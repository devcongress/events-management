import { describe, expect, it } from 'vitest';
import {
  canEditVolunteerFollowUpDeadline,
  volunteerFollowUpApplicationIsEligible,
  volunteerFollowUpQuotaIsComplete,
  volunteerFollowUpApplicationDeadline,
  volunteerFollowUpResponseDeadline,
  volunteerFollowUpWordCount,
} from './volunteer-follow-up';
import { volunteerFollowUpToken, volunteerFollowUpTokenMatches } from './volunteer-follow-up-token';

describe('volunteer follow-up rules', () => {
  it('requires both quota headers before treating provider usage as observed', () => {
    expect(volunteerFollowUpQuotaIsComplete(null)).toBe(false);
    expect(volunteerFollowUpQuotaIsComplete({ dailyUsed: 4, monthlyUsed: null })).toBe(false);
    expect(volunteerFollowUpQuotaIsComplete({ dailyUsed: null, monthlyUsed: 30 })).toBe(false);
    expect(volunteerFollowUpQuotaIsComplete({ dailyUsed: 4, monthlyUsed: 30 })).toBe(true);
    expect(volunteerFollowUpQuotaIsComplete({ dailyUsed: Number.NaN, monthlyUsed: 30 })).toBe(false);
    expect(volunteerFollowUpQuotaIsComplete({ dailyUsed: Number.POSITIVE_INFINITY, monthlyUsed: 30 })).toBe(false);
    expect(volunteerFollowUpQuotaIsComplete({ dailyUsed: -1, monthlyUsed: 30 })).toBe(false);
  });

  it('allows the application deadline to change only before launch', () => {
    expect(canEditVolunteerFollowUpDeadline('draft')).toBe(true);
    expect(canEditVolunteerFollowUpDeadline('running')).toBe(false);
    expect(canEditVolunteerFollowUpDeadline('paused')).toBe(false);
    expect(canEditVolunteerFollowUpDeadline('closed')).toBe(false);
  });

  it('excludes applications created after the current deadline', () => {
    const deadline = '2026-09-20T23:59:59.999Z';

    expect(volunteerFollowUpApplicationIsEligible('2026-09-20T23:59:59.999Z', deadline)).toBe(true);
    expect(volunteerFollowUpApplicationIsEligible('2026-09-21T00:00:00.000Z', deadline)).toBe(false);
    expect(volunteerFollowUpApplicationIsEligible('2026-09-21T00:00:00.000Z', null)).toBe(true);
  });

  it('closes the response window exactly fourteen days after the Accra application deadline', () => {
    const deadline = volunteerFollowUpApplicationDeadline('2026-09-30');

    expect(deadline).toBe('2026-09-30T23:59:59.999Z');
    expect(volunteerFollowUpResponseDeadline(deadline)).toBe('2026-10-14T23:59:59.999Z');
  });

  it('rejects invalid dates without throwing', () => {
    expect(volunteerFollowUpApplicationDeadline('2026-02-30')).toBeNull();
    expect(volunteerFollowUpApplicationDeadline('2026-09-31')).toBeNull();
    expect(volunteerFollowUpResponseDeadline('not a date')).toBeNull();
  });

  it('counts words across whitespace, including line breaks', () => {
    expect(volunteerFollowUpWordCount('  I want\nto help.  ')).toBe(4);
    expect(volunteerFollowUpWordCount('  ')).toBe(0);
  });

  it('binds private tokens to both campaign and recipient', () => {
    const input = { campaignId: 'campaign-one', recipientId: 'recipient-one', secret: 'test-secret' };
    const token = volunteerFollowUpToken(input);

    expect(volunteerFollowUpTokenMatches({ ...input, token })).toBe(true);
    expect(volunteerFollowUpTokenMatches({ ...input, recipientId: 'recipient-two', token })).toBe(false);
    expect(volunteerFollowUpTokenMatches({ ...input, campaignId: 'campaign-two', token })).toBe(false);
    expect(volunteerFollowUpTokenMatches({ ...input, token: 'invalid' })).toBe(false);
  });
});
