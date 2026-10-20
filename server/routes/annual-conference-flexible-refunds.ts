import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { inspectPaystackLiveRefund } from '@/lib/annual-conference-paystack-refunds';
import { getSupabaseAnnualConferenceTicketing } from '@/lib/supabase/annual-conference-ticketing';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { envValue } from '@/server/env';
import type { AppBindings } from '@/server/http/app-bindings';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';

const base = '/api/annual-conference/2026/ticketing/flexible/refunds';
const requestSchema = z.object({ allocation_id: z.string().uuid() }).strict();
const reconcileSchema = z.object({ provider_refund_id: z.string().regex(/^[1-9][0-9]{0,18}$/) }).strict();
const refundIdSchema = z.string().uuid();
const requestResultSchema = z.array(z.object({
  outcome: z.string(),
  refund_id: z.string().uuid().nullable(),
  amount_minor: z.number().int().nullable(),
})).length(1);
const paymentSchema = z.array(z.object({
  refund_id: z.string().uuid(),
  refund_status: z.string(),
  order_id: z.string().uuid(),
  allocation_id: z.string().uuid(),
  amount_minor: z.number().int(),
  currency: z.string(),
  provider: z.string(),
  payment_reference: z.string().min(1),
  provider_transaction_id: z.string().nullable(),
})).length(1);
const finalizeResultSchema = z.array(z.object({
  outcome: z.string(),
  ticket_id: z.string().uuid().nullable(),
  order_status: z.string().nullable(),
})).length(1);
const rejectResultSchema = z.array(z.object({
  outcome: z.string(),
  ticket_id: z.string().uuid().nullable(),
  delivery_queued: z.boolean(),
})).length(1);
const bindingResultSchema = z.array(z.object({ outcome: z.enum(['bound', 'invalid']) })).length(1);

async function ownerAccess(c: Context<AppBindings>) {
  const roleError = await requireAdmin(c, ['owner']);

  if (roleError) return { error: roleError, email: null };
  const capabilityError = await requireAnnualConferenceCapability(c, 2026, 'ticketing.manage');

  if (capabilityError) return { error: capabilityError, email: null };
  const session = c.get('adminSession') ?? await getAdminSession(c);

  if (!session.authenticated || session.role !== 'owner' || !session.email) {
    return { error: c.json({ error: 'Owner access is required.' }, 403), email: null };
  }

  return { error: null, email: session.email };
}

function paymentSecret(c: Context<AppBindings>): string | null {
  const provider = envValue('DEVCON26_PAYMENT_PROVIDER', c)?.trim().toLowerCase();
  const secretKey = envValue('PAYSTACK_SECRET_KEY', c)?.trim();

  return provider === 'paystack' && secretKey?.startsWith('sk_live_') && secretKey.length > 8
    ? secretKey : null;
}

export function registerAnnualConferenceFlexibleRefundRoutes(app: Hono<AppBindings>): void {
  app.post(`${base}/request`, async (c) => {
    const access = await ownerAccess(c);

    if (access.error) return access.error;
    const input = requestSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Enter a valid allocation ID.' }, 400);
    if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Ticketing storage is not configured.' }, 503);

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing) return c.json({ error: 'Conference ticketing is unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c).rpc('request_annual_conference_flexible_ticket_refund' as never, {
        p_edition_id: ticketing.settings.edition_id,
        p_allocation_id: input.data.allocation_id,
      } as never) as unknown as { data: unknown; error: unknown };
      const parsed = requestResultSchema.safeParse(result.data);

      if (result.error || !parsed.success) return c.json({ error: 'Unable to suspend this seat.' }, 503);
      const requested = parsed.data[0];

      if (!['requested', 'refunded'].includes(requested.outcome) || !requested.refund_id || requested.amount_minor !== 15_000) {
        return c.json({ error: 'This seat is not eligible for a refund request.' }, 409);
      }

      if (requested.outcome === 'requested') {
        await recordProtectedMutationAudit(c, {
          action: 'annual_conference.ticketing.flexible_refund_request',
          targetType: 'annual_conference_flexible_ticket_refund',
          targetId: requested.refund_id,
          metadata: { edition_year: 2026, allocation_id: input.data.allocation_id },
        });
      }

      return c.json({ status: requested.outcome, refund_id: requested.refund_id, amount_minor: requested.amount_minor });
    } catch {
      return c.json({ error: 'Unable to suspend this seat.' }, 503);
    }
  });

  app.post(`${base}/:refundId/reconcile`, async (c) => {
    const access = await ownerAccess(c);

    if (access.error) return access.error;
    const refundId = refundIdSchema.safeParse(c.req.param('refundId'));
    const input = reconcileSchema.safeParse(await c.req.json().catch(() => null));

    if (!refundId.success || !input.success) return c.json({ error: 'Enter valid refund IDs.' }, 400);
    if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Ticketing storage is not configured.' }, 503);
    const secretKey = paymentSecret(c);

    if (!secretKey) return c.json({ error: 'Live Paystack verification is unavailable.' }, 503);

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing) return c.json({ error: 'Conference ticketing is unavailable.' }, 503);
      const client = getSupabaseAdminClient(c);
      const result = await client.rpc('get_annual_conference_flexible_ticket_refund_payment' as never, {
        p_edition_id: ticketing.settings.edition_id,
        p_refund_id: refundId.data,
      } as never) as unknown as { data: unknown; error: unknown };
      const parsed = paymentSchema.safeParse(result.data);

      if (result.error || !parsed.success) return c.json({ error: 'Unable to verify this refund request.' }, 503);
      const payment = parsed.data[0];

      if (payment.refund_status !== 'requested' || payment.amount_minor !== 15_000
        || payment.currency !== 'GHS' || payment.provider !== 'paystack') {
        return c.json({ error: 'This refund request is not pending reconciliation.' }, 409);
      }

      const inspection = await inspectPaystackLiveRefund({
        secretKey,
        refundId: input.data.provider_refund_id,
        paymentReference: payment.payment_reference,
        providerTransactionId: payment.provider_transaction_id,
      });
      const binding = await client.rpc('bind_annual_conference_flexible_ticket_refund_provider_id' as never, {
        p_edition_id: ticketing.settings.edition_id,
        p_refund_id: refundId.data,
        p_provider_refund_id: input.data.provider_refund_id,
      } as never) as unknown as { data: unknown; error: unknown };
      const bound = bindingResultSchema.safeParse(binding.data);

      if (binding.error || !bound.success) return c.json({ error: 'Unable to bind this Paystack refund.' }, 503);
      if (bound.data[0].outcome !== 'bound') {
        return c.json({ error: 'This Paystack refund ID cannot be used for this seat.' }, 409);
      }

      if (inspection.status === 'pending') {
        return c.json({ error: 'The Paystack refund has not been processed yet.' }, 409);
      }

      if (inspection.status === 'failed') {
        const rejection = await client.rpc('reject_annual_conference_flexible_ticket_refund' as never, {
          p_edition_id: ticketing.settings.edition_id,
          p_refund_id: refundId.data,
          p_provider_refund_id: inspection.refundId,
          p_provider_payload_sha256: inspection.payloadSha256,
          p_rejection_reason: `Paystack refund ${input.data.provider_refund_id} failed.`,
          p_actor_email: access.email,
        } as never) as unknown as { data: unknown; error: unknown };
        const restored = rejectResultSchema.safeParse(rejection.data);

        if (rejection.error || !restored.success) return c.json({ error: 'Unable to restore admission.' }, 503);
        if (restored.data[0].outcome !== 'rejected') return c.json({ error: 'Admission could not be restored.' }, 409);

        await recordProtectedMutationAudit(c, {
          action: 'annual_conference.ticketing.flexible_refund_failed_restore',
          targetType: 'annual_conference_flexible_ticket_refund',
          targetId: refundId.data,
          metadata: { edition_year: 2026, provider_refund_id: input.data.provider_refund_id },
        });

        return c.json({ status: 'failed_restored', ticket_id: restored.data[0].ticket_id, delivery_queued: restored.data[0].delivery_queued });
      }

      const finalization = await client.rpc('finalize_annual_conference_flexible_ticket_refund' as never, {
        p_edition_id: ticketing.settings.edition_id,
        p_refund_id: refundId.data,
        p_provider: 'paystack',
        p_provider_refund_id: inspection.refundId,
        p_provider_refund_reference: inspection.refundId,
        p_refunded_amount_minor: 15_000,
        p_provider_payload_sha256: inspection.payloadSha256,
        p_actor_email: access.email,
      } as never) as unknown as { data: unknown; error: unknown };
      const finalized = finalizeResultSchema.safeParse(finalization.data);

      if (finalization.error || !finalized.success) return c.json({ error: 'Unable to finalize this refund.' }, 503);
      if (finalized.data[0].outcome !== 'refunded') return c.json({ error: 'This refund cannot be finalized.' }, 409);

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.ticketing.flexible_refund_finalize',
        targetType: 'annual_conference_flexible_ticket_refund',
        targetId: refundId.data,
        metadata: { edition_year: 2026, provider_refund_id: inspection.refundId },
      });

      return c.json({ status: 'refunded', ticket_id: finalized.data[0].ticket_id, order_status: finalized.data[0].order_status });
    } catch {
      return c.json({ error: 'Unable to reconcile this Paystack refund.' }, 503);
    }
  });
}
