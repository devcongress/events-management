import type { Event, EventStatus } from '@/types';

type EventStatusSource = Pick<Event, 'status' | 'event_date' | 'end_date'>;

export function resolveEventStatus(event: EventStatusSource, nowMs = Date.now()): EventStatus {
  if (event.status === 'draft') {
    return 'draft';
  }

  const startsAtMs = new Date(event.event_date).getTime();
  const endsAtMs = new Date(event.end_date ?? event.event_date).getTime();

  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) {
    return event.status;
  }

  if (nowMs > endsAtMs) {
    return 'completed';
  }

  if (nowMs >= startsAtMs) {
    return event.status === 'completed' ? 'completed' : 'live';
  }

  if (event.status === 'live' || event.status === 'completed') {
    return 'upcoming';
  }

  return event.status;
}

export function withResolvedEventStatus<T extends EventStatusSource>(event: T, nowMs = Date.now()): T {
  const status = resolveEventStatus(event, nowMs);
  return status === event.status ? event : { ...event, status };
}
