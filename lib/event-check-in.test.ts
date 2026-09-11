import { describe, expect, it } from 'vitest';
import { isEventCheckInDay } from './event-check-in';

describe('event-day check-in', () => {
  const event = { event_date: '2026-09-26T09:00:00Z', timezone: 'Africa/Accra' };

  it.each([
    ['2026-09-25T23:59:59Z', false],
    ['2026-09-26T00:00:00Z', true],
    ['2026-09-26T08:00:00Z', true],
    ['2026-09-26T23:59:59Z', true],
    ['2026-09-27T00:00:00Z', false],
  ])('checks calendar boundaries at %s', (now, allowed) => {
    expect(isEventCheckInDay(event, new Date(now))).toBe(allowed);
  });
  it('uses the event timezone, not the browser or UTC day', () => {
    const localEvent = { event_date: '2026-09-26T18:00:00Z', timezone: 'America/New_York' };

    expect(isEventCheckInDay(localEvent, new Date('2026-09-27T03:59:59Z'))).toBe(true);
    expect(isEventCheckInDay(localEvent, new Date('2026-09-27T04:00:00Z'))).toBe(false);
    expect(isEventCheckInDay(localEvent, new Date('2026-09-26T03:59:59Z'))).toBe(false);
  });
  it('defaults legacy events to Accra and fails closed for invalid data', () => {
    expect(isEventCheckInDay({ event_date: event.event_date }, new Date(event.event_date))).toBe(true);
    expect(isEventCheckInDay(null)).toBe(false);
    expect(isEventCheckInDay({ event_date: 'invalid' })).toBe(false);
    expect(isEventCheckInDay({ ...event, timezone: 'invalid' })).toBe(false);
  });
});
