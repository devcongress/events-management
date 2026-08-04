import type { EventFormat } from '@/types';

export const EVENT_FORMATS = [
  'meetup',
  'conference',
  'workshop',
  'hackathon',
  'webinar',
  'other',
] as const satisfies readonly EventFormat[];

export const EVENT_FORMAT_LABELS: Record<EventFormat, string> = {
  meetup: 'Meetup',
  conference: 'Conference / congress',
  workshop: 'Workshop',
  hackathon: 'Hackathon',
  webinar: 'Webinar',
  other: 'Other',
};

export function isEventFormat(value: unknown): value is EventFormat {
  return typeof value === 'string' && EVENT_FORMATS.includes(value as EventFormat);
}
