import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@/types/supabase';

const mocks = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseRuntimeEnabled: vi.fn(),
}));

vi.mock('./server', () => mocks);

import { getSupabasePublicEvents, getSupabasePublicMeetups } from './community-events';

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
    deleted_at: null,
    deleted_by_email: null,
    delete_reason: null,
    restore_until: null,
    deletion_snapshot: {},
    created_at: '2025-06-01T00:00:00.000Z',
    updated_at: '2025-06-21T00:00:00.000Z',
    ...overrides,
  };
}

function mockPublicEventQuery(rows: CommunityEventRow[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data: rows, error: null });
  mocks.getSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => query) });
  return query;
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

  it('excludes public submissions before applying the collection limit when discovery is disabled', async () => {
    const query = mockPublicEventQuery([communityEventRow()]);

    await getSupabasePublicEvents(undefined, { includePublicSubmissions: false });

    expect(query.neq).toHaveBeenCalledWith('submission_source', 'public_submission');
  });

  it('adds the approved contact action only to DevCongress-owned Project Night events', async () => {
    mockPublicEventQuery([
      communityEventRow({ name: 'DevCongress Project Night' }),
      communityEventRow({
        id: 'external-project-night',
        name: 'Project Night',
        event_ownership: 'external',
        submission_source: 'public_submission',
        moderation_status: 'approved',
      }),
    ]);

    const events = await getSupabasePublicEvents(undefined, { includePublicSubmissions: true });

    expect(events?.[0]?.primary_action).toEqual({
      kind: 'slack_profile',
      label: 'Message @aberkowitz',
      url: 'slack://user?team=T0A0T7A5Q&id=U3LB1TNLS',
    });
    expect(events?.[1]?.primary_action).toBeNull();
  });
});

describe('getSupabasePublicMeetups', () => {
  it('keeps the Project Night contact action on a completed event', async () => {
    mockPublicEventQuery([
      communityEventRow({ name: 'DevCongress Project Night', status: 'completed' }),
    ]);

    const meetups = await getSupabasePublicMeetups('https://events.example');

    expect(meetups?.[0]).toMatchObject({
      status: 'past',
      primary_action: {
        kind: 'slack_profile',
        label: 'Message @aberkowitz',
        url: 'slack://user?team=T0A0T7A5Q&id=U3LB1TNLS',
      },
    });
  });
});
