import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import { managedCheckoutOutcome } from './managed-checkout-outcome';

const mocks = vi.hoisted(() => ({ rows: {} as Record<string, unknown> }));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: mocks.rows[table] ?? null, error: null }),
      };

      return query;
    },
  }),
}));

const context = {} as Context;
const orderTable = 'annual_conference_ticket_orders';
const attemptTable = 'annual_conference_ticket_payment_attempts';
const refundTable = 'annual_conference_ticket_refunds';

beforeEach(() => {
  mocks.rows = {
    [orderTable]: { status: 'pending_payment', expires_at: '2026-11-10T12:00:00Z' },
    [attemptTable]: { paystack_status: 'abandoned', paystack_reason: 'Customer cancelled payment', paystack_checked_at: '2026-11-10T11:00:00Z', paystack_check_failed: false },
  };
});

describe('managed checkout buyer-safe outcome', () => {
  it('returns the hold and closed reason code without exposing provider fields', async () => {
    expect(await managedCheckoutOutcome(context, 'order', Date.parse('2026-11-10T11:30:00Z'))).toEqual({
      checkout_hold: { status: 'active', expires_at: '2026-11-10T12:00:00Z' },
      payment_observation: { status: 'abandoned', reason: 'customer_cancelled', checked_at: '2026-11-10T11:00:00Z', check_failed: false },
      refund_status: null,
    });
  });

  it('treats an elapsed hold independently from an unavailable provider check', async () => {
    mocks.rows[attemptTable] = { paystack_status: 'pending', paystack_reason: 'Merchant configuration issue', paystack_checked_at: '2026-11-10T11:00:00Z', paystack_check_failed: true };

    expect(await managedCheckoutOutcome(context, 'order', Date.parse('2026-11-10T12:01:00Z'))).toEqual({
      checkout_hold: { status: 'expired', expires_at: '2026-11-10T12:00:00Z' },
      payment_observation: { status: 'pending', reason: null, checked_at: '2026-11-10T11:00:00Z', check_failed: true },
      refund_status: null,
    });
  });

  it.each([
    ['pending_payment', 'expired'], ['expired', 'expired'], ['cancelled', 'cancelled'],
    ['paid', 'paid'], ['refunded', 'refunded'],
  ])('preserves order state %s as %s without inventing provider success', async (status, expected) => {
    mocks.rows[orderTable] = { status, expires_at: '2026-11-10T12:00:00Z' };
    mocks.rows[attemptTable] = null;
    const result = await managedCheckoutOutcome(context, 'order', Date.parse('2026-11-10T12:01:00Z'));

    expect(result.checkout_hold.status).toBe(expected);
    expect(result.payment_observation).toBeNull();
    expect(result.refund_status).toBe(status === 'refunded' ? 'refunded' : null);
  });

  it('suppresses unrecognized provider reasons and private fields', async () => {
    mocks.rows[attemptTable] = { paystack_status: 'failed', paystack_reason: 'sensitive provider detail', paystack_checked_at: null, paystack_check_failed: false, private_email: 'hidden@example.test' };
    const result = await managedCheckoutOutcome(context, 'order');

    expect(result.payment_observation?.reason).toBeNull();
    expect(JSON.stringify(result)).not.toContain('sensitive provider detail');
    expect(JSON.stringify(result)).not.toContain('hidden@example.test');
  });

  it('reports missing expiry and completed order-level refund without consulting seat refunds', async () => {
    mocks.rows[orderTable] = { status: 'pending_payment', expires_at: null };
    mocks.rows[attemptTable] = null;
    mocks.rows[refundTable] = { status: 'refunded' };

    expect(await managedCheckoutOutcome(context, 'order')).toEqual({
      checkout_hold: { status: 'unknown', expires_at: null },
      payment_observation: null,
      refund_status: 'refunded',
    });
  });
});
