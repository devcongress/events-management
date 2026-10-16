import { describe, expect, it } from 'vitest';
import { conferenceGuestRows, conferenceGuestMatchesStatus, type ConferenceAdmission, type ConferenceRegistrationGuest } from './conference-guests';

const admission: ConferenceAdmission = { ticket_id: 'ticket-1', name: 'Ada', attendee_name: 'Ada', status: 'issued', checked_in_at: null, order_seat_number: 1 };
const registration: ConferenceRegistrationGuest = { id: 'reg-1', name: 'Ada', email: 'ada@example.test', status: 'confirmed', created_at: '', is_test: false, ticket_id: 'ticket-1' };

describe('conference guest list', () => {
  it('combines a registration and its admission into one row by ticket identity', () => {
    const rows = conferenceGuestRows([admission], [registration]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ registration, admission, email: registration.email });
    expect(conferenceGuestMatchesStatus(rows[0]!, 'issued')).toBe(true);
  });

  it('never joins matching names and preserves unmatched admissions', () => {
    const rows = conferenceGuestRows([admission], [{ ...registration, ticket_id: null }]);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.admission).toBeUndefined();
    expect(rows[1]!.registration).toBeUndefined();
    expect(rows[1]!.email).toBeUndefined();
  });

  it.each(['cancelled', 'waitlisted'] as const)('keeps %s registrations without admission actions', (status) => {
    const rows = conferenceGuestRows([admission], [{ ...registration, status }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.admission).toBeUndefined();
    expect(conferenceGuestMatchesStatus(rows[0]!, status)).toBe(true);
    expect(conferenceGuestMatchesStatus(rows[0]!, 'issued')).toBe(false);
  });

  it('returns admission-only rows without management data for volunteers', () => {
    expect(conferenceGuestRows([admission])).toEqual([{ key: 'ticket:ticket-1', name: 'Ada', admission }]);
  });
});
