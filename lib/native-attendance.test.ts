import { describe, expect, it } from 'vitest';
import { attendanceRecordsFromRegistrations } from './native-attendance';
import type { EventRegistration } from '@/types';

function registration(status: EventRegistration['status'], checkedInAt: string | null = null): EventRegistration {
  return {
    id: `${status}-id`,
    campaign_id: 'campaign-id',
    name: `${status} guest`,
    email: `${status}@example.dev`,
    status,
    confirmed_at: status === 'confirmed' ? '2026-08-01T10:00:00.000Z' : null,
    cancelled_at: status === 'cancelled' ? '2026-08-01T10:00:00.000Z' : null,
    checked_in_at: checkedInAt,
    email_status: 'accepted',
    created_at: '2026-08-01T09:00:00.000Z',
    updated_at: '2026-08-01T09:00:00.000Z',
  };
}

describe('attendanceRecordsFromRegistrations', () => {
  it('keeps active registrations and preserves their attendance state', () => {
    const records = attendanceRecordsFromRegistrations('event-id', [
      registration('confirmed', '2026-08-10T19:05:00.000Z'),
      registration('waitlisted'),
      registration('cancelled'),
    ]);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ approval_status: 'approved', checked_in_at: '2026-08-10T19:05:00.000Z' });
    expect(records[1]).toMatchObject({ approval_status: 'pending', ticket_name: 'Waitlist' });
  });
});
