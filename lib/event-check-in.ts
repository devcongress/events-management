import type { Event } from '@/types';

export const CHECK_IN_DAY_MESSAGE = 'Check-in is available only on the event date (in the event’s timezone).';

export function isEventCheckInDay(event: Pick<Event, 'event_date' | 'timezone'> | null | undefined, now = new Date()): boolean {
  if (!event) return false;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: event.timezone || 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    return formatter.format(new Date(event.event_date)) === formatter.format(now);
  } catch {
    return false;
  }
}
