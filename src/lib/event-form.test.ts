import { describe, expect, it } from 'vitest';
import { createEventFormSchema, toCreateEventApiPayload, toEventSlug } from './event-form';

describe('toEventSlug', () => {
  it('turns an event name into a lowercase website slug', () => {
    expect(toEventSlug('DevCongress August 2026 Meetup')).toBe('devcongress-august-2026-meetup');
  });

  it('removes punctuation and preserves readable accented words', () => {
    expect(toEventSlug('Café, APIs & Community!')).toBe('cafe-apis-community');
  });

  it('does not leave a partial trailing separator at the length limit', () => {
    expect(toEventSlug(`${'a'.repeat(79)} event`)).toBe('a'.repeat(79));
  });
});

describe('event series form payload', () => {
  it('stores None of these as no series instead of Special', () => {
    const parsed = createEventFormSchema.parse({
      name: 'Community Demo Night',
      description: 'An independent community gathering.',
      event_date: '2026-08-20',
      series_type: 'none',
      location_name: 'Accra',
    });

    expect(toCreateEventApiPayload(parsed).series_type).toBeNull();
  });

  it('stores Ghana-local event times as UTC timestamps', () => {
    const parsed = createEventFormSchema.parse({
      name: 'Community Demo Night',
      description: 'An independent community gathering.',
      event_date: '2026-08-20T18:00',
      end_date: '2026-08-20T21:00',
      series_type: 'none',
      location_name: 'Accra',
    });

    expect(toCreateEventApiPayload(parsed)).toMatchObject({
      event_date: '2026-08-20T18:00:00.000Z',
      end_date: '2026-08-20T21:00:00.000Z',
    });
  });

  it('rejects an end time before the event starts', () => {
    const result = createEventFormSchema.safeParse({
      name: 'Community Demo Night',
      description: 'An independent community gathering.',
      event_date: '2026-08-20T18:00',
      end_date: '2026-08-20T17:30',
      series_type: 'none',
      location_name: 'Accra',
    });

    expect(result.success).toBe(false);
  });
});

describe('event video conference link', () => {
  it('normalizes an optional video conference link into the native event payload', () => {
    const parsed = createEventFormSchema.parse({
      name: 'DevCongress Online Meetup',
      description: 'A remote community meetup.',
      event_date: '2026-08-20',
      series_type: 'monthly',
      location_name: 'Online',
      stream_url: '  https://meet.google.com/abc-defg-hij  ',
    });

    expect(toCreateEventApiPayload(parsed)).toMatchObject({
      stream_url: 'https://meet.google.com/abc-defg-hij',
      embed_stream: false,
    });
  });

  it('rejects non-http video conference links', () => {
    const result = createEventFormSchema.safeParse({
      name: 'DevCongress Online Meetup',
      description: 'A remote community meetup.',
      event_date: '2026-08-20',
      series_type: 'monthly',
      location_name: 'Online',
      stream_url: 'javascript:alert(1)',
    });

    expect(result.success).toBe(false);
  });
});

describe('event Ghana map link', () => {
  it('normalizes a Google Maps share link into the native location', () => {
    const parsed = createEventFormSchema.parse({
      name: 'DevCongress Accra Meetup',
      description: 'An in-person community meetup.',
      event_date: '2026-08-20',
      series_type: 'monthly',
      location_name: 'buro., Accra',
      location_url: '  https://maps.app.goo.gl/n8u6C6TgdtW35db67  ',
    });

    expect(toCreateEventApiPayload(parsed).location).toMatchObject({
      name: 'buro., Accra',
      url: 'https://maps.app.goo.gl/n8u6C6TgdtW35db67',
    });
  });

  it('rejects non-Google URLs in the venue map field', () => {
    const result = createEventFormSchema.safeParse({
      name: 'DevCongress Accra Meetup',
      description: 'An in-person community meetup.',
      event_date: '2026-08-20',
      series_type: 'monthly',
      location_name: 'Accra',
      location_url: 'https://example.com/venue',
    });

    expect(result.success).toBe(false);
  });
});
