import { describe, expect, it } from 'vitest';
import {
  ALL_REGISTRATION_INITIALS,
  filterRegistrationsForCheckIn,
  registrationInitials,
  registrationNameInitial,
  SIMULATED_REGISTRATION_COUNT,
} from './registration-checkin';
import {
  createSimulatedRegistrations,
  isSimulatedRegistration,
} from './registration-simulation';

describe('registration check-in helpers', () => {
  it('creates a deterministic non-persistent 64-guest simulation', () => {
    const registrations = createSimulatedRegistrations();

    expect(registrations).toHaveLength(SIMULATED_REGISTRATION_COUNT);
    expect(registrations.filter((registration) => registration.status === 'confirmed')).toHaveLength(56);
    expect(registrations.filter((registration) => registration.status === 'waitlisted')).toHaveLength(8);
    expect(registrations.filter((registration) => registration.status === 'cancelled')).toHaveLength(0);
    expect(registrations.every((registration) => registration.email.endsWith('@example.test'))).toBe(true);
    expect(registrations.every((registration) => isSimulatedRegistration(registration.id))).toBe(true);
  });

  it('derives available letters and normalizes accented initials', () => {
    const registrations = createSimulatedRegistrations().slice(0, 2);
    registrations.push({
      ...registrations[0],
      id: 'accented',
      name: 'Ési Mensah',
    });

    expect(registrationNameInitial(' Ési Mensah')).toBe('E');
    expect(registrationNameInitial('123 Community')).toBe('#');
    expect(registrationInitials(registrations)).toEqual(['A', 'E']);
  });

  it('combines first-letter narrowing with name or email search', () => {
    const registrations = createSimulatedRegistrations();

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
