import type { Context } from 'hono';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from './server';

export type EventSlackAnnouncementStatus = 'pending' | 'sent' | 'failed';

export type EventSlackAnnouncement = {
  event_id: string;
  source: 'organizer' | 'public submission';
  status: EventSlackAnnouncementStatus;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error: string | null;
};

export type ClaimedEventSlackAnnouncement = EventSlackAnnouncement & {
  should_send: boolean;
  attempt_token: string | null;
};

const localAnnouncements = new Map<string, EventSlackAnnouncement & { lease_token: string | null; lease_expires_at: number | null }>();

function nowIso() {
  return new Date().toISOString();
}

function localClaim(eventId: string, source: EventSlackAnnouncement['source'], allowRetry: boolean): ClaimedEventSlackAnnouncement {
  const existing = localAnnouncements.get(eventId);
  const current = existing ?? {
    event_id: eventId,
    source,
    status: 'pending' as const,
    attempt_count: 0,
    last_attempt_at: null,
    sent_at: null,
    last_error: null,
    lease_token: null,
    lease_expires_at: null,
  };
  const leaseActive = current.status === 'pending' && Boolean(current.lease_expires_at && current.lease_expires_at > Date.now());
  if (current.status === 'sent' || leaseActive || (current.status === 'failed' && !allowRetry)) {
    localAnnouncements.set(eventId, current);
    return { ...current, should_send: false, attempt_token: null };
  }

  const attemptToken = crypto.randomUUID();
  const claimed = {
    ...current,
    source,
    status: 'pending' as const,
    attempt_count: current.attempt_count + 1,
    last_attempt_at: nowIso(),
    last_error: null,
    lease_token: attemptToken,
    lease_expires_at: Date.now() + 120_000,
  };
  localAnnouncements.set(eventId, claimed);
  return { ...claimed, should_send: true, attempt_token: attemptToken };
}

export async function getEventSlackAnnouncement(eventId: string, c?: Context): Promise<EventSlackAnnouncement | null> {
  if (!isSupabaseRuntimeEnabled(c)) {
    const local = localAnnouncements.get(eventId);
    return local ? { ...local } : null;
  }

  const client = getSupabaseAdminClient(c) as any;
  const { data, error } = await client.from('event_slack_announcements').select('*').eq('event_id', eventId).maybeSingle();
  if (error) throw new Error('Unable to load the Slack announcement status.');
  return data as EventSlackAnnouncement | null;
}

export async function claimEventSlackAnnouncement(
  eventId: string,
  source: EventSlackAnnouncement['source'],
  allowRetry: boolean,
  c?: Context,
): Promise<ClaimedEventSlackAnnouncement> {
  if (!isSupabaseRuntimeEnabled(c)) return localClaim(eventId, source, allowRetry);

  const client = getSupabaseAdminClient(c) as any;
  const { data, error } = await client.rpc('claim_event_slack_announcement', {
    p_event_id: eventId,
    p_source: source,
    p_allow_retry: allowRetry,
  }).single();
  if (error || !data) throw new Error('Unable to reserve the Slack announcement.');
  return data as ClaimedEventSlackAnnouncement;
}

export async function completeEventSlackAnnouncement(
  eventId: string,
  attemptToken: string,
  sent: boolean,
  errorMessage: string | null,
  c?: Context,
): Promise<EventSlackAnnouncement> {
  if (!isSupabaseRuntimeEnabled(c)) {
    const current = localAnnouncements.get(eventId);
    if (!current || current.lease_token !== attemptToken) throw new Error('Slack announcement claim is no longer active.');
    const completed = {
      ...current,
      status: sent ? 'sent' as const : 'failed' as const,
      sent_at: sent ? nowIso() : null,
      last_error: sent ? null : errorMessage,
      lease_token: null,
      lease_expires_at: null,
    };
    localAnnouncements.set(eventId, completed);
    return completed;
  }

  const client = getSupabaseAdminClient(c) as any;
  const { data, error } = await client.rpc('complete_event_slack_announcement', {
    p_event_id: eventId,
    p_attempt_token: attemptToken,
    p_sent: sent,
    p_error: errorMessage,
  }).single();
  if (error || !data) throw new Error('Unable to finalize the Slack announcement.');
  return data as EventSlackAnnouncement;
}
