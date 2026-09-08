import type { Context } from 'hono';
import { z } from 'zod';
import {
  annualConferenceSpeakerWorkspaceToken,
  annualConferenceSpeakerWorkspaceTokenMatches,
  claimAnnualConferenceDecisionEmailAttempt,
  getAnnualConferenceSpeakerIntakeLinkById,
  getPendingAnnualConferenceDecisionEmails,
  rotateAnnualConferenceSpeakerWorkspace,
  updateAnnualConferenceSpeakerIntakeLink,
  updateAnnualConferenceSpeakerSubmission,
  type AnnualConferenceEmailStatus,
  type AnnualConferenceSpeakerSubmission,
} from '@/lib/annual-conference-speakers';
import { recordResendEmailHealth } from '@/lib/email/delivery-health';
import { sendResendEmailBatch, ResendBatchError } from '@/lib/email/resend';
import { EMAIL_SENDERS, emailSubjects } from '@/lib/email/scenarios';
import { conferenceSpeakerAcceptanceEmail } from '@/lib/email/templates/conference-speaker-acceptance';
import { speakerProposalRejectionEmail } from '@/lib/email/templates/speaker-proposal-rejection';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { createAnnualConferenceRepository } from '@/server/annual-conference-repository';
import { envValue } from '@/server/env';
import { publicAppOrigin } from '@/server/http/public-app-origin';

const RETRY_DELAYS_MS = [0, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000] as const;
export const ANNUAL_CONFERENCE_EMAIL_MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
const EXHAUSTED_EMAIL_ERROR = 'Automatic email retries were exhausted. Review the recipient and retry manually.';

type DeliveryFailure = { message: string; retryable: boolean };

function deliveryFailure(error: unknown): DeliveryFailure {
  if (!(error instanceof ResendBatchError)) {
    return { message: 'Email provider could not be reached; delivery will retry automatically.', retryable: true };
  }
  if (error.status === 429) return { message: 'Email provider quota reached; delivery will retry automatically.', retryable: true };
  if (error.status !== null && error.status >= 500) return { message: 'Email provider is temporarily unavailable; delivery will retry automatically.', retryable: true };
  if (error.status === 400 || error.status === 422) return { message: 'The recipient or message was rejected. Correct the delivery email before retrying.', retryable: false };
  if (error.status === 401 || error.status === 403) return { message: 'Email provider configuration was rejected. Fix the configuration before retrying.', retryable: false };
  return { message: 'Email provider did not accept this delivery; delivery will retry automatically.', retryable: true };
}

export function annualConferenceDecisionEmailIsDue(submission: AnnualConferenceSpeakerSubmission, at = Date.now()): boolean {
  if (!submission.decision_email_retryable || submission.decision_email_attempt_count >= ANNUAL_CONFERENCE_EMAIL_MAX_ATTEMPTS) return false;
  if (!submission.decision_email_last_attempt_at) return true;
  const delay = RETRY_DELAYS_MS[Math.min(submission.decision_email_attempt_count, RETRY_DELAYS_MS.length - 1)];
  return new Date(submission.decision_email_last_attempt_at).getTime() + delay <= at;
}

export function annualConferenceDecisionEmailCooldownElapsed(submission: AnnualConferenceSpeakerSubmission, at = Date.now()): boolean {
  if (!submission.decision_email_last_attempt_at) return true;
  const delay = RETRY_DELAYS_MS[Math.min(submission.decision_email_attempt_count, RETRY_DELAYS_MS.length - 1)];
  return new Date(submission.decision_email_last_attempt_at).getTime() + delay <= at;
}

export function annualConferenceDecisionEmailCanBeRetriedManually(submission: AnnualConferenceSpeakerSubmission): boolean {
  return submission.decision_email_retryable || submission.decision_email_last_error === EXHAUSTED_EMAIL_ERROR;
}

function configuredDelivery(c: Context): { apiKey: string; replyTo: string; tokenSecret: string | null } | null {
  const apiKey = envValue('RESEND_API_KEY', c)?.trim();
  const replyTo = envValue('SPEAKER_EMAIL_REPLY_TO', c)?.trim();
  if (!apiKey || !replyTo || !z.string().email().safeParse(replyTo).success) return null;
  return {
    apiKey,
    replyTo,
    tokenSecret: secureSharedSecret(envValue('SPEAKER_INTAKE_LINK_TOKEN_SECRET', c)),
  };
}

async function recordOutcome(submission: AnnualConferenceSpeakerSubmission, update: {
  status: AnnualConferenceEmailStatus;
  providerId?: string | null;
  sentAt?: string | null;
  lastError?: string | null;
  retryable: boolean;
}) {
  const updated = await updateAnnualConferenceSpeakerSubmission(submission.id, {
    decision_email_status: update.status,
    decision_email_provider_id: update.providerId ?? null,
    decision_email_sent_at: update.sentAt ?? null,
    decision_email_last_error: update.lastError ?? null,
    decision_email_retryable: update.retryable,
  });
  if (updated.selected_intake_link_id) {
    const link = await getAnnualConferenceSpeakerIntakeLinkById(updated.selected_intake_link_id);
    if (link) {
      await updateAnnualConferenceSpeakerIntakeLink(link.id, {
        email_status: update.status,
        email_provider_id: update.providerId ?? null,
        email_sent_at: update.sentAt ?? null,
        email_last_error: update.lastError ?? null,
        email_retryable: update.retryable,
      });
    }
  }
  return updated;
}

export async function deliverAnnualConferenceDecisionEmail(c: Context, input: {
  editionLabel: string;
  editionYear: number;
  deadline: string | null;
  submission: AnnualConferenceSpeakerSubmission;
  token?: string;
  manual?: boolean;
}): Promise<'accepted' | 'failed' | 'skipped'> {
  const configured = configuredDelivery(c);
  if (!configured) throw new Error('Speaker email sending is not configured.');
  const recipient = input.submission.decision_email_recipient ?? input.submission.speaker_email;
  const idempotencyKey = input.submission.decision_email_idempotency_key;
  if (!idempotencyKey) throw new Error('The proposal email delivery is not prepared.');

  let content: { subject: string; html: string; text: string };
  if (input.submission.decision_email_kind === 'acceptance') {
    if (!input.deadline || !input.token) throw new Error('The speaker workspace email is incomplete.');
    const privateUrl = new URL(`/conference-speakers/${input.editionYear}/${input.token}`, publicAppOrigin(c)).toString();
    content = conferenceSpeakerAcceptanceEmail({
      editionLabel: input.editionLabel,
      speakerName: input.submission.speaker_name,
      talkTitle: input.submission.title,
      privateUrl,
      deadline: input.deadline,
    });
  } else if (input.submission.decision_email_kind === 'rejection') {
    content = speakerProposalRejectionEmail({
      eventName: input.editionLabel,
      speakerName: input.submission.speaker_name,
      talkTitle: input.submission.title,
      subject: emailSubjects.conferenceSpeakerDeclined(input.editionLabel),
    });
  } else {
    throw new Error('The proposal email kind is not prepared.');
  }

  const attempted = await claimAnnualConferenceDecisionEmailAttempt({
    submissionId: input.submission.id,
    expectedIdempotencyKey: idempotencyKey,
    expectedAttemptCount: input.submission.decision_email_attempt_count,
    allowNonRetryable: Boolean(input.manual && annualConferenceDecisionEmailCanBeRetriedManually(input.submission)),
  });
  if (!attempted) return 'skipped';
  let result: Awaited<ReturnType<typeof sendResendEmailBatch>>;
  try {
    result = await sendResendEmailBatch({
      apiKey: configured.apiKey,
      idempotencyKey,
      emails: [{ from: EMAIL_SENDERS.speakers.from, to: [recipient], reply_to: configured.replyTo, ...content }],
    });
  } catch (error) {
    const failure = deliveryFailure(error);
    const exhausted = !input.manual && attempted.decision_email_attempt_count >= ANNUAL_CONFERENCE_EMAIL_MAX_ATTEMPTS;
    await recordOutcome(attempted, {
      status: 'failed',
      lastError: exhausted ? EXHAUSTED_EMAIL_ERROR : failure.message,
      retryable: failure.retryable && !exhausted,
    });
    console.warn(JSON.stringify({
      event: 'annual_conference_speaker_decision_email_failed',
      submission_id: input.submission.id,
      decision: input.submission.decision_email_kind,
      provider_status: error instanceof ResendBatchError ? error.status : null,
      retryable: failure.retryable && !exhausted,
    }));
    return 'failed';
  }

  await recordResendEmailHealth(c, result.quota);
  const sentAt = new Date().toISOString();
  await recordOutcome(attempted, {
    status: 'accepted',
    providerId: result.ids[0] ?? null,
    sentAt,
    retryable: false,
  });
  return 'accepted';
}

export async function retryAnnualConferenceDecisionEmails(c: Context): Promise<{
  configured: boolean;
  accepted: string[];
  failed: string[];
  deferred: string[];
}> {
  const configured = configuredDelivery(c);
  if (!configured) return { configured: false, accepted: [], failed: [], deferred: [] };
  const pending = await getPendingAnnualConferenceDecisionEmails(['pending', 'failed'], 20);
  const editions = await createAnnualConferenceRepository(c).listEditions();
  const accepted: string[] = [];
  const failed: string[] = [];
  const deferred: string[] = [];

  for (const candidate of pending) {
    if (!annualConferenceDecisionEmailIsDue(candidate)) {
      deferred.push(candidate.id);
      continue;
    }
    const edition = editions.find((item) => item.id === candidate.edition_id);
    if (!edition) {
      await recordOutcome(candidate, { status: 'failed', lastError: 'The conference edition could not be loaded.', retryable: false });
      failed.push(candidate.id);
      continue;
    }
    let submission = candidate;
    let token: string | undefined;
    let deadline: string | null = null;
    if (candidate.decision_email_kind === 'acceptance') {
      if (!configured.tokenSecret) {
        await recordOutcome(candidate, { status: 'failed', lastError: 'Speaker workspace link signing is not configured.', retryable: false });
        failed.push(candidate.id);
        continue;
      }
      deadline = edition.speaker_logistics_deadline ?? null;
      if (!deadline || new Date(deadline).getTime() <= Date.now()) {
        await recordOutcome(candidate, { status: 'failed', lastError: 'Set a future speaker logistics deadline before retrying this email.', retryable: false });
        failed.push(candidate.id);
        continue;
      }
      const currentLink = candidate.selected_intake_link_id
        ? await getAnnualConferenceSpeakerIntakeLinkById(candidate.selected_intake_link_id)
        : undefined;
      if (currentLink && annualConferenceSpeakerWorkspaceTokenMatches(currentLink, configured.tokenSecret)) {
        token = annualConferenceSpeakerWorkspaceToken(currentLink.id, configured.tokenSecret);
      } else {
        const rotated = await rotateAnnualConferenceSpeakerWorkspace({
          submission: candidate,
          deadline,
          tokenSecret: configured.tokenSecret,
          emailRecipient: candidate.decision_email_recipient ?? candidate.speaker_email,
        });
        submission = rotated.submission;
        token = rotated.token;
      }
    }
    const result = await deliverAnnualConferenceDecisionEmail(c, {
      editionLabel: edition.label,
      editionYear: edition.year,
      deadline,
      submission,
      token,
    });
    (result === 'accepted' ? accepted : result === 'failed' ? failed : deferred).push(candidate.id);
  }
  return { configured: true, accepted, failed, deferred };
}

export function annualConferenceEmailConfigured(c: Context): boolean {
  return Boolean(configuredDelivery(c));
}

export function annualConferenceWorkspaceEmailConfigured(c: Context): boolean {
  return Boolean(configuredDelivery(c)?.tokenSecret);
}
