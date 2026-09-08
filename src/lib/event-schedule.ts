const EVENT_TIME_ZONE = 'Africa/Accra';

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: EVENT_TIME_ZONE,
  }).format(value);
}

const dateFormatter = new Intl.DateTimeFormat('en-GH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: EVENT_TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat('en-GH', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: EVENT_TIME_ZONE,
});

export function formatPublicEventSchedule(
  startsAt: string,
  endsAt?: string | null,
): string {
  const start = validDate(startsAt);
  if (!start) return 'Time to be announced';

  const end = validDate(endsAt);
  const startLabel = `${dateFormatter.format(start)} at ${timeFormatter.format(start)}`;
  if (!end || end.getTime() <= start.getTime()) return startLabel;

  if (dateKey(start) === dateKey(end)) {
    return `${startLabel}–${timeFormatter.format(end)}`;
  }

  return `${startLabel} – ${dateFormatter.format(end)} at ${timeFormatter.format(end)}`;
}
