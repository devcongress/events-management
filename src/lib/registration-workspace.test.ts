import { describe, expect, it } from 'vitest';
import {
  filterRegistrationGuests,
  registrationFirstName,
  registrationEventHasEnded,
  summarizeRegistrationEmails,
  summarizeRegistrationWorkspace,
} from './registration-workspace';
import type { Event, EventRegistration, EventRegistrationCampaign } from '@/types';
import { ALL_REGISTRATION_INITIALS } from '@/src/lib/registration-checkin';

const event: Pick<Event, 'status' | 'event_date' | 'end_date'> = {
  status: 'upcoming',
  event_date: '2026-08-20T18:00:00.000Z',
  end_date: '2026-08-20T21:00:00.000Z',
};

const campaign: Pick<EventRegistrationCampaign, 'capacity'> = {
  capacity: 3,
};

function registration(
  id: string,
  status: EventRegistration['status'],
  input: {
    checkedIn?: boolean;
    emailStatus?: EventRegistration['email_status'];
  } = {},
): EventRegistration {
  return {
    id,
    campaign_id: 'campaign-1',
    name: `Guest ${id}`,
    email: `${id}@example.com`,
    status,
    confirmed_at: status === 'confirmed' ? '2026-08-01T10:00:00.000Z' : null,
    cancelled_at: status === 'cancelled' ? '2026-08-02T10:00:00.000Z' : null,
    checked_in_at: input.checkedIn ? '2026-08-20T18:05:00.000Z' : null,
    email_status: input.emailStatus === undefined ? 'accepted' : input.emailStatus,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
  };
}

const registrations = [
  registration('one', 'confirmed', { checkedIn: true }),
  registration('two', 'confirmed', { emailStatus: 'failed' }),
  registration('three', 'waitlisted', { emailStatus: 'pending' }),
  registration('four', 'cancelled', { emailStatus: null }),
];

describe('registration receipt name', () => {
  it('uses only the first submitted name in the thank-you heading', () => {
    expect(registrationFirstName('Elvis Opoku Amoako')).toBe('Elvis');
    expect(registrationFirstName('  Ama   Mensah  ')).toBe('Ama');
    expect(registrationFirstName('Kojo')).toBe('Kojo');
  });
});

describe('registration workspace summary', () => {
  it('does not label guests as no-shows before the event ends', () => {
    expect(registrationEventHasEnded(event, Date.parse('2026-08-20T20:00:00.000Z'))).toBe(false);
    expect(summarizeRegistrationWorkspace(
      event,
      campaign,
      registrations,
      Date.parse('2026-08-20T20:00:00.000Z'),
    )).toEqual({
      going: 2,
      capacity: 3,
      placesLeft: 1,
      waitlisted: 1,
      checkedIn: 1,
      cancelled: 1,
      noShows: null,
      eventEnded: false,
    });
  });

  it('derives no-shows only after the event and excludes cancelled or waitlisted guests', () => {
    expect(summarizeRegistrationWorkspace(
      event,
      campaign,
      registrations,
      Date.parse('2026-08-20T22:00:00.000Z'),
    ).noShows).toBe(1);
  });

  it('treats a completed event as ended even when its saved date is malformed', () => {
    expect(registrationEventHasEnded({
      status: 'completed',
      event_date: 'unknown',
      end_date: null,
    })).toBe(true);
  });
});

describe('registration workspace filters', () => {
  it('combines search and status filters without treating pre-event absences as no-shows', () => {
    expect(filterRegistrationGuests(registrations, {
      query: 'two',
      initial: ALL_REGISTRATION_INITIALS,
      status: 'going',
      eventEnded: false,
    }).map((item) => item.id)).toEqual(['two']);

    expect(filterRegistrationGuests(registrations, {
      query: '',
      initial: ALL_REGISTRATION_INITIALS,
      status: 'no_show',
      eventEnded: false,
    })).toEqual([]);

    expect(filterRegistrationGuests(registrations, {
      query: '',
      initial: ALL_REGISTRATION_INITIALS,
      status: 'no_show',
      eventEnded: true,
    }).map((item) => item.id)).toEqual(['two']);
  });
});

describe('registration email summary', () => {
  it('keeps accepted, queued, failed, and missing delivery records distinct', () => {
    expect(summarizeRegistrationEmails(registrations)).toEqual({
      accepted: 1,
      pending: 1,
      failed: 1,
      notQueued: 1,
    });
  });
});
