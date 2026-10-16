import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { getAnnualConferenceEditionByYear, requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import type { AppBindings } from '@/server/http/app-bindings';

export async function requireConferenceCheckIn(c: Context, year: number) {
  const auth = await requireAdmin(c, ['owner', 'organizer', 'volunteer']);

  if (auth) return auth;
  const scan = await requireAnnualConferenceCapability(c, year, 'ticketing.check_in');

  if (!scan) return null;

  return await requireAnnualConferenceCapability(c, year, 'ticketing.manage');
}

export function registerAnnualConferenceCheckInRoutes(app: Hono<AppBindings>) {
  const path = '/api/annual-conference/:year/check-in';

  app.get(`${path}/attendees`, async (c) => {
    const year = z.coerce.number().int().min(2000).max(2200).safeParse(c.req.param('year'));
    const query = z.object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(100),
    }).strict().safeParse(c.req.query());

    if (!year.success || !query.success) return c.json({ error: 'Choose a valid attendee list page.' }, 400);
    const auth = await requireConferenceCheckIn(c, year.data);

    if (auth) return auth;
    const edition = await getAnnualConferenceEditionByYear(year.data, c);

    if (!edition) return c.json({ error: 'Conference not found.' }, 404);
    const { page, page_size: pageSize } = query.data;
    const from = (page - 1) * pageSize;
    const result = await getSupabaseAdminClient(c)
      .from('annual_conference_tickets')
      .select('id,attendee_name,status,checked_in_at,order_seat_number')
      .eq('edition_id', edition.id)
      .in('status', ['issued', 'checked_in'])
      .order('id', { ascending: true })
      .range(from, from + pageSize);

    if (result.error) return c.json({ error: 'Unable to load attendees.' }, 503);
    const rows = result.data ?? [];

    c.header('Cache-Control', 'no-store');

    return c.json({
      attendees: rows.slice(0, pageSize).map((ticket) => ({
        ticket_id: ticket.id,
        attendee_name: ticket.attendee_name,
        status: ticket.status,
        checked_in_at: ticket.checked_in_at,
        order_seat_number: ticket.order_seat_number,
      })),
      page,
      page_size: pageSize,
      has_more: rows.length > pageSize,
    });
  });

  app.post(`${path}/search`, async (c) => {
    const year = z.coerce.number().int().min(2000).max(2200).safeParse(c.req.param('year'));
    const input = z.object({ search: z.string().trim().min(3).max(254) }).strict().safeParse(await c.req.json().catch(() => null));

    if (!year.success || !input.success) return c.json({ error: 'Enter at least three characters of a name or the full email.' }, 400);
    const auth = await requireConferenceCheckIn(c, year.data);

    if (auth) return auth;
    const edition = await getAnnualConferenceEditionByYear(year.data, c);

    if (!edition) return c.json({ error: 'Conference not found.' }, 404);
    const result = await getSupabaseAdminClient(c).rpc('find_annual_conference_admissions' as never, {
      p_edition_id: edition.id, p_search: input.data.search,
    } as never);

    if (result.error) return c.json({ error: 'Unable to search admissions.' }, 503);
    c.header('Cache-Control', 'no-store');

    return c.json({ attendees: result.data });
  });

  app.post(`${path}/admit`, async (c) => {
    const year = z.coerce.number().int().min(2000).max(2200).safeParse(c.req.param('year'));
    const input = z.object({ ticket_id: z.string().uuid(), confirmed: z.literal(true) }).strict().safeParse(await c.req.json().catch(() => null));

    if (!year.success || !input.success) return c.json({ error: 'Confirm the attendee before admission.' }, 400);
    const auth = await requireConferenceCheckIn(c, year.data);

    if (auth) return auth;
    const edition = await getAnnualConferenceEditionByYear(year.data, c);
    const session = await getAdminSession(c);

    if (!edition || !session.authenticated) return c.json({ error: 'Conference not found.' }, 404);
    const result = await getSupabaseAdminClient(c).rpc('check_in_annual_conference_named_ticket' as never, {
      p_edition_id: edition.id, p_ticket_id: input.data.ticket_id, p_actor: session.email,
    } as never);

    if (result.error) return c.json({ error: 'Admission was not confirmed. Retry before admitting.' }, 503);
    const outcome: unknown = result.data;

    if (outcome === 'checked_in') await recordProtectedMutationAudit(c, {
      action: 'annual_conference.ticketing.manual_check_in', targetType: 'annual_conference_ticket', targetId: input.data.ticket_id,
      metadata: { edition_year: year.data },
    });

    return c.json({ outcome });
  });
}
