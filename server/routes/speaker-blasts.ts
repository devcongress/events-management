import crypto from 'node:crypto';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { AppBindings } from '@/server/http/app-bindings';
import type { Event } from '@/types';
import { resolveEventSeriesType } from '@/lib/event-series';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { envValue } from '@/server/env';
import { EMAIL_SENDERS } from '@/lib/email/scenarios';
import { sendResendEmailBatch } from '@/lib/email/resend';
import { getEmailDeliveryHealth, getEmailOutboxSummary, recordResendEmailHealth } from '@/lib/email/delivery-health';
import { assessBlastCapacity, blastTransactionalReserve } from '@/lib/email/blast-capacity';
import { speakerBlastEmail } from '@/lib/email/templates/speaker-blast';
import { createSpeakerBlast, getSpeakerBlast, listSpeakerBlasts, replaceSpeakerBlast } from '@/lib/speaker-blast-store';
import { speakerBlastAudienceMatches, speakerBlastDraftSchema, type SpeakerBlast, type SpeakerBlastAudience, type SpeakerBlastIntent } from '@/lib/speaker-blasts';

type Dependencies = {
  getEvent: (id: string, c: Context) => Promise<Event | undefined>;
  audience: (event: Event, intent: SpeakerBlastIntent, c: Context) => Promise<SpeakerBlastAudience>;
  audit: (c: Context, input: { action: string; targetType: string; targetId: string; metadata: Record<string, unknown> }) => Promise<unknown>;
};

function summary(blast: SpeakerBlast) {
  return {
    id: blast.id, intent: blast.intent, subject: blast.subject, status: blast.status,
    created_at: blast.created_at, recipient_count: blast.recipients.length,
    accepted_count: blast.status === 'accepted' ? blast.provider_ids.length : 0,
    error: blast.error,
    recipients: blast.recipients.map((recipient, index) => ({ name: recipient.name, email: recipient.email, provider_id: blast.provider_ids[index] ?? null })),
  };
}

export function registerSpeakerBlastRoutes(app: Hono<AppBindings>, deps: Dependencies) {
  const root = '/api/events/:eventId/speaker-blasts';

  app.use(`${root}*`, async (c, next) => {
    const denied = await requireAdmin(c, ['owner', 'organizer']);

    if (denied) return denied;
    try {
      await next();
    } catch {
      return c.json({ error: 'Speaker email could not be completed. Refresh delivery history before retrying. Check that speaker-blast storage is available.' }, 503);
    }
  });

  async function monthlyEvent(c: Context) {
    const event = await deps.getEvent(c.req.param('eventId')!, c);

    return event && resolveEventSeriesType(event) === 'monthly' ? event : null;
  }

  app.get(root, async (c) => {
    const event = await monthlyEvent(c);

    if (!event) return c.json({ error: 'Speaker blasts are available for monthly events only.' }, 404);
    const intent = c.req.query('intent') === 'slides_reminder' ? 'slides_reminder' : 'update';
    const [audience, rows] = await Promise.all([deps.audience(event, intent, c), listSpeakerBlasts(event.id, c, true)]);

    return c.json({ audience, blasts: rows.map((row) => row.payload).filter((blast) => blast.status !== 'preview').map(summary) });
  });

  app.post(`${root}/preview`, async (c) => {
    const event = await monthlyEvent(c);

    if (!event) return c.json({ error: 'Speaker blasts are available for monthly events only.' }, 404);
    const parsed = speakerBlastDraftSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the message.' }, 400);
    const actor = await getAdminSession(c);

    if (!actor.authenticated || !actor.email) return c.json({ error: 'Sign in again.' }, 401);
    const replyTo = envValue('SPEAKER_EMAIL_REPLY_TO', c)?.trim();

    if (!envValue('RESEND_API_KEY', c)?.trim() || !z.email().safeParse(replyTo).success) {
      return c.json({ error: 'Speaker email delivery is not configured.' }, 503);
    }
    const recent = await listSpeakerBlasts(event.id, c);

    if (recent.filter((row) => Date.parse(row.payload.created_at) > Date.now() - 60_000).length >= 10) {
      return c.json({ error: 'Please wait a minute before preparing another preview.' }, 429);
    }
    const audience = await deps.audience(event, parsed.data.intent, c);

    if (!audience.recipients.length || audience.recipients.length > 100) {
      return c.json({ error: 'A speaker blast needs between 1 and 100 eligible speakers.', audience }, 409);
    }
    const emails = audience.recipients.map((recipient) => ({
      from: EMAIL_SENDERS.speakers.from,
      to: [recipient.email],
      reply_to: replyTo!,
      subject: parsed.data.subject,
      ...speakerBlastEmail({ eventName: event.name, recipient, ...parsed.data }),
    }));
    const blast: SpeakerBlast = {
      id: crypto.randomUUID(), event_id: event.id, created_by: actor.email,
      ...parsed.data, recipients: audience.recipients, emails,
      status: 'preview', provider_ids: [], error: null,
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      first_attempt_at: null, lease_until: null, lease_token: null,
    };

    await createSpeakerBlast(blast, c);

    return c.json({ id: blast.id, expires_at: blast.expires_at, subject: blast.subject, excluded: audience.excluded, previews: emails.map((email, index) => ({ name: audience.recipients[index].name, to: email.to[0], from: email.from, subject: email.subject, text: email.text })) });
  });

  app.post(`${root}/:blastId/send`, async (c) => {
    const event = await monthlyEvent(c);

    if (!event) return c.json({ error: 'Speaker blasts are available for monthly events only.' }, 404);
    const actor = await getAdminSession(c);
    const row = await getSpeakerBlast(c.req.param('blastId'), event.id, c);

    if (!row || !actor.authenticated || row.payload.created_by !== actor.email) return c.json({ error: 'This email preview is not available for this account.' }, 404);
    const blast = row.payload;
    const now = Date.now();

    if (blast.status === 'accepted') return c.json({ blast: summary(blast) });
    if (blast.lease_until && Date.parse(blast.lease_until) > now) return c.json({ error: 'This blast is already being sent. Refresh its status shortly.' }, 409);
    if (!blast.first_attempt_at && Date.parse(blast.expires_at) <= now) return c.json({ error: 'The preview expired. Review a fresh preview before sending.' }, 409);
    if (blast.first_attempt_at && now - Date.parse(blast.first_attempt_at) >= 23 * 60 * 60_000) {
      return c.json({ error: 'The safe retry window has ended. Check delivery with the provider before preparing another message.' }, 409);
    }
    const current = await deps.audience(event, blast.intent, c);

    if (!speakerBlastAudienceMatches(blast.recipients, current.recipients)) return c.json({ error: blast.first_attempt_at ? 'The speakers, slides or private links changed after a delivery attempt. Check delivery with the provider before preparing another message.' : 'The speakers, slides or private links changed. Review a new preview before sending.' }, 409);
    const [health, outbox] = await Promise.all([getEmailDeliveryHealth(c), getEmailOutboxSummary(c)]);
    const capacity = assessBlastCapacity({ recipientCount: blast.recipients.length, health, outbox, protectedReserve: blastTransactionalReserve(envValue('RESEND_BLAST_TRANSACTIONAL_RESERVE', c)) });

    if (!capacity.can_send_now) return c.json({ error: 'There is not enough safe email capacity for this blast. Try again when capacity is available.' }, 409);
    const apiKey = envValue('RESEND_API_KEY', c)?.trim();

    if (!apiKey) return c.json({ error: 'Speaker email delivery is not configured.' }, 503);
    const claimed = await replaceSpeakerBlast(row, {
      ...blast, status: 'sending', error: null,
      first_attempt_at: blast.first_attempt_at ?? new Date(now).toISOString(),
      lease_until: new Date(now + 90_000).toISOString(), lease_token: crypto.randomUUID(),
    }, c);

    if (!claimed) return c.json({ error: 'Another request changed this blast. Refresh its status.' }, 409);
    let result;

    try {
      result = await sendResendEmailBatch({ apiKey, idempotencyKey: `monthly-speaker-blast-${blast.id}`, emails: blast.emails });
    } catch {
      await replaceSpeakerBlast(claimed, { ...claimed.payload, status: 'failed', lease_until: null, error: 'Provider acceptance is not confirmed. Retry this same blast within 23 hours to avoid duplicate sends.' }, c);

      return c.json({ error: 'Provider acceptance is not confirmed. Refresh delivery history and retry this same blast.' }, 502);
    }
    // Save provider truth before nonessential health/audit work. A lost persistence
    // response is recovered with the same immutable provider idempotency key.
    const accepted = await replaceSpeakerBlast(claimed, { ...claimed.payload, status: 'accepted', provider_ids: result.ids, lease_until: null, error: null }, c);

    if (!accepted) return c.json({ error: 'Delivery state changed. Refresh history before retrying.' }, 409);
    await recordResendEmailHealth(c, result.quota).catch(() => undefined);
    await deps.audit(c, { action: 'speaker.blast.accepted', targetType: 'speaker_blast', targetId: blast.id, metadata: { event_id: event.id, recipient_count: blast.recipients.length, intent: blast.intent } }).catch(() => undefined);

    return c.json({ blast: summary(accepted.payload) });
  });
}
