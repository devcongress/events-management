import { describe, expect, it } from 'vitest';
import { evaluateVolunteerRateLimit, recordVolunteerSubmission, volunteerRetryMessage } from '@/lib/volunteer-rate-limit';

describe('volunteer intake rate limit', () => {
  it('allows the first application and blocks another during cooldown', () => {
    const key = `cooldown-${Date.now()}`;
    const now = 1_700_000_000_000;

    expect(evaluateVolunteerRateLimit(key, now)).toEqual({ allowed: true });

    recordVolunteerSubmission(key, now);
    const blocked = evaluateVolunteerRateLimit(key, now + 1_000);

    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) return;
    expect(blocked.reason).toBe('cooldown');
    expect(volunteerRetryMessage(blocked)).toContain('already sent');
  });

  it('allows two applications in a day but blocks the third after cooldown', () => {
    const key = `daily-${Date.now()}`;
    const now = 1_700_000_000_000;
    const elevenMinutes = 11 * 60 * 1000;

    recordVolunteerSubmission(key, now - elevenMinutes * 2);
    recordVolunteerSubmission(key, now - elevenMinutes);

    const blocked = evaluateVolunteerRateLimit(key, now);

    expect(blocked.allowed).toBe(false);
    if (blocked.allowed) return;
    expect(blocked.reason).toBe('daily_limit');
    expect(volunteerRetryMessage(blocked)).toContain('limit for today');
  });

  it('forgets applications older than 24 hours', () => {
    const key = `expiry-${Date.now()}`;
    const now = 1_700_000_000_000;
    const day = 24 * 60 * 60 * 1000;

    recordVolunteerSubmission(key, now - day - 60_000);

    expect(evaluateVolunteerRateLimit(key, now)).toEqual({ allowed: true });
  });
});
