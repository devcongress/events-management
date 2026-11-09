import crypto from 'node:crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { inspectStoredPaystackAttempt } from '@/server/paystack-diagnostics';

const candidatesSchema = z.array(z.object({
  order_id: z.string().uuid(), payment_reference: z.string().min(1).max(255), payment_mode: z.enum(['live', 'test']),
})).max(8);

export async function checkUnresolvedPayments(c: Context) {
  const client = getSupabaseAdminClient(c);
  const claim = crypto.randomUUID();
  const leased = await client.rpc('claim_unresolved_payment_diagnostics' as never, { p_claim: claim } as never);

  if (leased.error) throw new Error('Payment diagnostics unavailable.');
  const candidates = candidatesSchema.parse(leased.data);
  const counts = { checked: 0, failed: 0 };

  async function check(candidate: z.infer<typeof candidatesSchema>[number]) {
    try {
      await inspectStoredPaystackAttempt(c, { reference: candidate.payment_reference, mode: candidate.payment_mode });
    } catch {
      counts.failed += 1;
    }
    const finished = await client.rpc('finish_unresolved_payment_diagnostic' as never, {
      p_order: candidate.order_id, p_claim: claim,
    } as never);

    if (finished.error) throw new Error('Payment diagnostics acknowledgement failed.');
    counts.checked += 1;
  }

  for (let offset = 0; offset < candidates.length; offset += 4) {
    await Promise.all(candidates.slice(offset, offset + 4).map(check));
  }

  return counts;
}
