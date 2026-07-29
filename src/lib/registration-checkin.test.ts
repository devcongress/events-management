import { describe, expect, it } from 'vitest';
import {
  ALL_REGISTRATION_INITIALS,
  filterRegistrationsForCheckIn,
  registrationInitials,
  registrationNameInitial,
} from './registration-checkin';
import type { EventRegistration } from '@/types';

function registration(
  id: string,
  name: string,
  email: string,
): EventRegistration {
  return {
    id,
    campaign_id: 'campaign-1',
    name,
    email,
    status: 'confirmed',
    confirmed_at: '2026-07-28T10:00:00.000Z',
    cancelled_at: null,
    checked_in_at: null,
    email_status: 'accepted',
    created_at: '2026-07-28T10:00:00.000Z',
    updated_at: '2026-07-28T10:00:00.000Z',
  };
}

const registrations = [
  registration('1', 'Adjoa Mensah', 'adjoa@example.com'),
  registration('2', 'Kafui Dzakpasu', 'kafui@example.com'),
  registration('3', 'Kofi Amoako', 'kofi@example.com'),
  registration('4', 'Kojo Poku', 'kojo@example.com'),
  registration('5', 'Kwabena Gyasi', 'kwabena@example.com'),
];

describe('registration check-in helpers', () => {
  it('derives available letters and normalizes accented initials', () => {
    const names = [
      registrations[0],
      registrations[1],
      registration('accented', 'Ési Mensah', 'esi@example.com'),
    ];

    expect(registrationNameInitial(' Ési Mensah')).toBe('E');
    expect(registrationNameInitial('123 Community')).toBe('#');
    expect(registrationInitials(names)).toEqual(['A', 'E', 'K']);
  });

  it('combines first-letter narrowing with name or email search', () => {
    expect(filterRegistrationsForCheckIn(registrations, {
      query: '',
      initial: 'K',
    }).map((registration) => registration.name)).toEqual([
      'Kafui Dzakpasu',
      'Kofi Amoako',
      'Kojo Poku',
      'Kwabena Gyasi',
    ]);

    expect(filterRegistrationsForCheckIn(registrations, {
      query: 'mensah',
      initial: ALL_REGISTRATION_INITIALS,
    }).map((registration) => registration.name)).toEqual(['Adjoa Mensah']);
  });

});
