import type { Context } from 'hono';
import type {
  EventFormat,
  EventLocationType,
  EventSubmission,
  EventSubmissionReviewStatus,
} from '@/types';
import type { Database } from '@/types/supabase';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from './server';

type EventSubmissionRow = Database['public']['Tables']['event_submissions']['Row'];
type EventSubmissionInsert = Database['public']['Tables']['event_submissions']['Insert'];

export type CreateEventSubmissionInput = {
  title: string;
  summary: string;
  format: EventFormat;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location_type: EventLocationType;
  venue_name?: string | null;
  venue_address?: string | null;
  online_url?: string | null;
  registration_url?: string | null;
  organizer_name: string;
  organizer_email: string;
  organizer_website?: string | null;
  notes?: string | null;
};

export class EventSubmissionStorageError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'not_found' | 'already_approved' | 'already_rejected' | 'unavailable',
  ) {
    super(message);
    this.name = 'EventSubmissionStorageError';
  }
}

function requireStorage(c?: Context) {
  if (!isSupabaseServerConfigured(c)) {
    throw new EventSubmissionStorageError('Event submission storage is unavailable.', 'not_configured');
  }
  return getSupabaseAdminClient(c);
}

export async function createEventSubmission(
  input: CreateEventSubmissionInput,
  c?: Context,
): Promise<EventSubmission> {
  const insert: EventSubmissionInsert = {
    title: input.title,
    summary: input.summary,
    event_format: input.format,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    timezone: input.timezone,
    location_type: input.location_type,
    location_name: input.venue_name ?? null,
    venue_name: input.venue_name ?? null,
    venue_address: input.venue_address ?? null,
    online_url: input.online_url ?? null,
    registration_url: input.registration_url ?? null,
    organizer_name: input.organizer_name,
    organizer_email: input.organizer_email,
    organizer_website: input.organizer_website ?? null,
    submitter_notes: input.notes ?? null,
    source_app: 'website',
  };

  const { data, error } = await requireStorage(c)
    .from('event_submissions')
    .insert(insert)
    .select('*')
    .single();

  if (error || !data) throw new EventSubmissionStorageError('Unable to save event submission.', 'unavailable');
  return toEventSubmission(data);
}

export async function listEventSubmissions(
  status?: EventSubmissionReviewStatus,
  c?: Context,
): Promise<EventSubmission[]> {
  let query = requireStorage(c)
    .from('event_submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('review_status', status);
  const { data, error } = await query;
  if (error) throw new EventSubmissionStorageError('Unable to load event submissions.', 'unavailable');
  return (data ?? []).map(toEventSubmission);
}

export async function approveEventSubmission(
  id: string,
  reviewerEmail: string,
  publish: boolean,
  c?: Context,
): Promise<EventSubmission> {
  const { data, error } = await requireStorage(c).rpc('approve_event_submission', {
    p_submission_id: id,
    p_reviewed_by: reviewerEmail,
    p_publish: publish,
  });

  if (error) throw reviewError(error.message);
  if (!data) throw new EventSubmissionStorageError('Event submission not found.', 'not_found');
  return toEventSubmission(data);
}

export async function rejectEventSubmission(
  id: string,
  reviewerEmail: string,
  reason: string,
  c?: Context,
): Promise<EventSubmission> {
  const { data, error } = await requireStorage(c).rpc('reject_event_submission', {
    p_submission_id: id,
    p_reviewed_by: reviewerEmail,
    p_reason: reason,
  });

  if (error) throw reviewError(error.message);
  if (!data) throw new EventSubmissionStorageError('Event submission not found.', 'not_found');
  return toEventSubmission(data);
}

function reviewError(message: string): EventSubmissionStorageError {
  if (message.includes('event_submission_not_found')) {
    return new EventSubmissionStorageError('Event submission not found.', 'not_found');
  }
  if (message.includes('event_submission_already_approved')) {
    return new EventSubmissionStorageError('This event submission was already approved.', 'already_approved');
  }
  if (message.includes('event_submission_already_rejected')) {
    return new EventSubmissionStorageError('This event submission was already rejected.', 'already_rejected');
  }
  return new EventSubmissionStorageError('Unable to review event submission.', 'unavailable');
}

function toEventSubmission(row: EventSubmissionRow): EventSubmission {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    format: row.event_format,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: row.timezone,
    location_type: row.location_type,
    venue_name: row.venue_name ?? row.location_name,
    venue_address: row.venue_address,
    online_url: row.online_url,
    registration_url: row.registration_url,
    organizer_name: row.organizer_name,
    organizer_email: row.organizer_email,
    organizer_website: row.organizer_website,
    notes: row.submitter_notes,
    source_app: 'website',
    review_status: row.review_status,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    rejection_reason: row.rejection_reason,
    approved_event_id: row.approved_event_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
