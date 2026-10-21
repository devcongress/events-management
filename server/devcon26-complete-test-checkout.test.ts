import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppBindings } from './http/app-bindings';

const mocks = vi.hoisted(() => ({ env: {} as Record<string, string>, rpc: vi.fn(), challenge: vi.fn(), limit: vi.fn(), enabled: true, state: 'internal', publicMode: 'paid', salesStatus: 'open' }));

vi.mock('@/server/env', () => ({ envValue: (key: string) => mocks.env[key] }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/http/public-intake-protection', () => ({ enforcePublicRateLimit: mocks.limit, requirePublicTurnstile: mocks.challenge, publicClientKey: () => 'fixture' }));
vi.mock('@/server/annual-conference-admission-email-delivery', () => ({ admissionEmailReadiness: () => ({ ready: true }) }));
vi.mock('@/server/annual-conference-social-card-email-delivery', () => ({ annualConferenceSocialCardEmailConfigurationForRequest: () => ({ enabled: true }) }));
vi.mock('@/server/annual-conference-registration-testing', () => ({ registrationTesting: async () => ({ enabled: mocks.enabled, tester_emails: ['tester@example.test', 'gift@example.test'] }) }));
vi.mock('@/lib/supabase/annual-conference-ticketing', () => ({
  getSupabaseAnnualConferenceTicketing: async () => ({ settings: { edition_id: '10000000-0000-4000-8000-000000000001', public_mode: mocks.publicMode, ticket_sales_status: mocks.salesStatus } }),
  getSupabaseAnnualConferenceFlexibleCheckoutState: async () => ({ flexible_checkout_state: mocks.state, regular_price_minor: 15000 }),
  prepareSupabaseAnnualConferenceTicketPaymentAttempt: vi.fn(),
  getSupabaseAnnualConferenceTicketPaymentAttempt: vi.fn(),
  confirmSupabaseAnnualConferenceTicketPayment: vi.fn(),
  getSupabaseAnnualConferencePaidOrderSummary: vi.fn(),
}));

import { registerDevcon26CompleteTestCheckout } from './routes/devcon26-complete-test-checkout';
import { COMPLETE_TEST_CHECKOUT_PATH as path } from '@/lib/devcon26-complete-test-checkout';

const origin = 'https://preview-site.account.workers.dev';
const app = new Hono<AppBindings>();

registerDevcon26CompleteTestCheckout(app);
beforeEach(() => {
  mocks.enabled = true;
  mocks.state = 'internal';
  mocks.publicMode = 'paid';
  mocks.salesStatus = 'open';
  mocks.env = { DEVCON26_COMPLETE_TEST_ENABLED: 'true', DEVCON26_COMPLETE_TEST_ORIGIN: origin, PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture', TURNSTILE_SECRET_KEY: 'turnstile-fixture' };
  mocks.rpc.mockReset();
  mocks.challenge.mockReset().mockResolvedValue(null);
  mocks.limit.mockReset().mockResolvedValue(null);
});

describe('complete test checkout boundary', () => {
  it('serves only the exact preview origin with a test catalog', async () => {
    const response = await app.request(path, { headers: { Origin: origin } });

    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(await response.json()).toMatchObject({ mode: 'test', flexible_checkout: { mode: 'test', unit_amount_minor: 15000 } });

    for (const forbidden of ['https://devcongress.org', 'https://another.account.workers.dev']) {
      const blocked = await app.request(path, { headers: { Origin: forbidden } });

      expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
      expect(blocked.status).toBe(503);
      expect(await blocked.json()).toEqual({ error: 'Test checkout unavailable.' });
    }
  });

  it('stays closed with testing disabled or public lifecycle state', async () => {
    mocks.enabled = false;
    expect(await (await app.request(path, { headers: { Origin: origin } })).json()).toEqual({ mode: 'unavailable' });
    mocks.enabled = true;
    mocks.state = 'public';
    expect(await (await app.request(path, { headers: { Origin: origin } })).json()).toEqual({ mode: 'unavailable' });
  });

  it('requires JSON and rejects unapproved-origin initialization before storage', async () => {
    const headers = { Origin: 'https://devcongress.org', 'Content-Type': 'application/json' };

    expect((await app.request(path + '/initialize', { method: 'POST', headers, body: '{}' })).status).toBe(503);
    expect((await app.request(path + '/initialize', { method: 'POST', headers: { Origin: origin }, body: '{}' })).status).toBe(415);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a forged webhook before reading or confirming orders', async () => {
    const response = await app.request('/api/webhooks/paystack/devcon26-complete-test', {
      method: 'POST', headers: { 'x-paystack-signature': '00' }, body: '{}',
    });

    expect(response.status).toBe(401);
  });
});

const input = {
  checkout_request_key: '10000000-0000-4000-8000-000000000001',
  purchaser_name: 'Tester', purchaser_email: 'tester@example.test',
  cart: { quantity: 2, payment_provider: 'paystack', allocations: [{ kind: 'self' }, { kind: 'gift', recipient_email: 'gift@example.test' }] },
  turnstile_token: 'test-token', turnstile_action: 'devcon26_complete_test_checkout',
};
const initialize = (body: unknown = input) => app.request(path + '/initialize', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('complete test email abuse protection', () => {
  it.each([['free', 'open'], ['paid', 'closed'], ['free', 'closed']])(
    'blocks catalog and direct initialization for %s/%s sales', async (publicMode, salesStatus) => {
      mocks.publicMode = publicMode;
      mocks.salesStatus = salesStatus;
      const catalog = await app.request(path, { headers: { Origin: origin } });

      expect(await catalog.json()).toEqual({ mode: 'unavailable' });
      expect((await initialize()).status).toBe(503);
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.limit).toHaveBeenCalledTimes(1);
    },
  );

  it('fails closed without a configured challenge or a submitted token', async () => {
    delete mocks.env.TURNSTILE_SECRET_KEY;
    expect(await (await app.request(path, { headers: { Origin: origin } })).json()).toEqual({ mode: 'unavailable' });
    expect((await initialize()).status).toBe(503);
    mocks.env.TURNSTILE_SECRET_KEY = 'fixture';
    expect((await initialize({ ...input, turnstile_token: '' })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('binds human verification to the preview hostname and action before holding tickets', async () => {
    mocks.challenge.mockResolvedValue(new Response('{}', { status: 400 }));
    expect((await initialize()).status).toBe(400);
    expect(mocks.challenge).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      expectedHostname: 'preview-site.account.workers.dev', expectedAction: 'devcon26_complete_test_checkout', token: 'test-token',
    }));
    expect(mocks.limit).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not consume daily budgets for unapproved recipients', async () => {
    expect((await initialize({ ...input, purchaser_email: 'stranger@example.test' })).status).toBe(409);
    expect(mocks.limit).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(['complete-test-ip-day', 'complete-test-recipient-day', 'complete-test-shared-day'])('blocks %s exhaustion before payment or email work', async (action) => {
    mocks.limit.mockImplementation(async (_c, limit) => limit.action === action ? new Response('{}', { status: 429 }) : null);
    expect((await initialize()).status).toBe(429);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('counts each distinct recipient before reserving a test order', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await initialize()).status).toBe(409);
    const recipients = mocks.limit.mock.calls.map((call) => call[1]).filter((limit) => limit.action === 'complete-test-recipient-day');

    expect(recipients).toEqual([
      { action: 'complete-test-recipient-day', clientKey: 'tester@example.test', maxAttempts: 3, windowSeconds: 86400 },
      { action: 'complete-test-recipient-day', clientKey: 'gift@example.test', maxAttempts: 3, windowSeconds: 86400 },
    ]);
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
});
