import { describe, expect, it } from 'vitest';
import { LumaPageFetchError, lumaImportFailure, parsePublicLumaEventHtml } from './luma/events';

describe('parsePublicLumaEventHtml', () => {
  it('extracts a public Luma event draft from JSON-LD metadata', () => {
    const html = `
      <html>
        <head>
          <meta property="og:url" content="https://luma.com/jf8pjncl">
          <meta property="og:title" content="DevCongress March Meetup · Luma">
          <meta property="og:image" content="https://images.lumacdn.com/fallback.png">
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Event",
              "@id": "https://luma.com/jf8pjncl",
              "url": "https://luma.com/jf8pjncl",
              "name": "DevCongress March Meetup",
              "startDate": "2026-03-28T10:00:00.000+00:00",
              "endDate": "2026-03-28T15:00:00.000+00:00",
              "description": "Builder-focused meetup.",
              "image": ["https://images.lumacdn.com/event-cover.png"],
              "location": {
                "@type": "Place",
                "name": "Fido",
                "address": {
                  "@type": "PostalAddress",
                  "addressLocality": "Accra",
                  "addressCountry": "GH",
                  "streetAddress": "Fido"
                }
              }
            }
          </script>
        </head>
      </html>
    `;

    expect(parsePublicLumaEventHtml('https://luma.com/jf8pjncl', html)).toEqual({
      external_id: 'jf8pjncl',
      external_url: 'https://luma.com/jf8pjncl',
      name: 'DevCongress March Meetup',
      description: 'Builder-focused meetup.',
      event_date: '2026-03-28T10:00:00.000+00:00',
      end_date: '2026-03-28T15:00:00.000+00:00',
      cover: 'https://images.lumacdn.com/event-cover.png',
      registration_url: 'https://luma.com/jf8pjncl',
      location: {
        label: 'Fido, Accra, GH',
        name: 'Fido',
        url: null,
      },
    });
  });

  it('rejects non-Luma URLs', () => {
    expect(parsePublicLumaEventHtml('https://example.com/jf8pjncl', '')).toBeNull();
  });

  it('turns Luma rate limiting into a clear organizer-facing failure', () => {
    expect(lumaImportFailure(
      new LumaPageFetchError(429),
      'Unable to preview Luma event right now.',
    )).toEqual({
      status: 429,
      message: 'Luma is temporarily limiting imports from DevCongress. Please try again later.',
    });
  });

  it('preserves the route fallback for other Luma failures', () => {
    expect(lumaImportFailure(
      new LumaPageFetchError(503),
      'Unable to preview Luma event right now.',
    )).toEqual({
      status: 502,
      message: 'Unable to preview Luma event right now.',
    });
  });
});
