import { describe, expect, it } from 'vitest';
import type { AnnualConferenceSpeakerSubmission } from '@/lib/annual-conference-speakers';
import {
  annualConferenceDecisionEmailCanBeRetriedManually,
  annualConferenceDecisionEmailCooldownElapsed,
  annualConferenceDecisionEmailIsDue,
} from './delivery';

function delivery(attempts: number, lastAttemptAt: string | null, retryable = true) {
  return {
    decision_email_attempt_count: attempts,
    decision_email_last_attempt_at: lastAttemptAt,
    decision_email_retryable: retryable,
  } as AnnualConferenceSpeakerSubmission;
}

describe('Annual Conference decision email retry policy', () => {
  it('applies bounded backoff and stops after five attempts', () => {
    const now = Date.parse('2026-09-07T19:00:00.000Z');
    expect(annualConferenceDecisionEmailIsDue(delivery(0, null), now)).toBe(true);
    expect(annualConferenceDecisionEmailIsDue(delivery(1, '2026-09-07T18:56:00.000Z'), now)).toBe(false);
    expect(annualConferenceDecisionEmailIsDue(delivery(1, '2026-09-07T18:55:00.000Z'), now)).toBe(true);
    expect(annualConferenceDecisionEmailIsDue(delivery(5, '2026-09-07T00:00:00.000Z'), now)).toBe(false);
    expect(annualConferenceDecisionEmailIsDue(delivery(1, null, false), now)).toBe(false);
  });

  it('separates automatic retry eligibility from manual exhausted recovery', () => {
    const exhausted = {
      ...delivery(5, '2026-09-07T00:00:00.000Z', false),
      decision_email_last_error: 'Automatic email retries were exhausted. Review the recipient and retry manually.',
    } as AnnualConferenceSpeakerSubmission;
    expect(annualConferenceDecisionEmailIsDue(exhausted, Date.parse('2026-09-08T00:00:00.000Z'))).toBe(false);
    expect(annualConferenceDecisionEmailCooldownElapsed(exhausted, Date.parse('2026-09-08T00:00:00.000Z'))).toBe(true);
    expect(annualConferenceDecisionEmailCanBeRetriedManually(exhausted)).toBe(true);
    expect(annualConferenceDecisionEmailCanBeRetriedManually({
      ...exhausted,
      decision_email_last_error: 'The recipient or message was rejected. Correct the delivery email before retrying.',
    })).toBe(false);
  });
});
