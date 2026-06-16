import { describe, expect, it } from 'vitest';
import {
  attendanceUploadWindowForMonth,
  lastSaturdayOfMonth,
} from './attendance-upload-window';

describe('attendance upload window', () => {
  it('finds the last Saturday of the current month', () => {
    expect(lastSaturdayOfMonth(new Date('2026-06-16T12:00:00Z')).toISOString()).toBe('2026-06-27T00:00:00.000Z');
  });

  it('allows past meetup months for backfill', () => {
    const window = attendanceUploadWindowForMonth('2026-05', new Date('2026-06-16T12:00:00Z'));

    expect(window.available).toBe(true);
  });

  it('blocks the current meetup month', () => {
    const window = attendanceUploadWindowForMonth('2026-06', new Date('2026-06-16T12:00:00Z'));

    expect(window).toMatchObject({
      available: false,
      reason: 'Attendance CSV upload is not open for the current meetup month.',
    });
  });

  it('blocks next month before this month last Saturday', () => {
    const window = attendanceUploadWindowForMonth('2026-07', new Date('2026-06-16T12:00:00Z'));

    expect(window).toMatchObject({
      available: false,
      unlocks_at: '2026-06-27T00:00:00.000Z',
    });
  });

  it('opens next month from this month last Saturday', () => {
    const window = attendanceUploadWindowForMonth('2026-07', new Date('2026-06-27T10:00:00Z'));

    expect(window.available).toBe(true);
  });
});
