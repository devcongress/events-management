import { describe, expect, it } from 'vitest';
import { formatProgrammeTime, parseProgrammeTime } from './programme-time';

describe('programme time parsing', () => {
  it.each([
    ['1:15–2:00 PM', '1:15–2:00 PM'],
    ['11:45 AM–12:00 PM', '11:45 AM–12:00 PM'],
    ['11:45–12:00 PM', '11:45 AM–12:00 PM'],
    ['10:00–10:15 AM', '10:00–10:15 AM'],
    ['11:59 PM–12:01', '11:59 PM–12:01 AM'],
    ['12:00 PM', '12:00 PM'],
  ])('reads %s', (value, expected) => {
    expect(formatProgrammeTime(parseProgrammeTime(value)!)).toBe(expected);
  });

  it.each(['TBD', '', 'After lunch', '13:00', '1:15–2:00'])('does not invent a time for %s', (value) => {
    expect(parseProgrammeTime(value)).toBeNull();
  });
});

describe('programme duration', () => {
  it('keeps custom durations and detects overnight ranges', async () => {
    const { programmeDuration, clockFromMinutes } = await import('./programme-time');

    expect(programmeDuration(parseProgrammeTime('11:45 AM–12:02 PM')!)).toBe(17);
    expect(programmeDuration(parseProgrammeTime('11:59 PM–12:01 AM')!)).toBeNull();
    expect(clockFromMinutes(720)).toEqual({ hour: 12, minute: 0, period: 'PM' });
    expect(clockFromMinutes(0)).toEqual({ hour: 12, minute: 0, period: 'AM' });
    expect(clockFromMinutes(1440)).toEqual({ hour: 12, minute: 0, period: 'AM' });
    expect(programmeDuration(parseProgrammeTime('11:45 PM–12:00 AM')!)).toBe(15);
  });
});
