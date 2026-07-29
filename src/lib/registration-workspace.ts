import type {
  Event,
  EventRegistration,
  EventRegistrationCampaign,
  RegistrationEmailDeliveryStatus,
} from '@/types';
import {
  filterRegistrationsForCheckIn,
} from '@/src/lib/registration-checkin';

export type RegistrationGuestFilter =
  | 'all'
  | 'going'
  | 'waitlisted'
  | 'checked_in'
  | 'cancelled'
  | 'no_show';

export interface RegistrationWorkspaceSummary {
  going: number;
  capacity: number;
  placesLeft: number;
  waitlisted: number;
  checkedIn: number;
  cancelled: number;
  noShows: number | null;
  eventEnded: boolean;
}

export interface RegistrationEmailSummary {
  accepted: number;
  pending: number;
  failed: number;
  notQueued: number;
}

type RegistrationEventTiming = Pick<Event, 'status' | 'event_date' | 'end_date'>;

export function registrationEventHasEnded(
  event: RegistrationEventTiming,
  nowMs = Date.now(),
): boolean {
  if (event.status === 'completed') return true;

  const eventEnd = event.end_date || event.event_date;
  const eventEndMs = new Date(eventEnd).getTime();
  return Number.isFinite(eventEndMs) && eventEndMs < nowMs;
}

export function summarizeRegistrationWorkspace(
  event: RegistrationEventTiming,
  campaign: Pick<EventRegistrationCampaign, 'capacity'>,
  registrations: EventRegistration[],
  nowMs = Date.now(),
): RegistrationWorkspaceSummary {
  const going = registrations.filter((registration) => registration.status === 'confirmed');
  const eventEnded = registrationEventHasEnded(event, nowMs);

  return {
    going: going.length,
    capacity: campaign.capacity,
    placesLeft: Math.max(0, campaign.capacity - going.length),
    waitlisted: registrations.filter((registration) => registration.status === 'waitlisted').length,
    checkedIn: going.filter((registration) => Boolean(registration.checked_in_at)).length,
    cancelled: registrations.filter((registration) => registration.status === 'cancelled').length,
    noShows: eventEnded
      ? going.filter((registration) => !registration.checked_in_at).length
      : null,
    eventEnded,
  };
}

export function filterRegistrationGuests(
  registrations: EventRegistration[],
  input: {
    query: string;
    initial: string;
    status: RegistrationGuestFilter;
    eventEnded: boolean;
  },
): EventRegistration[] {
  return filterRegistrationsForCheckIn(registrations, input)
    .filter((registration) => {
      if (input.status === 'all') return true;
      if (input.status === 'going') return registration.status === 'confirmed';
      if (input.status === 'waitlisted') return registration.status === 'waitlisted';
      if (input.status === 'checked_in') return Boolean(registration.checked_in_at);
      if (input.status === 'cancelled') return registration.status === 'cancelled';
      return input.eventEnded
        && registration.status === 'confirmed'
        && !registration.checked_in_at;
    });
}

export function summarizeRegistrationEmails(
  registrations: EventRegistration[],
): RegistrationEmailSummary {
  const count = (status: RegistrationEmailDeliveryStatus) => (
    registrations.filter((registration) => registration.email_status === status).length
  );

  return {
    accepted: count('accepted'),
    pending: count('pending'),
    failed: count('failed'),
    notQueued: registrations.filter((registration) => registration.email_status === null).length,
  };
}
