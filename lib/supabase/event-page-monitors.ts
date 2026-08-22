import type { Context } from 'hono';
import type { Event } from '@/types';
import {
  baselineForEvent,
  nextEventPageCheckAt,
  type EventPageMonitorDifference,
  type EventPageMonitorSnapshot,
} from '@/lib/event-page-monitor';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from './server';

export type EventPageMonitorStatus = 'pending' | 'unchanged' | 'changed' | 'warning' | 'unavailable' | 'unmonitorable';

export type EventPageMonitor = {
  event_id: string;
  enabled: boolean;
  source_url: string;
  status: EventPageMonitorStatus;
  baseline: EventPageMonitorSnapshot;
  last_observed: EventPageMonitorSnapshot | null;
  differences: EventPageMonitorDifference[];
  consecutive_failures: number;
  last_http_status: number | null;
  last_error: string | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  last_change_fingerprint: string | null;
  last_alerted_fingerprint: string | null;
  created_at: string;
  updated_at: string;
};

const localMonitors = new Map<string, EventPageMonitor>();

function eligible(event: Event): boolean {
  const external = event.ownership === 'external' || event.submission_source === 'public_submission' || Boolean(event.source_submission_id);
  const published = event.publish_to_website !== false && event.publication_status !== 'draft' && !event.deleted_at;
  return external && published && Boolean(baselineForEvent(event));
}

function sameSnapshot(left: EventPageMonitorSnapshot, right: EventPageMonitorSnapshot): boolean {
  const fields: Array<keyof EventPageMonitorSnapshot> = ['source_url', 'final_url', 'name', 'starts_at', 'ends_at', 'location', 'event_status', 'registration_url'];
  return fields.every((field) => left[field] === right[field]);
}

async function configureEventPageMonitor(event: Event, forceReset: boolean, c?: Context): Promise<EventPageMonitor | null> {
  if (!eligible(event)) return null;
  const baseline = baselineForEvent(event)!;
  const checkedAt = new Date();
  const now = checkedAt.toISOString();
  const nextCheckAt = nextEventPageCheckAt(event.event_date, event.end_date, checkedAt);
  if (!nextCheckAt) return null;

  if (!isSupabaseRuntimeEnabled(c)) {
    const existing = localMonitors.get(event.id);
    if (!forceReset && existing && existing.source_url === baseline.source_url && sameSnapshot(existing.baseline, baseline)) return { ...existing };
    const monitor: EventPageMonitor = {
      event_id: event.id,
      enabled: true,
      source_url: baseline.source_url,
      status: 'pending',
      baseline,
      last_observed: null,
      differences: [],
      consecutive_failures: 0,
      last_http_status: null,
      last_error: null,
      last_checked_at: existing?.last_checked_at ?? null,
      next_check_at: nextCheckAt,
      last_change_fingerprint: null,
      last_alerted_fingerprint: null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    localMonitors.set(event.id, monitor);
    return { ...monitor };
  }

  const client = getSupabaseAdminClient(c) as any;
  const { data: existing, error: readError } = await client.from('event_page_monitors').select('*').eq('event_id', event.id).maybeSingle();
  if (readError) throw new Error('Unable to load event page monitoring.');
  if (!forceReset && existing && existing.source_url === baseline.source_url && sameSnapshot(existing.baseline, baseline)) return existing as EventPageMonitor;

  const row = {
    event_id: event.id,
    enabled: true,
    source_url: baseline.source_url,
    status: 'pending',
    baseline,
    last_observed: null,
    differences: [],
    consecutive_failures: 0,
    last_http_status: null,
    last_error: null,
    last_checked_at: existing?.last_checked_at ?? null,
    next_check_at: nextCheckAt,
    last_change_fingerprint: null,
    last_alerted_fingerprint: null,
    updated_at: now,
  };
  const { data, error } = await client.from('event_page_monitors').upsert(row, { onConflict: 'event_id' }).select('*').single();
  if (error || !data) throw new Error('Unable to configure event page monitoring.');
  return data as EventPageMonitor;
}

export function ensureEventPageMonitor(event: Event, c?: Context): Promise<EventPageMonitor | null> {
  return configureEventPageMonitor(event, false, c);
}

export function rebaselineEventPageMonitor(event: Event, c?: Context): Promise<EventPageMonitor | null> {
  return configureEventPageMonitor(event, true, c);
}

export async function getEventPageMonitor(eventId: string, c?: Context): Promise<EventPageMonitor | null> {
  if (!isSupabaseRuntimeEnabled(c)) return localMonitors.get(eventId) ?? null;
  const client = getSupabaseAdminClient(c) as any;
  const { data, error } = await client.from('event_page_monitors').select('*').eq('event_id', eventId).maybeSingle();
  if (error) throw new Error('Unable to load event page monitoring.');
  return data as EventPageMonitor | null;
}

export async function listDueEventPageMonitors(limit: number, c?: Context): Promise<EventPageMonitor[]> {
  const now = new Date().toISOString();
  if (!isSupabaseRuntimeEnabled(c)) {
    return [...localMonitors.values()]
      .filter((monitor) => monitor.enabled && monitor.next_check_at && monitor.next_check_at <= now)
      .sort((a, b) => (a.next_check_at ?? '').localeCompare(b.next_check_at ?? ''))
      .slice(0, limit);
  }
  const client = getSupabaseAdminClient(c) as any;
  const { data, error } = await client.from('event_page_monitors')
    .select('*')
    .eq('enabled', true)
    .not('next_check_at', 'is', null)
    .lte('next_check_at', now)
    .order('next_check_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error('Unable to load due event page checks.');
  return (data ?? []) as EventPageMonitor[];
}

export async function saveEventPageMonitor(
  eventId: string,
  update: Partial<Omit<EventPageMonitor, 'event_id' | 'created_at'>>,
  c?: Context,
): Promise<EventPageMonitor> {
  const now = new Date().toISOString();
  if (!isSupabaseRuntimeEnabled(c)) {
    const existing = localMonitors.get(eventId);
    if (!existing) throw new Error('Event page monitoring is not configured.');
    const saved = { ...existing, ...update, updated_at: now };
    localMonitors.set(eventId, saved);
    return { ...saved };
  }
  const client = getSupabaseAdminClient(c) as any;
  const { data, error } = await client.from('event_page_monitors')
    .update({ ...update, updated_at: now })
    .eq('event_id', eventId)
    .select('*')
    .single();
  if (error || !data) throw new Error('Unable to save event page monitoring.');
  return data as EventPageMonitor;
}
