import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), auth: vi.fn(), campaign: vi.fn(), control: vi.fn(), limit: vi.fn(), audit: vi.fn() }));

vi.mock('@/lib/supabase/admin-auth', () => ({ getAdminSession: mocks.session, requireAdmin: mocks.auth }));
vi.mock('@/lib/supabase/volunteer-follow-up', () => ({ getVolunteerFollowUpCampaign: mocks.campaign, controlVolunteerOutcomeDelivery: mocks.control }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: mocks.limit }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: mocks.audit }));

const id = '00000000-0000-4000-8000-000000000001';

async function request(body: unknown) {
  const { controlVolunteerOutcomeRow } = await import('./routes/volunteer-outcome-row-control');
  const app = new Hono();

  app.post('/control', controlVolunteerOutcomeRow);

  return app.request('/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('owner outcome row control', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ authenticated: true, role: 'owner', email: 'owner@example.test' });
    mocks.campaign.mockResolvedValue({ id: 'server-campaign', outcome_paused: true });
    mocks.control.mockResolvedValue({ changed: true, block_reason: null });
  });

  it.each(['hold', 'resume'])('uses server-owned campaign and actor for %s', async (action) => {
    const response = await request({ delivery_id: id, action });

    expect(response.status).toBe(200);
    expect(mocks.control).toHaveBeenCalledWith({ deliveryId: id, campaignId: 'server-campaign', actor: 'owner@example.test', action }, expect.anything());
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.limit.mock.calls[0][1]).toMatchObject({ action: "volunteer_outcome_row_control", clientKey: "owner@example.test" });
    expect(await response.json()).toMatchObject({ held: action === 'hold' });
  });

  it.each([{ action: 'send' }, { delivery_id: 'bad' }, { campaign_id: 'forged' }, { actor: 'forged' }])('rejects invalid or forged input %j', async (change) => {
    expect((await request({ delivery_id: id, action: 'hold', ...change })).status).toBe(400);
    expect(mocks.control).not.toHaveBeenCalled();
  });

  it.each(['organizer', 'reviewer'])('rejects %s', async (role) => {
    mocks.session.mockResolvedValue({ authenticated: true, role, email: 'someone@example.test' });
    expect((await request({ delivery_id: id, action: 'hold' })).status).toBe(403);
    expect(mocks.control).not.toHaveBeenCalled();
  });

  it('preserves an authentication denial', async () => {
    mocks.auth.mockResolvedValue(new Response('Denied', { status: 401 }));
    expect((await request({ delivery_id: id, action: 'hold' })).status).toBe(401);
    expect(mocks.campaign).not.toHaveBeenCalled();
  });

  it('does not mutate when rate limited', async () => {
    mocks.limit.mockResolvedValue(new Response('Wait', { status: 429 }));
    expect((await request({ delivery_id: id, action: 'hold' })).status).toBe(429);
    expect(mocks.control).not.toHaveBeenCalled();
  });

  it.each(['legacy_batch', 'send_in_flight', 'idempotency_window_expired', 'uncertain_failure'])('reports safe conflict for %s', async (block_reason) => {
    mocks.control.mockResolvedValue({ changed: false, block_reason });
    const response = await request({ delivery_id: id, action: 'resume' });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
