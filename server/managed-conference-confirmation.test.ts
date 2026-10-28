import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmManagedCheckout } from './managed-conference-checkout';

const mocks = vi.hoisted(() => ({
  environment: {} as Record<string, string | undefined>,
  testPayment: vi.fn(), livePayment: vi.fn(), confirm: vi.fn(),
}));

vi.mock('@/server/env', () => ({ envValue: (key: string) => mocks.environment[key] }));
vi.mock('@/lib/annual-conference-ticket-payments', () => ({
  readPaystackTestTransaction: mocks.testPayment,
  inspectPaystackLiveTransaction: mocks.livePayment,
}));
vi.mock('@/lib/supabase/annual-conference-ticketing', () => ({ confirmSupabaseAnnualConferenceTicketPayment: mocks.confirm }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock('@/server/annual-conference-admission-email-delivery', () => ({ admissionEmailReadiness: vi.fn() }));
vi.mock('@/server/annual-conference-social-card-email-delivery', () => ({ annualConferenceSocialCardEmailConfigurationForRequest: vi.fn() }));

const context = {} as Context;
const order = {
  id: '10000000-0000-4000-8000-000000000001', edition_id: '20000000-0000-4000-8000-000000000001',
  payment_mode: 'test' as 'test' | 'live', checkout_origin: 'https://devcongress.org', checkout_settings_version: 7,
};
const charge = { providerEventId: 'charge:123', amountMinor: 15000, currency: 'GHS' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.environment = { PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture', PAYSTACK_SECRET_KEY: 'sk_live_fixture' };
  mocks.testPayment.mockResolvedValue({ status: 'verified', ...charge });
  mocks.livePayment.mockResolvedValue({ status: 'success', charge });
  mocks.confirm.mockResolvedValue({ status: 'paid' });
});

describe('managed checkout stored-order confirmation', () => {
  it.each(['test', 'live'] as const)('normalizes a successful %s payment using only its stored mode credentials', async (mode) => {
    const reference = 'devcon26-managed-' + mode + '-' + 'a'.repeat(32);
    const result = await confirmManagedCheckout(context, { ...order, payment_mode: mode }, reference);
    const selected = mode === 'test' ? mocks.testPayment : mocks.livePayment;
    const opposite = mode === 'test' ? mocks.livePayment : mocks.testPayment;

    expect(result).toEqual({ status: 'verified' });
    expect(selected).toHaveBeenCalledWith({ secretKey: mode === 'test' ? 'sk_test_fixture' : 'sk_live_fixture', paymentReference: reference });
    expect(opposite).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      providerEventId: `managed:${mode}:charge:123`, amountMinor: 15000, currency: 'GHS',
      paymentFacts: { ...(mode === 'test' ? { id: '123' } : {}), domain: mode, amount: 15000, currency: 'GHS', fee_mode: 'merchant_absorbs' },
    }), context);
  });

  it.each([
    ['test', 'pending'], ['test', 'failed'], ['live', 'pending'], ['live', 'failed'],
  ] as const)('does not finalize a %s provider result that is %s', async (mode, status) => {
    mocks.testPayment.mockResolvedValue({ status });
    mocks.livePayment.mockResolvedValue({ status });

    expect(await confirmManagedCheckout(context, { ...order, payment_mode: mode }, 'reference')).toEqual({ status });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it.each([
    ['test', 'failed'], ['live', 'refund_required'],
  ] as const)('maps an expired %s order to %s without inventing a test refund', async (mode, status) => {
    mocks.confirm.mockResolvedValue({ status: 'expired' });

    expect(await confirmManagedCheckout(context, { ...order, payment_mode: mode }, 'reference')).toEqual({ status });
  });

  it.each(['test', 'live'] as const)('fails closed when the %s key is missing even when the opposite key exists', async (mode) => {
    delete mocks.environment[mode === 'test' ? 'PAYSTACK_TEST_SECRET_KEY' : 'PAYSTACK_SECRET_KEY'];

    await expect(confirmManagedCheckout(context, { ...order, payment_mode: mode }, 'reference')).rejects.toThrow('Payment credentials unavailable.');
    expect(mocks.testPayment).not.toHaveBeenCalled();
    expect(mocks.livePayment).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
