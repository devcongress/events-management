import type { EventRegistration } from '@/types';

export const ALL_REGISTRATION_INITIALS = 'all';
export const SIMULATED_REGISTRATION_COUNT = 64;

export function registrationNameInitial(name: string): string {
  const normalized = name
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  const initial = normalized.charAt(0).toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : '#';
}

export function registrationInitials(registrations: EventRegistration[]): string[] {
  const initials = new Set(registrations.map((registration) => registrationNameInitial(registration.name)));
  return [...initials].sort((first, second) => {
    if (first === '#') return 1;
    if (second === '#') return -1;
    return first.localeCompare(second);
  });
}

export function filterRegistrationsForCheckIn(
  registrations: EventRegistration[],
  input: { query: string; initial: string },
): EventRegistration[] {
  const query = input.query.trim().toLowerCase();

  return registrations
    .filter((registration) => (
      input.initial === ALL_REGISTRATION_INITIALS
      || registrationNameInitial(registration.name) === input.initial
    ))
    .filter((registration) => (
      !query
      || registration.name.toLowerCase().includes(query)
      || registration.email.toLowerCase().includes(query)
    ))
    .sort((first, second) => first.name.localeCompare(second.name, 'en-GH', {
      sensitivity: 'base',
    }));
}
