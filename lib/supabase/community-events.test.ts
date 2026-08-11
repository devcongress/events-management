import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@/types/supabase';

const mocks = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseRuntimeEnabled: vi.fn(),
}));

vi.mock('./server', () => mocks);

import { getSupabasePublicEvents } from './community-events';

type CommunityEventRow = Database['public']['Tables']['community_events']['Row'];

function communityEventRow(overrides: Partial<CommunityEventRow> = {}): CommunityEventRow {
  return {
    id: 'event-1',
    slug: 'recorded-event',
    name: 'Recorded event',
    description: 'A completed event with a recording.',
    series_type: 'monthly',
    starts_at: '2025-06-20T18:00:00.000Z',
    ends_at: '2025-06-20T20:00:00.000Z',
    status: 'completed',
    cover_url: '/images/recorded-event.jpg',
    location_label: null,
    location_name: 'Online',
    location_url: null,
    stream_url: 'https://www.youtube.com/watch?v=recording',
    embed_stream: false,
    registration_url: 'https://lu.ma/recorded-event',
    schedule: [],
    speakers: [],
    photos: [],
    videos: [],
    publish_to_website: true,
    event_ownership: 'devcongress',
    event_format: 'meetup',
    submission_source: 'internal',
    moderation_status: null,
    publication_status: 'published',
    timezone: 'Africa/Accra',
    location_type: 'online',
    venue_address: null,
    online_url: 'https://meet.google.com/current-session',
    organizer_name: null,
    organizer_url: null,
    source_submission_id: null,
    website_source_id: null,
    external_source: null,
    external_id: null,
    external_url: null,
    external_synced_at: null,
    created_at: '2025-06-01T00:00:00.000Z',
    updated_at: '2025-06-21T00:00:00.000Z',
    ...overrides,
  };
}

function mockPublicEventQuery(rows: CommunityEventRow[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue({ data: rows, error: null });
  mocks.getSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => query) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isSupabaseRuntimeEnabled.mockReturnValue(true);
});

describe('getSupabasePublicEvents', () => {
  it('maps safe event media independently of online and registration links', async () => {
    mockPublicEventQuery([communityEventRow({ stream_url: 'javascript:alert(1)' })]);

    await expect(getSupabasePublicEvents()).resolves.toEqual([
      expect.objectContaining({
        online_url: 'https://meet.google.com/current-session',
        stream_url: null,
        embed_stream: false,
        registration_url: 'https://lu.ma/recorded-event',
      }),
    ]);
  });
});
