import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), session: vi.fn(), capability: vi.fn(), edition: vi.fn(), preview: vi.fn(), rate: vi.fn(), send: vi.fn(), audit: vi.fn(), health: vi.fn(), env: vi.fn(), queue: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-auth', () => ({ requireAdmin: mocks.requireAdmin, getAdminSession: mocks.session }));
vi.mock('@/server/annual-conference-request', () => ({ requireAnnualConferenceCapability: mocks.capability, getAnnualConferenceEditionByYear: mocks.edition }));
vi.mock('@/lib/annual-conference-speaker-outcomes', () => ({ getSpeakerOutcomePreviewRecipient: mocks.preview, queueSpeakerOutcomePreview: mocks.queue }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: mocks.rate }));
vi.mock('@/lib/email/resend', () => ({ sendResendEmailBatch: mocks.send }));
vi.mock('@/lib/email/delivery-health', () => ({ recordResendEmailHealth: mocks.health }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: mocks.audit }));
vi.mock('@/server/env', () => ({ envValue: mocks.env }));

const id = '00000000-0000-4000-8000-000000000001';
const payload = { preview_id: id, recipient_id: id, request_id: id, email: 'Tester@example.test' };
const frozen = { id, from: 'sender@example.test', replyTo: 'reply@example.test', subject: 'Hello Ama', html: '<p>Private link</p>', text: 'Private link' };

async function request(body: unknown) {
  const { registerSpeakerOutcomeRoutes } = await import('./routes/annual-conference-speakers/outcomes');
  const app = new Hono<AppBindings>();

  registerSpeakerOutcomeRoutes(app);

  return app.request('/api/annual-conference/2026/speaker-outcomes/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('speaker outcome frozen test email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ authenticated: true, membership_id: 'owner', email: 'owner@example.test' });
    mocks.capability.mockResolvedValue(null);
    mocks.edition.mockResolvedValue({ id: 'edition' });
    mocks.preview.mockResolvedValue(frozen);
    mocks.rate.mockResolvedValue(null);
    mocks.env.mockReturnValue('test-key');
    mocks.send.mockResolvedValue({ ids: ['provider'], quota: {} });
  });

  it('sends the exact frozen content only to the chosen address, with no queue mutation', async () => {
    const response = await request(payload);

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.anything(), ['owner', 'organizer', 'member']);
    expect(mocks.preview).toHaveBeenCalledWith(id, 'edition', 'owner', id);
    expect(mocks.send.mock.calls[0][0].emails).toEqual([{ from: frozen.from, reply_to: frozen.replyTo, subject: frozen.subject, html: frozen.html, text: frozen.text, to: ['tester@example.test'] }]);
    expect(mocks.rate.mock.calls[0][1]).toMatchObject({ clientKey: 'owner', maxAttempts: 5, windowSeconds: 600 });
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it('rejects invalid addresses, expired snapshots, and rate-limited requests', async () => {
    expect((await request({ ...payload, email: 'invalid' })).status).toBe(400);
    mocks.preview.mockResolvedValueOnce(undefined);
    expect((await request(payload)).status).toBe(409);
    mocks.rate.mockImplementationOnce((c) => c.json({ error: 'limit' }, 429));
    expect((await request(payload)).status).toBe(429);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
