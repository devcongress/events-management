import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { communityPurchase, communityPurchaseRowsSchema } from '@/lib/annual-conference-community-purchases';
import { getSupabaseAnnualConferenceTicketing } from '@/lib/supabase/annual-conference-ticketing';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import type { AppBindings } from '@/server/http/app-bindings';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';

const base = '/api/annual-conference/2026/ticketing/flexible/community-pool';
const listQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict();
const purchaseQuerySchema = listQuerySchema.extend({ mode: z.enum(['live', 'test']).default('live') });
const assignSchema = z.object({
  allocation_id: z.string().uuid(),
  attendee_name: z.string().trim().min(1).max(120),
  attendee_email: z.string().trim().toLowerCase().email().max(254),
  idempotency_key: z.string().uuid(),
}).strict();
const poolRowSchema = z.object({
  allocation_id: z.string().uuid(),
  order_id: z.string().uuid(),
  seat_index: z.number().int().positive(),
  ticket_id: z.string().uuid(),
  ticket_status: z.literal('pending'),
}).strict();
const assignmentSchema = z.object({
  outcome: z.string(),
  ticket_id: z.string().uuid().nullable(),
  order_seat_number: z.number().int().positive().nullable(),
  delivery_queued: z.boolean(),
}).strict();

async function requireOwnerTicketing(c: Context<AppBindings>) {
  const roleError = await requireAdmin(c, ['owner']);

  if (roleError) return roleError;

  return requireAnnualConferenceCapability(c, 2026, 'ticketing.manage');
}

export function registerAnnualConferenceFlexibleOperationsRoutes(app: Hono<AppBindings>): void {
  app.get(`${base}/purchases`, async (c) => {
    const accessError = await requireOwnerTicketing(c);

    if (accessError) return accessError;
    const query = purchaseQuerySchema.safeParse(c.req.query());

    if (!query.success) return c.json({ error: 'Invalid community-purchase page.' }, 400);
    if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Ticketing storage is not configured.' }, 503);
    c.header('Cache-Control', 'private, no-store');

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing) return c.json({ error: 'Conference ticketing is unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c)
        .from('annual_conference_ticket_orders')
        .select(`id, purchaser_name, purchaser_email, payment_mode, created_at,
          allocations:annual_conference_flexible_ticket_allocations!inner(id, seat_index),
          tickets:annual_conference_tickets!annual_conference_tickets_order_edition_fkey(id, order_seat_number, status, attendee_name, attendee_email)`)
        .eq('edition_id', ticketing.settings.edition_id)
        .eq('status', 'paid')
        .filter('checkout_flow', 'eq', 'flexible')
        .filter('payment_mode', 'eq', query.data.mode)
        .eq('allocations.allocation_kind', 'community_managed')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(query.data.offset, query.data.offset + 25);
      const rows = communityPurchaseRowsSchema.safeParse(result.data);

      if (result.error || !rows.success || rows.data.some((row) => row.payment_mode !== query.data.mode)) return c.json({ error: 'Unable to load community purchases.' }, 503);

      return c.json({
        purchases: rows.data.slice(0, 25).map(communityPurchase),
        next_offset: rows.data.length > 25 ? query.data.offset + 25 : null,
      });
    } catch {
      return c.json({ error: 'Unable to load community purchases.' }, 503);
    }
  });

  app.get(base, async (c) => {
    const accessError = await requireOwnerTicketing(c);

    if (accessError) return accessError;
    const query = listQuerySchema.safeParse(c.req.query());

    if (!query.success) return c.json({ error: 'Invalid community-pool page.' }, 400);
    if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Ticketing storage is not configured.' }, 503);

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing) return c.json({ error: 'Conference ticketing is unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c).rpc('list_annual_conference_community_managed_ticket_pool' as never, {
        p_edition_id: ticketing.settings.edition_id,
        p_offset: query.data.offset,
      } as never) as unknown as { data: unknown; error: unknown };
      const rows = z.array(poolRowSchema).max(100).safeParse(result.data);

      if (result.error || !rows.success) return c.json({ error: 'Unable to load the community pool.' }, 503);

      return c.json({ tickets: rows.data, next_offset: rows.data.length === 100 ? query.data.offset + 100 : null });
    } catch {
      return c.json({ error: 'Unable to load the community pool.' }, 503);
    }
  });

  app.post(`${base}/assign`, async (c) => {
    const accessError = await requireOwnerTicketing(c);

    if (accessError) return accessError;
    const input = assignSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Enter a valid seat, recipient, and request key.' }, 400);
    if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Ticketing storage is not configured.' }, 503);
    const session = c.get('adminSession') ?? await getAdminSession(c);

    if (!session.authenticated || session.role !== 'owner') return c.json({ error: 'Owner access is required.' }, 403);

    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing) return c.json({ error: 'Conference ticketing is unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c).rpc('assign_annual_conference_community_managed_ticket' as never, {
        p_edition_id: ticketing.settings.edition_id,
        p_allocation_id: input.data.allocation_id,
        p_name: input.data.attendee_name,
        p_email: input.data.attendee_email,
        p_actor_email: session.email,
        p_idempotency_key: input.data.idempotency_key,
      } as never) as unknown as { data: unknown; error: unknown };
      const assignment = z.array(assignmentSchema).length(1).safeParse(result.data);

      if (result.error || !assignment.success) return c.json({ error: 'Unable to assign this community ticket.' }, 503);
      if (assignment.data[0].outcome !== 'assigned' || !assignment.data[0].ticket_id) {
        return c.json({ error: 'This community ticket is no longer available.' }, 409);
      }

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.ticketing.community_ticket_assign',
        targetType: 'annual_conference_flexible_ticket_allocation',
        targetId: input.data.allocation_id,
        metadata: { edition_year: 2026, ticket_id: assignment.data[0].ticket_id },
      });

      return c.json({ assigned: true, delivery_queued: assignment.data[0].delivery_queued });
    } catch {
      return c.json({ error: 'Unable to assign this community ticket.' }, 503);
    }
  });
}
