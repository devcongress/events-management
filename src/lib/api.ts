import type { Event, LeaderboardEntry, QuizSession, Talk } from '@/types';
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

export const queryKeys = {
  overview: ['overview'] as const,
  events: ['events'] as const,
  feedbackMonths: ['feedback-months'] as const,
  routeFeedbackInbox: ['route-feedback-inbox'] as const,
  adminSession: ['admin-session'] as const,
  adminOrganizers: ['admin-organizers'] as const,
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

export function fetchFeedbackMonths() {
  return fetchJson<FeedbackMonthsResponse>('/api/feedback/monthly');
}

export function fetchRouteFeedbackInbox() {
  return fetchJson<RouteFeedbackInboxResponse>('/api/feedback/inbox');
}

export function fetchAdminSession() {
  return fetchJson<AdminSessionResponse>('/api/auth/session', { credentials: 'include' });
}

export function fetchAdminOrganizers() {
  return fetchJson<OrganizerMembershipsResponse>('/api/admin/organizers', { credentials: 'include' });
}
