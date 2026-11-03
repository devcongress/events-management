import type { Context } from 'hono';
import { z } from 'zod';
import {
  annualConferenceSpeakerWorkspaceToken,
  annualConferenceSpeakerWorkspaceTokenMatches,
  claimAnnualConferenceDecisionEmailAttempt,
  stopAnnualConferenceDecisionEmailRetry,
  getAnnualConferenceSpeakerIntakeLinkById,
  getPendingAnnualConferenceDecisionEmails,
  updateAnnualConferenceSpeakerIntakeLink,
  updateAnnualConferenceSpeakerSubmission,
  type AnnualConferenceEmailStatus,
  type AnnualConferenceSpeakerSubmission,
} from '@/lib/annual-conference-speakers';
import { purgeExpiredSpeakerOutcomePreviews } from '@/lib/annual-conference-speaker-outcomes';
import { recordResendEmailHealth } from '@/lib/email/delivery-health';
import { sendResendEmailBatch, ResendBatchError } from '@/lib/email/resend';
import { EMAIL_SENDERS } from '@/lib/email/scenarios';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { createAnnualConferenceRepository } from '@/server/annual-conference-repository';
import { envValue } from '@/server/env';

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

export function annualConferenceDecisionEmailNextRetryAt(submission: AnnualConferenceSpeakerSubmission): string | null {
  // A saved decision is not authorization to send.
  if (submission.decision_email_attempt_count === 0) return submission.decision_email_queued_at ?? null;
  if (!submission.decision_email_last_attempt_at) return null;
  if (!submission.decision_email_retryable || submission.decision_email_attempt_count >= ANNUAL_CONFERENCE_EMAIL_MAX_ATTEMPTS) return null;
  if (submission.decision_email_status && !['pending', 'failed'].includes(submission.decision_email_status)) return null;
  const timestamp = new Date(submission.decision_email_last_attempt_at).getTime();

  if (!Number.isFinite(timestamp)) return null;
  const delay = RETRY_DELAYS_MS[submission.decision_email_attempt_count];

  return new Date(timestamp + delay).toISOString();
}

export function annualConferenceDecisionEmailIsDue(submission: AnnualConferenceSpeakerSubmission, at = Date.now()): boolean {
  const nextRetry = annualConferenceDecisionEmailNextRetryAt(submission);

  return nextRetry !== null && new Date(nextRetry).getTime() <= at;
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

export function annualConferenceSpeakerEmailEnvelope(c: Context): { from: string; replyTo: string } | null {
  const configured = configuredDelivery(c);

  return configured ? { from: EMAIL_SENDERS.speakers.from, replyTo: configured.replyTo } : null;
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
  const idempotencyKey = input.submission.decision_email_idempotency_key;

  if (!idempotencyKey) throw new Error('The proposal email delivery is not prepared.');

  const payload = input.submission.decision_email_payload ?? null;

  if (input.submission.decision_email_attempt_count > 0) {
    const started = input.submission.decision_email_payload_started_at;

    if (!payload || !payload.from || !payload.replyTo || !started || Date.now() - new Date(started).getTime() >= 23 * 60 * 60_000) {
      await stopAnnualConferenceDecisionEmailRetry(input.submission, 'This delivery cannot be retried safely. Review the recipient before preparing a new delivery.');

      return 'failed';
    }
  }

  if (!payload || !payload.from || !payload.replyTo || !input.submission.decision_email_queued_at) {
    await stopAnnualConferenceDecisionEmailRetry(input.submission, 'The frozen message is incomplete. Preview it again before sending.');

    return 'failed';
  }

  const attempted = await claimAnnualConferenceDecisionEmailAttempt({
    submissionId: input.submission.id,
    expectedIdempotencyKey: idempotencyKey,
    expectedAttemptCount: input.submission.decision_email_attempt_count,
    allowNonRetryable: Boolean(input.manual && annualConferenceDecisionEmailCanBeRetriedManually(input.submission)),
    payload,
  });

  if (!attempted) {
    if (input.submission.decision_email_attempt_count === 0) {
      await stopAnnualConferenceDecisionEmailRetry(input.submission, 'The workspace or delivery changed. Preview again before sending.');
    }

    return 'skipped';
  }
  let result: Awaited<ReturnType<typeof sendResendEmailBatch>>;

  try {
    result = await sendResendEmailBatch({
      apiKey: configured.apiKey,
      idempotencyKey,
      emails: [{ from: payload.from, to: [payload.recipient], reply_to: payload.replyTo, subject: payload.subject, html: payload.html, text: payload.text }],
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

  await purgeExpiredSpeakerOutcomePreviews();
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
      await stopAnnualConferenceDecisionEmailRetry(candidate, 'The conference edition could not be loaded.');
      failed.push(candidate.id);
      continue;
    }
    const submission = candidate;
    let token: string | undefined;
    let deadline: string | null = null;

    if (candidate.decision_email_kind === 'acceptance') {
      if (!configured.tokenSecret) {
        await stopAnnualConferenceDecisionEmailRetry(candidate, 'Speaker workspace link signing is not configured.');
        failed.push(candidate.id);
        continue;
      }
      deadline = edition.speaker_logistics_deadline ?? null;
      if (!deadline) {
        await stopAnnualConferenceDecisionEmailRetry(candidate, 'Set a speaker logistics due date before retrying this email.');
        failed.push(candidate.id);
        continue;
      }
      const currentLink = candidate.selected_intake_link_id
        ? await getAnnualConferenceSpeakerIntakeLinkById(candidate.selected_intake_link_id)
        : undefined;

      if (!currentLink || currentLink.revoked_at || currentLink.edition_id !== candidate.edition_id
        || currentLink.speaker_submission_id !== candidate.id || currentLink.workspace_session_id !== candidate.selected_session_id
        || !annualConferenceSpeakerWorkspaceTokenMatches(currentLink, configured.tokenSecret)) {
        await stopAnnualConferenceDecisionEmailRetry(candidate, 'The original speaker workspace link is unavailable. Review the delivery before replacing it.');
        failed.push(candidate.id);
        continue;
      }
      if (candidate.decision_email_attempt_count === 0 && (!candidate.decision_email_payload
        || candidate.decision_email_payload.deadline !== deadline
        || candidate.decision_email_payload.linkId !== currentLink.id
        || candidate.decision_email_payload.linkExpiresAt !== currentLink.expires_at)) {
        await stopAnnualConferenceDecisionEmailRetry(candidate, 'The workspace or deadline changed after preview. Preview again before sending.');
        failed.push(candidate.id);
        continue;
      }
      token = annualConferenceSpeakerWorkspaceToken(currentLink.id, configured.tokenSecret);
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
