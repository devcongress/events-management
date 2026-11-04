import { describe, expect, it } from 'vitest';
import { annualConferenceCheckInNotice, isAnnualConferenceCheckInOpen } from './annual-conference-check-in';

describe('annual conference check-in opening', () => {
  it('opens at Accra midnight and stays open after the event date', () => {
    expect(isAnnualConferenceCheckInOpen('2026-12-19', new Date('2026-12-18T23:59:59.999Z'))).toBe(false);
    expect(isAnnualConferenceCheckInOpen('2026-12-19', new Date('2026-12-19T00:00:00.000Z'))).toBe(true);
    expect(isAnnualConferenceCheckInOpen('2026-12-19', new Date('2026-12-20T00:00:00.000Z'))).toBe(true);
  });

  it.each([null, undefined, '', '2026-02-30', '2026-1-01', 'invalid'])('fails closed for %s', (date) => {
    expect(isAnnualConferenceCheckInOpen(date, new Date('2027-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('conference check-in notice', () => {
  it('shows the actual Accra conference date', () => {
    expect(annualConferenceCheckInNotice('2026-12-19')).toBe('Check-in opens at midnight Accra time on 19 December 2026.');
  });

  it.each([null, undefined, '', '2026-02-30', 'invalid'])('explains an unavailable date: %s', (date) => {
    expect(annualConferenceCheckInNotice(date)).toBe('Check-in is unavailable until a valid conference date is set.');
  });
});
