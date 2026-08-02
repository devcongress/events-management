import type {
  Event,
  EventSubmission,
  EventSubmissionEmailKind,
  EventSubmissionRejectionCategory,
  EventSubmissionReviewStatus,
  EventChecklistItem,
  EventBlast,
  EventRegistration,
  EventRegistrationCampaign,
  EventRegistrationSummary,
  LeaderboardEntry,
  PublicArchiveEventResponse,
  PublicArchiveResponse,
  PublicHomeResponse,
  PublicMeetup,
  QuizSession,
  Talk,
  VolunteerApplication,
} from '@/types';
import type {
  AnnualConferenceEdition,
  AnnualConferenceTask,
  AnnualConferenceTaskCreateInput,
  AnnualConferenceTaskUpdateInput,
  AnnualConferenceWorkPlanSummary,
} from '@/lib/annual-conference-work-plan';
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
    not_attended_count: number;
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
  not_attended_count: number;
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
  auth_mode: 'supabase';
  auth_configured: boolean;
  expires_at?: string;
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
  auth_mode: 'supabase';
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
  auth_mode: 'supabase';
}

export interface PublicMeetupsResponse {
  data: PublicMeetup[];
  meta: {
    source: 'devcongress-comm';
    version: 1;
  };
}

export interface PublicMeetupResponse {
  data: PublicMeetup;
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

export interface VolunteerApplicationsResponse {
  applications: VolunteerApplication[];
}

export interface AdminEventSubmissionsResponse {
  submissions: EventSubmission[];
}

export interface AnnualConferenceWorkPlanResponse {
  edition: AnnualConferenceEdition;
  tasks: AnnualConferenceTask[];
  summary: AnnualConferenceWorkPlanSummary;
  permissions: {
    can_create_tasks: boolean;
    task_creator_email: string;
  };
}

export interface EventChecklistResponse {
  event_status: Event['status'];
  items: EventChecklistItem[];
}

export interface CreateNativeEventResponse {
  event: Event;
  registration_campaign: EventRegistrationCampaign;
}

export interface GhanaVenueSuggestion {
  placeId: string;
  name: string;
  address: string;
  label: string;
}

export interface AdminManagedEventRegistrationsResponse {
  managed_internally: true;
  event: Event;
  campaign: EventRegistrationCampaign;
  registrations: EventRegistration[];
  summary: EventRegistrationSummary;
  public_url: string;
}

export interface EventBlastsResponse {
  blasts: EventBlast[];
}

export interface AdminLegacyEventRegistrationsResponse {
  managed_internally: false;
  event: Event;
  campaign: null;
  registrations: [];
  summary: null;
  public_url: null;
}

export type AdminEventRegistrationsResponse =
  | AdminManagedEventRegistrationsResponse
  | AdminLegacyEventRegistrationsResponse;

export interface PublicEventRegistrationResponse {
  available: boolean;
  unavailable_reason: 'draft' | 'closed' | 'not_open' | 'ended' | null;
  event: Pick<Event, 'id' | 'name' | 'description' | 'event_date' | 'end_date' | 'cover' | 'location' | 'updated_at'>;
  campaign: Pick<EventRegistrationCampaign, 'status' | 'opens_at' | 'closes_at' | 'waitlist_enabled'>;
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
  volunteerApplications: ['volunteer-applications'] as const,
  eventSubmissions: (status: EventSubmissionReviewStatus | 'all') => ['event-submissions', status] as const,
  annualConferenceWorkPlan: (year: string) => ['annual-conference-work-plan', year] as const,
  adminSession: ['admin-session'] as const,
  adminOrganizers: ['admin-organizers'] as const,
  adminAuditLog: (filters?: Record<string, string>) => ['admin-audit-log', filters ?? {}] as const,
  event: (eventId: string) => ['events', eventId] as const,
  eventChecklist: (eventId: string) => ['event-checklist', eventId] as const,
  eventRegistrations: (eventId: string) => ['event-registrations', eventId] as const,
  eventBlasts: (eventId: string) => ['event-blasts', eventId] as const,
  publicEventRegistration: (eventId: string) => ['public-event-registration', eventId] as const,
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

export function fetchVolunteerApplications() {
  return fetchJson<VolunteerApplicationsResponse>('/api/admin/volunteer-applications');
}

export function fetchAnnualConferenceWorkPlan(year: string) {
  return fetchJson<AnnualConferenceWorkPlanResponse>(`/api/annual-conference/${year}/work-plan`, {
    credentials: 'include',
  });
}

export function createAnnualConferenceTask(year: string, input: AnnualConferenceTaskCreateInput) {
  return fetchJson<AnnualConferenceTask>(`/api/annual-conference/${year}/work-plan`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateAnnualConferenceTask(
  year: string,
  taskId: string,
  input: AnnualConferenceTaskUpdateInput,
) {
  return fetchJson<AnnualConferenceTask>(`/api/annual-conference/${year}/work-plan/${taskId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
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

export function fetchEventSubmissions(status: EventSubmissionReviewStatus | 'all' = 'all') {
  const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
  return fetchJson<AdminEventSubmissionsResponse>(`/api/admin/event-submissions${query}`, { credentials: 'include' });
}

export function approveEventSubmission(submissionId: string, publish = true) {
  return fetchJson<{ submission: EventSubmission; event_id: string }>(
    `/api/admin/event-submissions/${encodeURIComponent(submissionId)}/approve`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish }),
    },
  );
}

export function rejectEventSubmission(submissionId: string, input: {
  category: EventSubmissionRejectionCategory;
  organizer_message?: string;
  internal_note?: string;
}) {
  return fetchJson<{ submission: EventSubmission }>(
    `/api/admin/event-submissions/${encodeURIComponent(submissionId)}/reject`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export function retryEventSubmissionEmail(submissionId: string, kind: EventSubmissionEmailKind) {
  return fetchJson<{ accepted: true; kind: EventSubmissionEmailKind }>(
    `/api/admin/event-submissions/${encodeURIComponent(submissionId)}/emails/${encodeURIComponent(kind)}/retry`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
}

export function createNativeEvent(input: Record<string, unknown>) {
  return fetchJson<CreateNativeEventResponse>('/api/events', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function searchGhanaVenues(query: string, signal?: AbortSignal) {
  const search = new URLSearchParams({ q: query });
  return fetchJson<{ venues: GhanaVenueSuggestion[] }>(`/api/admin/venues/search?${search}`, {
    credentials: 'include',
    signal,
  });
}

export function fetchEventChecklist(eventId: string) {
  return fetchJson<EventChecklistResponse>(`/api/events/${eventId}/checklist`);
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
  return fetchJson<PublicMeetupResponse>(`/api/public/meetups/${encodeURIComponent(slug)}`, {
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

export function fetchPublicEventRegistration(eventKey: string) {
  return fetchJson<PublicEventRegistrationResponse>(`/api/registration/events/${encodeURIComponent(eventKey)}`, {
    cache: 'no-store',
  });
}

export function submitEventRegistration(
  eventKey: string,
  input: {
    name: string;
    email: string;
    turnstile_action?: string;
    turnstile_token?: string;
  },
) {
  return fetchJson<{
    accepted: true;
    message: string;
  }>(`/api/registration/events/${encodeURIComponent(eventKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function fetchEventRegistrations(eventId: string) {
  return fetchJson<AdminEventRegistrationsResponse>(`/api/events/${eventId}/registrations`, {
    credentials: 'include',
  });
}

export function updateEventRegistrationCampaign(
  eventId: string,
  input: Partial<Pick<EventRegistrationCampaign, 'status' | 'capacity' | 'opens_at' | 'closes_at'>>,
) {
  return fetchJson<EventRegistrationCampaign>(`/api/events/${eventId}/registrations`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function checkInEventRegistration(eventId: string, registrationId: string) {
  return fetchJson<{ checked_in_at: string }>(`/api/events/${eventId}/registrations/${registrationId}/check-in`, {
    method: 'POST',
    credentials: 'include',
  });
}

export function cancelEventRegistration(eventId: string, registrationId: string) {
  return fetchJson<{ ok: true; promoted_registration_id: string | null }>(`/api/events/${eventId}/registrations/${registrationId}/cancel`, {
    method: 'POST',
    credentials: 'include',
  });
}

export function removeEventRegistration(eventId: string, registrationId: string) {
  return fetchJson<{ ok: true }>(`/api/events/${eventId}/registrations/${registrationId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export function processEventRegistrationEmails(eventId: string) {
  return fetchJson<{ accepted_count: number; delayed_count: number }>(`/api/events/${eventId}/registration-emails/process`, {
    method: 'POST',
    credentials: 'include',
  });
}

export function fetchEventBlasts(eventId: string) {
  return fetchJson<EventBlastsResponse>(`/api/events/${eventId}/blasts`, { credentials: 'include' });
}

export function createEventBlast(
  eventId: string,
  input: { subject: string; body: string; scheduled_for?: string | null },
) {
  return fetchJson<{ blast: EventBlast; delivery: 'scheduled' | 'sent' | 'needs_capacity' | 'failed' }>(
    `/api/events/${eventId}/blasts`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export function retryEventBlast(eventId: string, blastId: string) {
  return fetchJson<{ blast: EventBlast; delivery: 'scheduled' | 'sent' | 'failed' }>(
    `/api/events/${eventId}/blasts/${blastId}/retry`,
    {
      method: 'POST',
      credentials: 'include',
    },
  );
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
