import { describe, expect, it } from 'vitest';
import { resolveEventStatus } from '@/lib/event-status';

describe('resolveEventStatus', () => {
  it('advances past non-draft events to completed', () => {
    expect(resolveEventStatus({
      status: 'live',
      event_date: '2026-06-20T10:00:00+00:00',
      end_date: '2026-06-20T15:00:00+00:00',
    }, new Date('2026-06-26T12:00:00+00:00').getTime())).toBe('completed');
  });

  it('promotes in-progress pre-event states to live', () => {
    expect(resolveEventStatus({
      status: 'cfp_closed',
      event_date: '2026-06-26T10:00:00+00:00',
      end_date: '2026-06-26T15:00:00+00:00',
    }, new Date('2026-06-26T12:00:00+00:00').getTime())).toBe('live');
  });

  it('keeps draft events as draft even after the scheduled date', () => {
    expect(resolveEventStatus({
      status: 'draft',
      event_date: '2026-06-20T10:00:00+00:00',
      end_date: '2026-06-20T15:00:00+00:00',
    }, new Date('2026-06-26T12:00:00+00:00').getTime())).toBe('draft');
  });

  it('downgrades impossible future live states back to upcoming', () => {
    expect(resolveEventStatus({
      status: 'live',
      event_date: '2026-07-25T10:00:00+00:00',
      end_date: '2026-07-25T15:00:00+00:00',
    }, new Date('2026-06-26T12:00:00+00:00').getTime())).toBe('upcoming');
  });
});
