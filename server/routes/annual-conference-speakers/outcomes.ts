import crypto from 'crypto';
import type { Hono, Context } from 'hono';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { annualConferenceSpeakerWorkspaceToken, annualConferenceSpeakerWorkspaceTokenMatches, getAnnualConferenceSpeakerIntakeLinkById, getAnnualConferenceSpeakerSubmission, type AnnualConferenceEmailKind } from '@/lib/annual-conference-speakers';
import { defaultSpeakerOutcomeMessage, getSpeakerOutcomeMessage, getSpeakerOutcomePreviewRecipient, isLegacyDefaultAcceptance, queueSpeakerOutcomePreview, renderSpeakerOutcomeMessage, saveSpeakerOutcomeMessage, saveSpeakerOutcomePreview } from '@/lib/annual-conference-speaker-outcomes';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { getAnnualConferenceEditionByYear, requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { sendResendEmailBatch } from '@/lib/email/resend';
import { recordResendEmailHealth } from '@/lib/email/delivery-health';
import { enforcePublicRateLimit } from '@/server/http/public-intake-protection';
import { envValue } from '@/server/env';
import { publicAppOrigin } from '@/server/http/public-app-origin';
import { internalErrorResponse } from '@/server/http/internal-error-response';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import type { AppBindings } from '@/server/http/app-bindings';
import { annualConferenceEmailConfigured, annualConferenceSpeakerEmailEnvelope } from './delivery';

const kindSchema = z.enum(['acceptance', 'rejection']);
const selectionSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100).refine((ids) => new Set(ids).size === ids.length) }).strict();
const messageSchema = z.object({ kind: kindSchema, subject: z.string().trim().min(1).max(200).refine((s) => !/[\r\n]/.test(s)), message: z.string().trim().min(1).max(10000), version: z.number().int().min(0) }).strict();

async function ownerAccess(c: Context<AppBindings>, capability: 'speakers.outcomes.view' | 'speakers.outcomes.manage' | 'speakers.outcomes.send') {
  const error = await requireAdmin(c, ['owner', 'organizer', 'member']);

  if (error) return error;
  const year = Number(c.req.param('year'));

  if (!/^\d{4}$/.test(c.req.param('year') ?? '')) return c.json({ error: 'Conference year must use four digits.' }, 400);

  return requireAnnualConferenceCapability(c, year, capability);
}

async function preview(c: Context<AppBindings>, ids: string[]) {
  const year = Number(c.req.param('year'));
  const edition = await getAnnualConferenceEditionByYear(year, c);

  if (!edition) throw new Error('Conference edition not found.');
  const envelope = annualConferenceSpeakerEmailEnvelope(c);

  if (!envelope) throw new Error('Speaker email sending is not configured.');
  const records = await Promise.all(ids.map((id) => getAnnualConferenceSpeakerSubmission(id)));
  const messages = new Map<AnnualConferenceEmailKind, Awaited<ReturnType<typeof getSpeakerOutcomeMessage>>>();
  const result = [];

  for (const submission of records) {
    if (!submission || submission.edition_id !== edition.id || !submission.decision_email_kind
      || !['pending', 'failed'].includes(submission.decision_email_status ?? '') || submission.decision_email_attempt_count !== 0 || submission.decision_email_queued_at
      || !submission.decision_email_idempotency_key
      || (submission.decision_email_kind === 'acceptance' ? submission.status !== 'selected' : submission.status !== 'not_selected')) {
      throw new Error('A selected recipient is no longer ready to send. Refresh the list.');
    }
    let message = messages.get(submission.decision_email_kind);

    if (!message) {
      message = await getSpeakerOutcomeMessage(edition.id, submission.decision_email_kind);
      messages.set(submission.decision_email_kind, message);
    }
    let workspaceUrl = '';
    let linkId: string | null = null;
    let linkExpiresAt: string | null = null;
    const deadline = edition.speaker_logistics_deadline ?? null;

    if (submission.decision_email_kind === 'acceptance') {
      const secret = secureSharedSecret(envValue('SPEAKER_INTAKE_LINK_TOKEN_SECRET', c));
      const link = submission.selected_intake_link_id ? await getAnnualConferenceSpeakerIntakeLinkById(submission.selected_intake_link_id) : undefined;

      if (!secret || !deadline || !link || link.revoked_at
        || link.edition_id !== edition.id || link.speaker_submission_id !== submission.id
        || link.workspace_session_id !== submission.selected_session_id
        || !annualConferenceSpeakerWorkspaceTokenMatches(link, secret)) {
        throw new Error('A selected speaker workspace is unavailable. Refresh and review the deadline or link.');
      }
      linkId = link.id;
      linkExpiresAt = link.expires_at;
      workspaceUrl = new URL(`/conference-speakers/${year}/${annualConferenceSpeakerWorkspaceToken(link.id, secret)}`, publicAppOrigin(c)).toString();
    }
    const [duration, format] = submission.session_type.split('-minute ');
    const date = edition.provisional_date
      ? new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${edition.provisional_date}T00:00:00Z`))
      : 'To be confirmed';
    const rendered = renderSpeakerOutcomeMessage({
      template: message, speakerName: submission.speaker_name, talkTitle: submission.title, edition: edition.label,
      deadline: deadline ? new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(deadline)) : '',
      workspaceUrl, year: String(year), sessionFormat: format || submission.session_type, sessionDuration: format ? `${duration} minutes` : 'To be confirmed',
      conferenceDate: year === 2026 ? '19 December 2026' : edition.provisional_date && edition.date_status === 'provisional' ? `${date} (provisional)` : date,
      conferenceVenue: year === 2026 ? 'Ghana Digital Center, Accra' : 'To be confirmed',
    });

    result.push({ id: submission.id, key: submission.decision_email_idempotency_key, kind: submission.decision_email_kind, version: message.version, deadline, link_id: linkId, link_expires_at: linkExpiresAt, name: submission.speaker_name, from: envelope.from, replyTo: envelope.replyTo, recipient: submission.decision_email_recipient ?? submission.speaker_email, ...rendered });
  }

  return { edition, recipients: result };
}

export function registerSpeakerOutcomeRoutes(app: Hono<AppBindings>) {
  const base = '/api/annual-conference/:year/speaker-outcomes';

  app.get(`${base}/messages`, async (c) => {
    const denied = await ownerAccess(c, 'speakers.outcomes.view');

    if (denied) return denied;
    c.header('Cache-Control', 'no-store');
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);

      if (!edition) return c.json({ error: 'Conference edition not found.' }, 404);

      const messages = await Promise.all(['acceptance', 'rejection'].map((kind) => getSpeakerOutcomeMessage(edition.id, kind as AnnualConferenceEmailKind)));

      return c.json({ messages, suggested_acceptance: defaultSpeakerOutcomeMessage(edition.id, 'acceptance'), legacy_acceptance: messages.some(isLegacyDefaultAcceptance) });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_outcome_messages_failed', error, 'Unable to load outcome messages.');
    }
  });

  app.put(`${base}/messages`, async (c) => {
    const denied = await ownerAccess(c, 'speakers.outcomes.manage');

    if (denied) return denied;
    const parsed = messageSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Check the message, subject, and version.' }, 400);
    if (parsed.data.kind === 'acceptance' && !parsed.data.message.includes('{workspace_url}')) return c.json({ error: 'Acceptance messages must include {workspace_url}.' }, 400);
    if (/\{(?!first_name\}|talk_title\}|edition\}|deadline\}|workspace_url\}|year\}|session_format\}|session_duration\}|conference_date\}|conference_venue\})[^}]*\}/.test(`${parsed.data.subject} ${parsed.data.message}`)) return c.json({ error: 'The message contains an unknown placeholder.' }, 400);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);

      if (!edition) return c.json({ error: 'Conference edition not found.' }, 404);
      const saved = await saveSpeakerOutcomeMessage({ edition_id: edition.id, ...parsed.data });

      if (!saved) return c.json({ error: 'This message changed elsewhere. Refresh and try again.' }, 409);
      const session = c.get('adminSession') ?? await getAdminSession(c);

      await recordProtectedMutationAudit(c, { action: 'annual_conference.speaker_outcome_message.save', targetType: 'annual_conference_edition', targetId: edition.id, metadata: { kind: parsed.data.kind, actor: session.authenticated ? session.email : null } });

      return c.json({ message: await getSpeakerOutcomeMessage(edition.id, parsed.data.kind) });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_outcome_message_save_failed', error, 'Unable to save the outcome message.');
    }
  });

  app.post(`${base}/preview`, async (c) => {
    const denied = await ownerAccess(c, 'speakers.outcomes.manage');

    if (denied && await ownerAccess(c, 'speakers.outcomes.send')) return denied;
    c.header('Cache-Control', 'no-store');
    const parsed = selectionSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Choose up to 100 unique recipients.' }, 400);
    try {
      const prepared = await preview(c, parsed.data.ids);

      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!session.authenticated || !session.membership_id) return c.json({ error: 'Owner session identity is unavailable.' }, 403);
      const previewId = crypto.randomUUID();

      await saveSpeakerOutcomePreview({ id: previewId, edition_id: prepared.edition.id, actor_id: session.membership_id, recipients: prepared.recipients, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), used_at: null });

      return c.json({ recipients: prepared.recipients.map(({ key: _key, ...recipient }) => recipient), preview_id: previewId, expires_in_seconds: 600 });
    } catch (error) {
      if (error instanceof Error && (error.message.includes('no longer ready') || error.message.includes('workspace is unavailable'))) return c.json({ error: error.message }, 409);

      return internalErrorResponse(c, 'speaker_outcome_preview_failed', error, 'Unable to preview messages.');
    }
  });

  app.post(`${base}/test`, async (c) => {
    const denied = await ownerAccess(c, 'speakers.outcomes.send');

    if (denied) return denied;
    const parsed = z.object({ preview_id: z.string().uuid(), recipient_id: z.string().uuid(), email: z.string().trim().max(254).email(), request_id: z.string().uuid() }).strict().safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Choose a preview and enter one valid test email address.' }, 400);
    const session = c.get('adminSession') ?? await getAdminSession(c);

    if (!session.authenticated || !session.membership_id || !session.email) return c.json({ error: 'Owner session identity is unavailable.' }, 403);
    const apiKey = envValue('RESEND_API_KEY', c)?.trim();

    if (!apiKey) return c.json({ error: 'Test email sending is not configured.' }, 503);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);

      if (!edition) return c.json({ error: 'Conference edition not found.' }, 404);
      const item = await getSpeakerOutcomePreviewRecipient(parsed.data.preview_id, edition.id, session.membership_id, parsed.data.recipient_id);

      if (!item) return c.json({ error: 'The preview expired or is unavailable. Preview again.' }, 409);
      const rateError = await enforcePublicRateLimit(c, { action: 'speaker_outcome_email_test', clientKey: session.membership_id, maxAttempts: 5, windowSeconds: 600 }, 'Wait a few minutes before sending another test email.');

      if (rateError) return rateError;
      const recipient = parsed.data.email.toLowerCase();
      const digest = crypto.createHash('sha256').update(JSON.stringify([session.membership_id, parsed.data.preview_id, item.id, recipient, parsed.data.request_id])).digest('hex');
      let result: Awaited<ReturnType<typeof sendResendEmailBatch>>;

      try {
        result = await sendResendEmailBatch({ apiKey, idempotencyKey: `speaker-outcome-test-${digest}`, emails: [{ from: item.from, reply_to: item.replyTo, to: [recipient], subject: item.subject, html: item.html, text: item.text }] });
      } catch {
        return c.json({ error: 'Test email acceptance could not be confirmed. Check your inbox before retrying.' }, 502);
      }
      try {
        await recordResendEmailHealth(c, result.quota);
      } catch {
        console.warn(JSON.stringify({ event: 'speaker_outcome_test_health_failed', edition_id: edition.id }));
      }
      try {
        await recordProtectedMutationAudit(c, { action: 'annual_conference.speaker_outcomes.test_send', targetType: 'annual_conference_edition', targetId: edition.id, metadata: { preview_id: parsed.data.preview_id, recipient_id: item.id, custom_recipient: recipient !== session.email.toLowerCase(), provider_id: result.ids[0] } });
      } catch {
        console.warn(JSON.stringify({ event: 'speaker_outcome_test_reporting_failed', edition_id: edition.id }));
      }

      return c.json({ accepted: true, recipient });
    } catch (error) {
      return internalErrorResponse(c, 'speaker_outcome_test_failed', error, 'Unable to prepare the test email.');
    }
  });

  app.post(`${base}/send`, async (c) => {
    const denied = await ownerAccess(c, 'speakers.outcomes.send');

    if (denied) return denied;
    const parsed = z.object({ preview_id: z.string().uuid() }).strict().safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Preview the selected recipients first.' }, 400);
    if (!annualConferenceEmailConfigured(c)) return c.json({ error: 'Speaker email sending is not configured.' }, 503);
    try {
      const edition = await getAnnualConferenceEditionByYear(Number(c.req.param('year')), c);
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!edition) return c.json({ error: 'Conference edition not found.' }, 404);
      if (!session.authenticated || !session.membership_id) return c.json({ error: 'Owner session identity is unavailable.' }, 403);
      const queued = await queueSpeakerOutcomePreview(parsed.data.preview_id, edition.id, session.membership_id);

      try {
        await recordProtectedMutationAudit(c, { action: 'annual_conference.speaker_outcomes.queue', targetType: 'annual_conference_edition', targetId: edition.id, metadata: { recipient_count: queued } });
      } catch {
        console.warn(JSON.stringify({ event: 'speaker_outcome_queue_audit_failed', edition_id: edition.id }));
      }

      return c.json({ queued });
    } catch (error) {
      if (error instanceof Error && error.message.includes('preview expired')) return c.json({ error: error.message }, 409);

      return internalErrorResponse(c, 'speaker_outcome_queue_failed', error, 'Unable to queue outcome messages.');
    }
  });
}
