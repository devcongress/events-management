export type ConferenceRegistrationGuest = {
  id: string;
  name: string;
  email: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  created_at: string;
  is_test: boolean;
  ticket_id: string | null;
  email_status?: string;
};

export type ConferenceAdmission = {
  ticket_id: string;
  attendee_name: string | null;
  name: string;
  status: 'issued' | 'checked_in';
  checked_in_at: string | null;
  order_seat_number: number | null;
};

export type ConferenceGuestRow = {
  key: string;
  name: string;
  email?: string;
  registration?: ConferenceRegistrationGuest;
  admission?: ConferenceAdmission;
};

export function conferenceGuestRows(
  admissions: ConferenceAdmission[],
  registrations?: ConferenceRegistrationGuest[],
): ConferenceGuestRow[] {
  const byTicket = new Map(admissions.map((admission) => [admission.ticket_id, admission]));
  const linkedTickets = new Set(registrations?.map((registration) => registration.ticket_id).filter(Boolean));
  const rows: ConferenceGuestRow[] = (registrations ?? []).map((registration) => ({
    key: `registration:${registration.id}`,
    name: registration.name,
    email: registration.email,
    registration,
    admission: registration.status === 'confirmed' && registration.ticket_id
      ? byTicket.get(registration.ticket_id)
      : undefined,
  }));

  for (const admission of admissions) {
    if (!linkedTickets.has(admission.ticket_id)) {
      rows.push({ key: `ticket:${admission.ticket_id}`, name: admission.name, admission });
    }
  }

  return rows;
}

export function conferenceGuestMatchesStatus(row: ConferenceGuestRow, status: string): boolean {
  if (status === 'all') return true;
  if (status === 'issued' || status === 'checked_in') return row.admission?.status === status;

  return row.registration?.status === status;
}
