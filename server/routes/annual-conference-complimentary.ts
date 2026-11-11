import crypto from 'node:crypto';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { sendResendAttachedEmail } from '@/lib/email/resend';
import { assertAdminOrigin } from '@/lib/supabase/admin-auth';
import { conferenceTicketPdf } from '@/server/conference-ticket-pdf';
import { markCompleteTestEmail } from '@/server/complete-test-email-context';
import { envValue } from '@/server/env';
import { enforcePublicRateLimit } from '@/server/http/public-intake-protection';
import { conferenceTicketEmail } from '@/lib/email/templates/conference-ticket';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { getSupabaseAnnualConferenceTicketing } from '@/lib/supabase/annual-conference-ticketing';
import { requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import type { AppBindings } from '@/server/http/app-bindings';

const base = '/api/annual-conference/2026/ticketing/complimentary';
const guestSchema = z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().toLowerCase().email().max(254), supporter_order_id: z.string().uuid().optional() }).strict();
const issueSchema = z.object({
  allocation_id: z.string().uuid().nullable(),
  reason: z.string().trim().min(1).max(1000),
  guests: z.array(guestSchema).min(1).max(100),
  idempotency_key: z.string().uuid(),
}).strict().refine(value => new Set(value.guests.map(guest => guest.email)).size === value.guests.length);

async function owner(c: Context<AppBindings>) {
  const denied = await requireAdmin(c, ['owner', 'organizer', 'volunteer', 'member']);

  return denied ?? await requireAnnualConferenceCapability(c, 2026, c.req.method === 'GET' ? 'ticketing.complimentary.view' : 'ticketing.complimentary.manage');
}

export function registerAnnualConferenceComplimentaryRoutes(app: Hono<AppBindings>) {
  app.post(`${base}/preview`, async (c) => {
    const denied = await owner(c);

    if (denied) return denied;
    const input = issueSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Check guest names, distinct email addresses, and the internal reason.' }, 400);
    c.header('Cache-Control', 'private, no-store');

    return c.json(conferenceTicketEmail({ name: input.data.guests[0].name, hasTicket: true, complimentary: true,
      badgeUrl: 'https://devcongress.org/devcon26/social-card/#preview-only' }));
  });

  app.post(`${base}/send-test`, async (c) => {
    const denied = await owner(c);

    if (denied) return denied;
    const originError = assertAdminOrigin(c);

    if (originError) return originError;
    const session = c.get('adminSession') ?? await getAdminSession(c);

    if (!session.authenticated || !session.email) return c.json({ error: 'Conference ticketing access required.' }, 403);
    const input = z.object({ guest: guestSchema, recipient: z.string().trim().toLowerCase().email().max(254), request_id: z.string().uuid() }).strict()
      .safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Enter a valid test email address.' }, 400);
    const apiKey = envValue('RESEND_API_KEY', c)?.trim();
    const from = envValue('DEVCON26_ADMISSION_EMAIL_FROM', c)?.trim();
    const replyTo = envValue('DEVCON26_ADMISSION_EMAIL_REPLY_TO', c)?.trim();

    if (!apiKey || !from || !replyTo) return c.json({ error: 'Test email sending is not configured.' }, 503);
    const actor = session.membership_id ?? session.user_id ?? session.email;
    const rateError = await enforcePublicRateLimit(c, { action: 'complimentary_email_test', clientKey: actor,
      maxAttempts: 5, windowSeconds: 600 }, 'Wait a few minutes before sending another test email.');

    if (rateError) return rateError;
    const digest = crypto.createHash('sha256').update(JSON.stringify([actor, input.data.recipient,
      input.data.guest, input.data.request_id])).digest('hex');
    const email = markCompleteTestEmail(conferenceTicketEmail({ name: input.data.guest.name, hasTicket: true,
      complimentary: true, badgeUrl: 'https://devcongress.org/devcon26/social-card/#preview-only' }));

    try {
      const pdf = await conferenceTicketPdf({ token: 'TEST-ONLY-NOT-AN-ADMISSION-CAPABILITY',
        name: input.data.guest.name, seat: 1, isTest: true });

      await sendResendAttachedEmail({ apiKey, idempotencyKey: `complimentary-test:${digest}`,
        email: { ...email, from, to: [input.data.recipient], reply_to: replyTo,
          attachments: [{ filename: 'devcon26-TEST-NOT-VALID.pdf', content: Buffer.from(pdf).toString('base64'), content_type: 'application/pdf' }] } });
    } catch {
      return c.json({ error: 'Test acceptance could not be confirmed. Check the inbox before retrying; the same request uses the same send key.' }, 502);
    }
    try {
      await recordProtectedMutationAudit(c, { action: 'annual_conference.ticketing.complimentary_test_send',
        targetType: 'annual_conference_edition', targetId: '2026', metadata: { edition_year: 2026, custom_recipient: input.data.recipient !== session.email.toLowerCase() } });
    } catch {
      console.warn(JSON.stringify({ event: 'complimentary_test_send_audit_failed' }));
    }

    return c.json({ accepted: true, recipient: input.data.recipient });
  });

  app.get(`${base}/supporters`, async (c) => {
    const denied = await owner(c);

    if (denied) return denied;
    if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Ticketing storage is not configured.' }, 503);
    const offset = z.coerce.number().int().min(0).max(100_000).safeParse(c.req.query('offset') ?? 0);

    if (!offset.success) return c.json({ error: 'Invalid supporter page.' }, 400);
    c.header('Cache-Control', 'private, no-store');
    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing) return c.json({ error: 'Ticketing is unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c).rpc('list_annual_conference_complimentary_supporters' as never,
        { p_edition_id: ticketing.settings.edition_id, p_offset: offset.data } as never);

      if (result.error) return c.json({ error: 'Unable to load community supporters.' }, 503);
      const rows = Array.isArray(result.data) ? result.data : [];

      return c.json({ supporters: rows.slice(0, 25), has_more: rows.length > 25 });
    } catch {
      return c.json({ error: 'Unable to load community supporters.' }, 503);
    }
  });

  app.get(base, async (c) => {
    const denied = await owner(c);

    if (denied) return denied;
    if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Ticketing storage is not configured.' }, 503);
    const offset = z.coerce.number().int().min(0).max(100_000).safeParse(c.req.query('offset') ?? 0);

    if (!offset.success) return c.json({ error: 'Invalid ticket page.' }, 400);
    c.header('Cache-Control', 'private, no-store');
    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing) return c.json({ error: 'Ticketing is unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c).rpc('list_annual_conference_complimentary_tickets' as never,
        { p_edition_id: ticketing.settings.edition_id, p_offset: offset.data } as never);

      if (result.error) return c.json({ error: 'Unable to load complimentary tickets.' }, 503);

      const rows = Array.isArray(result.data) ? result.data : [];

      return c.json({ tickets: rows.slice(0, 25), has_more: rows.length > 25 });
    } catch {
      return c.json({ error: 'Unable to load complimentary tickets.' }, 503);
    }
  });

  app.post(base, async (c) => {
    const denied = await owner(c);

    if (denied) return denied;
    const input = issueSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Check guest names, distinct email addresses, and the internal reason.' }, 400);
    if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Ticketing storage is not configured.' }, 503);
    const session = c.get('adminSession') ?? await getAdminSession(c);

    if (!session.authenticated) return c.json({ error: 'Conference ticketing access required.' }, 403);
    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing) return c.json({ error: 'Ticketing is unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c).rpc('issue_annual_conference_complimentary_tickets' as never, {
        p_edition_id: ticketing.settings.edition_id, p_allocation_id: input.data.allocation_id,
        p_reason: input.data.reason, p_guests: input.data.guests, p_actor_email: session.email,
        p_idempotency_key: input.data.idempotency_key,
      } as never);

      if (result.error) {
        if (/supporter_existing_admission|supporter_invalid|annual_conference_tickets_active_supporter_email_idx/.test(result.error.message)) {
          return c.json({ error: 'A selected supporter is no longer eligible or already has an admission. Refresh the supporter list and review their ticket.' }, 409);
        }
        if (/capacity_exhausted|allocation_exhausted|idempotency_mismatch/.test(result.error.message)) {
          return c.json({ error: 'Seats are unavailable or this request key was already used for different guests.' }, 409);
        }

        return c.json({ error: 'Unable to issue complimentary tickets.' }, 503);
      }
      await recordProtectedMutationAudit(c, { action: 'annual_conference.ticketing.complimentary_issue',
        targetType: 'annual_conference_complimentary_batch', targetId: String(result.data),
        metadata: { edition_year: 2026, guest_count: input.data.guests.length } });

      return c.json({ batch_id: result.data, queued: true });
    } catch {
      return c.json({ error: 'Unable to issue complimentary tickets. Retry the same request.' }, 503);
    }
  });

  app.post(`${base}/:ticketId/cancel`, async (c) => {
    const denied = await owner(c);

    if (denied) return denied;
    const ticketId = z.string().uuid().safeParse(c.req.param('ticketId'));

    if (!ticketId.success) return c.json({ error: 'Invalid ticket.' }, 400);
    if (!isSupabaseRuntimeEnabled(c)) return c.json({ error: 'Ticketing storage is not configured.' }, 503);
    try {
      const ticketing = await getSupabaseAnnualConferenceTicketing(2026, c);

      if (!ticketing) return c.json({ error: 'Ticketing is unavailable.' }, 503);
      const result = await getSupabaseAdminClient(c).rpc('cancel_annual_conference_complimentary_ticket' as never,
        { p_edition_id: ticketing.settings.edition_id, p_ticket_id: ticketId.data } as never);

      if (result.error) return c.json({ error: 'This ticket cannot be cancelled. It may have been checked in.' }, 409);
      if (result.data) await recordProtectedMutationAudit(c, { action: 'annual_conference.ticketing.complimentary_cancel',
        targetType: 'annual_conference_ticket', targetId: ticketId.data, metadata: { edition_year: 2026 } });

      return c.json({ cancelled: true });
    } catch {
      return c.json({ error: 'Unable to cancel this ticket.' }, 503);
    }
  });
}
