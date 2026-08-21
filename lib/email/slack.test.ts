import { describe, expect, it, vi } from 'vitest';
import { sendEventAddedToSlack, sendEventPageMonitoringAlertToSlack, sendEventSubmissionAmendmentToSlack, sendEventSubmissionReceivedToSlack } from './slack';

describe('event Slack announcements', () => {
  it('sends a review-only alert when a monitored registration page changes', async () => {
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    await sendEventPageMonitoringAlertToSlack({
      webhookUrl: 'https://hooks.slack.com/services/test/events',
      eventTitle: 'Systems Night',
      status: 'changed',
      detail: 'Start time and venue changed',
      sourceUrl: 'https://events.example/systems-night',
      dashboardUrl: 'https://em.devcongress.org/organizer-console/events/event-1',
      fetcher,
    });

    const payload = JSON.parse(String(requests[0]?.body)) as { text: string; blocks: Array<{ elements?: unknown[] }> };
    expect(payload.text).toContain('Registration page details changed');
    expect(payload.blocks.at(-1)?.elements).toHaveLength(2);
  });
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
      coverImageUrl: 'https://em.devcongress.org/images/event-announcement-fallback.png',
      fetcher,
    });

    const payload = JSON.parse(String(requests[0]?.body)) as {
      blocks: Array<{ type: string; image_url?: string }>;
    };
    expect(payload.blocks.find((block) => block.type === 'image')?.image_url)
      .toBe('https://em.devcongress.org/images/event-announcement-fallback.png');
  });

  it('uses a normal event link instead of an interactive Slack button', async () => {
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
      source: 'organizer',
      publicEventUrl: 'https://devcongress.org/events/community-design-night',
      fetcher,
    });

    const payload = JSON.parse(String(requests[0]?.body)) as {
      blocks: Array<{ type: string; text?: { text?: string } }>;
    };
    expect(payload.blocks.some((block) => block.type === 'actions')).toBe(false);
    expect(payload.blocks.find((block) => block.text?.text?.includes('Open event'))?.text?.text)
      .toBe('<https://devcongress.org/events/community-design-night|Open event →>');
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
      coverImageUrl: '/images/event-announcement-fallback.png',
      fetcher,
    });

    const payload = JSON.parse(String(requests[0]?.body)) as {
      blocks: Array<{ type: string }>;
    };
    expect(payload.blocks.some((block) => block.type === 'image')).toBe(false);
  });
});

describe('event submission Slack review cards', () => {
  it('uses a clear review hierarchy with the cover, readable details, and one primary action', async () => {
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    await sendEventSubmissionReceivedToSlack({
      webhookUrl: 'https://hooks.slack.com/services/test/submissions',
      eventTitle: 'Community design night',
      summary: 'A practical evening for designers and builders.',
      organizerName: 'Amina Mensah',
      organizerEmail: 'amina@example.com',
      startsAt: '2026-08-10T19:00:00.000Z',
      format: 'meetup',
      location: 'Accra',
      dashboardUrl: 'https://em.devcongress.org/organizer-console/events/submissions?submission=test',
      coverImageUrl: 'https://em.devcongress.org/images/event-announcement-fallback.png',
      fetcher,
    });

    const payload = JSON.parse(String(requests[0]?.body)) as {
      blocks: Array<{
        type: string;
        image_url?: string;
        text?: { text?: string };
        elements?: Array<{ style?: string; url?: string; text?: { text?: string } | string }>;
      }>;
    };
    expect(payload.blocks[0]).toMatchObject({
      type: 'header',
      text: { text: 'New community event submission' },
    });
    expect(payload.blocks.find((block) => block.type === 'image')?.image_url)
      .toBe('https://em.devcongress.org/images/event-announcement-fallback.png');
    expect(String(payload.blocks.find((block) => block.type === 'context')?.elements?.[0]?.text))
      .toContain('Amina Mensah');
    const action = payload.blocks.find((block) => block.type === 'actions')?.elements?.[0];
    expect(action).toMatchObject({ style: 'primary', url: 'https://em.devcongress.org/organizer-console/events/submissions?submission=test' });
    expect(action?.text && typeof action.text === 'object' ? action.text.text : action?.text).toBe('Review submission →');
  });

  it('sends submitted amendments to the existing private review channel', async () => {
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;

    await sendEventSubmissionAmendmentToSlack({
      webhookUrl: 'https://hooks.slack.com/services/test/submissions',
      eventTitle: 'Community design night',
      organizerName: 'Amina Mensah',
      organizerEmail: 'amina@example.com',
      startsAt: '2026-08-10T19:00:00.000Z',
      location: 'Impact Hub Accra',
      dashboardUrl: 'https://em.devcongress.org/organizer-console/events/submissions?submission=test',
      fetcher,
    });

    const payload = JSON.parse(String(requests[0]?.body)) as {
      text: string;
      blocks: Array<{
        type: string;
        text?: { text?: string };
        elements?: Array<{ style?: string; url?: string; text?: { text?: string } | string }>;
      }>;
    };
    expect(payload.text).toBe('Community event update requested: Community design night');
    expect(payload.blocks[0]).toMatchObject({
      type: 'header',
      text: { text: 'Community event update requested' },
    });
    const action = payload.blocks.find((block) => block.type === 'actions')?.elements?.[0];
    expect(action).toMatchObject({
      style: 'primary',
      url: 'https://em.devcongress.org/organizer-console/events/submissions?submission=test',
    });
    expect(action?.text && typeof action.text === 'object' ? action.text.text : action?.text).toBe('Review update →');
  });
});
