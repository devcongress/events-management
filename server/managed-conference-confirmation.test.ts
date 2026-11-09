import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmManagedCheckout } from './managed-conference-checkout';

const mocks = vi.hoisted(() => ({
  environment: {} as Record<string, string | undefined>,
  testPayment: vi.fn(), livePayment: vi.fn(), confirm: vi.fn(), rpc: vi.fn(),
}));

vi.mock('@/server/env', () => ({ envValue: (key: string) => mocks.environment[key] }));
vi.mock('@/lib/annual-conference-ticket-payments', () => ({
  readPaystackTestTransaction: mocks.testPayment,
  inspectPaystackLiveTransaction: mocks.livePayment,
}));
vi.mock('@/lib/supabase/annual-conference-ticketing', () => ({ confirmSupabaseAnnualConferenceTicketPayment: mocks.confirm }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/annual-conference-admission-email-delivery', () => ({ admissionEmailReadiness: vi.fn() }));
vi.mock('@/server/annual-conference-social-card-email-delivery', () => ({ annualConferenceSocialCardEmailConfigurationForRequest: vi.fn() }));

const context = {} as Context;
const order = {
  id: '10000000-0000-4000-8000-000000000001', edition_id: '20000000-0000-4000-8000-000000000001',
  payment_mode: 'test' as 'test' | 'live', checkout_origin: 'https://devcongress.org', checkout_settings_version: 7,
  quoted_processing_fee_policy: null as null | 'buyer_pays_processing',
};
const charge = { providerEventId: 'charge:123', amountMinor: 15000, currency: 'GHS' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.environment = { PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture', PAYSTACK_SECRET_KEY: 'sk_live_fixture' };
  mocks.testPayment.mockResolvedValue({ status: 'verified', ...charge });
  mocks.livePayment.mockResolvedValue({ status: 'success', charge });
  mocks.confirm.mockImplementation(async (input) => ({ status: 'paid', amount_paid_minor: input.amountMinor, currency: input.currency, payment_reference: input.paymentReference }));
});

describe('managed checkout stored-order confirmation', () => {
  it.each(['test', 'live'] as const)('normalizes a successful %s payment using only its stored mode credentials', async (mode) => {
    const reference = 'devcon26-managed-' + mode + '-' + 'a'.repeat(32);
    const result = await confirmManagedCheckout(context, { ...order, payment_mode: mode }, reference);
    const selected = mode === 'test' ? mocks.testPayment : mocks.livePayment;
    const opposite = mode === 'test' ? mocks.livePayment : mocks.testPayment;

    expect(result).toEqual({ status: 'verified' });
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ secretKey: mode === 'test' ? 'sk_test_fixture' : 'sk_live_fixture', paymentReference: reference }));
    expect(opposite).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      providerEventId: `managed:${mode}:charge:123`, amountMinor: 15000, currency: 'GHS',
      paymentFacts: { ...(mode === 'test' ? { id: '123' } : {}), domain: mode, amount: 15000, currency: 'GHS', fee_mode: 'merchant_absorbs' },
    }), context);
  });

  it.each(['test', 'live'] as const)('uses the stored buyer-paid fee policy for a %s payment', async (mode) => {
    const reference = 'devcon26-managed-' + mode + '-' + 'a'.repeat(32);
    const paidCharge = { ...charge, amountMinor: 15299 };

    mocks.testPayment.mockResolvedValue({ status: 'verified', ...paidCharge });
    mocks.livePayment.mockResolvedValue({ status: 'success', charge: paidCharge });

    await confirmManagedCheckout(context, { ...order, payment_mode: mode, quoted_processing_fee_policy: 'buyer_pays_processing' }, reference);

    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: 15299,
      paymentFacts: expect.objectContaining({ domain: mode, fee_mode: 'buyer_pays_processing' }),
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
    ['test', 'expired'], ['live', 'refund_required'],
  ] as const)('maps an expired %s order to %s without inventing a test refund', async (mode, status) => {
    mocks.confirm.mockResolvedValue({ status: 'expired', amount_paid_minor: 15000, currency: 'GHS', payment_reference: 'reference' });

    expect(await confirmManagedCheckout(context, { ...order, payment_mode: mode }, 'reference')).toEqual({ status });
  });

  it.each([
    { status: 'expired', amount_paid_minor: null, currency: 'GHS', payment_reference: null },
    { status: 'paid', amount_paid_minor: 999, currency: 'GHS', payment_reference: 'reference' },
    { status: 'paid', amount_paid_minor: 15000, currency: 'USD', payment_reference: 'reference' },
    { status: 'paid', amount_paid_minor: 15000, currency: 'GHS', payment_reference: 'other' },
  ])('rejects terminal confirmation without matching recorded payment facts', async (stored) => {
    mocks.confirm.mockResolvedValue(stored);

    await expect(confirmManagedCheckout(context, order, 'reference')).rejects.toThrow('Payment confirmation mismatch.');
  });

  it('records a valid observation after successful fulfillment and tolerates storage errors', async () => {
    const steps: string[] = [];

    mocks.testPayment.mockImplementation(async (input) => {
      await input.onObservation({ status: 'success', reason: 'Approved' });

      return { status: 'verified', ...charge };
    });
    mocks.confirm.mockImplementation(async (input) => {
      steps.push('confirm');

      return { status: 'paid', amount_paid_minor: input.amountMinor, currency: input.currency, payment_reference: input.paymentReference };
    });
    mocks.rpc.mockImplementation(async (_name, args) => {
      steps.push('diagnostic');
      expect(args).toMatchObject({ p_status: 'success', p_reason: 'Approved' });

      return { error: { message: 'unavailable' } };
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await confirmManagedCheckout(context, order, 'reference')).toEqual({ status: 'verified' });
    expect(steps).toEqual(['confirm', 'diagnostic']);
    log.mockRestore();
  });

  it.each(['test', 'live'] as const)('fails closed when the %s key is missing even when the opposite key exists', async (mode) => {
    delete mocks.environment[mode === 'test' ? 'PAYSTACK_TEST_SECRET_KEY' : 'PAYSTACK_SECRET_KEY'];

    await expect(confirmManagedCheckout(context, { ...order, payment_mode: mode }, 'reference')).rejects.toThrow('Payment credentials unavailable.');
    expect(mocks.testPayment).not.toHaveBeenCalled();
    expect(mocks.livePayment).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
