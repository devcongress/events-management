import { z } from 'zod';
import { EVENT_SERIES_SELECTIONS, eventSeriesSelectionToValue } from '@/lib/event-series';
import { safeGoogleMapsUrl } from '@/lib/location-links';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const OPTIONAL_URL_MESSAGE = 'Enter a full URL that starts with http:// or https://.';
const OPTIONAL_COVER_MESSAGE = 'Use a full URL or a site-local path that starts with /.';
const OPTIONAL_MAP_MESSAGE = 'Add an HTTPS Google Maps link for the Ghana venue.';
const OPTIONAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidCalendarValue(value: string): boolean {
  const dateOnly = ISO_DATE_PATTERN.test(value);
  const localDateTime = LOCAL_DATE_TIME_PATTERN.test(value);
  if (!dateOnly && !localDateTime) {
    return value.includes('T') && !Number.isNaN(new Date(value).getTime());
  }

  const candidate = dateOnly ? `${value}T00:00:00.000Z` : `${value}:00.000Z`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return false;
  return dateOnly
    ? parsed.toISOString().startsWith(`${value}T00:00:00.000Z`)
    : parsed.toISOString().startsWith(`${value}:00.000Z`);
}

function normalizeEventDateValue(value: string): string {
  return LOCAL_DATE_TIME_PATTERN.test(value)
    ? new Date(`${value}:00.000Z`).toISOString()
    : value;
}

function isFullUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.length > 0;
  } catch {
    return false;
  }
}

function isSiteLocalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//');
}

export function toEventSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export const createEventFormSchema = z.object({
  name: z.string().trim().min(1, 'Add the meetup name.'),
  description: z.string().trim().min(1, 'Add a short description for the meetup.'),
  event_date: z.string().trim().refine(isValidCalendarValue, 'Choose the meetup start date and time.'),
  series_type: z.enum(EVENT_SERIES_SELECTIONS).default('monthly'),
  end_date: z.string().trim().optional().default(''),
  slug: z.string().trim().optional().default(''),
  cover: z.string().trim().optional().default(''),
  location_name: z.string().trim().min(1, 'Add the meetup location.'),
  location_url: z.string().trim().max(2048, 'The Google Maps link is too long.').optional().default(''),
  stream_url: z.string().trim().max(2048, 'The video conference link is too long.').optional().default(''),
  publish_to_website: z.boolean().default(false),
  registration_capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1.').max(5000, 'Capacity cannot exceed 5,000.').default(100),
  registration_opens_at: z.string().trim().optional().default(''),
  registration_closes_at: z.string().trim().optional().default(''),
  waitlist_enabled: z.boolean().default(true),
  auto_confirm: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.end_date && !isValidCalendarValue(value.end_date)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_date'],
      message: 'Choose a valid end date and time.',
    });
  }

  if (
    value.end_date
    && new Date(normalizeEventDateValue(value.end_date)).getTime()
      < new Date(normalizeEventDateValue(value.event_date)).getTime()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_date'],
      message: 'End date cannot be before the meetup date.',
    });
  }

  if (value.slug && !OPTIONAL_SLUG_PATTERN.test(value.slug)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['slug'],
      message: 'Use lowercase letters, numbers, and single hyphens for the slug.',
    });
  }

  if (value.cover && !(isFullUrl(value.cover) || isSiteLocalPath(value.cover))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cover'],
      message: OPTIONAL_COVER_MESSAGE,
    });
  }

  if (value.registration_opens_at && Number.isNaN(new Date(value.registration_opens_at).getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registration_opens_at'],
      message: 'Choose a valid registration opening time.',
    });
  }

  if (value.registration_closes_at && Number.isNaN(new Date(value.registration_closes_at).getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registration_closes_at'],
      message: 'Choose a valid registration closing time.',
    });
  }

  if (
    value.registration_opens_at
    && value.registration_closes_at
    && new Date(value.registration_closes_at).getTime() < new Date(value.registration_opens_at).getTime()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registration_closes_at'],
      message: 'Registration cannot close before it opens.',
    });
  }

  if (value.location_url && !safeGoogleMapsUrl(value.location_url)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['location_url'],
      message: OPTIONAL_MAP_MESSAGE,
    });
  }

  if (value.stream_url && !isFullUrl(value.stream_url)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stream_url'],
      message: OPTIONAL_URL_MESSAGE,
    });
  }
});

export type CreateEventFormInput = z.input<typeof createEventFormSchema>;
export type CreateEventFormPayload = z.output<typeof createEventFormSchema>;

export function toCreateEventApiPayload(value: CreateEventFormPayload) {
  const locationLabel = value.location_name.trim();

  return {
    name: value.name,
    description: value.description,
    event_date: normalizeEventDateValue(value.event_date),
    series_type: eventSeriesSelectionToValue(value.series_type),
    end_date: value.end_date ? normalizeEventDateValue(value.end_date) : null,
    slug: emptyToNull(value.slug),
    cover: emptyToNull(value.cover),
    location: {
      label: locationLabel,
      name: locationLabel,
      url: safeGoogleMapsUrl(value.location_url),
    },
    stream_url: emptyToNull(value.stream_url),
    embed_stream: false,
    publish_to_website: value.publish_to_website,
    registration: {
      status: 'draft' as const,
      capacity: value.registration_capacity,
      opens_at: emptyToNull(value.registration_opens_at),
      closes_at: emptyToNull(value.registration_closes_at),
      waitlist_enabled: value.waitlist_enabled,
      auto_confirm: value.auto_confirm,
    },
  };
}
