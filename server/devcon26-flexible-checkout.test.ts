import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as storage from '@/lib/supabase/annual-conference-ticketing';
import { consumePublicRateLimit } from '@/lib/public-rate-limit';
import { inspectPaystackLiveTransaction } from '@/lib/annual-conference-ticket-payments';
import app, { isUnauthenticatedApiRequest } from '@/server/app';

vi.mock('@/lib/supabase/annual-conference-ticketing', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/supabase/annual-conference-ticketing')>(),
  getSupabaseAnnualConferenceTicketing: vi.fn(),
  getSupabaseAnnualConferenceFlexibleCheckoutState: vi.fn(),
  createSupabaseAnnualConferenceFlexibleCheckoutHold: vi.fn(),
  prepareSupabaseAnnualConferenceTicketPaymentAttempt: vi.fn(),
  getSupabaseAnnualConferenceTicketPaymentAttempt: vi.fn(),
  confirmSupabaseAnnualConferenceTicketPayment: vi.fn(),
  getSupabaseAnnualConferencePaidOrderSummary: vi.fn(),
}));
vi.mock('@/lib/public-rate-limit', () => ({ consumePublicRateLimit: vi.fn() }));
vi.mock('@/lib/annual-conference-ticket-payments', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/annual-conference-ticket-payments')>(),
  inspectPaystackLiveTransaction: vi.fn(),
}));

const origin = 'https://preview.example.test';
const path = '/api/public/annual-conference/2026/checkout/flexible/initialize';
const requestKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reference = `devcon26_${orderId.replaceAll('-', '')}`;
const checkoutUrl = 'https://checkout.paystack.com/fixture';
const buyer = { purchaser_name: 'Ada Lovelace', purchaser_email: 'ada@example.test' };
const cart = { quantity: 2, allocations: [{ kind: 'self' }, { kind: 'community_managed' }], payment_provider: 'paystack' };
let provider: ReturnType<typeof vi.fn>;

function post(body: unknown, requestOrigin = origin, route = path) {
  return app.request(`https://ems.example${route}`, {
    method: 'POST',
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  for (const [key, value] of Object.entries({
    NODE_ENV: 'production', APP_DATA_SOURCE: 'local-json',
    DEVCON26_PUBLIC_CHECKOUT_ENABLED: 'true', DEVCON26_FLEXIBLE_CHECKOUT_ENABLED: 'true',
    DEVCON26_PAYMENT_PROVIDER: 'paystack', DEVCON26_PAYMENTS_ENABLED: 'true',
    DEVCON26_PAYSTACK_FEE_MODE: 'merchant_absorbs', PAYSTACK_SECRET_KEY: 'sk_live_fixture',
    PUBLIC_WEBSITE_ORIGIN: 'https://devcongress.org', DEVCON26_PUBLIC_CHECKOUT_ORIGINS: origin,
    DEVCON26_ADMISSION_EMAILS_ENABLED: 'true', DEVCON26_ADMISSION_EMAIL_FROM: 'tickets@example.test',
    DEVCON26_ADMISSION_EMAIL_REPLY_TO: 'help@example.test', RESEND_API_KEY: 're_fixture',
  })) vi.stubEnv(key, value);

  vi.mocked(consumePublicRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(storage.getSupabaseAnnualConferenceTicketing).mockResolvedValue({
    settings: {
      edition_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      public_mode: 'paid', ticket_sales_status: 'open',
    },
  } as never);
  vi.mocked(storage.getSupabaseAnnualConferenceFlexibleCheckoutState).mockResolvedValue({
    flexible_checkout_state: 'public', flexible_checkout_max_amount_minor: 10_000_000,
    regular_price_minor: 15_000,
  });
  vi.mocked(storage.createSupabaseAnnualConferenceFlexibleCheckoutHold).mockResolvedValue({
    id: orderId, amount_minor: 30_000, currency: 'GHS', quantity: 2,
  } as never);
  vi.mocked(storage.prepareSupabaseAnnualConferenceTicketPaymentAttempt).mockResolvedValue({} as never);
  vi.mocked(storage.getSupabaseAnnualConferenceTicketPaymentAttempt).mockResolvedValue({
    order_id: orderId, provider: 'paystack', payment_reference: reference,
  });
  vi.mocked(storage.confirmSupabaseAnnualConferenceTicketPayment).mockResolvedValue({
    id: orderId, status: 'paid', quantity: 2, amount_minor: 30_000, currency: 'GHS',
  });
  vi.mocked(storage.getSupabaseAnnualConferencePaidOrderSummary).mockResolvedValue({
    status: 'paid', tier_key: 'regular_flexible', quantity: 2,
    ticket_amount_minor: 30_000, amount_paid_minor: 30_000, currency: 'GHS',
  });
  vi.mocked(inspectPaystackLiveTransaction).mockResolvedValue({
    status: 'success',
    charge: {
      provider: 'paystack', providerEventId: '123', eventType: 'charge.success',
      paymentReference: reference, amountMinor: 30_000, providerFeeMinor: 0,
      requestedAmountMinor: 30_000, currency: 'GHS', facts: { id: 123 },
    },
  });
  provider = vi.fn(async () => new Response(JSON.stringify({
    status: true, data: { authorization_url: checkoutUrl, reference },
  }), { status: 200 }));
  vi.stubGlobal('fetch', provider);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('DevCon26 flexible public checkout', () => {
  it('keeps the route closed unless the separate feature and database gates are public', async () => {
    const input = { ...buyer, cart, checkout_request_key: requestKey };

    vi.stubEnv('DEVCON26_FLEXIBLE_CHECKOUT_ENABLED', 'false');
    expect((await post(input)).status).toBe(503);
    expect(storage.createSupabaseAnnualConferenceFlexibleCheckoutHold).not.toHaveBeenCalled();

    vi.stubEnv('DEVCON26_FLEXIBLE_CHECKOUT_ENABLED', 'true');
    vi.mocked(storage.getSupabaseAnnualConferenceFlexibleCheckoutState).mockResolvedValue({
      flexible_checkout_state: 'foundation', flexible_checkout_max_amount_minor: 10_000_000,
      regular_price_minor: 15_000,
    });
    expect((await post(input)).status).toBe(503);
    expect(storage.createSupabaseAnnualConferenceFlexibleCheckoutHold).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('holds an allocated GH₵150 cart and sends only the verified total to Paystack', async () => {
    const response = await post({ ...buyer, cart, checkout_request_key: requestKey });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ mode: 'live', quantity: 2, amount_minor: 30_000,
      authorization_url: checkoutUrl, reference });
    expect(payload.checkout_grant).toEqual(expect.any(String));
    expect(payload.checkout_verifier).toEqual(expect.any(String));
    expect(payload.buyer_grant).toBeUndefined();
    expect(storage.createSupabaseAnnualConferenceFlexibleCheckoutHold).toHaveBeenCalledWith(
      expect.objectContaining({ cart, purchaserEmail: buyer.purchaser_email }), expect.anything(),
    );
    expect(JSON.parse(provider.mock.calls[0][1].body)).toMatchObject({
      amount: 30_000, currency: 'GHS', email: buyer.purchaser_email,
    });
    expect(isUnauthenticatedApiRequest(path, 'POST')).toBe(true);
    expect(JSON.stringify(payload)).not.toContain('community_managed');
  });

  it('rejects unallocated seats and unapproved origins before payment work', async () => {
    expect((await post({ ...buyer, cart: { ...cart, allocations: [{ kind: 'self' }] },
      checkout_request_key: requestKey })).status).toBe(400);
    expect((await post({ ...buyer, cart, checkout_request_key: requestKey }, 'https://attacker.example')).status).toBe(503);
    expect(storage.createSupabaseAnnualConferenceFlexibleCheckoutHold).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('accepts a large fully allocated cart under the provider ceiling without the standard 64 KiB body limit', async () => {
    const largeCart = {
      quantity: 666,
      allocations: Array.from({ length: 666 }, (_, index) => ({
        kind: 'gift', recipient_email: `person-${index}@${'a'.repeat(50)}.${'b'.repeat(50)}.${'c'.repeat(50)}.example`,
      })),
      payment_provider: 'paystack',
    };

    vi.mocked(storage.createSupabaseAnnualConferenceFlexibleCheckoutHold).mockResolvedValue({
      id: orderId, amount_minor: 9_990_000, currency: 'GHS', quantity: 666,
    } as never);

    const response = await post({ ...buyer, cart: largeCart, checkout_request_key: requestKey });

    expect(response.status).toBe(200);
    expect((await response.json()).amount_minor).toBe(9_990_000);
    expect(JSON.parse(provider.mock.calls[0][1].body).amount).toBe(9_990_000);
  });

  it('verifies payment through a separate checkout grant without exposing seat claims or QR codes', async () => {
    const initialized = await (await post({ ...buyer, cart, checkout_request_key: requestKey })).json();
    const verification = await post({
      reference,
      checkout_grant: initialized.checkout_grant,
      checkout_verifier: initialized.checkout_verifier,
    }, origin, '/api/public/annual-conference/2026/checkout/flexible/verify');
    const result = await verification.json();

    expect(verification.status).toBe(200);
    expect(result).toMatchObject({ mode: 'live', status: 'verified', quantity: 2, ticket_amount_minor: 30_000 });
    expect(JSON.stringify(result)).not.toMatch(/qr_token|capability|claim|buyer_grant|checkout_grant/);
    expect(storage.confirmSupabaseAnnualConferenceTicketPayment).toHaveBeenCalledTimes(1);

    const denied = await post({
      reference,
      checkout_grant: initialized.checkout_grant,
      checkout_verifier: 'x'.repeat(43),
    }, origin, '/api/public/annual-conference/2026/checkout/flexible/verify');

    expect(denied.status).toBe(404);
  });
});
