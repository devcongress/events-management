import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const schedulerSecret = 'scheduled-worker-budget-test-secret-at-least-32-bytes';
const eventCount = 21;

function communityEvent(index: number) {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

  return {
    id,
    slug: `event-${index}`,
    name: `Event ${index}`,
    description: null,
    series_type: 'monthly',
    starts_at: '2026-09-01T18:00:00.000Z',
    ends_at: '2026-09-01T20:00:00.000Z',
    status: 'upcoming',
    cover_url: '/images/default-event-cover.svg',
    location_label: 'Accra, Ghana',
    location_name: 'Accra, Ghana',
    location_url: null,
    stream_url: null,
    embed_stream: false,
    registration_url: null,
    schedule: [],
    photos: [],
    videos: [],
    publish_to_website: true,
    event_ownership: 'devcongress',
    event_format: 'meetup',
    submission_source: 'internal',
    moderation_status: 'approved',
    publication_status: 'published',
    timezone: 'Africa/Accra',
    location_type: 'in_person',
    venue_address: null,
    online_url: null,
    organizer_name: null,
    organizer_url: null,
    source_submission_id: null,
    external_source: null,
    external_id: null,
    external_url: null,
    external_synced_at: null,
    deleted_at: null,
    deleted_by_email: null,
    delete_reason: null,
    restore_until: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}

describe('scheduled worker outbound-request budget', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    // This HTTP-only suite provides the construction API and forbids connections.
    vi.stubGlobal('WebSocket', class UnexpectedWebSocket {
      constructor() {
        throw new Error('Unexpected WebSocket connection in HTTP budget test');
      }
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('runs the selected-speaker retry in its own bounded invocation', async () => {
    const outboundRequests: URL[] = [];
    const events = Array.from({ length: eventCount }, (_, index) => communityEvent(index + 1));

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));

      outboundRequests.push(url);

      if (url.origin === 'https://supabase.test') {
        if (url.pathname.endsWith('/community_events'))
          return Response.json(events);

        return Response.json([]);
      }

      if (url.origin === 'https://api.resend.com') {
        return new Response(JSON.stringify({ data: [] }), {
          headers: {
            'Content-Type': 'application/json',
            'x-resend-daily-quota': '0',
            'x-resend-monthly-quota': '0',
          },
        });
      }

      return Response.json({});
    }));

    const worker = (await import('./worker')).default;
    const context = { waitUntil: vi.fn() } as never;

    await worker.scheduled(
      { scheduledTime: 6 * 60_000 },
      {
        APP_DATA_SOURCE: 'supabase',
        NODE_ENV: 'production',
        VITE_SUPABASE_URL: 'https://supabase.test',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-test',
        SLACK_EVENTS_RETRY_SECRET: schedulerSecret,
        RESEND_API_KEY: 'resend-test-key',
        SPEAKER_EMAIL_REPLY_TO: 'speakers@example.com',
        SPEAKER_INTAKE_LINK_TOKEN_SECRET: 'speaker-intake-link-token-secret-for-test',
      },
      context,
    );

    expect(outboundRequests).toHaveLength(43);
    expect(
      outboundRequests.filter((url) => url.pathname.endsWith('/speaker_intake_links')),
    ).toHaveLength(eventCount);
    expect(
      outboundRequests.filter((url) => url.pathname.endsWith('/speaker_submissions')),
    ).toHaveLength(eventCount);
  });

});
