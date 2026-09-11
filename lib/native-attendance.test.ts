import { describe, expect, it } from 'vitest';
import {
  attendanceImportFromRegistrationSource,
  attendanceRecordsFromRegistrations,
  eventHasFinalNativeAttendance,
  eventUsesNativeAttendance,
} from './native-attendance';
import type { Event, EventRegistration } from '@/types';

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

  it('builds a native attendance import from one registration source', () => {
    const attendanceImport = attendanceImportFromRegistrationSource({
      event_id: 'event-id',
      campaign_updated_at: '2026-08-30T09:00:00.000Z',
      registrations: [registration('confirmed', '2026-08-29T10:05:00.000Z')],
    }, '2026-08');

    expect(attendanceImport).toMatchObject({
      id: 'native-registration-event-id',
      event_id: 'event-id',
      attendance_month: '2026-08',
      source: 'native_registration',
      source_filename: null,
      row_count: 1,
    });
    expect(attendanceImport.records[0]?.checked_in_at).toBe('2026-08-29T10:05:00.000Z');
  });

  it('uses native attendance only for official monthly meetups from the native rollout onward', () => {
    const event = {
      event_date: '2026-08-29T09:00:00.000Z',
      name: 'DevCongress August Meetup',
      series_type: 'monthly',
      submission_source: 'internal',
    } as Event;

    expect(eventUsesNativeAttendance(event)).toBe(true);
    expect(eventUsesNativeAttendance({ ...event, event_date: '2026-07-25T09:00:00.000Z' })).toBe(false);
    expect(eventUsesNativeAttendance({ ...event, submission_source: 'public_submission' })).toBe(false);
    expect(eventUsesNativeAttendance({ ...event, series_type: 'special' })).toBe(false);
  });

  it('treats native attendance as final only after the event ends', () => {
    const event = {
      event_date: '2026-09-26T09:00:00.000Z',
      end_date: '2026-09-26T16:00:00.000Z',
      status: 'upcoming',
      name: 'DevCongress September Meetup',
      series_type: 'monthly',
      submission_source: 'internal',
    } as Event;

    expect(eventHasFinalNativeAttendance(event, Date.parse('2026-09-26T12:00:00.000Z'))).toBe(false);
    expect(eventHasFinalNativeAttendance(event, Date.parse('2026-09-26T16:00:01.000Z'))).toBe(true);
  });
});
