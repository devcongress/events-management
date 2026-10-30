import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CHECKOUT_PATH,
  MANAGED_PAYMENT_WEBHOOK_PATH,
  isManagedCheckoutRequest,
  managedCheckoutMaximumQuantity,
  managedCheckoutProcessingFeeQuote,
  managedCheckoutInitializeSchema,
  managedCheckoutSettingsSchema,
  managedCheckoutOrigin,
  managedCheckoutVerifySchema,
  managedPaymentReference,
  managedPaymentSecret,
} from './managed-conference-checkout';
import {
  confirmManagedCheckout,
  managedCheckoutOrder,
  managedCheckoutReadiness,
  managedCheckoutSettings,
} from '@/server/managed-conference-checkout';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string>,
  rpc: vi.fn(),
  from: vi.fn(),
  testPayment: vi.fn(),
  livePayment: vi.fn(),
  confirm: vi.fn(),
  admission: vi.fn(),
  badge: vi.fn(),
}));

vi.mock('@/server/env', () => ({ envValue: (key: string) => mocks.env[key] }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/supabase/annual-conference-ticketing', () => ({ confirmSupabaseAnnualConferenceTicketPayment: mocks.confirm }));
vi.mock('@/lib/annual-conference-ticket-payments', () => ({
  inspectPaystackLiveTransaction: mocks.livePayment,
  readPaystackTestTransaction: mocks.testPayment,
}));
vi.mock('@/server/annual-conference-admission-email-delivery', () => ({ admissionEmailReadiness: mocks.admission }));
vi.mock('@/server/annual-conference-social-card-email-delivery', () => ({ annualConferenceSocialCardEmailConfigurationForRequest: mocks.badge }));

const orderId = '10000000-0000-4000-8000-000000000001';
const editionId = '20000000-0000-4000-8000-000000000001';
const origin = 'https://devcongress.org';
const context = {} as Context;
const storedOrder = {
  id: orderId,
  edition_id: editionId,
  payment_mode: 'test' as const,
  checkout_origin: origin,
  checkout_settings_version: 5,
  quoted_processing_fee_policy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env = {
    NODE_ENV: 'production', PUBLIC_WEBSITE_ORIGIN: origin,
    PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture', PAYSTACK_SECRET_KEY: 'sk_live_fixture',
    TURNSTILE_SECRET_KEY: 'turnstile-fixture',
  };
  mocks.admission.mockReturnValue({ ready: true });
  mocks.badge.mockReturnValue({ enabled: true });
  mocks.confirm.mockResolvedValue({ id: orderId, status: 'paid' });
  mocks.testPayment.mockResolvedValue({
    status: 'verified', providerEventId: 'charge:123', paymentReference: managedPaymentReference(orderId, 'test'),
    amountMinor: 15000, currency: 'GHS',
  });
  mocks.livePayment.mockResolvedValue({
    status: 'success', charge: {
      providerEventId: 'charge:456', amountMinor: 15000, currency: 'GHS',
    },
  });
});

describe('managed checkout credential and browser contracts', () => {
  it('selects an explicit environment key without cross-mode fallback', () => {
    expect(managedPaymentSecret(mocks.env, 'test')).toBe('sk_test_fixture');
    expect(managedPaymentSecret(mocks.env, 'live')).toBe('sk_live_fixture');
    expect(managedPaymentSecret({ PAYSTACK_SECRET_KEY: 'sk_test_fixture' }, 'test')).toBeNull();
    expect(managedPaymentSecret({ PAYSTACK_TEST_SECRET_KEY: 'sk_live_fixture' }, 'live')).toBeNull();
    expect(managedPaymentSecret({ PAYSTACK_TEST_SECRET_KEY: 'sk_live_fixture', PAYSTACK_SECRET_KEY: 'sk_live_fixture' }, 'test')).toBeNull();
    expect(managedPaymentSecret({ PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture', PAYSTACK_SECRET_KEY: 'sk_test_fixture' }, 'live')).toBeNull();
  });

  it('requires one exact approved origin and rejects origin-shaped credentials and paths', () => {
    expect(managedCheckoutOrigin(mocks.env, origin)).toBe(origin);
    expect(managedCheckoutOrigin({ ...mocks.env, DEVCON26_PUBLIC_CHECKOUT_ORIGINS: 'https://www.devcongress.org' }, 'https://www.devcongress.org')).toBe('https://www.devcongress.org');

    for (const invalid of [undefined, 'http://devcongress.org', 'https://devcongress.org/', 'https://user@devcongress.org', 'https://devcongress.org/checkout', 'https://evil.test', 'https://devcongress.org?test=true']) {
      expect(managedCheckoutOrigin(mocks.env, invalid)).toBeNull();
    }
  });

  it.each(['test', 'live'] as const)('uses Paystack-compatible %s references through initialization and return validation', (mode) => {
    const reference = managedPaymentReference(orderId, mode);

    expect(reference).toMatch(/^[A-Za-z0-9.=-]+$/);
    expect(managedCheckoutVerifySchema.safeParse({
      reference, checkout_grant: 'signed-grant-fixture-long', checkout_verifier: 'a'.repeat(43),
    }).success).toBe(true);
  });

  it('requires the backend lifecycle state rather than assuming activation from paid/open settings', () => {
    const settings = {
      edition_id: editionId, payment_mode: 'test', settings_version: 5,
      public_mode: 'paid', sales_status: 'open', regular_price_minor: 15000,
      flexible_checkout_max_amount_minor: 10000000, processing_fee_rate_basis_points: 195,
    };

    expect(managedCheckoutSettingsSchema.safeParse(settings).success).toBe(false);
    for (const state of ['foundation', 'internal', 'public']) {
      expect(managedCheckoutSettingsSchema.parse({ ...settings, flexible_checkout_state: state }).flexible_checkout_state).toBe(state);
    }
    expect(managedCheckoutSettingsSchema.safeParse({ ...settings, flexible_checkout_state: 'unknown' }).success).toBe(false);
  });

  it('binds initialization to an explicit catalog mode/version and one challenge action', () => {
    const input = {
      checkout_request_key: orderId, purchaser_name: 'Tester', purchaser_email: ' TESTER@example.test ',
      expected_mode: 'test', settings_version: 5,
      cart: { quantity: 1, allocations: [{ kind: 'self' }], payment_provider: 'paystack' },
      turnstile_token: 'challenge-token', turnstile_action: 'devcon26_checkout',
    };

    expect(managedCheckoutInitializeSchema.parse(input).purchaser_email).toBe('tester@example.test');
    for (const changes of [
      { settings_version: 0 }, { settings_version: Number.MAX_SAFE_INTEGER + 1 },
      { expected_mode: 'production' }, { turnstile_action: 'devcon26_complete_test_checkout' },
      { turnstile_token: '' }, { amount_minor: 1 },
    ]) expect(managedCheckoutInitializeSchema.safeParse({ ...input, ...changes }).success).toBe(false);
    expect(isManagedCheckoutRequest(MANAGED_CHECKOUT_PATH, 'GET')).toBe(true);
    expect(isManagedCheckoutRequest(`${MANAGED_CHECKOUT_PATH}/initialize`, 'POST')).toBe(true);
    expect(isManagedCheckoutRequest(`${MANAGED_CHECKOUT_PATH}/verify`, 'POST')).toBe(true);
    expect(isManagedCheckoutRequest(MANAGED_PAYMENT_WEBHOOK_PATH, 'POST')).toBe(true);
    expect(isManagedCheckoutRequest(`${MANAGED_CHECKOUT_PATH}/initialize`, 'GET')).toBe(false);
  });
});

describe('managed buyer-paid processing-fee quote', () => {
  it('grosses up once in integer pesewas and keeps the ticket subtotal distinct', () => {
    expect(managedCheckoutProcessingFeeQuote(15_000, 195)).toEqual({
      ticket_amount_minor: 15_000, processing_fee_minor: 299, amount_minor: 15_299,
    });
    expect(managedCheckoutProcessingFeeQuote(30_000, 195)).toEqual({
      ticket_amount_minor: 30_000, processing_fee_minor: 597, amount_minor: 30_597,
    });
  });

  it('uses the gross limit when calculating the maximum cart quantity', () => {
    expect(managedCheckoutMaximumQuantity(15_000, 195, 15_298)).toBe(0);
    expect(managedCheckoutMaximumQuantity(15_000, 195, 15_299)).toBe(1);
  });
});

describe('managed checkout server reconciliation', () => {
  it('reports missing readiness without exposing either credential', () => {
    expect(managedCheckoutReadiness(context, 'test')).toEqual({ ready: true, reasons: [] });
    delete mocks.env.PAYSTACK_TEST_SECRET_KEY;
    const unavailable = managedCheckoutReadiness(context, 'test');

    expect(unavailable.ready).toBe(false);
    expect(JSON.stringify(unavailable)).not.toContain('sk_live_fixture');
    expect(managedCheckoutReadiness(context, 'live').ready).toBe(true);
    mocks.admission.mockReturnValue({ ready: false });
    mocks.badge.mockReturnValue({ enabled: false });
    delete mocks.env.TURNSTILE_SECRET_KEY;
    expect(managedCheckoutReadiness(context, 'live').ready).toBe(false);
  });

  it('fails closed when settings are absent or their version is invalid', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(managedCheckoutSettings(context)).resolves.toBeNull();
    mocks.rpc.mockResolvedValue({ data: { settings_version: -1 }, error: null });
    await expect(managedCheckoutSettings(context)).rejects.toThrow();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    await expect(managedCheckoutSettings(context)).rejects.toThrow('database unavailable');
  });

  it('requires a server-bound attempt and immutable managed order provenance', async () => {
    const reference = managedPaymentReference(orderId, 'test');
    let persistedOrder: unknown = storedOrder;

    mocks.from.mockImplementation((table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: table === 'annual_conference_ticket_payment_attempts'
          ? { order_id: orderId, provider: 'paystack', payment_reference: reference }
          : persistedOrder,
        error: null,
      }) }) }),
    }));
    await expect(managedCheckoutOrder(context, reference)).resolves.toEqual(storedOrder);
    persistedOrder = { ...storedOrder, checkout_settings_version: null };
    await expect(managedCheckoutOrder(context, reference)).resolves.toBeNull();
    persistedOrder = null;
    await expect(managedCheckoutOrder(context, reference)).resolves.toBeNull();
  });

  it('verifies an old test order with its test key after current settings have changed', async () => {
    mocks.rpc.mockImplementation(() => { throw new Error('Current checkout settings must not select a historical key.'); });
    const reference = managedPaymentReference(orderId, 'test');

    await expect(confirmManagedCheckout(context, storedOrder, reference)).resolves.toEqual({ status: 'verified' });
    expect(mocks.testPayment).toHaveBeenCalledWith({ secretKey: 'sk_test_fixture', paymentReference: reference });
    expect(mocks.livePayment).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      orderId, providerEventId: 'managed:test:charge:123', paymentFacts: expect.objectContaining({ domain: 'test' }),
    }), context);
  });

  it('sends the stored buyer-paid policy while allowing a test charge without provider fee facts', async () => {
    const buyerPaidOrder = { ...storedOrder, quoted_processing_fee_policy: 'buyer_pays_processing' as const };
    const reference = managedPaymentReference(orderId, 'test');

    mocks.testPayment.mockResolvedValue({
      status: 'verified', providerEventId: 'charge:buyer-paid', paymentReference: reference,
      amountMinor: 15_299, currency: 'GHS',
    });

    await expect(confirmManagedCheckout(context, buyerPaidOrder, reference)).resolves.toEqual({ status: 'verified' });
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ paymentFacts: expect.objectContaining({
      amount: 15_299, fee_mode: 'buyer_pays_processing',
    }) }), context);
  });

  it('uses the live key for an existing live order while Testing is selected for new purchases', async () => {
    const reference = managedPaymentReference(orderId, 'live');

    mocks.livePayment.mockResolvedValue({ status: 'success', charge: {
      providerEventId: 'charge:456', amountMinor: 15000, currency: 'GHS',
      providerFeeMinor: 100, requestedAmountMinor: 15000,
      facts: { id: '456', amount: 15000, fees: 100, requested_amount: 15000, currency: 'GHS', status: 'success', domain: 'live' },
    } });

    await expect(confirmManagedCheckout(context, { ...storedOrder, payment_mode: 'live', checkout_origin: null }, reference)).resolves.toEqual({ status: 'verified' });
    expect(mocks.livePayment).toHaveBeenCalledWith({ secretKey: 'sk_live_fixture', paymentReference: reference });
    expect(mocks.testPayment).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ paymentFacts: expect.objectContaining({
      domain: 'live', id: '456', fees: 100, requested_amount: 15000, amount: 15000, currency: 'GHS', fee_mode: 'merchant_absorbs',
    }) }), context);
  });

  it.each(['pending', 'failed'] as const)('does not issue tickets while the provider reports %s', async (status) => {
    mocks.testPayment.mockResolvedValue({ status });

    await expect(confirmManagedCheckout(context, storedOrder, managedPaymentReference(orderId, 'test'))).resolves.toEqual({ status });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('keeps provider verification failure and missing original credentials closed', async () => {
    mocks.testPayment.mockRejectedValue(new Error('Provider domain mismatch'));
    await expect(confirmManagedCheckout(context, storedOrder, managedPaymentReference(orderId, 'test'))).rejects.toThrow('Provider domain mismatch');
    expect(mocks.confirm).not.toHaveBeenCalled();
    delete mocks.env.PAYSTACK_TEST_SECRET_KEY;
    await expect(confirmManagedCheckout(context, storedOrder, managedPaymentReference(orderId, 'test'))).rejects.toThrow('Payment credentials unavailable');
    expect(mocks.livePayment).not.toHaveBeenCalled();
  });

  it('reports an expired simulated payment without offering a real refund', async () => {
    mocks.confirm.mockResolvedValue({ id: orderId, status: 'expired' });

    await expect(confirmManagedCheckout(context, storedOrder, managedPaymentReference(orderId, 'test'))).resolves.toEqual({ status: 'failed' });
  });

  it('keeps an expired real payment in the refund-required outcome', async () => {
    mocks.confirm.mockResolvedValue({ id: orderId, status: 'expired' });

    await expect(confirmManagedCheckout(context, { ...storedOrder, payment_mode: 'live', checkout_origin: null }, managedPaymentReference(orderId, 'live'))).resolves.toEqual({ status: 'refund_required' });
  });
});
