import { describe, expect, it } from 'vitest';
import { volunteerOutcomeRowControl, type OutcomeControlEvidence } from './volunteer-outcome-row-control';

const now = Date.parse('2026-10-18T20:00:00Z');
const recipient = { decision: 'accepted', decision_version: 2 };
const delivery: OutcomeControlEvidence = {
  ...recipient, status: 'retrying', individually_controlled: true, held_at: null,
  provider_email_id: null, provider_event_at: null, claimed_until: null,
  attempt_count: 2, first_attempt_at: '2026-10-18T19:00:00Z', next_attempt_at: '2026-10-18T20:05:00Z',
};

describe('outcome row control availability', () => {
  it('allows holding and resuming a current singleton retry without resetting its attempts', () => {
    expect(volunteerOutcomeRowControl(delivery, recipient, now).can_hold).toBe(true);
    expect(volunteerOutcomeRowControl({ ...delivery, held_at: '2026-10-18T19:30:00Z' }, recipient, now).can_resume).toBe(true);
    expect(delivery.attempt_count).toBe(2);
  });

  it.each([
    { individually_controlled: false }, { decision_version: 1 }, { status: 'sending' },
    { claimed_until: '2026-10-18T20:10:00Z' }, { provider_email_id: 'accepted-id' },
    { provider_event_at: '2026-10-18T19:00:00Z' }, { status: 'delivered' },
    { status: 'failed', next_attempt_at: null },
  ])('blocks unsafe hold %j', (change) => {
    expect(volunteerOutcomeRowControl({ ...delivery, ...change }, recipient, now)).toMatchObject({ can_hold: false, can_resume: false, reason: expect.any(String) });
  });

  it.each([
    { attempt_count: 4 }, { first_attempt_at: '2026-10-17T20:00:00Z' },
    { first_attempt_at: null }, { status: 'failed', failure_certainty: 'ambiguous' },
  ])('keeps unsafe resumes on hold %j', (change) => {
    expect(volunteerOutcomeRowControl({ ...delivery, held_at: '2026-10-18T19:30:00Z', ...change }, recipient, now)).toMatchObject({ held: true, can_resume: false });
  });
});
