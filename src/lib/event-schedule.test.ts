import { describe, expect, it } from 'vitest';
import { formatPublicEventSchedule } from './event-schedule';

describe('formatPublicEventSchedule', () => {
  it('shows the organizer-controlled start and end time for a same-day monthly event', () => {
    expect(formatPublicEventSchedule(
      '2026-09-26T09:00:00.000Z',
      '2026-09-26T16:00:00.000Z',
    )).toBe('Saturday, 26 September 2026 at 9:00 am–4:00 pm');
  });

  it('falls back to the start when an end time is unavailable', () => {
    expect(formatPublicEventSchedule('2026-09-26T09:00:00.000Z', null))
      .toBe('Saturday, 26 September 2026 at 9:00 am');
  });
});
