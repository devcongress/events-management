type AmendmentComparableEvent = {
  starts_at: string;
  ends_at: string;
  timezone: string;
  location_type: string;
  venue_name: string | null;
  venue_address: string | null;
  online_url: string | null;
  registration_url: string | null;
  cover_url: string | null;
};

export type EventAmendmentChanges = {
  schedule: boolean;
  location: boolean;
  onlineUrl: boolean;
  registrationUrl: boolean;
  cover: boolean;
};

function normalizedText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function sameInstant(left: string, right: string): boolean {
  const leftInstant = Date.parse(left);
  const rightInstant = Date.parse(right);

  if (!Number.isNaN(leftInstant) && !Number.isNaN(rightInstant)) return leftInstant === rightInstant;

  return normalizedText(left) === normalizedText(right);
}

export function amendmentReplacesCover(currentCoverUrl: string | null, amendmentCoverUrl: string | null) {
  const current = normalizedText(currentCoverUrl);
  const requested = normalizedText(amendmentCoverUrl);

  return requested !== null && requested !== current;
}

export function compareEventAmendment(
  current: AmendmentComparableEvent,
  requested: AmendmentComparableEvent,
): EventAmendmentChanges {
  return {
    schedule: !sameInstant(current.starts_at, requested.starts_at)
      || !sameInstant(current.ends_at, requested.ends_at)
      || normalizedText(current.timezone) !== normalizedText(requested.timezone),
    location: normalizedText(current.location_type) !== normalizedText(requested.location_type)
      || normalizedText(current.venue_name) !== normalizedText(requested.venue_name)
      || normalizedText(current.venue_address) !== normalizedText(requested.venue_address),
    onlineUrl: normalizedText(current.online_url) !== normalizedText(requested.online_url),
    registrationUrl: normalizedText(current.registration_url) !== normalizedText(requested.registration_url),
    cover: amendmentReplacesCover(current.cover_url, requested.cover_url),
  };
}

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function dateTimePartsInTimeZone(date: Date, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: valueFor('year'),
    month: valueFor('month'),
    day: valueFor('day'),
    hour: valueFor('hour'),
    minute: valueFor('minute'),
  };
}

function sameDateTimeParts(left: DateTimeParts, right: DateTimeParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}

function formatDateTimeParts(parts: DateTimeParts): string {
  const datePart = [
    parts.year,
    `${parts.month}`.padStart(2, '0'),
    `${parts.day}`.padStart(2, '0'),
  ].join('-');
  const timePart = [
    `${parts.hour}`.padStart(2, '0'),
    `${parts.minute}`.padStart(2, '0'),
  ].join(':');

  return `${datePart}T${timePart}`;
}

function parseDateTimeInput(value: string): DateTimeParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
  const candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));

  if (
    candidate.getUTCFullYear() !== parts.year
    || candidate.getUTCMonth() !== parts.month - 1
    || candidate.getUTCDate() !== parts.day
    || parts.hour > 23
    || parts.minute > 59
  ) return null;

  return parts;
}

export function isoToDateTimeInputInTimeZone(iso: string, timeZone: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return '';

  try {
    return formatDateTimeParts(dateTimePartsInTimeZone(date, timeZone));
  } catch {
    return '';
  }
}

export function dateTimeInputInTimeZoneToIso(
  value: string,
  timeZone: string,
  existingIso = '',
): string {
  if (existingIso && isoToDateTimeInputInTimeZone(existingIso, timeZone) === value) {
    return existingIso;
  }

  const requested = parseDateTimeInput(value);

  if (!requested) throw new Error('Choose a valid date and time.');

  try {
    const requestedAsUtc = Date.UTC(
      requested.year,
      requested.month - 1,
      requested.day,
      requested.hour,
      requested.minute,
    );
    const timeZoneOffsetAt = (instantMs: number) => {
      const parts = dateTimePartsInTimeZone(new Date(instantMs), timeZone);

      return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instantMs;
    };
    let instantMs = requestedAsUtc - timeZoneOffsetAt(requestedAsUtc);

    instantMs = requestedAsUtc - timeZoneOffsetAt(instantMs);
    const resolved = dateTimePartsInTimeZone(new Date(instantMs), timeZone);

    if (!sameDateTimeParts(resolved, requested)) {
      throw new Error(`Choose a time that occurs in ${timeZone}.`);
    }
    const isRepeatedTime = Array.from({ length: 24 }, (_, index) => (index + 1) * 15 * 60 * 1000)
      .some((offset) => (
        sameDateTimeParts(dateTimePartsInTimeZone(new Date(instantMs - offset), timeZone), requested)
        || sameDateTimeParts(dateTimePartsInTimeZone(new Date(instantMs + offset), timeZone), requested)
      ));

    if (isRepeatedTime) {
      throw new Error(`Choose a different time: ${value} occurs twice in ${timeZone}.`);
    }

    return new Date(instantMs).toISOString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Choose')) throw error;

    throw new Error('Choose a valid event time zone.');
  }
}
