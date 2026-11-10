import crypto from 'node:crypto';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { annualConferenceSpeakerWorkspaceToken, annualConferenceSpeakerWorkspaceTokenMatches, getAnnualConferenceSpeakerIntakeLinkById, getAnnualConferenceSpeakerSubmissions, getAnnualConferenceSessionUpdateDetails } from '@/lib/annual-conference-speakers';
import { defaultSpeakerUpdate, renderSpeakerUpdate, type SpeakerUpdateRecipient } from '@/lib/annual-conference-speaker-updates';
import { getSpeakerUpdate, getSpeakerUpdatePreview, listSpeakerUpdateDeliveries, listSpeakerUpdateDeliveryStatuses, listSpeakerUpdates, queueSpeakerUpdate, saveSpeakerUpdate, saveSpeakerUpdatePreview, suppressedSpeakerUpdateEmails } from '@/lib/annual-conference-speaker-update-store';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { sendResendEmailBatch } from '@/lib/email/resend';
import { recordResendEmailHealth } from '@/lib/email/delivery-health';
import { getAnnualConferenceEditionByYear, requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { enforcePublicRateLimit } from '@/server/http/public-intake-protection';
import { publicAppOrigin } from '@/server/http/public-app-origin';
import { internalErrorResponse } from '@/server/http/internal-error-response';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { envValue } from '@/server/env';
import type { AppBindings } from '@/server/http/app-bindings';
import { annualConferenceEmailConfigured, annualConferenceSpeakerEmailEnvelope } from './delivery';

const messageSchema = z.object({ subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value)), message: z.string().trim().min(1).max(10000).refine((value) => value.includes('{workspace_url}')) });
const placeholders = /\{(?!first_name\}|talk_title\}|edition\}|workspace_url\}|year\})[^}]*\}/;
const previewSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100).refine((ids) => new Set(ids).size === ids.length), version: z.number().int().positive() }).strict();

function sendingEnabled(c: Context<AppBindings>): boolean {
  return envValue('DEVCON26_SPEAKER_UPDATES_ENABLED', c) === 'true'
    && isSupabaseRuntimeEnabled(c)
    && annualConferenceEmailConfigured(c);
}

async function ownerAccess(c: Context<AppBindings>) {
  const denied = await requireAdmin(c, ['owner']);

  if (denied) return denied;
  if (!/^\d{4}$/.test(c.req.param('year') ?? '')) return c.json({ error: 'Conference year must use four digits.' }, 400);

  return requireAnnualConferenceCapability(c, Number(c.req.param('year')), 'speakers.manage');
}

async function candidates(c: Context<AppBindings>, editionId: string) {
  const submissions = (await getAnnualConferenceSpeakerSubmissions(editionId)).filter((item) => item.decision_email_kind === 'acceptance' && item.decision_email_sent_at);
  const suppressed = await suppressedSpeakerUpdateEmails(submissions.map((item) => (item.decision_email_recipient ?? item.speaker_email).trim().toLowerCase()));
  const secret = secureSharedSecret(envValue('SPEAKER_INTAKE_LINK_TOKEN_SECRET', c));
  const seen = new Set<string>();
  const result = [];

  for (const submission of submissions) {
    const email = (submission.decision_email_recipient ?? submission.speaker_email).trim().toLowerCase();
    const link = submission.selected_intake_link_id ? await getAnnualConferenceSpeakerIntakeLinkById(submission.selected_intake_link_id) : undefined;
    let reason: string | null = null;

    if (submission.status !== 'selected') reason = 'This proposal is no longer selected.';
    else if (!['accepted', 'delivered', 'delayed'].includes(submission.decision_email_status ?? '')) reason = 'The original acceptance has a delivery problem.';
    else if (!z.string().email().safeParse(email).success || email !== submission.speaker_email.trim().toLowerCase()) reason = 'The speaker email has changed since the acceptance.';
    else if (suppressed.has(email)) reason = 'This email address is suppressed.';
    else if (!secret || !link || link.revoked_at || link.edition_id !== editionId || link.speaker_submission_id !== submission.id || link.workspace_session_id !== submission.selected_session_id || !annualConferenceSpeakerWorkspaceTokenMatches(link, secret)) reason = 'The private workspace link is unavailable.';
    else if (seen.has(email)) reason = 'Another selected proposal uses this email address.';
    if (!reason) seen.add(email);
    result.push({ id: submission.id, name: submission.speaker_name, email, eligible: !reason, reason, submission, link });
  }

  return result;
}

export function registerSpeakerUpdateRoutes(app: Hono<AppBindings>) {
  const base = '/api/annual-conference/:year/speaker-updates';

  app.get(base, async (c) => {
    const denied = await ownerAccess(c);

    if (denied) return denied;
    c.header('Cache-Control', 'no-store');
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);

      if (!edition) return c.json({ error: 'Conference edition not found.' }, 404);
      const [campaigns, audience] = await Promise.all([listSpeakerUpdates(edition.id), candidates(c, edition.id)]);

      const [deliveryStatuses, sessions] = await Promise.all([
        listSpeakerUpdateDeliveryStatuses(campaigns.filter(campaign => campaign.state !== 'draft').map(campaign => campaign.id)),
        getAnnualConferenceSessionUpdateDetails(audience.flatMap(({ submission }) => submission.selected_session_id ? [submission.selected_session_id] : [])),
      ]);
      const summaries = new Map<string, { total: number; statuses: Record<string, number> }>();

      for (const delivery of deliveryStatuses) {
        const summary = summaries.get(delivery.update_id) ?? { total: 0, statuses: {} };

        summary.total += 1;
        summary.statuses[delivery.status] = (summary.statuses[delivery.status] ?? 0) + 1;
        summaries.set(delivery.update_id, summary);
      }
      const sessionById = new Map(sessions.map(session => [session.id, session]));
      const history = campaigns.map(campaign => ({ ...campaign, delivery_summary: summaries.get(campaign.id) ?? { total: 0, statuses: {} } }));
      const candidateDetails = audience.map(({ id, name, email, eligible, reason, submission }) => {
        const session = submission.selected_session_id ? sessionById.get(submission.selected_session_id) : undefined;
        const missing = session ? [
          ...(!session.availability_confirmed ? ['confirmation'] : []),
          ...(!session.headshot_url?.trim() && !session.headshot_photo_path?.trim() ? ['headshot'] : []),
          ...(!session.social_handle?.trim() ? ['socials'] : []),
        ] : null;

        return { id, name, email, eligible, reason, missing_workspace_details: missing };
      });
      const enabled = sendingEnabled(c);

      return c.json({ campaigns: history, candidates: candidateDetails, default_draft: defaultSpeakerUpdate(edition.year), sending_enabled: enabled, send_unavailable_reason: enabled ? null : 'Sending becomes available after follow-up delivery is enabled and configured.' });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_updates_load_failed', error, 'Unable to load speaker updates.');
    }
  });

  app.post(base, async (c) => {
    const denied = await ownerAccess(c);

    if (denied) return denied;
    const parsed = messageSchema.strict().safeParse(await c.req.json().catch(() => null));

    if (!parsed.success || placeholders.test(`${parsed.data.subject} ${parsed.data.message}`)) return c.json({ error: 'Check the subject, message, and placeholders. Include {workspace_url}.' }, 400);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);

      if (!edition) return c.json({ error: 'Conference edition not found.' }, 404);
      const campaign = await saveSpeakerUpdate(edition.id, parsed.data);

      await recordProtectedMutationAudit(c, { action: 'annual_conference.speaker_update.create', targetType: 'annual_conference_edition', targetId: edition.id });

      return c.json({ campaign }, 201);
    } catch (error) {
      return internalErrorResponse(c, 'speaker_update_create_failed', error, 'Unable to create speaker update.');
    }
  });

  app.get(`${base}/:id`, async (c) => {
    const denied = await ownerAccess(c);

    if (denied) return denied;
    c.header('Cache-Control', 'no-store');
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);
      const campaign = edition && await getSpeakerUpdate(edition.id, c.req.param('id'));

      if (!campaign) return c.json({ error: 'Speaker update not found.' }, 404);
      const deliveries = await listSpeakerUpdateDeliveries(campaign.id);

      return c.json({ campaign, deliveries: deliveries.map(({ provider_payload: _payload, idempotency_key: _key, ...delivery }) => delivery) });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_update_load_failed', error, 'Unable to load speaker update.');
    }
  });

  app.put(`${base}/:id`, async (c) => {
    const denied = await ownerAccess(c);

    if (denied) return denied;
    const parsed = messageSchema.extend({ version: z.number().int().positive() }).strict().safeParse(await c.req.json().catch(() => null));

    if (!parsed.success || placeholders.test(`${parsed.data.subject} ${parsed.data.message}`)) return c.json({ error: 'Check the subject, message, and version. Include {workspace_url}.' }, 400);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);

      if (!edition) return c.json({ error: 'Conference edition not found.' }, 404);
      const campaign = await saveSpeakerUpdate(edition.id, { ...parsed.data, id: c.req.param('id') });

      if (!campaign) return c.json({ error: 'This draft changed or was already queued. Refresh and try again.' }, 409);
      await recordProtectedMutationAudit(c, { action: 'annual_conference.speaker_update.save', targetType: 'annual_conference_speaker_update', targetId: campaign.id });

      return c.json({ campaign });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_update_save_failed', error, 'Unable to save speaker update.');
    }
  });

  app.post(`${base}/:id/preview`, async (c) => {
    const denied = await ownerAccess(c);

    if (denied) return denied;
    c.header('Cache-Control', 'no-store');
    const parsed = previewSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Choose up to 100 unique recipients and a draft version.' }, 400);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);
      const campaign = edition && await getSpeakerUpdate(edition.id, c.req.param('id'));
      const session = c.get('adminSession') ?? await getAdminSession(c);
      const envelope = annualConferenceSpeakerEmailEnvelope(c);
      const secret = secureSharedSecret(envValue('SPEAKER_INTAKE_LINK_TOKEN_SECRET', c));

      if (!edition || !campaign) return c.json({ error: 'Speaker update not found.' }, 404);
      if (!session.authenticated || !session.membership_id) return c.json({ error: 'Owner session identity is unavailable.' }, 403);
      if (!envelope || !secret) return c.json({ error: 'Speaker email sending is not configured.' }, 503);
      if (campaign.state !== 'draft' || campaign.version !== parsed.data.version) return c.json({ error: 'The draft changed. Refresh and preview again.' }, 409);
      const audience = await candidates(c, edition.id);
      const recipients: SpeakerUpdateRecipient[] = [];

      for (const id of parsed.data.ids) {
        const item = audience.find((candidate) => candidate.id === id);

        if (!item?.eligible || !item.link) return c.json({ error: 'A selected speaker is no longer eligible. Refresh and review the audience.' }, 409);
        const workspaceUrl = new URL(`/conference-speakers/${edition.year}/${annualConferenceSpeakerWorkspaceToken(item.link.id, secret)}`, publicAppOrigin(c)).toString();
        const rendered = renderSpeakerUpdate({ template: campaign, speakerName: item.name, talkTitle: item.submission.title, edition: edition.label, workspaceUrl, year: String(edition.year) });
        const key = `speaker-update-${crypto.randomUUID()}`;

        recipients.push({ id, name: item.name, recipient: item.email, speaker_email: item.submission.speaker_email.trim().toLowerCase(), link_id: item.link.id, link_expires_at: item.link.expires_at, key, ...rendered, provider_payload: { from: envelope.from, reply_to: envelope.replyTo, to: [item.email], ...rendered } });
      }
      const previewId = crypto.randomUUID();

      await saveSpeakerUpdatePreview({ id: previewId, update_id: campaign.id, edition_id: edition.id, actor_id: session.membership_id, version: campaign.version, recipients, expires_at: new Date(Date.now() + 600000).toISOString(), used_at: null, queued_count: null });

      return c.json({ preview_id: previewId, expires_in_seconds: 600, recipients: recipients.map(({ id, name, recipient, subject, html, text }) => ({ id, name, recipient, subject, html, text, preview_url: `/api/annual-conference/${edition.year}/speaker-updates/${campaign.id}/previews/${previewId}/recipients/${id}/html` })) });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_update_preview_failed', error, 'Unable to preview speaker update.');
    }
  });

  app.get(`${base}/:id/previews/:previewId/recipients/:recipientId/html`, async (c) => {
    const denied = await ownerAccess(c);

    if (denied) return denied;
    const params = z.object({ id: z.string().uuid(), previewId: z.string().uuid(), recipientId: z.string().uuid() }).safeParse(c.req.param());

    if (!params.success) return c.json({ error: 'The preview is unavailable. Preview again.' }, 404);
    const session = c.get('adminSession') ?? await getAdminSession(c);

    if (!session.authenticated || !session.membership_id) return c.json({ error: 'Owner session identity is unavailable.' }, 403);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);
      const campaign = edition && await getSpeakerUpdate(edition.id, params.data.id);

      if (!edition || !campaign) return c.json({ error: 'Speaker update not found.' }, 404);
      const preview = await getSpeakerUpdatePreview(params.data.previewId, campaign.id, edition.id, session.membership_id);
      const item = preview && !preview.used_at && Date.parse(preview.expires_at) > Date.now() && preview.version === campaign.version && campaign.state === 'draft'
        ? preview.recipients.find((recipient) => recipient.id === params.data.recipientId)
        : undefined;

      if (!item) return c.json({ error: 'The preview expired or is unavailable. Preview again.' }, 409);

      return c.html(item.html, 200, {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
      });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_update_preview_document_failed', error, 'Unable to load speaker update preview.');
    }
  });

  app.post(`${base}/:id/test`, async (c) => {
    const denied = await ownerAccess(c);

    if (denied) return denied;
    const parsed = z.object({ preview_id: z.string().uuid(), recipient_id: z.string().uuid(), email: z.string().trim().email().max(254), request_id: z.string().uuid() }).strict().safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Choose a preview and enter one valid test email address.' }, 400);
    const session = c.get('adminSession') ?? await getAdminSession(c);
    const apiKey = envValue('RESEND_API_KEY', c)?.trim();

    if (!session.authenticated || !session.membership_id || !session.email) return c.json({ error: 'Owner session identity is unavailable.' }, 403);
    if (!apiKey) return c.json({ error: 'Test email sending is not configured.' }, 503);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);
      const campaign = edition && await getSpeakerUpdate(edition.id, c.req.param('id'));

      if (!edition || !campaign) return c.json({ error: 'Speaker update not found.' }, 404);
      const preview = await getSpeakerUpdatePreview(parsed.data.preview_id, campaign.id, edition.id, session.membership_id);
      const item = preview && !preview.used_at && Date.parse(preview.expires_at) > Date.now() && preview.version === campaign.version && campaign.state === 'draft' ? preview.recipients.find((recipient) => recipient.id === parsed.data.recipient_id) : undefined;

      if (!item) return c.json({ error: 'The preview expired or is unavailable. Preview again.' }, 409);
      const rateError = await enforcePublicRateLimit(c, { action: 'speaker_update_email_test', clientKey: session.membership_id, maxAttempts: 5, windowSeconds: 600 }, 'Wait a few minutes before sending another test email.');

      if (rateError) return rateError;
      const recipient = parsed.data.email.toLowerCase();
      const digest = crypto.createHash('sha256').update(JSON.stringify([session.membership_id, preview!.id, item.id, recipient, parsed.data.request_id])).digest('hex');
      let result: Awaited<ReturnType<typeof sendResendEmailBatch>>;

      try {
        result = await sendResendEmailBatch({ apiKey, idempotencyKey: `speaker-update-test-${digest}`, emails: [{ ...item.provider_payload, to: [recipient] }] });
      } catch {
        return c.json({ error: 'Test email acceptance could not be confirmed. Check your inbox before retrying.' }, 502);
      }
      try {
        await recordResendEmailHealth(c, result.quota);
        await recordProtectedMutationAudit(c, { action: 'annual_conference.speaker_update.test_send', targetType: 'annual_conference_speaker_update', targetId: campaign.id, metadata: { preview_id: preview!.id, recipient_id: item.id, custom_recipient: recipient !== session.email.toLowerCase(), provider_id: result.ids[0] } });
      } catch {
        console.warn(JSON.stringify({ event: 'speaker_update_test_reporting_failed', update_id: campaign.id }));
      }

      return c.json({ accepted: true, recipient });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_update_test_failed', error, 'Unable to prepare test email.');
    }
  });

  app.post(`${base}/:id/send`, async (c) => {
    const denied = await ownerAccess(c);

    if (denied) return denied;
    const parsed = z.object({ preview_id: z.string().uuid(), confirmed: z.literal(true) }).strict().safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Preview and confirm the selected recipients first.' }, 400);
    if (!sendingEnabled(c)) return c.json({ error: 'Sending becomes available after follow-up delivery is enabled and configured.' }, 503);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);
      const campaign = edition && await getSpeakerUpdate(edition.id, c.req.param('id'));
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!edition || !campaign) return c.json({ error: 'Speaker update not found.' }, 404);
      if (!session.authenticated || !session.membership_id) return c.json({ error: 'Owner session identity is unavailable.' }, 403);
      const preview = await getSpeakerUpdatePreview(parsed.data.preview_id, campaign.id, edition.id, session.membership_id);

      if (!preview) return c.json({ error: 'The preview expired or is unavailable. Preview again.' }, 409);
      if (!preview.used_at) {
        const audience = await candidates(c, edition.id);

        if (preview.recipients.some((recipient) => {
          const item = audience.find((candidate) => candidate.id === recipient.id);

          return !item?.eligible || item.email !== recipient.recipient || item.link?.id !== recipient.link_id || item.link.expires_at !== recipient.link_expires_at || item.submission.speaker_email.trim().toLowerCase() !== recipient.speaker_email;
        })) return c.json({ error: 'The audience or workspace changed. Preview again.' }, 409);
      }
      const queued = await queueSpeakerUpdate(preview);

      try {
        await recordProtectedMutationAudit(c, { action: 'annual_conference.speaker_update.queue', targetType: 'annual_conference_speaker_update', targetId: campaign.id, metadata: { recipient_count: queued } });
      } catch {
        console.warn(JSON.stringify({ event: 'speaker_update_queue_audit_failed', update_id: campaign.id }));
      }

      return c.json({ queued });
    } catch (error) {
      if (error instanceof Error && error.message.includes('preview')) return c.json({ error: error.message }, 409);

      return internalErrorResponse(c, 'speaker_update_queue_failed', error, 'Unable to queue speaker update.');
    }
  });

  app.post(`${base}/:id/deliveries/:deliveryId/retry`, async (c) => {
    const denied = await ownerAccess(c);

    if (denied) return denied;
    if (!sendingEnabled(c)) return c.json({ error: 'Sending becomes available after follow-up delivery is enabled and configured.' }, 503);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);
      const campaign = edition && await getSpeakerUpdate(edition.id, c.req.param('id'));

      if (!campaign) return c.json({ error: 'Speaker update not found.' }, 404);
      if (!z.string().uuid().safeParse(c.req.param('deliveryId')).success || !isSupabaseRuntimeEnabled()) return c.json({ error: 'This delivery cannot be retried.' }, 409);
      const result = await getSupabaseAdminClient().rpc('retry_annual_conference_speaker_update' as never, { p_update_id: campaign.id, p_delivery_id: c.req.param('deliveryId') } as never);

      if (result.error) throw new Error('Unable to retry speaker update.');
      if (!result.data) return c.json({ error: 'This delivery cannot be retried. Review its status and workspace.' }, 409);
      await recordProtectedMutationAudit(c, { action: 'annual_conference.speaker_update.retry', targetType: 'annual_conference_speaker_update', targetId: campaign.id, metadata: { delivery_id: c.req.param('deliveryId') } });

      return c.json({ queued: true });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_update_retry_failed', error, 'Unable to retry speaker update.');
    }
  });
}
