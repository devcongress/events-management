import type { Context } from 'hono';
import type {
  EventFormat,
  EventLocationType,
  EventSubmission,
  EventSubmissionEmailDelivery,
  EventSubmissionEmailDeliveryStatus,
  EventSubmissionEmailKind,
  EventSubmissionRejectionCategory,
  EventSubmissionReviewStatus,
} from '@/types';
import type { Database } from '@/types/supabase';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from './server';

type EventSubmissionRow = Database['public']['Tables']['event_submissions']['Row'];
type EventSubmissionInsert = Database['public']['Tables']['event_submissions']['Insert'];
type EventSubmissionEmailDeliveryRow = Database['public']['Tables']['event_submission_email_deliveries']['Row'];

export type PendingEventSubmissionEmail = {
  delivery_id: string;
  submission_id: string;
  idempotency_key: string;
  attempts: number;
  kind: EventSubmissionEmailKind;
  organizer_name: string;
  organizer_email: string;
  event_title: string;
  starts_at: string;
  timezone: string;
  registration_url: string | null;
  rejection_category: EventSubmissionRejectionCategory | null;
  organizer_message: string | null;
};

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
  return toEventSubmission(data, []);
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
  const deliveries = await loadEmailDeliveries((data ?? []).map((submission) => submission.id), c);
  return (data ?? []).map((submission) => toEventSubmission(
    submission,
    deliveries.get(submission.id) ?? [],
  ));
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
  return toEventSubmission(data, []);
}

export async function rejectEventSubmission(
  id: string,
  reviewerEmail: string,
  input: {
    category: EventSubmissionRejectionCategory;
    organizer_message?: string;
    internal_note?: string;
  },
  c?: Context,
): Promise<EventSubmission> {
  const { data, error } = await requireStorage(c).rpc('reject_event_submission', {
    p_submission_id: id,
    p_reviewed_by: reviewerEmail,
    p_category: input.category,
    p_organizer_message: input.organizer_message ?? '',
    p_internal_note: input.internal_note ?? '',
  });

  if (error) throw reviewError(error.message);
  if (!data) throw new EventSubmissionStorageError('Event submission not found.', 'not_found');
  return toEventSubmission(data, []);
}

export async function getPendingEventSubmissionEmails(
  input: {
    submissionId?: string;
    kinds?: EventSubmissionEmailKind[];
    statuses?: Array<Extract<EventSubmissionEmailDeliveryStatus, 'pending' | 'failed'>>;
    limit?: number;
  } = {},
  c?: Context,
): Promise<PendingEventSubmissionEmail[]> {
  const client = requireStorage(c);
  let deliveriesQuery = client
    .from('event_submission_email_deliveries')
    .select('*')
    .in('kind', input.kinds ?? ['receipt', 'approved', 'rejected'])
    .in('status', input.statuses ?? ['pending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(input.limit ?? 100);
  if (input.submissionId) deliveriesQuery = deliveriesQuery.eq('submission_id', input.submissionId);

  const { data: deliveries, error: deliveriesError } = await deliveriesQuery;
  if (deliveriesError) throw new EventSubmissionStorageError('Unable to load submission emails.', 'unavailable');
  if (!deliveries?.length) return [];

  const { data: submissions, error: submissionsError } = await client
    .from('event_submissions')
    .select('*')
    .in('id', Array.from(new Set(deliveries.map((delivery) => delivery.submission_id))));
  if (submissionsError) throw new EventSubmissionStorageError('Unable to load submission emails.', 'unavailable');

  const submissionsById = new Map((submissions ?? []).map((submission) => [submission.id, submission]));
  return deliveries.flatMap((delivery) => {
    const submission = submissionsById.get(delivery.submission_id);
    if (!submission) return [];
    return [{
      delivery_id: delivery.id,
      submission_id: submission.id,
      idempotency_key: delivery.idempotency_key,
      attempts: delivery.attempts,
      kind: delivery.kind,
      organizer_name: submission.organizer_name,
      organizer_email: submission.organizer_email,
      event_title: submission.title,
      starts_at: submission.starts_at,
      timezone: submission.timezone,
      registration_url: submission.registration_url ?? submission.online_url,
      rejection_category: rejectionCategory(submission.rejection_category),
      organizer_message: submission.organizer_message,
    }];
  });
}

export async function updateEventSubmissionEmailDelivery(
  deliveryId: string,
  input: {
    status: EventSubmissionEmailDeliveryStatus;
    provider_id?: string | null;
    last_error?: string | null;
  },
  c?: Context,
): Promise<void> {
  const client = requireStorage(c);
  const { data: current, error: currentError } = await client
    .from('event_submission_email_deliveries')
    .select('attempts')
    .eq('id', deliveryId)
    .single();
  if (currentError) throw new EventSubmissionStorageError('Unable to update submission email.', 'unavailable');

  const attemptedAt = new Date().toISOString();
  const { error } = await client
    .from('event_submission_email_deliveries')
    .update({
      status: input.status,
      provider_id: input.provider_id ?? null,
      last_error: input.last_error ?? null,
      attempts: current.attempts + 1,
      last_attempt_at: attemptedAt,
      accepted_at: input.status === 'accepted' ? attemptedAt : null,
    })
    .eq('id', deliveryId);
  if (error) throw new EventSubmissionStorageError('Unable to update submission email.', 'unavailable');
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

async function loadEmailDeliveries(
  submissionIds: string[],
  c?: Context,
): Promise<Map<string, EventSubmissionEmailDelivery[]>> {
  const result = new Map<string, EventSubmissionEmailDelivery[]>();
  if (submissionIds.length === 0) return result;

  const { data, error } = await requireStorage(c)
    .from('event_submission_email_deliveries')
    .select('*')
    .in('submission_id', submissionIds)
    .order('created_at', { ascending: true });
  if (error) throw new EventSubmissionStorageError('Unable to load submission email status.', 'unavailable');

  for (const delivery of data ?? []) {
    const items = result.get(delivery.submission_id) ?? [];
    items.push(toEmailDelivery(delivery));
    result.set(delivery.submission_id, items);
  }
  return result;
}

function toEventSubmission(
  row: EventSubmissionRow,
  emailDeliveries: EventSubmissionEmailDelivery[],
): EventSubmission {
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
    rejection_category: rejectionCategory(row.rejection_category),
    organizer_message: row.organizer_message,
    internal_note: row.internal_note,
    email_deliveries: emailDeliveries,
    approved_event_id: row.approved_event_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toEmailDelivery(row: EventSubmissionEmailDeliveryRow): EventSubmissionEmailDelivery {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    attempts: row.attempts,
    last_error: row.last_error,
    last_attempt_at: row.last_attempt_at,
    accepted_at: row.accepted_at,
  };
}

function rejectionCategory(value: string | null): EventSubmissionRejectionCategory | null {
  if (
    value === 'calendar_fit'
    || value === 'insufficient_information'
    || value === 'duplicate'
    || value === 'event_passed'
    || value === 'other'
  ) {
    return value;
  }
  return null;
}
