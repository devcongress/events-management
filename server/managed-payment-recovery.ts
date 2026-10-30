import crypto from 'node:crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { confirmManagedCheckout, managedCheckoutOrder } from './managed-conference-checkout';

const candidatesSchema = z.array(z.object({ order_id: z.string().uuid(), payment_reference: z.string() })).max(8);

export async function reconcileManagedPayments(c: Context) {
  const client = getSupabaseAdminClient(c);
  const claim = crypto.randomUUID();
  const leased = await client.rpc('claim_managed_payment_reconciliation' as never, { p_claim: claim } as never);

  if (leased.error) throw new Error('Payment recovery unavailable.');
  const candidates = candidatesSchema.parse(leased.data);
  const counts = { checked: 0, resolved: 0, failed: 0 };

  async function check(candidate: z.infer<typeof candidatesSchema>[number]) {
    let resolved = false;
    let failed = false;

    try {
      const order = await managedCheckoutOrder(c, candidate.payment_reference);

      if (!order || order.id !== candidate.order_id) throw new Error('Stored order unavailable.');
      const result = await confirmManagedCheckout(c, order, candidate.payment_reference);

      resolved = result.status === 'verified' || result.status === 'refund_required';
      if (result.status === 'refund_required') console.warn(JSON.stringify({ event: 'managed_payment_refund_required', order_id: order.id }));
    } catch {
      failed = true;
    }
    const finished = await client.rpc('finish_managed_payment_reconciliation' as never, {
      p_order: candidate.order_id, p_claim: claim, p_resolved: resolved, p_error: failed,
    } as never);

    if (finished.error) throw new Error('Payment recovery acknowledgement failed.');
    counts.checked += 1;
    counts.resolved += Number(resolved);
    counts.failed += Number(failed);
  }

  for (let offset = 0; offset < candidates.length; offset += 4) {
    await Promise.all(candidates.slice(offset, offset + 4).map(check));
  }

  return counts;
}
