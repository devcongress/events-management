import type { Hono } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAnnualConferenceTicketing } from '@/lib/supabase/annual-conference-ticketing';
import { requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { enforcePublicRateLimit } from '@/server/http/public-intake-protection';
import { inspectStoredPaystackAttempt, PaystackDiagnosticConfigurationError } from '@/server/paystack-diagnostics';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import type { AppBindings } from '@/server/http/app-bindings';

const orderSchema = z.object({ id: z.string().uuid(), payment_mode: z.enum(['live', 'test']) });
const attemptSchema = z.object({ order_id: z.string().uuid(), provider: z.literal('paystack'), payment_reference: z.string().min(1).max(255) });

export function registerAnnualConferencePaymentDiagnostics(app: Hono<AppBindings>): void {
  app.post('/api/annual-conference/:year/ticketing/orders/:orderId/paystack-check', async (c) => {
    const year = z.string().regex(/^\d{4}$/).safeParse(c.req.param('year'));
    const orderId = z.string().uuid().safeParse(c.req.param('orderId'));

    if (!year.success || !orderId.success) return c.json({ error: 'Invalid conference or order.' }, 400);
    const denied = await requireAdmin(c, ['owner', 'organizer', 'volunteer', 'member']);

    if (denied) return denied;
    const capabilityError = await requireAnnualConferenceCapability(c, Number(year.data), 'ticketing.manage');

    if (capabilityError) return capabilityError;
    const session = c.get('adminSession') ?? await getAdminSession(c);

    if (!session.authenticated || !session.email) return c.json({ error: 'Conference ticketing access required.' }, 403);

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(Number(year.data), c);

      if (!ticketing) return c.json({ error: 'Conference ticketing unavailable.' }, 404);
      const client = getSupabaseAdminClient(c);
      const stored = await client.from('annual_conference_ticket_orders' as never)
        .select('id,payment_mode').eq('id', orderId.data).eq('edition_id', ticketing.settings.edition_id).maybeSingle();
      const order = orderSchema.safeParse(stored.data);

      if (stored.error) throw new Error('Order lookup failed.');
      if (!order.success) return c.json({ error: 'Order not found.' }, 404);
      const attemptResult = await client.from('annual_conference_ticket_payment_attempts')
        .select('order_id,provider,payment_reference').eq('order_id', order.data.id).maybeSingle();
      const attempt = attemptSchema.safeParse(attemptResult.data);

      if (attemptResult.error) throw new Error('Attempt lookup failed.');
      if (!attempt.success || attempt.data.order_id !== order.data.id) return c.json({ error: 'No Paystack attempt is available for this order.' }, 404);
      const limited = await enforcePublicRateLimit(c, {
        action: 'annual-conference-paystack-diagnostic', clientKey: `${session.email}:${order.data.id}`, maxAttempts: 3, windowSeconds: 60,
      }, 'Please wait before checking this payment again.');

      if (limited) return limited;
      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.ticketing.paystack_status_check', targetType: 'annual_conference_ticket_order',
        targetId: order.data.id, metadata: { edition_year: Number(year.data), mode: order.data.payment_mode },
      });
      try {
        await inspectStoredPaystackAttempt(c, { reference: attempt.data.payment_reference, mode: order.data.payment_mode });
      } catch (error) {
        if (error instanceof PaystackDiagnosticConfigurationError) {
          return c.json({ error: `Paystack ${order.data.payment_mode} status checks are not configured on this server. The last known result was retained.` }, 503);
        }

        return c.json({ error: 'Paystack status check failed. The last known result was retained.' }, 503);
      }

      return c.json({ checked: true });
    } catch {
      return c.json({ error: 'Paystack status check is unavailable.' }, 503);
    }
  });
}
