import crypto from 'node:crypto';

import type { Context, Hono } from 'hono';
import { z } from 'zod';

import { assessBlastCapacity, blastTransactionalReserve } from '@/lib/email/blast-capacity';
import { getEmailDeliveryHealth, getEmailOutboxSummary } from '@/lib/email/delivery-health';
import {
  addResendBroadcastRecipients,
  createResendBroadcastDraftFromContent,
  ensureResendEventBlastSegment,
  findResendEventBlastSegment,
  getResendBroadcastStatus,
  listResendEventBlastSegmentContacts,
  removeResendEventBlastSegmentContact,
  ResendBroadcastError,
  sendResendBroadcast,
} from '@/lib/email/resend';
import { EMAIL_SENDERS } from '@/lib/email/scenarios';
import {
  VOLUNTEER_BROADCAST_TEMPLATE_VERSION,
  volunteerBroadcastEmail,
} from '@/lib/email/templates/volunteer-broadcast';
import { EVENT_BLAST_PREPARATION_BATCH_SIZE, type VolunteerBlastPreparationMessage } from '@/lib/event-blast-preparation';
import {
  claimVolunteerBlastSegmentSlot,
  findOwnedVolunteerBlastSegmentSlot,
  listEventBlastSegmentSlots,
  markEventBlastSegmentTerminal,
  recordEventBlastSegmentSlotError,
  releaseEventBlastSegmentSlot,
  setEventBlastSegmentSlotProviderId,
  type EventBlastSegmentSlot,
} from '@/lib/event-blast-segment-pool';
import {
  getEventBlastById,
  getVolunteerBroadcasts,
  updateEventBlast,
} from '@/lib/event-blast-store';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import {
  confirmVolunteerBroadcastPreview,
  createVolunteerBroadcastPreview,
  readVolunteerBroadcastPreview,
} from '@/lib/supabase/volunteer-broadcasts';
import {
  getVolunteerFollowUpCampaign,
  listVolunteerFollowUpRecipients,
} from '@/lib/supabase/volunteer-follow-up';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { envValue } from '@/server/env';
import type { AppBindings } from '@/server/http/app-bindings';
import { internalErrorResponse } from '@/server/http/internal-error-response';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import type { EventBlast } from '@/types';

const volunteerBroadcastInputSchema = z.object({
  recipient_ids: z.array(z.string().uuid()).min(1).max(100),
  subject: z.string().trim().min(1, 'Add an email subject.').max(160)
    .refine((value) => !/[\r\n]/u.test(value), 'Use a one-line email subject.'),
  body: z.string().trim().min(1, 'Add a message.').max(5000),
  scheduled_for: z.string().datetime().nullable().optional(),
}).strict().superRefine((value, context) => {
  if (new Set(value.recipient_ids).size !== value.recipient_ids.length) {
    context.addIssue({ code: 'custom', path: ['recipient_ids'], message: 'Choose each volunteer only once.' });
  }
  if (value.scheduled_for && new Date(value.scheduled_for).getTime() < Date.now() + 60_000) {
    context.addIssue({ code: 'custom', path: ['scheduled_for'], message: 'Choose a send time at least one minute from now.' });
  }
});

const volunteerBroadcastConfirmSchema = z.object({
  preview_id: z.string().uuid(),
}).strict();

const volunteerPreparationSchema = z.object({
  kind: z.literal('volunteer'),
  campaign_id: z.string().uuid(),
  blast_id: z.string().uuid(),
  offset: z.number().int().min(0),
  phase: z.enum(['prepare', 'send', 'clear']).optional().default('prepare'),
  slot_number: z.number().int().min(1).max(3).optional(),
}).strict();

function scheduledJobAuthorized(c: Context): boolean {
  const expected = secureSharedSecret(envValue('SLACK_EVENTS_RETRY_SECRET', c));
  const received = c.req.header('x-scheduled-job-secret')?.trim();

  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);

  return expectedBytes.length === receivedBytes.length
    && crypto.timingSafeEqual(expectedBytes, receivedBytes);
}

function broadcastErrorMessage(error: unknown): string {
  if (error instanceof ResendBroadcastError) {
    return error.providerMessage ? `${error.message} Resend says: ${error.providerMessage}` : error.message;
  }

  return 'The selected-volunteer audience could not be prepared. No broadcast was sent.';
}

function volunteerBroadcastCanceled(blast: EventBlast): boolean {
  return blast.status === 'failed' && (
    blast.preparation_error?.startsWith('The broadcast was canceled in Resend.')
    || blast.preparation_error?.startsWith('The scheduled broadcast is no longer queued in Resend.')
  ) === true;
}

function volunteerBroadcastRetryable(blast: EventBlast): boolean {
  return blast.status === 'needs_capacity' || (blast.status === 'failed' && !volunteerBroadcastCanceled(blast));
}

function capacityFor(recipientCount: number, scheduledFor: string | null, c: Context) {
  if (scheduledFor && new Date(scheduledFor).getTime() > Date.now()) return Promise.resolve(null);

  return Promise.all([getEmailDeliveryHealth(c), getEmailOutboxSummary(c)]).then(([health, outbox]) => assessBlastCapacity({
    recipientCount,
    health,
    outbox,
    protectedReserve: blastTransactionalReserve(envValue('RESEND_BLAST_TRANSACTIONAL_RESERVE', c)),
  }));
}

async function queueVolunteerBroadcast(blast: EventBlast, c: Context): Promise<void> {
  const queue = c.env.EVENT_BLAST_PREPARATION_QUEUE;

  if (!queue || !blast.volunteer_campaign_id) throw new Error('Volunteer broadcast queue unavailable.');
  await queue.send({
    kind: 'volunteer',
    campaign_id: blast.volunteer_campaign_id,
    blast_id: blast.id,
    offset: blast.provider_broadcast_id ? blast.prepared_recipient_count : 0,
    phase: blast.provider_broadcast_id ? 'send' : 'prepare',
  });
}

async function queueNextWaitingVolunteerBroadcast(campaignId: string, excludeId: string, c: Context): Promise<void> {
  const next = (await getVolunteerBroadcasts(campaignId, c))
    .find((blast) => blast.id !== excludeId && blast.status === 'waiting');

  if (next) await queueVolunteerBroadcast(next, c);
}

export async function reconcileVolunteerBroadcasts(
  c: Context,
  providedSlots?: EventBlastSegmentSlot[],
): Promise<number> {
  const slots = providedSlots ?? await listEventBlastSegmentSlots(c);
  const apiKey = envValue('RESEND_BROADCASTS_API_KEY', c)?.trim();
  const queue = c.env.EVENT_BLAST_PREPARATION_QUEUE;

  if (!apiKey || !queue) return 0;
  let reconciled = 0;

  for (const slot of slots) {
    if (slot.active_scope !== 'volunteer' || !slot.active_blast_id || !slot.active_volunteer_campaign_id) continue;
    const blast = await getEventBlastById(slot.active_blast_id, c);

    if (!blast || blast.audience_kind !== 'accepted_volunteers') continue;
    if (slot.status === 'clearing') {
      await queue.send({
        kind: 'volunteer',
        campaign_id: slot.active_volunteer_campaign_id,
        blast_id: slot.active_blast_id,
        offset: 0,
        phase: 'clear',
        slot_number: slot.slot_number,
      });
      continue;
    }
    if (!blast.provider_broadcast_id) continue;

    try {
      const providerStatus = await getResendBroadcastStatus({ apiKey, broadcastId: blast.provider_broadcast_id });

      const canceled = ['canceled', 'cancelled'].includes(providerStatus)
        || (blast.status === 'scheduled' && providerStatus === 'draft');

      if (providerStatus !== 'sent' && !canceled) continue;
      await updateEventBlast(blast.id, providerStatus === 'sent'
        ? { status: 'sent', sent_at: new Date().toISOString(), preparation_error: null }
        : {
            status: 'failed',
            preparation_error: ['canceled', 'cancelled'].includes(providerStatus)
              ? 'The broadcast was canceled in Resend. Its audience is being cleared; create a new update to send again.'
              : 'The scheduled broadcast is no longer queued in Resend. Its audience is being cleared; create a new update to send again.',
          }, c);
      await markEventBlastSegmentTerminal(blast.id, slot.slot_number, c);
      await queue.send({
        kind: 'volunteer',
        campaign_id: slot.active_volunteer_campaign_id,
        blast_id: blast.id,
        offset: 0,
        phase: 'clear',
        slot_number: slot.slot_number,
      });
      reconciled += 1;
    } catch (error) {
      console.warn(JSON.stringify({ event: 'volunteer_broadcast_reconciliation_failed', blast_id: blast.id, error: broadcastErrorMessage(error) }));
    }
  }

  return reconciled;
}

export function registerVolunteerBroadcastRoutes(app: Hono<AppBindings>): void {
  app.get('/api/annual-conference/2026/volunteer-follow-up/blasts', async (c) => {
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;

    try {
      const campaign = await getVolunteerFollowUpCampaign(c);

      if (!campaign) return c.json({ accepted_volunteers: [], blasts: [], capacity: null });
      const [recipients, blasts, health, outbox] = await Promise.all([
        listVolunteerFollowUpRecipients(c),
        getVolunteerBroadcasts(campaign.id, c),
        getEmailDeliveryHealth(c),
        getEmailOutboxSummary(c),
      ]);

      return c.json({
        accepted_volunteers: recipients
          .filter((recipient) => recipient.decision === 'accepted')
          .map((recipient) => ({
            id: recipient.id,
            name: recipient.applicant_name,
            email: recipient.applicant_email,
            decision_version: recipient.decision_version,
          })),
        blasts: blasts.map((blast) => ({ ...blast, retryable: volunteerBroadcastRetryable(blast) })),
        capacity: assessBlastCapacity({
          recipientCount: 0,
          health,
          outbox,
          protectedReserve: blastTransactionalReserve(envValue('RESEND_BLAST_TRANSACTIONAL_RESERVE', c)),
        }),
      });
    } catch (error) {
      return internalErrorResponse(c, 'volunteer_broadcast_list_failed', error, 'Unable to load selected-volunteer updates.');
    }
  });

  app.post('/api/annual-conference/2026/volunteer-follow-up/blasts/preview', async (c) => {
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;
    const parsed = volunteerBroadcastInputSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the volunteer update.' }, 400);

    try {
      const campaign = await getVolunteerFollowUpCampaign(c);
      const session = c.get('adminSession') ?? await getAdminSession(c);
      const actorEmail = session.authenticated ? session.email ?? '' : '';

      if (!campaign) return c.json({ error: 'The volunteer campaign is unavailable.' }, 404);
      if (!actorEmail) return c.json({ error: 'Owner session identity is unavailable.' }, 403);
      const rendered = volunteerBroadcastEmail({
        subject: parsed.data.subject,
        body: parsed.data.body,
        unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
      });
      const preview = await createVolunteerBroadcastPreview({
        campaignId: campaign.id,
        recipientIds: parsed.data.recipient_ids,
        subject: rendered.subject,
        body: parsed.data.body,
        scheduledFor: parsed.data.scheduled_for ?? null,
        renderedHtml: rendered.html,
        renderedText: rendered.text,
        templateVersion: VOLUNTEER_BROADCAST_TEMPLATE_VERSION,
        actorEmail,
      }, c);

      return c.json({
        preview_id: preview.id,
        subject: preview.subject,
        body: preview.body,
        scheduled_for: preview.scheduledFor,
        recipients: preview.recipients,
        recipient_count: preview.recipientCount,
        from: rendered.from,
        html: preview.renderedHtml,
        text: preview.renderedText,
        expires_in_seconds: 600,
      });
    } catch (error) {
      if (error instanceof Error && /volunteer_broadcast_(selection_stale|recipient|email_duplicate)/u.test(error.message)) {
        return c.json({ error: 'The selected audience is invalid or changed. Refresh and choose the volunteers again.' }, 409);
      }

      return internalErrorResponse(c, 'volunteer_broadcast_preview_failed', error, 'Unable to preview the selected-volunteer update.');
    }
  });

  app.post('/api/annual-conference/2026/volunteer-follow-up/blasts/confirm', async (c) => {
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;
    const parsed = volunteerBroadcastConfirmSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Preview the selected audience first.' }, 400);

    try {
      const session = c.get('adminSession') ?? await getAdminSession(c);
      const actorEmail = session.authenticated ? session.email ?? '' : '';

      if (!actorEmail) return c.json({ error: 'Owner session identity is unavailable.' }, 403);
      const preview = await readVolunteerBroadcastPreview({ previewId: parsed.data.preview_id, actorEmail }, c);

      if (!preview) return c.json({ error: 'This preview is unavailable. Create a new preview.' }, 404);
      if (preview.expiresAt <= new Date().toISOString() && !preview.confirmedBlastId) {
        return c.json({ error: 'This preview expired. Create a new preview.' }, 409);
      }
      if (preview.confirmedBlastId) {
        const existing = await getEventBlastById(preview.confirmedBlastId, c);

        if (existing?.status === 'waiting') {
          try {
            await queueVolunteerBroadcast(existing, c);
          } catch {
            const failed = await updateEventBlast(existing.id, {
              status: 'failed',
              preparation_error: 'The background preparation could not be queued. No Broadcast was sent; retry this update.',
            }, c);

            return c.json({ blast: failed ?? existing, delivery: 'failed', already_confirmed: true }, 503);
          }
        }

        return c.json({ blast: existing, delivery: existing?.status ?? 'waiting', already_confirmed: true }, 200);
      }
      const blast = await confirmVolunteerBroadcastPreview({ previewId: preview.id, actorEmail }, c);
      let capacity: Awaited<ReturnType<typeof capacityFor>>;

      try {
        capacity = await capacityFor(blast.recipient_count, blast.scheduled_for, c);
      } catch {
        const failed = await updateEventBlast(blast.id, {
          status: 'failed',
          preparation_error: 'Email capacity could not be checked. No Broadcast was sent; retry this update.',
        }, c);

        return c.json({ blast: failed ?? blast, delivery: 'failed' }, 503);
      }

      if (capacity && !capacity.can_send_now) {
        const deferred = await updateEventBlast(blast.id, {
          status: 'needs_capacity',
          preparation_error: `Protected transactional capacity is active. ${capacity.safe_recipients_today ?? 0} recipients can send safely today.`,
        }, c);

        return c.json({ blast: deferred ?? blast, delivery: 'needs_capacity', capacity }, 202);
      }
      const apiKey = envValue('RESEND_BROADCASTS_API_KEY', c)?.trim();
      const replyTo = envValue('REGISTRATION_EMAIL_REPLY_TO', c)?.trim();

      if (!apiKey || !replyTo || !z.string().email().safeParse(replyTo).success) {
        const unavailable = await updateEventBlast(blast.id, {
          status: 'needs_capacity',
          preparation_error: 'Email broadcasts are not configured. Add the Resend broadcast key and monitored reply-to address, then retry.',
        }, c);

        return c.json({ blast: unavailable ?? blast, delivery: 'needs_capacity', capacity }, 202);
      }
      if (!c.env.EVENT_BLAST_PREPARATION_QUEUE) {
        const failed = await updateEventBlast(blast.id, {
          status: 'failed',
          preparation_error: 'Background blast preparation is not configured. Deploy the Worker queue binding, then retry.',
        }, c);

        return c.json({ blast: failed ?? blast, delivery: 'failed', capacity }, 503);
      }
      try {
        await queueVolunteerBroadcast(blast, c);
      } catch {
        const failed = await updateEventBlast(blast.id, {
          status: 'failed',
          preparation_error: 'The background preparation could not be queued. No Broadcast was sent; retry this update.',
        }, c);

        return c.json({ blast: failed ?? blast, delivery: 'failed', capacity }, 503);
      }
      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.volunteer_broadcast.queue',
        targetType: 'volunteer_broadcast',
        targetId: blast.id,
        metadata: { campaign_id: blast.volunteer_campaign_id, recipient_count: blast.recipient_count, scheduled_for: blast.scheduled_for },
      });

      return c.json({ blast, delivery: 'waiting', capacity }, 202);
    } catch (error) {
      if (error instanceof Error && /volunteer_broadcast_(selection_stale|preview_expired)/u.test(error.message)) {
        return c.json({ error: 'The selected audience changed. Create a new preview.' }, 409);
      }

      return internalErrorResponse(c, 'volunteer_broadcast_confirm_failed', error, 'Unable to queue the selected-volunteer update.');
    }
  });

  app.post('/api/annual-conference/2026/volunteer-follow-up/blasts/:id/retry', async (c) => {
    const adminError = await requireAdmin(c, ['owner']);

    if (adminError) return adminError;

    try {
      const blast = await getEventBlastById(c.req.param('id'), c);

      if (!blast || blast.audience_kind !== 'accepted_volunteers') return c.json({ error: 'Volunteer update not found.' }, 404);
      if (!['failed', 'needs_capacity'].includes(blast.status)) return c.json({ error: 'Only an update that needs attention can be retried.' }, 409);
      if (volunteerBroadcastCanceled(blast)) return c.json({ error: 'This Broadcast was canceled in Resend. Create a new update if it should be sent again.' }, 409);
      const capacity = await capacityFor(blast.recipient_count, blast.scheduled_for, c);

      if (capacity && !capacity.can_send_now) {
        const deferred = await updateEventBlast(blast.id, {
          status: 'needs_capacity',
          preparation_error: `Protected transactional capacity is active. ${capacity.safe_recipients_today ?? 0} recipients can send safely today.`,
        }, c);

        return c.json({ blast: deferred ?? blast, delivery: 'needs_capacity', capacity }, 202);
      }
      const replyTo = envValue('REGISTRATION_EMAIL_REPLY_TO', c)?.trim();

      if (!envValue('RESEND_BROADCASTS_API_KEY', c)?.trim()
        || !replyTo
        || !z.string().email().safeParse(replyTo).success
        || !c.env.EVENT_BLAST_PREPARATION_QUEUE) {
        return c.json({ error: 'The broadcast key, monitored reply-to, or background queue is unavailable.' }, 503);
      }
      const resumed = await updateEventBlast(blast.id, {
        status: 'waiting',
        preparation_error: null,
        ...(blast.provider_broadcast_id ? {} : { provider_segment_id: null, prepared_recipient_count: 0 }),
      }, c);

      try {
        await queueVolunteerBroadcast(resumed ?? blast, c);
      } catch {
        const failed = await updateEventBlast(blast.id, {
          status: 'failed',
          preparation_error: 'The background retry could not be queued. No Broadcast was sent; retry this update.',
        }, c);

        return c.json({ blast: failed ?? resumed ?? blast, delivery: 'failed', capacity }, 503);
      }
      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.volunteer_broadcast.retry_queue',
        targetType: 'volunteer_broadcast',
        targetId: blast.id,
        metadata: { campaign_id: blast.volunteer_campaign_id, recipient_count: blast.recipient_count },
      });

      return c.json({ blast: resumed ?? blast, delivery: 'waiting', capacity }, 202);
    } catch (error) {
      return internalErrorResponse(c, 'volunteer_broadcast_retry_failed', error, 'Unable to retry the selected-volunteer update.');
    }
  });

  app.post('/api/internal/volunteer-broadcasts/prepare', async (c) => {
    if (!scheduledJobAuthorized(c)) return c.json({ error: 'Not found.' }, 404);
    const parsed = volunteerPreparationSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Invalid preparation message.' }, 400);
    const message: VolunteerBlastPreparationMessage = parsed.data;
    let blast = await getEventBlastById(message.blast_id, c);

    if (!blast || blast.audience_kind !== 'accepted_volunteers' || blast.volunteer_campaign_id !== message.campaign_id) {
      return c.json({ ok: true, skipped: 'blast_missing' });
    }
    if (message.phase !== 'clear' && !['waiting', 'preparing'].includes(blast.status)) {
      return c.json({ ok: true, skipped: 'not_waiting' });
    }
    let slot = message.phase === 'clear' && message.slot_number
      ? await findOwnedVolunteerBlastSegmentSlot(blast.id, message.campaign_id, message.slot_number, c)
      : null;

    if (message.phase === 'clear' && (!slot || slot.status !== 'clearing' || !slot.terminal_confirmed_at)) {
      return c.json({ ok: true, skipped: 'clear_slot_not_owned_or_terminal' });
    }
    const apiKey = envValue('RESEND_BROADCASTS_API_KEY', c)?.trim();
    const replyTo = envValue('REGISTRATION_EMAIL_REPLY_TO', c)?.trim();
    const queue = c.env.EVENT_BLAST_PREPARATION_QUEUE;

    if (!apiKey || !queue) return c.json({ error: 'Broadcast preparation is not configured.' }, 503);
    const scheduleExpired = blast.scheduled_for
      && new Date(blast.scheduled_for).getTime() <= Date.now();
    const immediateCapacityCheck = message.phase !== 'clear'
      && (message.phase === 'send' || message.offset === 0)
      && (!blast.scheduled_for || scheduleExpired);

    if (immediateCapacityCheck) {
      let capacity: Awaited<ReturnType<typeof capacityFor>>;

      try {
        capacity = await capacityFor(blast.recipient_count, null, c);
      } catch {
        await updateEventBlast(blast.id, {
          status: 'failed',
          preparation_error: 'Email capacity could not be checked immediately before the Broadcast send. No Broadcast was sent; retry this update.',
        }, c);

        return c.json({ ok: true, status: 'failed', error: 'Email capacity could not be checked.' });
      }
      if (capacity && !capacity.can_send_now) {
        await updateEventBlast(blast.id, {
          status: 'needs_capacity',
          preparation_error: `${scheduleExpired ? 'The scheduled time passed during preparation. ' : ''}Protected transactional capacity is active; ${capacity.safe_recipients_today ?? 0} recipients can send safely today.`,
        }, c);

        return c.json({ ok: true, status: 'needs_capacity' });
      }
    }
    if (message.phase !== 'clear') {
      slot = await claimVolunteerBlastSegmentSlot(blast.id, message.campaign_id, c);

      if (!slot) {
        await updateEventBlast(blast.id, { status: 'waiting', preparation_error: null }, c);
        await queue.send({ ...message, phase: 'prepare' }, { delaySeconds: 900 });

        return c.json({ ok: true, status: 'waiting_for_segment_slot' });
      }
    }
    if (!slot) return c.json({ ok: true, skipped: 'slot_unavailable' });

    try {
      if (!slot.provider_segment_id && message.phase !== 'clear') {
        const segmentId = await ensureResendEventBlastSegment({ apiKey, slotNumber: slot.slot_number });
        const saved = await setEventBlastSegmentSlotProviderId(blast.id, slot.slot_number, segmentId, c);

        if (!saved) throw new Error('The provider segment could not be attached to its shared slot.');
        slot = { ...slot, provider_segment_id: segmentId };
      }
      if (message.phase === 'clear') {
        if (!slot.provider_segment_id) {
          const segmentId = await findResendEventBlastSegment({ apiKey, slotNumber: slot.slot_number });

          if (!segmentId) {
            await releaseEventBlastSegmentSlot(blast.id, slot.slot_number, c);
            await queueNextWaitingVolunteerBroadcast(message.campaign_id, blast.id, c);

            return c.json({ ok: true, slot_released: true });
          }
          await setEventBlastSegmentSlotProviderId(blast.id, slot.slot_number, segmentId, c);
          slot = { ...slot, provider_segment_id: segmentId };
        }
        const contacts = await listResendEventBlastSegmentContacts({ apiKey, segmentId: slot.provider_segment_id! });

        for (const contact of contacts.slice(0, EVENT_BLAST_PREPARATION_BATCH_SIZE)) {
          await removeResendEventBlastSegmentContact({ apiKey, segmentId: slot.provider_segment_id!, contactId: contact.id });
        }
        if (contacts.length > 0) {
          await queue.send({ ...message, phase: 'clear', slot_number: slot.slot_number });

          return c.json({ ok: true, clearing_contacts: contacts.length });
        }
        await releaseEventBlastSegmentSlot(blast.id, slot.slot_number, c);
        await queueNextWaitingVolunteerBroadcast(message.campaign_id, blast.id, c);

        return c.json({ ok: true, slot_released: true });
      }
      if (message.phase === 'prepare' && message.offset === 0 && blast.prepared_recipient_count === 0) {
        const oldContacts = await listResendEventBlastSegmentContacts({ apiKey, segmentId: slot.provider_segment_id! });

        for (const contact of oldContacts.slice(0, EVENT_BLAST_PREPARATION_BATCH_SIZE)) {
          await removeResendEventBlastSegmentContact({ apiKey, segmentId: slot.provider_segment_id!, contactId: contact.id });
        }
        if (oldContacts.length > 0) {
          await queue.send({ ...message, phase: 'prepare' });

          return c.json({ ok: true, cleared_old_members: oldContacts.length });
        }
      }
      if (message.phase === 'send') {
        if (!blast.provider_broadcast_id) return c.json({ ok: true, skipped: 'broadcast_missing' });
        const providerStatus = await getResendBroadcastStatus({ apiKey, broadcastId: blast.provider_broadcast_id });
        const scheduledFor = blast.scheduled_for && new Date(blast.scheduled_for).getTime() > Date.now()
          ? blast.scheduled_for
          : null;

        if (providerStatus === 'draft') {
          await sendResendBroadcast({ apiKey, broadcastId: blast.provider_broadcast_id, scheduledFor });
        } else if (!['scheduled', 'queued', 'sent'].includes(providerStatus)) {
          throw new ResendBroadcastError(`The provider broadcast is ${providerStatus} and cannot be retried.`);
        }
        const status = providerStatus === 'sent' || (!scheduledFor && ['draft', 'queued'].includes(providerStatus)) ? 'sent' : 'scheduled';

        await updateEventBlast(blast.id, { status, sent_at: scheduledFor ? null : new Date().toISOString(), preparation_error: null }, c);

        return c.json({ ok: true, status });
      }
      if (message.offset !== blast.prepared_recipient_count) return c.json({ ok: true, skipped: 'stale_message' });
      const recipients = blast.recipient_snapshot
        .slice(message.offset, message.offset + EVENT_BLAST_PREPARATION_BATCH_SIZE)
        .map(({ name, email }) => ({ name, email }));

      if (recipients.length > 0) {
        await addResendBroadcastRecipients({ apiKey, segmentId: slot.provider_segment_id!, recipients });
        const preparedCount = message.offset + recipients.length;

        await updateEventBlast(blast.id, {
          status: 'preparing',
          provider_segment_id: slot.provider_segment_id,
          prepared_recipient_count: preparedCount,
          preparation_error: null,
        }, c);
        if (preparedCount < blast.recipient_count) {
          await queue.send({ ...message, offset: preparedCount, phase: 'prepare' });

          return c.json({ ok: true, prepared_recipient_count: preparedCount });
        }
      }
      blast = await getEventBlastById(blast.id, c) ?? blast;
      let broadcastId = blast.provider_broadcast_id;

      if (!broadcastId) {
        if (!replyTo || !z.string().email().safeParse(replyTo).success) throw new ResendBroadcastError('The monitored reply-to address is not configured.');
        if (!blast.rendered_html || !blast.rendered_text) throw new Error('The frozen volunteer broadcast content is unavailable.');
        broadcastId = await createResendBroadcastDraftFromContent({
          apiKey,
          segmentId: slot.provider_segment_id!,
          name: 'DevCongress · DevCon26 volunteer update',
          from: EMAIL_SENDERS.events.from,
          replyTo,
          subject: blast.subject,
          html: blast.rendered_html,
          text: blast.rendered_text,
        });
        await updateEventBlast(blast.id, {
          provider_segment_id: slot.provider_segment_id,
          provider_broadcast_id: broadcastId,
          preparation_error: null,
        }, c);
      }
      await queue.send({ ...message, offset: blast.recipient_count, phase: 'send', slot_number: slot.slot_number });

      return c.json({ ok: true, status: 'ready_to_send' });
    } catch (error) {
      const providerStatus = error instanceof ResendBroadcastError ? error.status : null;
      const status = providerStatus === 402 || providerStatus === 403 || providerStatus === 429 ? 'needs_capacity' : 'failed';
      const errorMessage = broadcastErrorMessage(error);

      if (message.phase === 'clear') {
        await recordEventBlastSegmentSlotError(blast.id, slot.slot_number, errorMessage, c);

        return c.json({ error: errorMessage }, 503);
      }
      await updateEventBlast(blast.id, { status, preparation_error: errorMessage }, c);
      console.error(JSON.stringify({ event: 'volunteer_broadcast_preparation_failed', blast_id: blast.id, provider_status: providerStatus, error: errorMessage }));

      return c.json({ ok: true, status, error: errorMessage });
    }
  });
}
