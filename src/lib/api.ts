import type { Event, LeaderboardEntry, PublicArchiveEventResponse, PublicArchiveResponse, PublicHomeResponse, PublicMeetup, QuizSession, Talk } from '@/types';
import type { FeedbackKind, FeedbackStatus } from '@/types/supabase';
import type { AdminMembershipStatus, AdminRole } from '@/types/supabase';

export interface OverviewRegular {
  key: string;
  name: string;
  registered_count: number;
  checked_in_count: number;
  check_in_rate: number;
  last_seen_at: string | null;
}

export interface OverviewResponse {
  events: Event[];
  talks: Talk[];
  leaderboard: LeaderboardEntry[];
  regulars: OverviewRegular[];
  activeSession: QuizSession | null;
}

export interface FeedbackMonthEvent {
  event: {
    id: string;
    name: string;
    event_date: string;
    status: string;
  };
  campaign: {
    id: string;
    title: string;
    status: string;
    auto_open_on_event_completion: boolean;
  } | null;
  campaign_configured: boolean;
  response_count: number;
  feedback_window: {
    opens_at: string | null;
    closes_at: string | null;
  };
  is_open: boolean;
  insights: {
    average_rating: number | null;
    rating_count: number;
    attend_again_percent: number | null;
    attend_again_count: number;
    top_talk_label: string | null;
    top_talk_count: number;
    comment_count: number;
  };
  public_url: string;
}

export interface FeedbackMonth {
  month: string;
  label: string;
  total_responses: number;
  event_count: number;
  comment_count: number;
  average_rating: number | null;
  attend_again_percent: number | null;
  top_talk_label: string | null;
  top_talk_count: number;
  events: FeedbackMonthEvent[];
}

export interface FeedbackMonthsResponse {
  months: FeedbackMonth[];
}

export interface RouteFeedbackSubmission {
  id: string;
  tester_name: string;
  type: FeedbackKind;
  message: string;
  trigger_source: string | null;
  page_path: string | null;
  user_agent: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteFeedbackSummary {
  total: number;
  new: number;
  reviewing: number;
  done: number;
  wont_fix: number;
}

export interface RouteFeedbackInboxResponse {
  submissions: RouteFeedbackSubmission[];
  summary: RouteFeedbackSummary;
}

export interface AdminSessionResponse {
  authenticated: boolean;
  auth_mode: 'supabase' | 'local';
  user?: {
    email: string | null;
    display_name: string | null;
    role: AdminRole;
  };
}

export interface OrganizerMembership {
  id: string;
  email: string;
  display_name: string | null;
  role: AdminRole;
  status: AdminMembershipStatus;
  last_login_at: string | null;
  created_at: string | null;
}

export interface OrganizerMembershipsResponse {
  organizers: OrganizerMembership[];
  auth_mode: 'supabase' | 'local';
}

export interface AdminAuditLogEntry {
  id: string;
  actor_email: string | null;
  actor_role: AdminRole | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  request_method: string | null;
  request_path: string | null;
  created_at: string;
}

export interface AdminAuditLogResponse {
  logs: AdminAuditLogEntry[];
  auth_mode: 'supabase' | 'local';
}

export interface LumaImportResponse {
  event: Event;
  already_imported: boolean;
}

export interface LumaEventPreview {
  name: string;
  description: string | null;
  event_date: string;
  series_type?: Event['series_type'];
  end_date: string | null;
  cover: string | null;
  registration_url: string | null;
  location: Event['location'];
  publish_to_website: boolean;
  external_source: string;
  external_id: string;
  external_url: string | null;
  external_synced_at: string;
}

export interface LumaPreviewResponse {
  preview: LumaEventPreview;
  existing_event: Event | null;
  already_imported: boolean;
}

export interface PublicMeetupsResponse {
  data: PublicMeetup[];
}

export interface PublicMeetupResponse {
  data: PublicMeetup;
}

export interface PublicMeetupPreviewResponse {
  data: PublicMeetup;
  already_imported: boolean;
}

export interface FeedbackEventStatusResponse {
  available: boolean;
  feedback_window: {
    opens_at: string | null;
    closes_at: string | null;
  } | null;
  public_url: string | null;
  error?: string;
}

export const queryKeys = {
  overview: ['overview'] as const,
  events: ['events'] as const,
  publicArchive: ['public-archive'] as const,
  publicArchiveEvent: (eventId: string) => ['public-archive-event', eventId] as const,
  publicHome: ['public-home'] as const,
  publicMeetups: ['public-meetups'] as const,
  publicMeetup: (slug: string) => ['public-meetup', slug] as const,
  feedbackMonths: ['feedback-months'] as const,
  routeFeedbackInbox: ['route-feedback-inbox'] as const,
  adminSession: ['admin-session'] as const,
  adminOrganizers: ['admin-organizers'] as const,
  adminAuditLog: (filters?: Record<string, string>) => ['admin-audit-log', filters ?? {}] as const,
  event: (eventId: string) => ['events', eventId] as const,
  eventChecklist: (eventId: string) => ['event-checklist', eventId] as const,
};

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null) as T | { error?: string } | null;

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export function summarizeRouteFeedback(submissions: RouteFeedbackSubmission[]): RouteFeedbackSummary {
  return {
    total: submissions.length,
    new: submissions.filter((item) => item.status === 'new').length,
    reviewing: submissions.filter((item) => item.status === 'reviewing').length,
    done: submissions.filter((item) => item.status === 'done').length,
    wont_fix: submissions.filter((item) => item.status === 'wont_fix').length,
  };
}

export function fetchOverview() {
  return fetchJson<OverviewResponse>('/api/overview');
}

export function fetchEvents() {
  return fetchJson<Event[]>('/api/events');
}

export function fetchEventById(eventId: string) {
  return fetchJson<Event>(`/api/events/${eventId}`);
}

export function deleteEventById(eventId: string) {
  return fetchJson<{ ok: true }>(`/api/events/${eventId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export function fetchPublicMeetups() {
  return fetchJson<PublicMeetupsResponse>('/api/public/meetups', {
    cache: 'no-store',
  });
}

export function fetchPublicMeetup(slug: string) {
  return fetchJson<PublicMeetupResponse>(`/api/public/meetups/${slug}`, {
    cache: 'no-store',
  });
}

export function fetchPublicArchive() {
  return fetchJson<PublicArchiveResponse>('/api/public/archive', {
    cache: 'no-store',
  });
}

export function fetchPublicArchiveEvent(eventId: string) {
  return fetchJson<PublicArchiveEventResponse>(`/api/public/archive/${eventId}`, {
    cache: 'no-store',
  });
}

export function fetchPublicHome() {
  return fetchJson<PublicHomeResponse>('/api/public/home', {
    cache: 'no-store',
  });
}

export function fetchPreviewPublicMeetup(eventUrl: string, seriesType?: Event['series_type']) {
  return fetchJson<PublicMeetupPreviewResponse>('/api/integrations/luma/public-preview', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_url: eventUrl, ...(seriesType ? { series_type: seriesType } : {}) }),
  });
}

export function importLumaEventUrl(eventUrl: string, seriesType: Event['series_type']) {
  return fetchJson<LumaImportResponse>('/api/integrations/luma/import', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_url: eventUrl, series_type: seriesType }),
  });
}

export function previewLumaEventUrl(eventUrl: string, seriesType?: Event['series_type']) {
  return fetchJson<LumaPreviewResponse>('/api/integrations/luma/preview', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_url: eventUrl, ...(seriesType ? { series_type: seriesType } : {}) }),
  });
}

export function fetchFeedbackMonths() {
  return fetchJson<FeedbackMonthsResponse>('/api/feedback/monthly');
}

export function fetchRouteFeedbackInbox() {
  return fetchJson<RouteFeedbackInboxResponse>('/api/feedback/inbox');
}

export function fetchAdminSession() {
  return fetchJson<AdminSessionResponse>('/api/auth/session', { credentials: 'include' });
}

export function fetchFeedbackEventStatus(eventId: string) {
  return fetchJson<FeedbackEventStatusResponse>(`/api/feedback/events/${eventId}/status`, { credentials: 'include' });
}

export function fetchAdminOrganizers() {
  return fetchJson<OrganizerMembershipsResponse>('/api/admin/organizers', { credentials: 'include' });
}

export function fetchAdminAuditLog(filters: { actor?: string; action?: string; target_type?: string; limit?: string } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return fetchJson<AdminAuditLogResponse>(`/api/admin/audit-log${query ? `?${query}` : ''}`, { credentials: 'include' });
}
