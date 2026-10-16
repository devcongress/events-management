import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { volunteerOutcomeEmailPreview } from '@/lib/email/templates/volunteer-follow-up';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  requireAdmin: vi.fn(),
  campaign: vi.fn(),
  messages: vi.fn(),
  rateLimit: vi.fn(),
  send: vi.fn(),
  health: vi.fn(),
  audit: vi.fn(),
  env: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-auth', () => ({ getAdminSession: mocks.session, requireAdmin: mocks.requireAdmin }));
// Deliberately expose no campaign mutation functions: a sample must never call them.
vi.mock('@/lib/supabase/volunteer-follow-up', () => ({
  getVolunteerFollowUpCampaign: mocks.campaign,
  listVolunteerFollowUpOutcomeMessages: mocks.messages,
}));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: mocks.rateLimit }));
vi.mock('@/lib/email/resend', () => ({ sendResendEmailBatch: mocks.send, ResendBatchError: class extends Error {} }));
vi.mock('@/lib/email/delivery-health', () => ({ recordResendEmailHealth: mocks.health }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: mocks.audit }));
vi.mock('@/server/env', () => ({ envValue: mocks.env }));

const requestId = '00000000-0000-4000-8000-000000000001';
const messages = [
  { decision: 'accepted' as const, version: 2, subject: 'Welcome aboard', message: 'You are selected.\nNext steps soon.' },
  { decision: 'not_selected' as const, version: 3, subject: 'Application update', message: 'Thank you <friend>. No place this year.' },
];

async function request(body: unknown) {
  const { sendVolunteerOutcomeTestEmail } = await import('./routes/volunteer-outcome-test-email');
  const app = new Hono();

  app.post('/test', sendVolunteerOutcomeTestEmail);

  return app.request('/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('volunteer outcome sample emails', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ authenticated: true, role: 'owner', email: 'owner@example.test', user_id: 'owner-1' });
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.campaign.mockResolvedValue({ id: 'campaign-2026', outcome_paused: true, status: 'draft' });
    mocks.messages.mockResolvedValue(messages);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.env.mockReturnValue('test-key');
    mocks.send.mockResolvedValue({ ids: ['provider-1'], quota: { dailyUsed: 1, monthlyUsed: 1 } });
  });

  it.each(messages)('sends only the saved $decision sample to one custom address', async (message) => {
    const response = await request({ decision: message.decision, email: '  Tester@Example.test ', request_id: requestId });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true, recipient: 'tester@example.test', provider_id: 'provider-1' });
    expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.anything(), ['owner']);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const content = volunteerOutcomeEmailPreview({ name: 'Applicant', ...message });

    expect(mocks.send.mock.calls[0][0].emails).toEqual([{ ...content, to: ['tester@example.test'], subject: `[TEST] ${message.subject}` }]);
    expect(mocks.rateLimit.mock.calls[0][1]).toMatchObject({ clientKey: 'owner-1', maxAttempts: 5, windowSeconds: 600 });
    expect(JSON.stringify(mocks.audit.mock.calls[0][1])).not.toContain('tester@example.test');
  });

  it('defaults to the authenticated email without needing any applicant', async () => {
    const response = await request({ decision: 'accepted', request_id: requestId });

    expect(response.status).toBe(200);
    expect(mocks.send.mock.calls[0][0].emails[0].to).toEqual(['owner@example.test']);
  });

  it.each([
    { decision: 'pending' },
    { email: 'bad-address' },
    { email: 'a@example.test,b@example.test' },
    { subject: 'Forged subject' },
    { message: 'Forged message' },
    { request_id: 'bad-id' },
  ])('rejects invalid or browser-authored content %j', async (override) => {
    const response = await request({ decision: 'accepted', request_id: requestId, ...override });

    expect(response.status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([401, 403])('respects access denial %s before reading or sending', async (status) => {
    mocks.requireAdmin.mockResolvedValue(new Response('{}', { status }));
    const response = await request({ decision: 'accepted', request_id: requestId });

    expect(response.status).toBe(status);
    expect(mocks.campaign).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects missing session identity even with a custom recipient', async () => {
    mocks.session.mockResolvedValue({ authenticated: true, role: 'owner', email: null });
    const response = await request({ decision: 'accepted', email: 'tester@example.test', request_id: requestId });

    expect(response.status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects missing provider configuration', async () => {
    mocks.env.mockReturnValue(undefined);
    const response = await request({ decision: 'accepted', request_id: requestId });

    expect(response.status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('honors the actor rate limit', async () => {
    mocks.rateLimit.mockResolvedValue(new Response('{}', { status: 429 }));
    const response = await request({ decision: 'accepted', request_id: requestId });

    expect(response.status).toBe(429);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('requires the saved template instead of substituting defaults', async () => {
    mocks.messages.mockResolvedValue([]);
    const response = await request({ decision: 'accepted', request_id: requestId });

    expect(response.status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('keeps ambiguous retries on the same provider key even after a template edit', async () => {
    mocks.send.mockRejectedValueOnce(new Error('network timeout'));
    const body = { decision: 'accepted', request_id: requestId };
    const failed = await request(body);

    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ error: expect.stringContaining('could not be confirmed') });
    mocks.messages.mockResolvedValue([{ ...messages[0], version: 4, message: 'Updated message' }]);
    await request(body);
    expect(mocks.send.mock.calls[0][0].idempotencyKey).toBe(mocks.send.mock.calls[1][0].idempotencyKey);
  });

  it('does not report a provider-accepted send as failed when bookkeeping fails', async () => {
    mocks.health.mockRejectedValue(new Error('health unavailable'));
    mocks.audit.mockRejectedValue(new Error('audit unavailable'));
    const response = await request({ decision: 'accepted', request_id: requestId });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accepted: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
