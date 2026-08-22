import type { Context } from 'hono';
import type {
  EventFormat,
  EventLocationType,
  EventSubmission,
  EventSubmissionEmailDelivery,
  EventSubmissionEmailDeliveryStatus,
  EventSubmissionEmailKind,
  EventSubmissionAmendment,
  EventSubmissionAmendmentStatus,
  EventSubmissionReply,
  EventSubmissionReplyAttachment,
  EventSubmissionReplySlackStatus,
  EventSubmissionRejectionCategory,
  EventSubmissionQueueFilter,
} from '@/types';
import type { Database } from '@/types/supabase';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from './server';

type EventSubmissionRow = Database['public']['Tables']['event_submissions']['Row'];
type EventSubmissionInsert = Database['public']['Tables']['event_submissions']['Insert'];
type EventSubmissionEmailDeliveryRow = Database['public']['Tables']['event_submission_email_deliveries']['Row'];
type EventSubmissionReplyRow = Database['public']['Tables']['event_submission_replies']['Row'];
type EventSubmissionAmendmentRow = Database['public']['Tables']['event_submission_amendments']['Row'];
type CommunityEventRow = Database['public']['Tables']['community_events']['Row'];

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
  amendment_id: string | null;
  amendment_starts_at: string | null;
  amendment_timezone: string | null;
  management_link_id: string | null;
};

export type EventSubmissionManagement = {
  link_id: string;
  expires_at: string;
  submission: EventSubmission;
  current_event: EventSubmissionManagedEvent;
  amendment: EventSubmissionAmendment | null;
};

export type EventSubmissionManagedEvent = {
  starts_at: string;
  ends_at: string;
  location_type: EventLocationType;
  venue_name: string | null;
  venue_address: string | null;
  online_url: string | null;
  registration_url: string | null;
  cover_url: string | null;
};

export type ActiveEventSubmissionManagementLink = {
  id: string;
  expires_at: string;
};

export type EventSubmissionOrganizerContact = {
  name: string;
  email: string;
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
  cover_url?: string | null;
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

export async function getEventSubmissionOrganizerContact(
  submissionId: string,
  eventId: string,
  c?: Context,
): Promise<EventSubmissionOrganizerContact | null> {
  if (!isSupabaseServerConfigured(c)) return null;
  const { data, error } = await getSupabaseAdminClient(c)
    .from('event_submissions')
    .select('organizer_name, organizer_email')
    .eq('id', submissionId)
    .eq('approved_event_id', eventId)
    .eq('review_status', 'approved')
    .maybeSingle();
  if (error) throw new EventSubmissionStorageError('Unable to load the event organizer.', 'unavailable');
  return data ? { name: data.organizer_name, email: data.organizer_email } : null;
}

export async function getApprovedEventIdForSubmission(submissionId: string, c?: Context): Promise<string | null> {
  const { data, error } = await requireStorage(c)
    .from('event_submissions')
    .select('approved_event_id')
    .eq('id', submissionId)
    .eq('review_status', 'approved')
    .maybeSingle();
  if (error) throw new EventSubmissionStorageError('Unable to resolve the approved event.', 'unavailable');
  return data?.approved_event_id ?? null;
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
    cover_url: input.cover_url ?? null,
    source_app: 'website',
  };

  const { data, error } = await requireStorage(c)
    .from('event_submissions')
    .insert(insert)
    .select('*')
    .single();

  if (error || !data) throw new EventSubmissionStorageError('Unable to save event submission.', 'unavailable');
  return toEventSubmission(data, [], []);
}

export async function listEventSubmissions(
  status?: EventSubmissionQueueFilter,
  c?: Context,
): Promise<EventSubmission[]> {
  let query = requireStorage(c)
    .from('event_submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (status === 'updates') query = query.eq('review_status', 'approved');
  else if (status) query = query.eq('review_status', status);
  const { data, error } = await query;
  if (error) throw new EventSubmissionStorageError('Unable to load event submissions.', 'unavailable');
  const deliveries = await loadEmailDeliveries((data ?? []).map((submission) => submission.id), c);
  const replies = await loadEventSubmissionReplies((data ?? []).map((submission) => submission.id), c);
  const amendments = await loadEventSubmissionAmendments((data ?? []).map((submission) => submission.id), c);
  const submissions = (data ?? []).map((submission) => toEventSubmission(
    submission,
    deliveries.get(submission.id) ?? [],
    replies.get(submission.id) ?? [],
    amendments.get(submission.id) ?? [],
  ));
  return status === 'updates'
    ? submissions.filter((submission) => submission.amendments?.some((amendment) => amendment.status === 'submitted'))
    : submissions;
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
  return toEventSubmission(data, [], []);
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
  return toEventSubmission(data, [], []);
}

export async function getEventSubmissionManagement(linkId: string, c?: Context): Promise<EventSubmissionManagement> {
  const client = requireStorage(c);
  const { data: link, error: linkError } = await client.from('event_submission_management_links')
    .select('*').eq('id', linkId).maybeSingle();
  if (linkError) throw new EventSubmissionStorageError('Unable to load the event link.', 'unavailable');
  if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    throw new EventSubmissionStorageError('This event link is no longer available.', 'not_found');
  }
  const { data: submission, error } = await client.from('event_submissions').select('*').eq('id', link.submission_id).maybeSingle();
  if (error) throw new EventSubmissionStorageError('Unable to load the event link.', 'unavailable');
  if (!submission || submission.review_status !== 'approved') throw new EventSubmissionStorageError('This event link is no longer available.', 'not_found');
  const approvedEventId = submission.approved_event_id;
  if (!approvedEventId) throw new EventSubmissionStorageError('This event link is no longer available.', 'not_found');
  const { data: event, error: eventError } = await client.from('community_events')
    .select('starts_at, ends_at, location_type, location_name, location_label, venue_address, online_url, stream_url, registration_url, cover_url')
    .eq('id', approvedEventId)
    .maybeSingle();
  if (eventError) throw new EventSubmissionStorageError('Unable to load the event link.', 'unavailable');
  if (!event || new Date(event.ends_at).getTime() <= Date.now()) {
    throw new EventSubmissionStorageError('This event has ended and can no longer be updated.', 'not_found');
  }
  const { data: amendment, error: amendmentError } = await client.from('event_submission_amendments')
    .select('*').eq('submission_id', submission.id).in('status', ['draft', 'submitted']).maybeSingle();
  if (amendmentError) throw new EventSubmissionStorageError('Unable to load the event change request.', 'unavailable');
  return {
    link_id: link.id,
    expires_at: link.expires_at,
    submission: toEventSubmission(submission, [], []),
    current_event: toEventSubmissionManagedEvent(event),
    amendment: amendment ? toEventSubmissionAmendment(amendment) : null,
  };
}

/**
 * Resolves an existing bearer link for an authenticated organizer without
 * creating a new link or sending another email. The canonical event end time
 * remains the final authority, since an approved amendment may have changed it.
 */
export async function getActiveEventSubmissionManagementLink(
  submissionId: string,
  c?: Context,
): Promise<ActiveEventSubmissionManagementLink> {
  const client = requireStorage(c);
  const { data: link, error: linkError } = await client
    .from('event_submission_management_links')
    .select('id, expires_at, revoked_at')
    .eq('submission_id', submissionId)
    .maybeSingle();
  if (linkError) throw new EventSubmissionStorageError('Unable to load the event link.', 'unavailable');
  if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    throw new EventSubmissionStorageError('This event link is no longer available.', 'not_found');
  }

  const { data: submission, error: submissionError } = await client
    .from('event_submissions')
    .select('review_status, approved_event_id')
    .eq('id', submissionId)
    .maybeSingle();
  if (submissionError) throw new EventSubmissionStorageError('Unable to load the event link.', 'unavailable');
  if (!submission || submission.review_status !== 'approved' || !submission.approved_event_id) {
    throw new EventSubmissionStorageError('This event link is no longer available.', 'not_found');
  }

  const { data: event, error: eventError } = await client
    .from('community_events')
    .select('ends_at')
    .eq('id', submission.approved_event_id)
    .maybeSingle();
  if (eventError) throw new EventSubmissionStorageError('Unable to load the event link.', 'unavailable');
  if (!event || new Date(event.ends_at).getTime() <= Date.now()) {
    throw new EventSubmissionStorageError('This event has ended and can no longer be updated.', 'not_found');
  }

  return { id: link.id, expires_at: link.expires_at };
}

export async function saveEventSubmissionAmendment(
  submissionId: string,
  input: Pick<EventSubmissionAmendment, 'starts_at' | 'ends_at' | 'location_type'> & { venue_name?: string; venue_address?: string; online_url?: string; registration_url?: string; cover_url?: string | null; organizer_note?: string },
  c?: Context,
): Promise<EventSubmissionAmendment> {
  const client = requireStorage(c);
  const { data: current, error: currentError } = await client.from('event_submission_amendments')
    .select('*').eq('submission_id', submissionId).in('status', ['draft', 'submitted']).maybeSingle();
  if (currentError) throw new EventSubmissionStorageError('Unable to save the event change request.', 'unavailable');
  if (current?.status === 'submitted') throw new EventSubmissionStorageError('A change request is already being reviewed.', 'unavailable');
  const values = {
    ...input,
    venue_name: input.venue_name || null,
    venue_address: input.venue_address || null,
    online_url: input.online_url || null,
    registration_url: input.registration_url || null,
    ...('cover_url' in input ? { cover_url: input.cover_url || null } : {}),
    organizer_note: input.organizer_note || null,
  };
  const query = current
    ? client.from('event_submission_amendments').update(values).eq('id', current.id).select('*').single()
    : client.from('event_submission_amendments').insert({ submission_id: submissionId, ...values }).select('*').single();
  const { data, error } = await query;
  if (error || !data) throw new EventSubmissionStorageError('Unable to save the event change request.', 'unavailable');
  return toEventSubmissionAmendment(data);
}

export async function submitEventSubmissionAmendment(submissionId: string, c?: Context): Promise<EventSubmissionAmendment> {
  const { data, error } = await requireStorage(c).from('event_submission_amendments')
    .update({ status: 'submitted' }).eq('submission_id', submissionId).eq('status', 'draft').select('*').maybeSingle();
  if (error) throw new EventSubmissionStorageError('Unable to submit the event change request.', 'unavailable');
  if (!data) throw new EventSubmissionStorageError('Save the changes before submitting them for review.', 'not_found');
  return toEventSubmissionAmendment(data);
}

export async function reviewEventSubmissionAmendment(id: string, reviewerEmail: string, approve: boolean, message: string, c?: Context): Promise<EventSubmissionAmendment> {
  const { data, error } = await requireStorage(c).rpc('review_event_submission_amendment', {
    p_amendment_id: id, p_reviewed_by: reviewerEmail, p_approve: approve, p_message: message,
  });
  if (error?.message.includes('event_submission_management_window_closed')) {
    throw new EventSubmissionStorageError('This event has ended and can no longer be changed.', 'unavailable');
  }
  if (error?.message.includes('event_submission_amendment_ends_in_past')) {
    throw new EventSubmissionStorageError('The proposed event end time has already passed.', 'unavailable');
  }
  if (error || !data) throw new EventSubmissionStorageError('Unable to review the event change request.', 'unavailable');
  return toEventSubmissionAmendment(data);
}

export async function withdrawEventSubmission(id: string, reviewerEmail: string, message: string, c?: Context): Promise<EventSubmission> {
  const { data, error } = await requireStorage(c).rpc('withdraw_event_submission', { p_submission_id: id, p_reviewed_by: reviewerEmail, p_message: message });
  if (error || !data) throw new EventSubmissionStorageError('Unable to remove this event listing.', 'unavailable');
  return toEventSubmission(data, [], []);
}

export type InsertEventSubmissionReplyInput = {
  submission_id: string;
  webhook_event_id: string;
  resend_email_id: string;
  sender_email: string;
  subject: string;
  body_text: string;
  received_at: string;
  attachments: EventSubmissionReplyAttachment[];
};

export async function insertEventSubmissionReply(
  input: InsertEventSubmissionReplyInput,
  c?: Context,
): Promise<{ created: boolean; reply: EventSubmissionReply }> {
  const client = requireStorage(c);
  const insert: Database['public']['Tables']['event_submission_replies']['Insert'] = {
    submission_id: input.submission_id,
    webhook_event_id: input.webhook_event_id,
    resend_email_id: input.resend_email_id,
    sender_email: input.sender_email,
    subject: input.subject,
    body_text: input.body_text,
    received_at: input.received_at,
    attachments: input.attachments.map((attachment) => ({
      filename: attachment.filename,
      content_type: attachment.content_type,
      size: attachment.size,
    })),
  };
  const { data, error } = await client
    .from('event_submission_replies')
    .insert(insert)
    .select('*')
    .single();

  if (!error && data) return { created: true, reply: toEventSubmissionReply(data) };
  if (error?.code !== '23505') {
    throw new EventSubmissionStorageError('Unable to save submission reply.', 'unavailable');
  }

  const existingByWebhook = await client
    .from('event_submission_replies')
    .select('*')
    .eq('webhook_event_id', input.webhook_event_id)
    .maybeSingle();
  if (existingByWebhook.error) throw new EventSubmissionStorageError('Unable to load submission reply.', 'unavailable');
  if (existingByWebhook.data) return { created: false, reply: toEventSubmissionReply(existingByWebhook.data) };

  const existingByEmail = await client
    .from('event_submission_replies')
    .select('*')
    .eq('resend_email_id', input.resend_email_id)
    .maybeSingle();
  if (existingByEmail.error || !existingByEmail.data) {
    throw new EventSubmissionStorageError('Unable to resolve duplicate submission reply.', 'unavailable');
  }
  return { created: false, reply: toEventSubmissionReply(existingByEmail.data) };
}

export async function updateEventSubmissionReplySlackStatus(
  replyId: string,
  input: { status: EventSubmissionReplySlackStatus; error?: string | null },
  c?: Context,
): Promise<void> {
  const { error } = await requireStorage(c)
    .from('event_submission_replies')
    .update({
      slack_status: input.status,
      slack_error: input.error ?? null,
      slack_sent_at: input.status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', replyId);
  if (error) throw new EventSubmissionStorageError('Unable to update submission reply status.', 'unavailable');
}

export async function getEventSubmissionReply(
  submissionId: string,
  replyId: string,
  c?: Context,
): Promise<EventSubmissionReply> {
  const { data, error } = await requireStorage(c)
    .from('event_submission_replies')
    .select('*')
    .eq('id', replyId)
    .eq('submission_id', submissionId)
    .maybeSingle();
  if (error) throw new EventSubmissionStorageError('Unable to load submission reply.', 'unavailable');
  if (!data) throw new EventSubmissionStorageError('Submission reply not found.', 'not_found');
  return toEventSubmissionReply(data);
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
    .in('kind', input.kinds ?? ['approved', 'rejected', 'amendment_approved', 'amendment_rejected', 'withdrawn'])
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
  const { data: links } = await client.from('event_submission_management_links').select('id, submission_id').in('submission_id', Array.from(submissionsById.keys()));
  const linksBySubmission = new Map((links ?? []).map((link) => [link.submission_id, link.id]));
  const amendmentIds = deliveries.map((delivery) => delivery.amendment_id).filter((id): id is string => Boolean(id));
  const { data: amendments } = amendmentIds.length ? await client.from('event_submission_amendments').select('*').in('id', amendmentIds) : { data: [] };
  const amendmentsById = new Map((amendments ?? []).map((amendment) => [amendment.id, amendment]));
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
      amendment_id: delivery.amendment_id,
      amendment_starts_at: delivery.amendment_id ? amendmentsById.get(delivery.amendment_id)?.starts_at ?? null : null,
      amendment_timezone: delivery.amendment_id ? submission.timezone : null,
      management_link_id: linksBySubmission.get(submission.id) ?? null,
    }];
  });
}

function toEventSubmissionAmendment(row: EventSubmissionAmendmentRow): EventSubmissionAmendment {
  return { ...row, status: row.status as EventSubmissionAmendmentStatus, location_type: row.location_type };
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

async function loadEventSubmissionReplies(
  submissionIds: string[],
  c?: Context,
): Promise<Map<string, EventSubmissionReply[]>> {
  const result = new Map<string, EventSubmissionReply[]>();
  if (submissionIds.length === 0) return result;

  const { data, error } = await requireStorage(c)
    .from('event_submission_replies')
    .select('*')
    .in('submission_id', submissionIds)
    .order('received_at', { ascending: true });
  if (error) throw new EventSubmissionStorageError('Unable to load submission replies.', 'unavailable');

  for (const reply of data ?? []) {
    const items = result.get(reply.submission_id) ?? [];
    items.push(toEventSubmissionReply(reply));
    result.set(reply.submission_id, items);
  }
  return result;
}

async function loadEventSubmissionAmendments(submissionIds: string[], c?: Context): Promise<Map<string, EventSubmissionAmendment[]>> {
  const result = new Map<string, EventSubmissionAmendment[]>();
  if (!submissionIds.length) return result;
  const { data, error } = await requireStorage(c).from('event_submission_amendments').select('*')
    .in('submission_id', submissionIds).order('created_at', { ascending: false });
  if (error) throw new EventSubmissionStorageError('Unable to load event change requests.', 'unavailable');
  for (const row of data ?? []) {
    const entries = result.get(row.submission_id) ?? [];
    entries.push(toEventSubmissionAmendment(row));
    result.set(row.submission_id, entries);
  }
  return result;
}

function toEventSubmission(
  row: EventSubmissionRow,
  emailDeliveries: EventSubmissionEmailDelivery[],
  replies: EventSubmissionReply[],
  amendments: EventSubmissionAmendment[] = [],
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
    cover_url: row.cover_url,
    source_app: 'website',
    review_status: row.review_status,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    rejection_category: rejectionCategory(row.rejection_category),
    organizer_message: row.organizer_message,
    internal_note: row.internal_note,
    email_deliveries: emailDeliveries,
    amendments,
    replies,
    approved_event_id: row.approved_event_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toEventSubmissionManagedEvent(row: Pick<CommunityEventRow,
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
>): EventSubmissionManagedEvent {
  const venueName = row.location_type === 'online' ? 'Online' : row.location_name;
  return {
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    location_type: row.location_type,
    venue_name: venueName,
    venue_address: row.venue_address ?? row.location_label,
    online_url: row.online_url ?? row.stream_url,
    registration_url: row.registration_url,
    cover_url: row.cover_url,
  };
}

function toEventSubmissionReply(row: EventSubmissionReplyRow): EventSubmissionReply {
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  return {
    id: row.id,
    sender_email: row.sender_email,
    subject: row.subject,
    body_text: row.body_text,
    received_at: row.received_at,
    attachments: attachments.flatMap((attachment) => {
      if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return [];
      const item = attachment as { filename?: unknown; content_type?: unknown; size?: unknown };
      return [{
        filename: typeof item.filename === 'string' && item.filename.trim() ? item.filename : 'attachment',
        content_type: typeof item.content_type === 'string' ? item.content_type : null,
        size: typeof item.size === 'number' && Number.isInteger(item.size) && item.size >= 0 ? item.size : null,
      }];
    }),
    slack_status: row.slack_status,
    slack_error: row.slack_error,
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
