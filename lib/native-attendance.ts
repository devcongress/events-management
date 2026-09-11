import { resolveEventSeriesType } from '@/lib/event-series';
import { resolveEventStatus } from '@/lib/event-status';
import type { Event, EventAttendanceImport, EventRegistration, LumaAttendanceRecord } from '@/types';

export type RegistrationAttendanceSource = {
  event_id: string;
  campaign_updated_at: string;
  registrations: EventRegistration[];
};

export function eventUsesNativeAttendance(event: Event): boolean {
  return new Date(event.event_date).getTime() >= Date.UTC(2026, 7, 1)
    && resolveEventSeriesType(event) === 'monthly'
    && event.submission_source !== 'public_submission';
}

export function eventHasFinalNativeAttendance(event: Event, nowMs = Date.now()): boolean {
  return eventUsesNativeAttendance(event) && resolveEventStatus(event, nowMs) === 'completed';
}

/**
 * Adapts the native registration ledger to the attendance read model.
 * Cancelled registrations are intentionally omitted: they never held an
 * active place and therefore are neither attendance nor a no-show.
 */
export function attendanceRecordsFromRegistrations(
  eventId: string,
  registrations: EventRegistration[],
): LumaAttendanceRecord[] {
  return registrations
    .filter((registration) => registration.status !== 'cancelled')
    .map((registration) => ({
      guest_id: registration.id,
      event_id: eventId,
      name: registration.name,
      first_name: null,
      last_name: null,
      email: registration.email,
      phone_number: null,
      registered_at: registration.created_at,
      approval_status: registration.status === 'confirmed' ? 'approved' : 'pending',
      checked_in_at: registration.checked_in_at,
      utm_source: 'DevCongress registration',
      ticket_type_id: null,
      ticket_name: registration.status === 'confirmed' ? 'Confirmed' : 'Waitlist',
      raw_row: {},
    }));
}

export function attendanceImportFromRegistrationSource(
  source: RegistrationAttendanceSource,
  attendanceMonth: string,
): EventAttendanceImport {
  const records = attendanceRecordsFromRegistrations(source.event_id, source.registrations);

  return {
    id: `native-registration-${source.event_id}`,
    event_id: source.event_id,
    attendance_month: attendanceMonth,
    source: 'native_registration',
    source_filename: null,
    row_count: records.length,
    imported_at: source.campaign_updated_at,
    records,
  };
}
