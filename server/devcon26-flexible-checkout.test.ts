import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as storage from '@/lib/supabase/annual-conference-ticketing';
import { consumePublicRateLimit } from '@/lib/public-rate-limit';
import { inspectPaystackLiveTransaction } from '@/lib/annual-conference-ticket-payments';
import { createDevcon26FlexibleCheckoutGrant } from '@/lib/devcon26-flexible-checkout-grant';
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

describe('historical DevCon26 flexible checkout', () => {
  it.each([
    '/api/public/annual-conference/2026/checkout/initialize',
    '/api/public/annual-conference/2026/checkout/flexible/initialize',
  ])('retires new initialization at %s before storage or provider work', async (route) => {
    const response = await post({ ...buyer, cart, checkout_request_key: requestKey }, origin, route);

    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ code: 'checkout_moved' });
    expect(storage.createSupabaseAnnualConferenceFlexibleCheckoutHold).not.toHaveBeenCalled();
    expect(storage.prepareSupabaseAnnualConferenceTicketPaymentAttempt).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(isUnauthenticatedApiRequest(route, 'POST')).toBe(true);
  });

  it('keeps historical initialized grants verifiable without exposing ticket capabilities', async () => {
    const verifier = 'v'.repeat(43);
    const checkoutGrant = createDevcon26FlexibleCheckoutGrant({
      orderId, verifier, origin, secretKey: 'sk_live_fixture',
    });
    const verifyPath = '/api/public/annual-conference/2026/checkout/flexible/verify';
    const verification = await post({
      reference, checkout_grant: checkoutGrant, checkout_verifier: verifier,
    }, origin, verifyPath);
    const result = await verification.json();

    expect(verification.status).toBe(200);
    expect(result).toMatchObject({ mode: 'live', status: 'verified', quantity: 2, ticket_amount_minor: 30_000 });
    expect(JSON.stringify(result)).not.toMatch(/qr_token|capability|claim|buyer_grant|checkout_grant/);
    expect(storage.confirmSupabaseAnnualConferenceTicketPayment).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveBeenCalled();

    const denied = await post({
      reference, checkout_grant: checkoutGrant, checkout_verifier: 'x'.repeat(43),
    }, origin, verifyPath);

    expect(denied.status).toBe(404);
  });
});
