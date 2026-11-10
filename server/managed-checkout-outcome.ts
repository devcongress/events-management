import type { Context } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

const orderSchema = z.object({
  status: z.enum(['pending_payment', 'paid', 'refunded', 'expired', 'cancelled']),
  expires_at: z.string().nullable(),
});
const observationSchema = z.object({
  paystack_status: z.enum(['success', 'failed', 'abandoned', 'reversed', 'pending', 'ongoing', 'processing', 'queued', 'other']).nullable(),
  paystack_reason: z.string().nullable(),
  paystack_checked_at: z.string().nullable(),
  paystack_check_failed: z.boolean(),
});
const refundSchema = z.object({ status: z.enum(['required', 'processing', 'refunded', 'failed', 'needs_attention']) });

const buyerReasonCodes: Record<string, string> = {
  'Customer cancelled payment': 'customer_cancelled',
  'Insufficient Funds': 'insufficient_funds',
  'Insufficient funds': 'insufficient_funds',
  'Declined': 'declined',
  'Transaction declined': 'declined',
  'Bank declined the payment': 'declined',
  'Card expired': 'expired_card',
  'Bank unavailable': 'bank_unavailable',
  'Payment timed out': 'timed_out',
  'Card security code verification failed': 'card_verification_failed',
};

export async function managedCheckoutOutcome(c: Context, orderId: string, now = Date.now()) {
  const client = getSupabaseAdminClient(c);
  const [orderResult, observationResult, refundResult] = await Promise.all([
    client.from('annual_conference_ticket_orders' as never).select('status,expires_at').eq('id', orderId).maybeSingle(),
    client.from('annual_conference_ticket_payment_attempts').select('paystack_status,paystack_reason,paystack_checked_at,paystack_check_failed').eq('order_id', orderId).eq('provider', 'paystack').maybeSingle(),
    client.from('annual_conference_ticket_refunds').select('status').eq('order_id', orderId).maybeSingle(),
  ]);

  if (orderResult.error || observationResult.error || refundResult.error) throw new Error('Checkout status unavailable.');
  const order = orderSchema.parse(orderResult.data);
  const observation = observationResult.data ? observationSchema.parse(observationResult.data) : null;
  const refund = refundResult.data ? refundSchema.parse(refundResult.data) : null;
  const expiry = order.expires_at ? Date.parse(order.expires_at) : NaN;
  const holdStatus = order.status === 'pending_payment'
    ? Number.isFinite(expiry) ? (expiry <= now ? 'expired' : 'active') : 'unknown'
    : order.status;
  const reason = observation?.paystack_reason;

  return {
    checkout_hold: { status: holdStatus, expires_at: order.expires_at },
    payment_observation: observation ? {
      status: observation.paystack_status,
      reason: reason && Object.hasOwn(buyerReasonCodes, reason) ? buyerReasonCodes[reason] : null,
      checked_at: observation.paystack_checked_at,
      check_failed: observation.paystack_check_failed,
    } : null,
    refund_status: refund?.status ?? (order.status === 'refunded' ? 'refunded' : null),
  };
}
