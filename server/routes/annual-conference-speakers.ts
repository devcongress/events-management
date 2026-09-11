import crypto from 'crypto';
import type { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT,
  ANNUAL_CONFERENCE_BIO_WORD_LIMIT,
  ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX,
  ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN,
  ANNUAL_CONFERENCE_SESSION_TYPES,
  ANNUAL_CONFERENCE_TOPIC_TRACKS,
} from '@/lib/annual-conference-cfp';
import { hasAnnualConferenceCapability, effectiveAnnualConferenceCapabilities } from '@/lib/annual-conference-capabilities';
import {
  annualConferenceSpeakerWorkspaceToken,
  annualConferenceSpeakerWorkspaceTokenMatches,
  applyAnnualConferenceDecisionEmailProviderEvent,
  acceptAnnualConferenceSpeakerSubmission,
  createAnnualConferenceSpeakerSubmission,
  getAnnualConferenceSession,
  getAnnualConferenceSpeakerIntakeLink,
  getAnnualConferenceSpeakerIntakeLinkById,
  getAnnualConferenceSpeakerSubmission,
  getAnnualConferenceSpeakerSubmissions,
  insertAnnualConferenceEmailWebhookEvent,
  rejectAnnualConferenceSpeakerSubmission,
  replaceAnnualConferenceDecisionEmailRecipient,
  rotateAnnualConferenceSpeakerWorkspace,
  updateAnnualConferenceSessionLogistics,
  updateAnnualConferenceSpeakerIntakeDeadlines,
  updateAnnualConferenceSpeakerSubmission,
  type AnnualConferenceSpeakerSubmission,
} from '@/lib/annual-conference-speakers';
import { getAnnualConferenceAccessGrants } from '@/lib/supabase/annual-conference-access-grants';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { createAnnualConferenceRepository } from '@/server/annual-conference-repository';
import { CFP_SUBMISSION_TURNSTILE_ACTION } from '@/lib/turnstile';
import { safePublicResourceUrl } from '@/lib/safe-url';
import { envValue } from '@/server/env';
import {
  getAnnualConferenceEditionByYear,
  requireAnnualConferenceCapability,
} from '@/server/annual-conference-request';
import type { AppBindings } from '@/server/http/app-bindings';
import { internalErrorResponse } from '@/server/http/internal-error-response';
import {
  assessPublicSubmissionEmail,
  enforcePublicRateLimit,
  publicClientKey,
  publicEmailErrorPayload,
  requirePublicTurnstile,
} from '@/server/http/public-intake-protection';
import { acquireSpeakerIntakeSubmissionLock } from '@/server/http/speaker-intake-lock';
import { safeErrorName } from '@/server/security-log';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { verifyResendWebhookSignature } from '@/lib/email/event-submission-replies';
import {
  annualConferenceDecisionEmailCanBeRetriedManually,
  annualConferenceDecisionEmailCooldownElapsed,
  annualConferenceEmailConfigured,
  annualConferenceWorkspaceEmailConfigured,
  deliverAnnualConferenceDecisionEmail,
  retryAnnualConferenceDecisionEmails,
} from './annual-conference-speakers/delivery';
import {
  annualConferenceResendWebhookSchema,
  conferenceSpeakerDeadlineSchema,
  conferenceSpeakerEmailRecipientSchema,
  conferenceSpeakerLogisticsSchema,
  conferenceSpeakerReplacementEmailSchema,
  conferenceSpeakerSubmissionCreateSchema,
  conferenceSpeakerSubmissionDecisionSchema,
} from './annual-conference-speakers/schemas';

function speakerSubmissionCounts(submissions: Array<Pick<AnnualConferenceSpeakerSubmission, 'status'>>) {
  return submissions.reduce((counts, submission) => {
    counts[submission.status] += 1;

    return counts;
  }, {
    submitted: 0,
    selected: 0,
    not_selected: 0,
    withdrawn: 0,
  });
}

function annualConferenceDeadline(edition: { speaker_logistics_deadline?: string | null }): string | null {
  return edition.speaker_logistics_deadline ?? null;
}

function annualConferenceWebhookOutcome(type: string, eventAt: string) {
  if (type === 'email.delivered') return { status: 'delivered' as const, deliveredAt: eventAt, retryable: false, lastError: null };
  if (type === 'email.delivery_delayed') return { status: 'delayed' as const, retryable: false, lastError: 'The provider reported a delivery delay.' };
  if (type === 'email.bounced') return { status: 'bounced' as const, retryable: false, lastError: 'The message bounced. Correct the delivery address before sending again.' };
  if (type === 'email.suppressed') return { status: 'suppressed' as const, retryable: false, lastError: 'The provider suppressed this recipient. Correct the address or resolve the suppression before sending again.' };
  if (type === 'email.complained') return { status: 'complained' as const, retryable: false, lastError: 'The recipient reported this message. Do not resend without their consent.' };

  return { status: 'failed' as const, retryable: false, lastError: 'The provider reported a permanent delivery failure. Correct the address before sending again.' };
}

function scheduledJobAuthorized(c: Context): boolean {
  const expected = secureSharedSecret(envValue('SLACK_EVENTS_RETRY_SECRET', c));
  const received = c.req.header('x-scheduled-job-secret')?.trim();

  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function registerAnnualConferenceSpeakerRoutes(app: Hono<AppBindings>): void {
  app.get('/api/annual-conference/:year/speakers', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer']);

    if (adminError) return adminError;
    const yearParam = c.req.param('year');

    if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'Conference year must use four digits.' }, 400);
    const year = Number(yearParam);
    const capabilityError = await requireAnnualConferenceCapability(c, year, 'speakers.view');

    if (capabilityError) return capabilityError;

    try {
      const edition = await getAnnualConferenceEditionByYear(year, c);

      if (!edition) return c.json({ error: `Annual conference ${year} was not found.` }, 404);
      const submissions = await getAnnualConferenceSpeakerSubmissions(edition.id);
      const session = c.get('adminSession') ?? await getAdminSession(c);

      if (!session.authenticated) return c.json({ error: 'Conference access required.' }, 401);
      const access = await getAnnualConferenceAccessGrants(edition.id, session.membership_id, c);
      const capabilities = effectiveAnnualConferenceCapabilities({
        role: session.role,
        grants: access,
        isPlanningOwner: session.email?.trim().toLowerCase() === edition.task_creator_email.trim().toLowerCase(),
      });
      const submissionDetails = await Promise.all(submissions.map(async (submission) => {
        const [decisionLink, acceptedSession] = await Promise.all([
          submission.selected_intake_link_id
            ? getAnnualConferenceSpeakerIntakeLinkById(submission.selected_intake_link_id)
            : undefined,
          submission.selected_session_id
            ? getAnnualConferenceSession(submission.selected_session_id)
            : undefined,
        ]);

        return {
          ...submission,
          decision_email_status: submission.decision_email_status ?? decisionLink?.email_status ?? null,
          decision_email_recipient: submission.decision_email_recipient ?? decisionLink?.email_recipient ?? submission.speaker_email,
          decision_email_last_attempt_at: submission.decision_email_last_attempt_at ?? decisionLink?.email_last_attempt_at ?? null,
          decision_email_sent_at: submission.decision_email_sent_at ?? decisionLink?.email_sent_at ?? null,
          decision_email_delivered_at: submission.decision_email_delivered_at ?? decisionLink?.email_delivered_at ?? null,
          decision_email_last_error: submission.decision_email_last_error ?? decisionLink?.email_last_error ?? null,
          decision_email_attempt_count: submission.decision_email_attempt_count ?? decisionLink?.email_attempt_count ?? 0,
          decision_email_retryable: submission.decision_email_retryable ?? decisionLink?.email_retryable ?? true,
          logistics: acceptedSession ? {
            slides_url: acceptedSession.slides_url,
            availability_confirmed: acceptedSession.availability_confirmed,
            technical_requirements: acceptedSession.technical_requirements,
            workshop_prerequisites: acceptedSession.workshop_prerequisites,
            required_software_equipment: acceptedSession.required_software_equipment,
            participants_need_laptops: acceptedSession.participants_need_laptops,
            preferred_workshop_capacity: acceptedSession.preferred_workshop_capacity,
            updated_at: acceptedSession.logistics_updated_at,
          } : null,
        };
      }));

      return c.json({
        edition: { year: edition.year, label: edition.label, name: edition.name },
        call: {
          open: edition.speaker_call_status === 'open',
          public_path: `/speak/c/${edition.year}`,
          logistics_deadline: edition.speaker_logistics_deadline ?? null,
        },
        permissions: { can_manage: hasAnnualConferenceCapability(capabilities, 'speakers.manage') },
        email_delivery: {
          configured: annualConferenceEmailConfigured(c),
          workspace_links_configured: annualConferenceWorkspaceEmailConfigured(c),
        },
        counts: speakerSubmissionCounts(submissions),
        submissions: submissionDetails,
      });
    } catch (error) {
      return internalErrorResponse(
        c,
        'annual_conference_speakers_read_failed',
        error,
        'Unable to load conference speaker proposals.',
      );
    }
  });

  app.patch('/api/annual-conference/:year/speakers/call', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer']);

    if (adminError) return adminError;
    const yearParam = c.req.param('year');

    if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'Conference year must use four digits.' }, 400);
    const parsed = z.object({ open: z.boolean() }).strict().safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Choose whether the Call for Speakers is open.' }, 400);
    const year = Number(yearParam);
    const capabilityError = await requireAnnualConferenceCapability(c, year, 'speakers.manage');

    if (capabilityError) return capabilityError;

    try {
      const edition = await getAnnualConferenceEditionByYear(year, c);

      if (!edition) return c.json({ error: `Annual conference ${year} was not found.` }, 404);
      const repository = createAnnualConferenceRepository(c);

      await repository.getWorkspace(year);
      const updatedEdition = await repository.updateEditionSpeakerCallStatus(
        edition.id,
        parsed.data.open ? 'open' : 'closed',
      );

      await recordProtectedMutationAudit(c, {
        action: parsed.data.open
          ? 'annual_conference.speakers.call.open'
          : 'annual_conference.speakers.call.close',
        targetType: 'annual_conference_edition',
        targetId: edition.id,
        metadata: { edition_year: year },
      });

      return c.json({
        open: updatedEdition.speaker_call_status === 'open',
        public_path: `/speak/c/${year}`,
      });
    } catch (error) {
      return internalErrorResponse(
        c,
        'annual_conference_speakers_call_update_failed',
        error,
        'Unable to update the Call for Speakers.',
      );
    }
  });

  app.patch('/api/annual-conference/:year/speakers/logistics-deadline', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer']);

    if (adminError) return adminError;
    const yearParam = c.req.param('year');

    if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'Conference year must use four digits.' }, 400);
    const parsed = conferenceSpeakerDeadlineSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) return c.json({ error: 'Choose a valid logistics deadline with a timezone.' }, 400);
    const year = Number(yearParam);
    const capabilityError = await requireAnnualConferenceCapability(c, year, 'speakers.manage');

    if (capabilityError) return capabilityError;

    try {
      const edition = await getAnnualConferenceEditionByYear(year, c);

      if (!edition) return c.json({ error: `Annual conference ${year} was not found.` }, 404);
      if (parsed.data.deadline && new Date(parsed.data.deadline).getTime() <= Date.now()) {
        return c.json({ error: 'The logistics deadline must be in the future.' }, 400);
      }
      const repository = createAnnualConferenceRepository(c);

      await repository.getWorkspace(year);
      const updated = await repository.updateEditionSpeakerLogisticsDeadline(edition.id, parsed.data.deadline);

      if (updated.speaker_logistics_deadline) {
        await updateAnnualConferenceSpeakerIntakeDeadlines(edition.id, updated.speaker_logistics_deadline);
      }
      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.speakers.logistics_deadline.update',
        targetType: 'annual_conference_edition',
        targetId: edition.id,
        metadata: { edition_year: year, deadline: updated.speaker_logistics_deadline ?? null },
      });

      return c.json({ deadline: updated.speaker_logistics_deadline ?? null });
    } catch (error) {
      return internalErrorResponse(
        c,
        'annual_conference_speaker_deadline_update_failed',
        error,
        'Unable to update the speaker logistics deadline.',
      );
    }
  });

  app.patch('/api/annual-conference/:year/speaker-submissions/:submissionId', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer']);

    if (adminError) return adminError;
    const year = Number(c.req.param('year'));

    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      return c.json({ error: 'Conference year must use four digits.' }, 400);
    }
    const parsed = conferenceSpeakerSubmissionDecisionSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the proposal decision.' }, 400);
    }
    const capabilityError = await requireAnnualConferenceCapability(c, year, 'speakers.manage');

    if (capabilityError) return capabilityError;

    const releaseDecisionLock = await acquireSpeakerIntakeSubmissionLock(
      `annual-conference-decision:${year}:${c.req.param('submissionId')}`,
    );

    try {
      const edition = await getAnnualConferenceEditionByYear(year, c);

      if (!edition) return c.json({ error: `Annual conference ${year} was not found.` }, 404);
      const existing = await getAnnualConferenceSpeakerSubmission(c.req.param('submissionId'));

      if (!existing || existing.edition_id !== edition.id) {
        return c.json({ error: 'Conference proposal not found.' }, 404);
      }
      if (existing.status !== 'submitted') {
        return c.json({ error: 'This conference proposal has already been decided.' }, 409);
      }
      if (parsed.data.status === 'selected' && existing.proposal_schema_version !== 2) {
        return c.json({
          error: 'This legacy proposal is incomplete and cannot be accepted. Ask the speaker to submit a complete conference proposal.',
        }, 409);
      }

      if (!annualConferenceEmailConfigured(c)) {
        return c.json({ error: 'Speaker decision email is not configured. The proposal was not decided.' }, 503);
      }

      if (parsed.data.status === 'selected') {
        const tokenSecret = secureSharedSecret(envValue('SPEAKER_INTAKE_LINK_TOKEN_SECRET', c));

        if (!tokenSecret) {
          return c.json({ error: 'Speaker workspace link signing is not configured. The proposal was not accepted.' }, 503);
        }
        const deadline = annualConferenceDeadline(edition);

        if (!deadline || new Date(deadline).getTime() <= Date.now()) {
          return c.json({ error: 'Set a future speaker logistics deadline before accepting this proposal.' }, 409);
        }
        const accepted = await acceptAnnualConferenceSpeakerSubmission({
          submission: existing,
          deadline,
          tokenSecret,
          internalNote: parsed.data.internal_note || null,
        });

        try {
          await recordProtectedMutationAudit(c, {
            action: 'annual_conference.speaker_submission.decision',
            targetType: 'annual_conference_speaker_submission',
            targetId: accepted.submission.id,
            metadata: {
              edition_year: year,
              status: accepted.submission.status,
              selected_intake_link_id: accepted.link.id,
            },
          });
        } catch (auditError) {
          console.warn(JSON.stringify({
            event: 'annual_conference_speaker_decision_audit_failed',
            submission_id: accepted.submission.id,
            error_name: safeErrorName(auditError),
          }));
        }
        const emailStatus = await deliverAnnualConferenceDecisionEmail(c, {
          editionLabel: edition.label,
          editionYear: edition.year,
          deadline,
          submission: accepted.submission,
          token: accepted.token,
        });

        return c.json({
          submission: accepted.submission,
          token: null,
          decision_email: { status: emailStatus },
        });
      }

      const submission = await rejectAnnualConferenceSpeakerSubmission(
        existing.id,
        parsed.data.internal_note || null,
      );

      try {
        await recordProtectedMutationAudit(c, {
          action: 'annual_conference.speaker_submission.decision',
          targetType: 'annual_conference_speaker_submission',
          targetId: submission.id,
          metadata: { edition_year: year, status: submission.status, selected_intake_link_id: null },
        });
      } catch (auditError) {
        console.warn(JSON.stringify({
          event: 'annual_conference_speaker_decision_audit_failed',
          submission_id: submission.id,
          error_name: safeErrorName(auditError),
        }));
      }
      const emailStatus = await deliverAnnualConferenceDecisionEmail(c, {
        editionLabel: edition.label,
        editionYear: edition.year,
        deadline: null,
        submission,
      });

      return c.json({ submission, token: null, decision_email: { status: emailStatus } });
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : 'Unable to update conference proposal.',
      }, 409);
    } finally {
      releaseDecisionLock();
    }
  });

  app.post('/api/annual-conference/:year/speaker-submissions/:submissionId/resend-workspace-email', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer']);

    if (adminError) return adminError;
    const yearParam = c.req.param('year');

    if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'Conference year must use four digits.' }, 400);
    const year = Number(yearParam);
    const capabilityError = await requireAnnualConferenceCapability(c, year, 'speakers.manage');

    if (capabilityError) return capabilityError;
    const tokenSecret = secureSharedSecret(envValue('SPEAKER_INTAKE_LINK_TOKEN_SECRET', c));

    if (!annualConferenceEmailConfigured(c) || !tokenSecret) {
      return c.json({ error: 'Speaker email sending is not configured.' }, 503);
    }

    const releaseRotationLock = await acquireSpeakerIntakeSubmissionLock(
      `annual-conference-email-rotation:${year}:${c.req.param('submissionId')}`,
    );

    try {
      const edition = await getAnnualConferenceEditionByYear(year, c);

      if (!edition) return c.json({ error: `Annual conference ${year} was not found.` }, 404);
      const submission = await getAnnualConferenceSpeakerSubmission(c.req.param('submissionId'));

      if (
        !submission
        || submission.edition_id !== edition.id
        || submission.status !== 'selected'
        || !submission.selected_session_id
      ) {
        return c.json({ error: 'Accepted conference proposal not found.' }, 404);
      }
      const currentLink = submission.selected_intake_link_id
        ? await getAnnualConferenceSpeakerIntakeLinkById(submission.selected_intake_link_id)
        : undefined;

      if (!['pending', 'failed'].includes(submission.decision_email_status ?? '')) {
        return c.json({ error: 'This delivery state requires an address correction, not a routine retry.' }, 409);
      }
      if (submission.decision_email_status === 'failed' && !annualConferenceDecisionEmailCanBeRetriedManually(submission)) {
        return c.json({ error: 'The provider permanently failed this delivery. Correct the address before sending again.' }, 409);
      }
      if (currentLink?.email_status === 'accepted' || currentLink?.email_status === 'delivered') {
        return c.json({ error: 'The workspace email was already accepted by the provider.' }, 409);
      }
      if (
        currentLink?.email_status === 'pending'
        && currentLink.email_last_attempt_at
        && new Date(currentLink.email_last_attempt_at).getTime() > Date.now() - 5 * 60 * 1000
      ) {
        return c.json({ error: 'The workspace email is still being sent. Try again in a few minutes.' }, 409);
      }
      const deadline = annualConferenceDeadline(edition);

      if (!deadline || new Date(deadline).getTime() <= Date.now()) {
        return c.json({ error: 'The speaker logistics deadline has passed.' }, 409);
      }
      let deliverySubmission = submission;
      let deliveryToken: string;

      if (currentLink && annualConferenceSpeakerWorkspaceTokenMatches(currentLink, tokenSecret)) {
        deliveryToken = annualConferenceSpeakerWorkspaceToken(currentLink.id, tokenSecret);
      } else {
        const rotated = await rotateAnnualConferenceSpeakerWorkspace({ submission: deliverySubmission, deadline, tokenSecret });

        deliverySubmission = rotated.submission;
        deliveryToken = rotated.token;
      }
      const emailStatus = await deliverAnnualConferenceDecisionEmail(c, {
        editionLabel: edition.label,
        editionYear: edition.year,
        deadline,
        submission: deliverySubmission,
        token: deliveryToken,
        manual: true,
      });

      try {
        await recordProtectedMutationAudit(c, {
          action: 'annual_conference.speaker_workspace_email.resend',
          targetType: 'annual_conference_speaker_submission',
          targetId: submission.id,
          metadata: { edition_year: year, email_status: emailStatus },
        });
      } catch (auditError) {
        console.warn(JSON.stringify({
          event: 'annual_conference_speaker_email_retry_audit_failed',
          submission_id: submission.id,
          error_name: safeErrorName(auditError),
        }));
      }

      return c.json({ decision_email: { status: emailStatus } });
    } catch (error) {
      return internalErrorResponse(
        c,
        'annual_conference_speaker_workspace_email_retry_failed',
        error,
        'Unable to resend the speaker workspace email.',
      );
    } finally {
      releaseRotationLock();
    }
  });

  app.post('/api/annual-conference/:year/speaker-submissions/:submissionId/resend-decision-email', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer']);

    if (adminError) return adminError;
    const year = Number(c.req.param('year'));

    if (!Number.isInteger(year) || year < 2000 || year > 3000) return c.json({ error: 'Conference year must use four digits.' }, 400);
    const capabilityError = await requireAnnualConferenceCapability(c, year, 'speakers.manage');

    if (capabilityError) return capabilityError;
    if (!annualConferenceEmailConfigured(c)) return c.json({ error: 'Speaker email sending is not configured.' }, 503);

    const release = await acquireSpeakerIntakeSubmissionLock(`annual-conference-decision-email:${year}:${c.req.param('submissionId')}`);

    try {
      const edition = await getAnnualConferenceEditionByYear(year, c);
      const submission = await getAnnualConferenceSpeakerSubmission(c.req.param('submissionId'));

      if (!edition || !submission || submission.edition_id !== edition.id || submission.status !== 'not_selected') {
        return c.json({ error: 'Rejected conference proposal not found.' }, 404);
      }
      if (submission.decision_email_status !== 'failed') {
        return c.json({ error: 'Only a failed rejection email can be retried.' }, 409);
      }
      if (!annualConferenceDecisionEmailCanBeRetriedManually(submission)) {
        return c.json({ error: 'The provider permanently failed this delivery. Correct the address before sending again.' }, 409);
      }
      if (!annualConferenceDecisionEmailCooldownElapsed(submission)) {
        return c.json({ error: 'The decision email is still being processed. Try again in a few minutes.' }, 409);
      }
      const retrySubmission = submission;
      const status = await deliverAnnualConferenceDecisionEmail(c, {
        editionLabel: edition.label,
        editionYear: edition.year,
        deadline: null,
        submission: retrySubmission,
        manual: true,
      });

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.speaker_decision_email.retry',
        targetType: 'annual_conference_speaker_submission',
        targetId: submission.id,
        metadata: { edition_year: year, email_status: status },
      });

      return c.json({ decision_email: { status } });
    } catch (error) {
      return internalErrorResponse(c, 'annual_conference_speaker_decision_email_retry_failed', error, 'Unable to retry the speaker decision email.');
    } finally {
      release();
    }
  });

  app.patch('/api/annual-conference/:year/speaker-submissions/:submissionId/decision-email-recipient', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer']);

    if (adminError) return adminError;
    const year = Number(c.req.param('year'));
    const parsed = conferenceSpeakerEmailRecipientSchema.safeParse(await c.req.json().catch(() => null));

    if (!Number.isInteger(year) || year < 2000 || year > 3000) return c.json({ error: 'Conference year must use four digits.' }, 400);
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Confirm the delivery email address.' }, 400);
    const capabilityError = await requireAnnualConferenceCapability(c, year, 'speakers.manage');

    if (capabilityError) return capabilityError;
    if (!annualConferenceEmailConfigured(c)) return c.json({ error: 'Speaker email sending is not configured.' }, 503);
    const emailAssessment = await assessPublicSubmissionEmail(c, parsed.data.speaker_email);

    if (emailAssessment.status === 'invalid') return c.json(publicEmailErrorPayload(emailAssessment), 422);

    const release = await acquireSpeakerIntakeSubmissionLock(`annual-conference-recipient:${year}:${c.req.param('submissionId')}`);

    try {
      const edition = await getAnnualConferenceEditionByYear(year, c);
      const submission = await getAnnualConferenceSpeakerSubmission(c.req.param('submissionId'));

      if (!edition || !submission || submission.edition_id !== edition.id || !['selected', 'not_selected'].includes(submission.status)) {
        return c.json({ error: 'Decided conference proposal not found.' }, 404);
      }
      let prepared: AnnualConferenceSpeakerSubmission;
      let token: string | undefined;
      let deadline: string | null = null;

      if (submission.status === 'selected') {
        const tokenSecret = secureSharedSecret(envValue('SPEAKER_INTAKE_LINK_TOKEN_SECRET', c));

        if (!tokenSecret) return c.json({ error: 'Speaker workspace link signing is not configured.' }, 503);
        deadline = annualConferenceDeadline(edition);
        if (!deadline || new Date(deadline).getTime() <= Date.now()) return c.json({ error: 'Set a future speaker logistics deadline before sending a workspace email.' }, 409);
        const rotated = await rotateAnnualConferenceSpeakerWorkspace({
          submission,
          deadline,
          tokenSecret,
          emailRecipient: emailAssessment.normalizedEmail,
          allowAccepted: true,
        });

        prepared = rotated.submission;
        token = rotated.token;
      } else {
        prepared = await replaceAnnualConferenceDecisionEmailRecipient({
          submission,
          recipient: emailAssessment.normalizedEmail,
          idempotencyKey: `conference-speaker-rejected-${submission.id}-${crypto.randomUUID()}`,
        });
      }
      const status = await deliverAnnualConferenceDecisionEmail(c, {
        editionLabel: edition.label,
        editionYear: edition.year,
        deadline,
        submission: prepared,
        token,
        manual: true,
      });

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.speaker_decision_email.recipient_correct',
        targetType: 'annual_conference_speaker_submission',
        targetId: submission.id,
        metadata: { edition_year: year, recipient_changed: true, email_status: status },
      });

      return c.json({ decision_email: { status, recipient: emailAssessment.normalizedEmail } });
    } catch (error) {
      if (error instanceof Error && (error.message.includes('still being sent') || error.message.includes('changed while the address'))) {
        return c.json({ error: error.message }, 409);
      }

      return internalErrorResponse(c, 'annual_conference_speaker_recipient_correction_failed', error, 'Unable to correct and resend the speaker email.');
    } finally {
      release();
    }
  });

  app.post('/api/annual-conference/:year/speaker-submissions/:submissionId/replace-workspace-email', async (c) => {
    const adminError = await requireAdmin(c, ['owner', 'organizer']);

    if (adminError) return adminError;
    const year = Number(c.req.param('year'));
    const parsed = conferenceSpeakerReplacementEmailSchema.safeParse(await c.req.json().catch(() => null));

    if (!Number.isInteger(year) || year < 2000 || year > 3000) return c.json({ error: 'Conference year must use four digits.' }, 400);
    if (!parsed.success) return c.json({ error: 'Confirm that the current private link should be replaced.' }, 400);
    const capabilityError = await requireAnnualConferenceCapability(c, year, 'speakers.manage');

    if (capabilityError) return capabilityError;
    const tokenSecret = secureSharedSecret(envValue('SPEAKER_INTAKE_LINK_TOKEN_SECRET', c));

    if (!annualConferenceEmailConfigured(c) || !tokenSecret) return c.json({ error: 'Speaker workspace email is not configured.' }, 503);

    const release = await acquireSpeakerIntakeSubmissionLock(`annual-conference-workspace-replacement:${year}:${c.req.param('submissionId')}`);

    try {
      const edition = await getAnnualConferenceEditionByYear(year, c);
      const submission = await getAnnualConferenceSpeakerSubmission(c.req.param('submissionId'));

      if (!edition || !submission || submission.edition_id !== edition.id || submission.status !== 'selected') {
        return c.json({ error: 'Accepted conference proposal not found.' }, 404);
      }
      const deadline = annualConferenceDeadline(edition);

      if (!deadline || new Date(deadline).getTime() <= Date.now()) return c.json({ error: 'Set a future speaker logistics deadline before replacing the workspace link.' }, 409);
      const rotated = await rotateAnnualConferenceSpeakerWorkspace({ submission, deadline, tokenSecret, allowAccepted: true });
      const status = await deliverAnnualConferenceDecisionEmail(c, {
        editionLabel: edition.label,
        editionYear: edition.year,
        deadline,
        submission: rotated.submission,
        token: rotated.token,
        manual: true,
      });

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.speaker_workspace_email.replace',
        targetType: 'annual_conference_speaker_submission',
        targetId: submission.id,
        metadata: { edition_year: year, email_status: status },
      });

      return c.json({ decision_email: { status } });
    } catch (error) {
      return internalErrorResponse(c, 'annual_conference_speaker_workspace_replacement_failed', error, 'Unable to replace the speaker workspace link.');
    } finally {
      release();
    }
  });

  app.post('/api/internal/annual-conference-speaker-emails/retry', async (c) => {
    if (!scheduledJobAuthorized(c)) return c.json({ error: 'Not found' }, 404);
    try {
      return c.json(await retryAnnualConferenceDecisionEmails(c));
    } catch (error) {
      return internalErrorResponse(c, 'annual_conference_speaker_email_scheduled_retry_failed', error, 'Unable to retry conference speaker emails.');
    }
  });

  app.post('/api/webhooks/resend', async (c) => {
    const secret = envValue('RESEND_WEBHOOK_SECRET', c)?.trim();
    const rawBody = await c.req.text();

    if (!secret || !verifyResendWebhookSignature({
      rawBody,
      webhookId: c.req.header('svix-id') ?? null,
      timestamp: c.req.header('svix-timestamp') ?? null,
      signatures: c.req.header('svix-signature') ?? null,
      secret,
    })) return c.json({ error: 'Invalid webhook signature.' }, 401);

    const payload = (() => {
      try { return JSON.parse(rawBody); } catch { return null; }
    })();
    const parsed = annualConferenceResendWebhookSchema.safeParse(payload);

    if (!parsed.success) return c.json({ error: 'Unsupported webhook payload.' }, 400);
    const eventId = c.req.header('svix-id')!;
    const outcome = annualConferenceWebhookOutcome(parsed.data.type, parsed.data.created_at);

    try {
      const matched = await applyAnnualConferenceDecisionEmailProviderEvent({
        providerEmailId: parsed.data.data.email_id,
        eventAt: parsed.data.created_at,
        ...outcome,
      });

      if (!matched) return c.body(null, 204);
      await insertAnnualConferenceEmailWebhookEvent({
        webhook_event_id: eventId,
        provider_email_id: parsed.data.data.email_id,
        event_type: parsed.data.type,
        provider_created_at: parsed.data.created_at,
      });

      return c.body(null, 204);
    } catch (error) {
      return internalErrorResponse(c, 'annual_conference_speaker_email_webhook_failed', error, 'Unable to process email delivery status.');
    }
  });

  app.get('/api/cfp/conferences/:year', async (c) => {
    c.header('Cache-Control', 'no-store');
    const yearParam = c.req.param('year');

    if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'CFP event not found' }, 404);

    const edition = await getAnnualConferenceEditionByYear(Number(yearParam), c);

    if (!edition || edition.speaker_call_status !== 'open') {
      return c.json({ error: 'CFP event not found' }, 404);
    }

    return c.json({
      id: edition.id,
      name: edition.name,
      description: `Call for Speakers for ${edition.label}.`,
      event_date: edition.provisional_date ?? `${edition.year}-12-19`,
      status: 'cfp_open',
      call_scope: 'annual_conference',
      edition_year: edition.year,
      topic_tracks: ANNUAL_CONFERENCE_TOPIC_TRACKS,
      session_types: ANNUAL_CONFERENCE_SESSION_TYPES,
      bio_word_limit: ANNUAL_CONFERENCE_BIO_WORD_LIMIT,
      abstract_word_limit: ANNUAL_CONFERENCE_ABSTRACT_WORD_LIMIT,
      learning_outcome_limits: {
        min: ANNUAL_CONFERENCE_LEARNING_OUTCOME_MIN,
        max: ANNUAL_CONFERENCE_LEARNING_OUTCOME_MAX,
      },
    });
  });

  app.post('/api/cfp/conferences/:year', async (c) => {
    const yearParam = c.req.param('year');

    if (!/^\d{4}$/.test(yearParam)) return c.json({ error: 'CFP event not found' }, 404);
    const parsed = conferenceSpeakerSubmissionCreateSchema.safeParse(await c.req.json().catch(() => ({})));

    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the presentation proposal.' }, 400);
    }
    const turnstileError = await requirePublicTurnstile(c, {
      token: parsed.data.turnstile_token,
      submittedAction: parsed.data.turnstile_action,
      expectedAction: CFP_SUBMISSION_TURNSTILE_ACTION,
    });

    if (turnstileError) return turnstileError;
    const rateLimitError = await enforcePublicRateLimit(c, {
      action: `conference_cfp_submission:${yearParam}`,
      clientKey: publicClientKey(c),
      maxAttempts: 5,
      windowSeconds: 60 * 60,
    }, 'This device has sent several proposals. Please try again later.');

    if (rateLimitError) return rateLimitError;

    const edition = await getAnnualConferenceEditionByYear(Number(yearParam), c);

    if (!edition || edition.speaker_call_status !== 'open') {
      return c.json({ error: 'The conference Call for Speakers is not open.' }, 400);
    }
    const emailAssessment = await assessPublicSubmissionEmail(c, parsed.data.speaker_email);

    if (emailAssessment.status === 'invalid') {
      return c.json(publicEmailErrorPayload(emailAssessment), 422);
    }
    try {
      await createAnnualConferenceSpeakerSubmission({
        edition_id: edition.id,
        speaker_name: parsed.data.speaker_name,
        speaker_email: parsed.data.speaker_email,
        title: parsed.data.title,
        topic: parsed.data.topic,
        session_type: parsed.data.session_type,
        learning_outcomes: parsed.data.learning_outcomes,
        abstract: parsed.data.abstract,
        bio: parsed.data.bio,
      });

      return c.json({
        accepted: true,
        message: 'If this proposal is eligible, it has been added for organizer review.',
      }, 202);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already been submitted')) {
        return c.json({
          accepted: true,
          message: 'If this proposal is eligible, it has been added for organizer review.',
        }, 202);
      }

      return c.json({
        error: 'The proposal could not be submitted. Please check the form and try again.',
      }, 400);
    }
  });

  app.get('/api/conferences/:year/speaker-intake/:token', async (c) => {
    const yearParam = c.req.param('year');

    if (!/^\d{4}$/.test(yearParam)) {
      return c.json({ error: 'This presenter link is no longer available.' }, 404);
    }
    const edition = await getAnnualConferenceEditionByYear(Number(yearParam), c);

    if (!edition) return c.json({ error: 'This presenter link is no longer available.' }, 404);
    const link = await getAnnualConferenceSpeakerIntakeLink(edition.id, c.req.param('token'));

    if (
      !link
      || link.revoked_at
      || new Date(edition.speaker_logistics_deadline ?? link.expires_at).getTime() <= Date.now()
      || !link.speaker_submission_id
      || !link.workspace_session_id
    ) {
      return c.json({ error: 'This presenter link is no longer available.' }, 410);
    }
    const submission = await getAnnualConferenceSpeakerSubmission(link.speaker_submission_id);
    const session = await getAnnualConferenceSession(link.workspace_session_id);

    if (
      !submission
      || !session
      || submission.edition_id !== edition.id
      || session.edition_id !== edition.id
      || session.speaker_submission_id !== submission.id
      || submission.status !== 'selected'
      || submission.selected_intake_link_id !== link.id
      || submission.selected_session_id !== session.id
    ) {
      return c.json({ error: 'This presenter link is no longer available.' }, 410);
    }

    return c.json({
      event: {
        id: edition.id,
        name: edition.name,
        event_date: edition.provisional_date ?? `${edition.year}-12-19`,
        status: 'cfp_closed',
      },
      link: {
        purpose: 'conference_speaker_workspace',
        deadline: edition.speaker_logistics_deadline ?? link.expires_at,
      },
      prefill: {
        speaker_name: submission.speaker_name,
        speaker_email: submission.speaker_email,
        title: submission.title,
        topic: submission.topic,
        session_type: submission.session_type,
        learning_outcomes: submission.learning_outcomes,
        abstract: submission.abstract ?? '',
        bio: submission.bio ?? '',
        slides_url: safePublicResourceUrl(session.slides_url) ?? '',
        availability_confirmed: session.availability_confirmed,
        technical_requirements: session.technical_requirements ?? '',
        workshop_prerequisites: session.workshop_prerequisites ?? '',
        required_software_equipment: session.required_software_equipment ?? '',
        participants_need_laptops: session.participants_need_laptops,
        preferred_workshop_capacity: session.preferred_workshop_capacity,
        logistics_updated_at: session.logistics_updated_at,
      },
    });
  });

  app.post('/api/conferences/:year/speaker-intake/:token', async (c) => {
    const yearParam = c.req.param('year');

    if (!/^\d{4}$/.test(yearParam)) {
      return c.json({ error: 'This presenter link is no longer available.' }, 404);
    }
    const rateLimitError = await enforcePublicRateLimit(c, {
      action: `conference_speaker_intake:${yearParam}`,
      clientKey: `${publicClientKey(c)}:${c.req.param('token')}`,
      maxAttempts: 10,
      windowSeconds: 60 * 60,
    }, 'This private form has received several attempts. Please try again later.');

    if (rateLimitError) return rateLimitError;
    const edition = await getAnnualConferenceEditionByYear(Number(yearParam), c);

    if (!edition) return c.json({ error: 'This presenter link is no longer available.' }, 404);
    const parsed = conferenceSpeakerLogisticsSchema.safeParse(await c.req.json().catch(() => ({})));

    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the presenter details.' }, 400);
    }

    try {
      const link = await getAnnualConferenceSpeakerIntakeLink(edition.id, c.req.param('token'));
      const deadline = link ? edition.speaker_logistics_deadline ?? link.expires_at : null;

      if (
        !link
        || link.revoked_at
        || !deadline
        || new Date(deadline).getTime() <= Date.now()
        || !link.speaker_submission_id
        || !link.workspace_session_id
      ) {
        return c.json({ error: 'This presenter link is no longer available.' }, 410);
      }
      const submission = await getAnnualConferenceSpeakerSubmission(link.speaker_submission_id);
      const existingSession = await getAnnualConferenceSession(link.workspace_session_id);

      if (
        !submission
        || !existingSession
        || submission.edition_id !== edition.id
        || existingSession.edition_id !== edition.id
        || existingSession.speaker_submission_id !== submission.id
        || submission.status !== 'selected'
        || submission.selected_intake_link_id !== link.id
        || submission.selected_session_id !== existingSession.id
      ) {
        return c.json({ error: 'This presenter link is no longer available.' }, 410);
      }
      const session = await updateAnnualConferenceSessionLogistics(existingSession.id, {
        slides_url: safePublicResourceUrl(parsed.data.slides_url) || null,
        availability_confirmed: parsed.data.availability_confirmed,
        technical_requirements: parsed.data.technical_requirements || null,
        workshop_prerequisites: parsed.data.workshop_prerequisites || null,
        required_software_equipment: parsed.data.required_software_equipment || null,
        participants_need_laptops: parsed.data.participants_need_laptops,
        preferred_workshop_capacity: parsed.data.preferred_workshop_capacity,
      });

      return c.json({ session, message: 'Your speaker logistics have been saved.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit presenter details.';

      return c.json({
        error: message.includes('no longer available')
          ? message
          : 'Unable to save presenter details. Please check the form and try again.',
      }, message.includes('no longer available') ? 410 : 400);
    }
  });
}
