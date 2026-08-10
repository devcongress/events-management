import type { EventRegistration, LumaAttendanceRecord } from '@/types';

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
