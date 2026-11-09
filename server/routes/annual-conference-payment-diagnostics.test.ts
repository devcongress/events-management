import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const state = vi.hoisted(() => ({
  allowed: true, capability: true, edition: true, order: true, attempt: true, mode: 'live', key: true,
  rpc: vi.fn(), audit: vi.fn(), limit: vi.fn(), eq: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: async (c: { json: (body: object, code: number) => Response }) => state.allowed ? null : c.json({}, 401),
  getAdminSession: async () => ({ authenticated: true, email: 'owner@example.test' }),
}));
vi.mock('@/server/annual-conference-request', () => ({
  requireAnnualConferenceCapability: async (c: { json: (body: object, code: number) => Response }) => state.capability ? null : c.json({}, 403),
}));
vi.mock('@/lib/supabase/annual-conference-ticketing', () => ({
  getSupabaseAnnualConferenceTicketing: async () => state.edition ? { settings: { edition_id: 'edition-2026' } } : null,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdminClient: () => ({ from: (table: string) => {
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { state.eq(table, key, value);

 return query; },
      maybeSingle: async () => ({ error: null, data: table === 'annual_conference_ticket_orders'
        ? state.order ? { id, payment_mode: state.mode } : null
        : state.attempt ? { order_id: id, provider: 'paystack', payment_reference: 'stored-reference' } : null }),
    };

    return query;
  } }),
}));
vi.mock('@/server/managed-conference-checkout', () => ({
  managedPaymentEnvironment: () => state.key ? { PAYSTACK_SECRET_KEY: 'sk_live_fixture', PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture' } : {},
  managedCheckoutRpc: (...args: unknown[]) => state.rpc(...args),
}));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: (...args: unknown[]) => state.audit(...args) }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: (...args: unknown[]) => state.limit(...args) }));

import { registerAnnualConferencePaymentDiagnostics } from './annual-conference-payment-diagnostics';

const app = new Hono<AppBindings>();

registerAnnualConferencePaymentDiagnostics(app);
const path = `/api/annual-conference/2026/ticketing/orders/${id}/paystack-check`;
const payload = { id: 123, reference: 'stored-reference', amount: 15000, currency: 'GHS', status: 'failed', domain: 'live', gateway_response_code: 'insufficient_funds', gateway_response: 'private' };

beforeEach(() => {
  Object.assign(state, { allowed: true, capability: true, edition: true, order: true, attempt: true, mode: 'live', key: true });
  vi.clearAllMocks();
  state.limit.mockResolvedValue(null);
  state.rpc.mockResolvedValue(null);
  state.audit.mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: true, data: { ...payload } })));
});
afterEach(() => vi.unstubAllGlobals());

describe('protected Paystack diagnostic', () => {
  it('requires ticketing management and scoped order and attempt', async () => {
    state.allowed = false;
    expect((await app.request(path, { method: 'POST' })).status).toBe(401);
    state.allowed = true;
    state.capability = false;
    expect((await app.request(path, { method: 'POST' })).status).toBe(403);
    state.capability = true;
    state.order = false;
    expect((await app.request(path, { method: 'POST' })).status).toBe(404);
    expect(state.eq).toHaveBeenCalledWith('annual_conference_ticket_orders', 'edition_id', 'edition-2026');
    state.order = true;
    state.attempt = false;
    expect((await app.request(path, { method: 'POST' })).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads the stored reference, records safe mapped observation, and audits without confirmation', async () => {
    const response = await app.request(path, { method: 'POST', body: JSON.stringify({ reference: 'attacker', mode: 'test' }) });

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/stored-reference'), expect.objectContaining({ headers: { Authorization: 'Bearer sk_live_fixture' } }));
    expect(state.rpc).toHaveBeenCalledOnce();
    expect(state.rpc).toHaveBeenCalledWith(expect.anything(), 'record_managed_paystack_observation', expect.objectContaining({ p_reference: 'stored-reference', p_status: 'failed', p_reason: 'Insufficient funds' }));
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.limit).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ checked: true });
  });

  it.each([{ domain: 'test' }, { reference: 'wrong' }, { amount: 'invalid' }])('retains previous observation for malformed or mismatched provider data', async (changed) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: true, data: { ...payload, ...changed } })));
    expect((await app.request(path, { method: 'POST' })).status).toBe(503);
    expect(state.rpc).toHaveBeenCalledWith(expect.anything(), 'record_managed_paystack_observation', expect.objectContaining({ p_status: null, p_reason: null }));
  });

  it.each(['live', 'test'])('explains missing %s credentials without altering stored observations', async (mode) => {
    state.mode = mode;
    state.key = false;
    const response = await app.request(path, { method: 'POST' });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: `Paystack ${mode} status checks are not configured on this server. The last known result was retained.` });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses the stored test mode and key', async () => {
    state.mode = 'test';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: true, data: { ...payload, domain: 'test', status: 'success' } })));
    expect((await app.request(path, { method: 'POST' })).status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: { Authorization: 'Bearer sk_test_fixture' } }));
    expect(state.rpc).toHaveBeenCalledWith(expect.anything(), 'record_managed_paystack_observation', expect.objectContaining({ p_status: 'success' }));
  });
});
