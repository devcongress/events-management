import crypto from 'node:crypto';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CHECKOUT_PATH as path, MANAGED_PAYMENT_WEBHOOK_PATH, managedPaymentReference } from '@/lib/managed-conference-checkout';
import { createDevcon26FlexibleCheckoutGrant, verifyDevcon26FlexibleCheckoutGrant } from '@/lib/devcon26-flexible-checkout-grant';
import { registerManagedConferenceCheckout } from './routes/managed-conference-checkout';
import { registerManagedConferencePaymentSettings } from './routes/managed-conference-payment-settings';
import type { AppBindings } from './http/app-bindings';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string>,
  settings: vi.fn(), readiness: vi.fn(), rpc: vi.fn(), order: vi.fn(), confirm: vi.fn(),
  testers: vi.fn(), initialize: vi.fn(), summary: vi.fn(), from: vi.fn(), card: vi.fn(),
  challenge: vi.fn(), limit: vi.fn(), assess: vi.fn(), dispatch: vi.fn(),
  admin: vi.fn(), session: vi.fn(), audit: vi.fn(),
  cachedUrl: null as string | null,
}));

vi.mock('@/server/managed-conference-checkout', () => ({
  managedPaymentEnvironment: () => mocks.env,
  managedCheckoutSettings: mocks.settings,
  managedCheckoutReadiness: mocks.readiness,
  managedCheckoutRpc: mocks.rpc,
  managedCheckoutOrder: mocks.order,
  confirmManagedCheckout: mocks.confirm,
}));
vi.mock('@/lib/annual-conference-ticket-payments', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/annual-conference-ticket-payments')>(),
  createPaystackHostedCheckout: mocks.initialize,
}));
vi.mock('@/lib/supabase/annual-conference-ticketing', () => ({ getSupabaseAnnualConferencePaidOrderSummary: mocks.summary }));
vi.mock('@/lib/supabase/annual-conference-social-cards', () => ({ getSupabaseAnnualConferenceSocialCardByOrderSeat: mocks.card }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ from: mocks.from }) }));
vi.mock('@/server/annual-conference-registration-testing', () => ({ registrationTesting: mocks.testers }));
vi.mock('@/server/complete-test-immediate-emails', () => ({ dispatchManagedConferenceEmails: mocks.dispatch }));
vi.mock('@/server/http/public-intake-protection', () => ({
  enforcePublicRateLimit: mocks.limit,
  publicClientKey: () => 'fixture-ip',
  requirePublicTurnstile: mocks.challenge,
  assessPublicSubmissionEmail: mocks.assess,
}));
vi.mock('@/lib/supabase/admin-auth', () => ({ requireAdmin: mocks.admin, getAdminSession: mocks.session }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: mocks.audit }));

const origin = 'https://devcongress.org';
const orderId = '10000000-0000-4000-8000-000000000001';
const editionId = '20000000-0000-4000-8000-000000000001';
const authorizationUrl = 'https://checkout.paystack.com/fixture';
const catalogSettings = {
  edition_id: editionId, payment_mode: 'test' as 'test' | 'live', settings_version: 7,
  public_mode: 'paid', sales_status: 'open', flexible_checkout_state: 'internal', regular_price_minor: 15000, flexible_checkout_max_amount_minor: 10000000,
  processing_fee_rate_basis_points: 195,
};
const storedOrder = {
  id: orderId, edition_id: editionId, payment_mode: 'test' as 'test' | 'live',
  checkout_origin: origin, checkout_settings_version: 7, quoted_processing_fee_policy: 'buyer_pays_processing' as const,
};
const input = {
  checkout_request_key: '30000000-0000-4000-8000-000000000001',
  purchaser_name: 'Tester', purchaser_email: 'tester@example.test',
  expected_mode: 'test', settings_version: 7,
  cart: { quantity: 2, payment_provider: 'paystack', allocations: [{ kind: 'self' }, { kind: 'gift', recipient_email: 'gift@example.test' }] },
  turnstile_token: 'challenge-token', turnstile_action: 'devcon26_checkout',
};
const app = new Hono<AppBindings>();

registerManagedConferenceCheckout(app);
registerManagedConferencePaymentSettings(app);

const historicalWebhookPaths = ['/api/webhooks/paystack', '/api/webhooks/paystack/devcon26-complete-test', '/api/webhooks/paystack/devcon26-test'];

for (const historicalPath of historicalWebhookPaths) {
  app.post(historicalPath, (c) => c.json({ legacy: true }));
}

const request = (route: string, body?: unknown, method = body ? 'POST' : 'GET', requestOrigin = origin) => app.request(route, {
  method,
  headers: { Origin: requestOrigin, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const initialize = (body: unknown = input) => request(`${path}/initialize`, body);
const modePath = '/api/annual-conference/2026/registrations/payment-mode';
const modeInput = { payment_mode: 'live', settings_version: 7, tester_emails: ['tester@example.test', 'gift@example.test'], confirmed: true };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cachedUrl = null;
  mocks.env = {
    NODE_ENV: 'production', PUBLIC_WEBSITE_ORIGIN: origin,
    PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture', PAYSTACK_SECRET_KEY: 'sk_live_fixture',
    TURNSTILE_SECRET_KEY: 'turnstile-fixture',
  };
  mocks.settings.mockResolvedValue({ ...catalogSettings });
  mocks.readiness.mockReturnValue({ ready: true, reasons: [] });
  mocks.testers.mockResolvedValue({ enabled: true, tester_emails: ['tester@example.test', 'gift@example.test'] });
  mocks.limit.mockResolvedValue(null);
  mocks.challenge.mockResolvedValue(null);
  mocks.assess.mockResolvedValue({ status: 'deliverable' });
  mocks.order.mockResolvedValue({ ...storedOrder });
  mocks.confirm.mockResolvedValue({ status: 'verified' });
  mocks.summary.mockResolvedValue({ status: 'paid', tier_key: 'regular_flexible', quantity: 2, ticket_amount_minor: 30000, amount_paid_minor: 30000, currency: 'GHS' });
  mocks.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }));
  mocks.card.mockResolvedValue(null);
  mocks.dispatch.mockResolvedValue(undefined);
  mocks.admin.mockResolvedValue(null);
  mocks.session.mockResolvedValue({ authenticated: true, role: 'owner', email: 'owner@example.test' });
  mocks.audit.mockResolvedValue(undefined);
  mocks.rpc.mockImplementation(async (_context, name: string, args: Record<string, unknown>) => {
    if (name === 'create_managed_conference_checkout_hold') return { id: orderId, payment_mode: args.p_expected_mode, amount_minor: 30000, quoted_processing_fee_minor: 597, quoted_gross_amount_minor: 30597, currency: 'GHS' };
    if (name === 'claim_managed_conference_checkout_initialization') return { authorization_url: mocks.cachedUrl, initialization_claim: args.p_claim_token };
    if (name === 'finalize_managed_conference_checkout_initialization') return { authorization_url: args.p_authorization_url, initialization_claim: args.p_claim_token };
    if (name === 'configure_managed_conference_payment_mode') return { ...catalogSettings, payment_mode: args.p_mode, settings_version: 8 };

    throw new Error(`Unexpected RPC: ${name}`);
  });
  mocks.initialize.mockImplementation(async (value: { paymentReference: string }) => ({ authorizationUrl, paymentReference: value.paymentReference }));
});

describe('EMS-managed public checkout', () => {
  it('uses the server-selected catalog mode and never publishes approved addresses', async () => {
    const response = await request(path);
    const catalog = await response.json();

    expect(catalog).toMatchObject({ mode: 'test', settings_version: 7, currency: 'GHS', flexible_checkout: { mode: 'test', unit_amount_minor: 15000, fee_rate_basis_points: 195, fee_policy: 'buyer_pays_processing', fee_rounding: 'ceil_minor' } });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(JSON.stringify(catalog)).not.toMatch(/tester_emails|tester@example|gift@example|sk_test|sk_live/);
    mocks.settings.mockResolvedValue({ ...catalogSettings, payment_mode: 'live' });
    expect(await (await request(path)).json()).toMatchObject({ mode: 'live', flexible_checkout: { mode: 'live' } });
  });

  it.each(['test', 'live'] as const)('keeps a foundation-only %s checkout unavailable before taking purchaser details', async (mode) => {
    mocks.settings.mockResolvedValue({ ...catalogSettings, payment_mode: mode, flexible_checkout_state: 'foundation' });

    expect(await (await request(path)).json()).toEqual({ mode: 'unavailable' });
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(['internal', 'public'])('allows an activated %s lifecycle in the managed catalog', async (state) => {
    mocks.settings.mockResolvedValue({ ...catalogSettings, flexible_checkout_state: state });

    expect(await (await request(path)).json()).toMatchObject({ mode: 'test', flexible_checkout: { mode: 'test' } });
  });

  it('holds an allocated cart only after the shared challenge and recipient policy pass', async () => {
    const response = await initialize();
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ mode: 'test', reference: managedPaymentReference(orderId, 'test'), ticket_amount_minor: 30000, processing_fee_minor: 597, amount_minor: 30597, authorization_url: authorizationUrl });
    expect(mocks.challenge).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      token: 'challenge-token', expectedAction: 'devcon26_checkout', expectedHostname: 'devcongress.org',
    }));
    expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), 'create_managed_conference_checkout_hold', expect.objectContaining({
      p_expected_mode: 'test', p_settings_version: 7, p_origin: origin,
      p_allocations: [{ seat_index: 1, kind: 'self', recipient_name: 'Tester', recipient_email: 'tester@example.test' }, { seat_index: 2, kind: 'gift', recipient_email: 'gift@example.test' }],
    }));
    expect(mocks.initialize).toHaveBeenCalledWith(expect.objectContaining({ secretKey: 'sk_test_fixture', amountMinor: 30597, callbackUrl: `${origin}/devcon26/payment-confirmation/` }));
    expect(verifyDevcon26FlexibleCheckoutGrant({ grant: result.checkout_grant, verifier: result.checkout_verifier, origin, secretKey: 'sk_test_fixture' })?.order_id).toBe(orderId);
  });

  it('selects the live key only when Live was selected by EMS', async () => {
    mocks.settings.mockResolvedValue({ ...catalogSettings, payment_mode: 'live' });
    const response = await initialize({ ...input, expected_mode: 'live' });

    expect(response.status).toBe(200);
    expect(mocks.initialize).toHaveBeenCalledWith(expect.objectContaining({ secretKey: 'sk_live_fixture', paymentReference: managedPaymentReference(orderId, 'live') }));
  });

  it.each([{ expected_mode: 'live' }, { settings_version: 6 }])('rejects a stale browser catalog before creating a provider checkout: %j', async (changes) => {
    const response = await initialize({ ...input, ...changes });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'checkout_settings_changed' });
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns a durable authorization URL without calling Paystack again', async () => {
    mocks.cachedUrl = authorizationUrl;
    const response = await initialize();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ authorization_url: authorizationUrl });
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it.each(['checkout_initialization_in_progress', 'checkout_initialization_uncertain'])('keeps %s initialization closed without another provider call', async (error) => {
    mocks.rpc.mockImplementation(async (_context, name: string) => {
      if (name === 'create_managed_conference_checkout_hold') return { id: orderId, payment_mode: 'test', amount_minor: 30000, quoted_processing_fee_minor: 597, quoted_gross_amount_minor: 30597, currency: 'GHS' };

      throw new Error(error);
    });
    const response = await initialize();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: error });
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it('rejects unapproved testing buyers and gifts, including an empty approved list', async () => {
    for (const emails of [[], ['tester@example.test'], ['gift@example.test']]) {
      mocks.testers.mockResolvedValue({ enabled: true, tester_emails: emails });
      expect((await initialize()).status).toBe(409);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it('applies distributed rate and challenge failures before reserving or charging', async () => {
    mocks.limit.mockResolvedValue(new Response(JSON.stringify({ error: 'Slow down.' }), { status: 429 }));
    expect((await initialize()).status).toBe(429);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.limit.mockResolvedValue(null);
    mocks.challenge.mockResolvedValue(new Response(JSON.stringify({ error: 'Challenge failed.' }), { status: 400 }));
    expect((await initialize()).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it('rejects an unapproved origin before reserving or contacting the provider', async () => {
    const response = await request(`${path}/initialize`, input, 'POST', 'https://unapproved.example.test');

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it('rejects a settings change committed after the initial catalog read', async () => {
    mocks.rpc.mockRejectedValue(new Error('checkout_settings_changed'));
    const response = await initialize();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'checkout_settings_changed' });
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it('uses recipient and shared daily budgets for approved testing checkout', async () => {
    expect((await initialize()).status).toBe(200);
    const policies = mocks.limit.mock.calls.map((call) => call[1]);

    expect(policies).toContainEqual(expect.objectContaining({ clientKey: 'tester@example.test', windowSeconds: 86400 }));
    expect(policies).toContainEqual(expect.objectContaining({ clientKey: 'gift@example.test', windowSeconds: 86400 }));
    expect(policies).toContainEqual(expect.objectContaining({ clientKey: 'fixture-ip', maxAttempts: 100, windowSeconds: 86400 }));
    expect(policies).toContainEqual(expect.objectContaining({ clientKey: 'all', maxAttempts: 500, windowSeconds: 86400 }));
  });

  it('verifies an existing test order after new purchases switch to Live', async () => {
    mocks.settings.mockResolvedValue({ ...catalogSettings, payment_mode: 'live', settings_version: 8 });
    mocks.testers.mockResolvedValue({ enabled: false, tester_emails: ['tester@example.test', 'gift@example.test'] });
    const verifier = 'a'.repeat(43);
    const reference = managedPaymentReference(orderId, 'test');
    const grant = createDevcon26FlexibleCheckoutGrant({ orderId, verifier, origin, secretKey: 'sk_test_fixture' });
    const response = await request(`${path}/verify`, { reference, checkout_grant: grant, checkout_verifier: verifier });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: 'test', status: 'verified', quantity: 2 });
    expect(mocks.confirm).toHaveBeenCalledWith(expect.anything(), storedOrder, reference);
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it('rejects an invalid grant without confirming a transaction', async () => {
    const response = await request(`${path}/verify`, {
      reference: managedPaymentReference(orderId, 'test'), checkout_grant: 'forged-long-grant-value', checkout_verifier: 'a'.repeat(43),
    });

    expect(response.status).toBe(404);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});

function webhook(mode: 'test' | 'live', signingKey: string, route = MANAGED_PAYMENT_WEBHOOK_PATH) {
  const body = JSON.stringify({ event: 'charge.success', data: {
    id: 123, reference: managedPaymentReference(orderId, mode), amount: 30000, currency: 'GHS', status: 'success', domain: mode,
  } });

  return app.request(route, {
    method: 'POST', body, headers: { 'x-paystack-signature': crypto.createHmac('sha512', signingKey).update(body).digest('hex') },
  });
}

describe('managed Paystack webhook mode binding', () => {
  it('accepts an old test callback with its original key independently of current mode', async () => {
    mocks.settings.mockResolvedValue({ ...catalogSettings, payment_mode: 'live' });
    expect((await webhook('test', 'sk_test_fixture')).status).toBe(204);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.anything(), storedOrder, managedPaymentReference(orderId, 'test'));
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it('does not let the test key confirm a live order', async () => {
    mocks.order.mockResolvedValue({ ...storedOrder, payment_mode: 'live', checkout_origin: null });
    const response = await webhook('live', 'sk_test_fixture');

    expect(response.status).toBe(401);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it('rejects a forged signature before order reconciliation', async () => {
    expect((await webhook('test', 'unrelated-secret')).status).toBe(401);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('does not let the live key confirm a test order', async () => {
    const response = await webhook('test', 'sk_live_fixture');

    expect(response.status).toBe(401);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it.each(historicalWebhookPaths)('reconciles managed payments through the existing Paystack URL %s', async (route) => {
    expect((await webhook('test', 'sk_test_fixture', route)).status).toBe(204);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.anything(), storedOrder, managedPaymentReference(orderId, 'test'));
  });

  it.each(historicalWebhookPaths)('leaves historical nonmanaged events with their existing handler at %s', async (route) => {
    const body = JSON.stringify({ event: 'charge.success', data: {
      id: 123, reference: `devcon26-test-${orderId.replaceAll('-', '')}`, amount: 30000, currency: 'GHS', status: 'success', domain: 'test',
    } });
    const response = await app.request(route, { method: 'POST', body });

    expect(await response.json()).toEqual({ legacy: true });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});

describe('Owner payment settings', () => {
  it('returns tester addresses only through the Owner-protected settings endpoint', async () => {
    const response = await request(modePath);

    expect(response.status).toBe(200);
    expect(mocks.admin).toHaveBeenCalledWith(expect.anything(), ['owner']);
    expect(await response.json()).toMatchObject({ payment_mode: 'test', settings_version: 7, tester_emails: ['tester@example.test', 'gift@example.test'] });
  });

  it('requires Owner access before reading or saving payment settings', async () => {
    mocks.admin.mockResolvedValue(new Response(JSON.stringify({ error: 'Owner required.' }), { status: 403 }));
    expect((await request(modePath)).status).toBe(403);
    expect((await request(modePath, modeInput, 'PATCH')).status).toBe(403);
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('saves the environment and approved recipients atomically with expected version and confirmation', async () => {
    const response = await request(modePath, modeInput, 'PATCH');

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), 'configure_managed_conference_payment_mode', {
      p_edition_id: editionId, p_mode: 'live', p_settings_version: 7,
      p_actor: 'owner@example.test', p_tester_emails: modeInput.tester_emails.slice().sort(),
    });
    expect(mocks.audit).toHaveBeenCalled();
  });

  it('rejects an unconfirmed change and stale database revision without saving', async () => {
    expect((await request(modePath, { ...modeInput, confirmed: false }, 'PATCH')).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockRejectedValue(new Error('checkout_settings_changed'));
    expect((await request(modePath, modeInput, 'PATCH')).status).toBe(409);
  });

  it('normalizes approved addresses atomically and rejects wildcard entries', async () => {
    const response = await request(modePath, { ...modeInput, tester_emails: [' TESTER@EXAMPLE.TEST ', 'tester@example.test'] }, 'PATCH');

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), 'configure_managed_conference_payment_mode', expect.objectContaining({ p_tester_emails: ['tester@example.test'] }));
    mocks.rpc.mockClear();
    expect((await request(modePath, { ...modeInput, tester_emails: ['*@example.test'] }, 'PATCH')).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('allows an empty Testing list to be saved while purchases remain separately restricted', async () => {
    const response = await request(modePath, { ...modeInput, payment_mode: 'test', tester_emails: [] }, 'PATCH');

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), 'configure_managed_conference_payment_mode', expect.objectContaining({ p_mode: 'test', p_tester_emails: [] }));
  });

  it('can stop Live checkout by selecting Testing even during credential and delivery outages', async () => {
    mocks.settings.mockResolvedValue({ ...catalogSettings, payment_mode: 'live' });
    mocks.readiness.mockReturnValue({ ready: false, reasons: ['Payment and delivery services are unavailable.'] });
    const response = await request(modePath, { ...modeInput, payment_mode: 'test' }, 'PATCH');

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), 'configure_managed_conference_payment_mode', expect.objectContaining({ p_mode: 'test' }));
    expect(mocks.readiness).not.toHaveBeenCalled();
  });

  it.each(['test', 'live'] as const)('can revoke approved recipients in existing %s mode during an outage', async (mode) => {
    mocks.settings.mockResolvedValue({ ...catalogSettings, payment_mode: mode });
    mocks.readiness.mockReturnValue({ ready: false, reasons: ['Payment services are unavailable.'] });
    const response = await request(modePath, { ...modeInput, payment_mode: mode, tester_emails: [] }, 'PATCH');

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), 'configure_managed_conference_payment_mode', expect.objectContaining({ p_mode: mode, p_tester_emails: [] }));
    expect(mocks.readiness).not.toHaveBeenCalled();
  });

  it('keeps Live disabled when its server credential or delivery readiness fails', async () => {
    mocks.readiness.mockImplementation((_context, mode) => ({ ready: mode === 'test', reasons: mode === 'test' ? [] : ['The Paystack live key is missing or invalid.'] }));
    const response = await request(modePath, modeInput, 'PATCH');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'payment_mode_not_ready' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

it('permits 200 distinct buyers on one IP while stopping repeated-buyer abuse', async () => {
  mocks.settings.mockResolvedValue({ ...catalogSettings, payment_mode: 'live' });
  const buckets = new Map<string, number>();

  mocks.limit.mockImplementation(async (c, limit) => {
    const key = limit.action + ':' + limit.clientKey;
    const count = (buckets.get(key) ?? 0) + 1;

    buckets.set(key, count);

    return count > limit.maxAttempts ? c.json({ error: 'Please wait', retry_after_seconds: 300 }, 429) : null;
  });
  for (let i = 0; i < 200; i += 1) {
    const response = await initialize({ ...input, expected_mode: 'live', purchaser_email: `buyer-${i}@example.test`,
      cart: { ...input.cart, allocations: [{ kind: 'self' }, { kind: 'gift', recipient_email: `gift-${i}@example.test` }] } });

    expect(response.status).toBe(200);
  }
  for (let i = 0; i < 11; i += 1) {
    const response = await initialize({ ...input, expected_mode: 'live' });

    expect(response.status).toBe(i < 10 ? 200 : 429);
  }
});

it('does not authorize a fresh payment when the existing order is not payable', async () => {
  const original = mocks.rpc.getMockImplementation()!;

  mocks.rpc.mockImplementation(async (...args) => {
    if (args[1] === 'claim_managed_conference_checkout_initialization') throw new Error('not_payable');

    return original(...args);
  });
  const response = await initialize();
  const body = await response.json();

  expect(response.status).toBe(409);
  expect(body.code).toBeUndefined();
  expect(body.error).toContain('Check your ticket email');
  expect(mocks.initialize).not.toHaveBeenCalled();
});
