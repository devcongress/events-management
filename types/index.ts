// ---- Enums ----
export type EventStatus = 'draft' | 'cfp_open' | 'cfp_closed' | 'upcoming' | 'live' | 'completed';
export type EventChecklistPhase = 'setup' | 'cfp' | 'program' | 'event_day' | 'post_event';
export type TalkStatus = 'submitted' | 'accepted' | 'rejected' | 'slides_received' | 'published';
export type QuizStatus = 'draft' | 'waiting' | 'active' | 'finished';
export type QuestionPhase = 'answering' | 'revealing' | 'scoreboard';
export type Role = 'admin' | 'speaker' | 'player';
export type SlidesType = 'url' | 'file' | null;
export type FeedbackCampaignStatus = 'draft' | 'active' | 'closed';
export type FeedbackQuestionType = 'rating' | 'text' | 'choice' | 'talk_select' | 'yes_no';
export type LumaAttendanceApprovalStatus = 'approved' | 'pending' | 'declined' | 'unknown';

// ---- Entities ----
export interface Event {
  id: string;
  name: string;
  description: string | null;
  event_date: string;          // ISO date string
  status: EventStatus;
  created_at: string;
  updated_at: string;
  slug?: string;
  end_date?: string;
  cover?: string;
  location?: {
    label?: string;
    name: string;
    url: string | null;
  };
  stream_url?: string | null;
  embed_stream?: boolean;
  registration_url?: string | null;
  schedule?: PublicMeetupScheduleItem[];
  photos?: {
    url: string;
    type: 'image' | 'folder';
  }[];
  videos?: {
    title: string;
    embed_url: string;
  }[];
  publish_to_website?: boolean;
}

export interface EventChecklistItem {
  id: string;
  event_id: string;
  phase: EventChecklistPhase;
  label: string;
  description: string;
  order_index: number;
  status_on_complete: EventStatus | null;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  updated_at: string;
}

export interface EventSpeaker {
  id: string;
  event_id: string;
  email: string;
  name: string;
  added_at: string;
}

export interface Talk {
  id: string;
  event_id: string;
  speaker_name: string;
  speaker_email: string;
  github_username: string | null;
  title: string;
  topic: string;  // Tech topic/category (e.g., "Web Development", "AI/ML", "DevOps")
  abstract: string | null;
  bio: string | null;
  status: TalkStatus;
  slides_url: string | null;
  slides_type: SlidesType;
  storage_path: string | null;  // simulated
  slides_uploaded_at: string | null;
  reminder_sent_count: number;
  last_reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Public website API ----
export type PublicMeetupStatus = 'upcoming' | 'live' | 'past';

export interface PublicMeetupSpeaker {
  name: string;
  title: string;
  bio: string | null;
  image: string;
  talk_title: string;
  talk_description: string | null;
  slides_url: string | null;
  recording_url: string | null;
  socials: {
    platform: 'github' | 'website';
    url: string;
  }[];
}

export interface PublicMeetupScheduleItem {
  time: string;
  title: string;
  type: 'networking' | 'talk' | 'panel' | 'workshop' | 'open_discussion' | 'break';
  lead: string | null;
  resources: {
    title: string;
    url: string;
  }[];
}

export interface PublicMeetup {
  id: string;
  slug: string;
  name: string;
  status: PublicMeetupStatus;
  start: string;
  end: string;
  description: string;
  cover: string;
  location: {
    label?: string;
    name: string;
    url: string | null;
  };
  stream_url: string | null;
  embed_stream: boolean;
  registration_url: string | null;
  speakers: PublicMeetupSpeaker[];
  schedule: PublicMeetupScheduleItem[];
  photos: {
    url: string;
    type: 'image' | 'folder';
  }[];
  videos: {
    title: string;
    embed_url: string;
  }[];
  talks_count: number;
  published_talks_count: number;
  cfp_url: string | null;
  archive_url: string;
  updated_at: string;
}

export interface User {
  id: string;
  device_id: string | null;
  nickname: string | null;
  username: string | null;
  email: string | null;
  secret_question: string | null;
  secret_answer_hash: string | null;
  is_claimed: boolean;
  is_admin: boolean;
  merged_into_user_id: string | null;
  total_points: number;
  events_participated: number;
  created_at: string;
}

export interface QuizSession {
  id: string;
  event_id: string;
  join_code: string;
  status: QuizStatus;
  current_question_index: number;  // -1 means not started
  question_phase: QuestionPhase | null;  // null when not active
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  question_started_at: string | null;  // When current question started
  phase_started_at: string | null;  // When current phase started (for auto-advance)
}

export interface Question {
  id: string;
  quiz_session_id: string;
  question_text: string;
  options: string[];             // exactly 4 items
  correct_index: number;         // 0-3
  time_limit_seconds: number;
  points: number;
  order_index: number;
  created_at: string;
}

export interface Response {
  id: string;
  question_id: string;
  user_id: string;
  answer_index: number | null;   // null if timed out
  answered_at: string | null;
  time_taken_ms: number | null;
  points_awarded: number;
  is_correct: boolean | null;
  created_at: string;
}

export interface QuizParticipant {
  id: string;
  quiz_session_id: string;
  user_id: string;
  nickname_used: string;
  total_score: number;
  current_streak: number;  // consecutive correct answers
  joined_at: string;
}

export interface FeedbackQuestion {
  id: string;
  type: FeedbackQuestionType;
  label: string;
  required: boolean;
  options: string[];
  order_index: number;
}

export interface FeedbackCampaign {
  id: string;
  event_id: string;
  title: string;
  intro: string | null;
  status: FeedbackCampaignStatus;
  auto_open_on_event_completion: boolean;
  opens_at: string | null;
  closes_at: string | null;
  questions: FeedbackQuestion[];
  created_at: string;
  updated_at: string;
}

export interface FeedbackAnswer {
  question_id: string;
  value: string | number | boolean | null;
}

export interface EventFeedbackSubmission {
  id: string;
  campaign_id: string;
  event_id: string;
  respondent_name: string | null;
  respondent_email: string | null;
  answers: FeedbackAnswer[];
  page_path: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface LumaAttendanceRecord {
  guest_id: string;
  event_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  registered_at: string | null;
  approval_status: LumaAttendanceApprovalStatus;
  checked_in_at: string | null;
  utm_source: string | null;
  ticket_type_id: string | null;
  ticket_name: string | null;
  raw_row: Record<string, string>;
}

export interface EventAttendanceImport {
  id: string;
  event_id: string;
  attendance_month?: string;
  source_filename: string | null;
  row_count: number;
  imported_at: string;
  records: LumaAttendanceRecord[];
}

export interface AttendanceBreakdownItem {
  label: string;
  count: number;
}

export interface EventAttendanceSummary {
  total_registrations: number;
  approved_registrations: number;
  checked_in: number;
  approved_checked_in: number;
  approved_no_shows: number;
  pending_registrations: number;
  declined_registrations: number;
  check_in_rate: number;
  registration_to_attendance_gap: number;
  source_breakdown: AttendanceBreakdownItem[];
  ticket_breakdown: AttendanceBreakdownItem[];
}

export interface AttendanceLedgerEvent {
  event: Event;
  attendance_month: string;
  month_label: string;
  import: EventAttendanceImport | null;
  summary: EventAttendanceSummary;
  upload_status: 'uploaded' | 'missing';
}

export interface AttendanceSourceInsight {
  label: string;
  registrations: number;
  checked_in: number;
  check_in_rate: number;
}

export interface AttendanceMonthlyInsights {
  total_months: number;
  imported_months: number;
  missing_completed_months: number;
  total_registrations: number;
  total_checked_in: number;
  total_no_shows: number;
  average_check_in_rate: number;
  median_checked_in: number;
  p80_checked_in: number;
  repeat_attendees: number;
  unique_attendees: number;
  source_quality: AttendanceSourceInsight[];
  best_month: AttendanceLedgerEvent | null;
  weakest_month: AttendanceLedgerEvent | null;
}

// ---- API payloads ----
export interface QuizStateResponse {
  session: Pick<QuizSession, 'id' | 'status' | 'current_question_index' | 'join_code' | 'question_phase'>;
  current_question: Omit<Question, 'correct_index'> | null;  // hide answer from player
  question_started_at: string | null;                         // when this question was shown
  participants_count: number;
  answers_count: number;                                      // how many answered current Q
  leaderboard: LeaderboardEntry[];                            // top 10
  answer_distribution?: {                                     // shown in revealing/scoreboard phases
    option_index: number;
    count: number;
    percentage: number;
  }[];
  player_result?: {                                           // if player already answered
    is_correct: boolean;
    points_awarded: number;
    correct_index: number;                                    // reveal after answered
    streak_count: number;                                     // current streak
  };
}

export interface LeaderboardEntry {
  user_id: string;
  nickname: string;
  total_score: number;
  rank: number;
  streak_count: number;                                       // display streak indicator
  previous_rank?: number;                                     // for animation
}

export interface GeneratedQuizFromPaperSummary {
  source_file_name: string;
  extracted_character_count: number;
  requested_question_count: number;
  created_question_count: number;
  generation_note: string;
  warnings: string[];
}

export interface GeneratedQuizFromPaperResponse {
  session_id: string;
  questions: Question[];
  summary: GeneratedQuizFromPaperSummary;
}
