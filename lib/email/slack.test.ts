import { describe, expect, it, vi } from 'vitest';
import { sendEventAddedToSlack } from './slack';

describe('event Slack announcements', () => {
  it('uses a public HTTPS cover in the event card', async () => {
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    await sendEventAddedToSlack({
      webhookUrl: 'https://hooks.slack.com/services/test/events',
      eventName: 'Community design night',
      eventDate: '2026-08-10T19:00:00.000Z',
      eventFormat: 'meetup',
      location: 'Accra',
      source: 'public submission',
      publicEventUrl: 'https://devcongress.org/events/community-design-night',
      coverImageUrl: 'https://em.devcongress.org/images/event-fallback.png',
      fetcher,
    });

    const payload = JSON.parse(String(requests[0]?.body)) as {
      blocks: Array<{ type: string; image_url?: string }>;
    };
    expect(payload.blocks.find((block) => block.type === 'image')?.image_url)
      .toBe('https://em.devcongress.org/images/event-fallback.png');
  });

  it('omits a malformed or non-public cover instead of sending an invalid image block', async () => {
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    await sendEventAddedToSlack({
      webhookUrl: 'https://hooks.slack.com/services/test/events',
      eventName: 'Community design night',
      eventDate: '2026-08-10T19:00:00.000Z',
      eventFormat: 'meetup',
      location: 'Accra',
      source: 'public submission',
      publicEventUrl: 'https://devcongress.org/events/community-design-night',
      coverImageUrl: '/images/event-fallback.png',
      fetcher,
    });

    const payload = JSON.parse(String(requests[0]?.body)) as {
      blocks: Array<{ type: string }>;
    };
    expect(payload.blocks.some((block) => block.type === 'image')).toBe(false);
  });
});
