import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@/types/supabase';

const mocks = vi.hoisted(() => ({
  getSupabaseAdminClient: vi.fn(),
  isSupabaseServerConfigured: vi.fn(),
}));

vi.mock('./server', () => mocks);

import { getApprovedEventIdForSubmission, getEventSubmissionManagement, getEventSubmissionOrganizerContact } from './event-submissions';

type CommunityEventRow = Database['public']['Tables']['community_events']['Row'];
type EventSubmissionRow = Database['public']['Tables']['event_submissions']['Row'];
type EventSubmissionManagementLinkRow = Database['public']['Tables']['event_submission_management_links']['Row'];

const linkRow: EventSubmissionManagementLinkRow = {
  id: '30000000-0000-4000-8000-000000000001',
  submission_id: '10000000-0000-4000-8000-000000000001',
  expires_at: '2099-09-20T13:00:00.000Z',
  revoked_at: null,
  created_at: '2099-08-01T10:00:00.000Z',
  updated_at: '2099-08-01T10:00:00.000Z',
};

const submissionRow: EventSubmissionRow = {
  id: linkRow.submission_id,
  title: 'Community systems workshop',
  summary: 'A practical workshop for engineers building reliable distributed systems.',
  event_format: 'workshop',
  starts_at: '2099-09-20T09:00:00.000Z',
  ends_at: '2099-09-20T13:00:00.000Z',
  timezone: 'Africa/Accra',
  location_type: 'in_person',
  location_name: 'Fido, Accra',
  venue_name: 'Fido, Accra',
  venue_address: 'Osu, Accra',
  online_url: null,
  registration_url: 'https://example.com/register',
  organizer_name: 'Community Builders Ghana',
  organizer_email: 'hello@example.com',
  organizer_website: 'https://example.com',
  submitter_notes: null,
  cover_url: null,
  source_app: 'website',
  review_status: 'approved',
  reviewed_by: 'owner@devcongress.org',
  reviewed_at: '2099-08-01T11:00:00.000Z',
  rejection_category: null,
  organizer_message: null,
  internal_note: null,
  approved_event_id: '20000000-0000-4000-8000-000000000001',
  created_at: '2099-08-01T10:00:00.000Z',
  updated_at: '2099-08-01T11:00:00.000Z',
};

const approvedEventRow: Pick<CommunityEventRow,
  'starts_at'
  | 'ends_at'
  | 'location_type'
  | 'location_name'
  | 'location_label'
  | 'venue_address'
  | 'online_url'
  | 'stream_url'
  | 'registration_url'
  | 'cover_url'
> = {
  starts_at: '2099-09-20T10:00:00.000Z',
  ends_at: '2099-09-20T14:00:00.000Z',
  location_type: 'in_person',
  location_name: 'Accra Digital Center',
  location_label: 'Ring Road West, Accra',
  venue_address: 'Ring Road West, Accra',
  online_url: null,
  stream_url: null,
  registration_url: 'https://example.com/new-register',
  cover_url: 'https://example.com/live-cover.png',
};

function queryReturning<T>(data: T) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isSupabaseServerConfigured.mockReturnValue(true);
});

describe('event submission management storage', () => {
  it('resolves the canonical event only from an approved submission', async () => {
    const submissionQuery = queryReturning({ approved_event_id: submissionRow.approved_event_id });
    mocks.getSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => submissionQuery) });

    await expect(getApprovedEventIdForSubmission(submissionRow.id)).resolves.toBe(submissionRow.approved_event_id);
    expect(submissionQuery.eq).toHaveBeenNthCalledWith(1, 'id', submissionRow.id);
    expect(submissionQuery.eq).toHaveBeenNthCalledWith(2, 'review_status', 'approved');
  });

  it('returns the approved submission contact only for its linked event', async () => {
    const contactQuery = queryReturning({
      organizer_name: submissionRow.organizer_name,
      organizer_email: submissionRow.organizer_email,
    });
    mocks.getSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => contactQuery) });

    await expect(getEventSubmissionOrganizerContact(submissionRow.id, submissionRow.approved_event_id!)).resolves.toEqual({
      name: 'Community Builders Ghana',
      email: 'hello@example.com',
    });
    expect(contactQuery.eq).toHaveBeenNthCalledWith(1, 'id', submissionRow.id);
    expect(contactQuery.eq).toHaveBeenNthCalledWith(2, 'approved_event_id', submissionRow.approved_event_id);
    expect(contactQuery.eq).toHaveBeenNthCalledWith(3, 'review_status', 'approved');
  });

  it('returns the current approved event values instead of the original submitted venue', async () => {
    const linkQuery = queryReturning(linkRow);
    const submissionQuery = queryReturning(submissionRow);
    const eventQuery = queryReturning(approvedEventRow);
    const amendmentQuery = queryReturning(null);
    const from = vi.fn()
      .mockReturnValueOnce(linkQuery)
      .mockReturnValueOnce(submissionQuery)
      .mockReturnValueOnce(eventQuery)
      .mockReturnValueOnce(amendmentQuery);
    mocks.getSupabaseAdminClient.mockReturnValue({ from });

    await expect(getEventSubmissionManagement(linkRow.id)).resolves.toMatchObject({
      submission: {
        venue_name: 'Fido, Accra',
      },
      current_event: {
        starts_at: '2099-09-20T10:00:00.000Z',
        ends_at: '2099-09-20T14:00:00.000Z',
        venue_name: 'Accra Digital Center',
        venue_address: 'Ring Road West, Accra',
        registration_url: 'https://example.com/new-register',
        cover_url: 'https://example.com/live-cover.png',
      },
      amendment: null,
    });
    expect(from).toHaveBeenNthCalledWith(3, 'community_events');
    expect(eventQuery.select).toHaveBeenCalledWith('starts_at, ends_at, location_type, location_name, location_label, venue_address, online_url, stream_url, registration_url, cover_url');
  });
});
