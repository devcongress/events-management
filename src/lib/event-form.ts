import { z } from 'zod';
import { EVENT_SERIES_TYPES } from '@/lib/event-series';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OPTIONAL_URL_MESSAGE = 'Enter a full URL that starts with http:// or https://.';
const OPTIONAL_COVER_MESSAGE = 'Use a full URL or a site-local path that starts with /.';
const OPTIONAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isFullUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isSiteLocalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//');
}

export const createEventFormSchema = z.object({
  name: z.string().trim().min(1, 'Add the meetup name.'),
  description: z.string().trim().min(1, 'Add a short description for the meetup.'),
  event_date: z.string().trim().regex(ISO_DATE_PATTERN, 'Choose the meetup date.'),
  series_type: z.enum(EVENT_SERIES_TYPES).default('monthly'),
  end_date: z.string().trim().optional().default(''),
  slug: z.string().trim().optional().default(''),
  cover: z.string().trim().optional().default(''),
  registration_url: z.string().trim().optional().default(''),
  location_name: z.string().trim().min(1, 'Add the meetup location.'),
  location_url: z.string().trim().optional().default(''),
  publish_to_website: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.end_date && !ISO_DATE_PATTERN.test(value.end_date)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['end_date'],
      message: 'Choose a valid end date.',
    });
  }

  if (value.end_date && value.end_date < value.event_date) {
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

  if (value.registration_url && !isFullUrl(value.registration_url)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['registration_url'],
      message: OPTIONAL_URL_MESSAGE,
    });
  }

  if (value.location_url && !isFullUrl(value.location_url)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['location_url'],
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
    event_date: value.event_date,
    series_type: value.series_type,
    end_date: emptyToNull(value.end_date),
    slug: emptyToNull(value.slug),
    cover: emptyToNull(value.cover),
    registration_url: emptyToNull(value.registration_url),
    location: {
      label: locationLabel,
      name: locationLabel,
      url: emptyToNull(value.location_url),
    },
    publish_to_website: value.publish_to_website,
  };
}
