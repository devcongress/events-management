// ---- Enums ----
export type EventStatus = 'draft' | 'cfp_open' | 'cfp_closed' | 'upcoming' | 'live' | 'completed';
export type EventChecklistPhase = 'setup' | 'cfp' | 'program' | 'event_day' | 'post_event';
export type TalkStatus = 'submitted' | 'accepted' | 'rejected' | 'slides_received' | 'published';
export type ArchiveItemKind = 'talk' | 'product_demo';
export type SpeakerSubmissionStatus = 'submitted' | 'selected' | 'not_selected' | 'withdrawn';
export type SpeakerIntakeLinkPurpose = 'archive_backfill' | 'selected_speaker_confirmation' | 'archive_materials_follow_up';
export type ArchiveMaterialField = 'abstract' | 'bio' | 'slides_url';
export type SpeakerIntakeEmailStatus = 'pending' | 'accepted' | 'failed';
export type QuizStatus = 'draft' | 'waiting' | 'active' | 'finished';
export type QuestionPhase = 'answering' | 'revealing' | 'scoreboard';
export type Role = 'admin' | 'speaker' | 'player';
export type SlidesType = 'url' | 'file' | null;
export type FeedbackCampaignStatus = 'draft' | 'active' | 'closed';
export type FeedbackQuestionType = 'rating' | 'text' | 'choice' | 'talk_select' | 'yes_no';
export type LumaAttendanceApprovalStatus = 'approved' | 'pending' | 'declined' | 'unknown';
export type EventSeriesType = 'monthly' | 'quarterly' | 'special';
export type EventOwnership = 'devcongress' | 'external';
export type EventFormat = 'meetup' | 'conference' | 'workshop' | 'hackathon' | 'webinar' | 'other';
export type EventSubmissionSource = 'internal' | 'public_submission';
export type EventModerationStatus = 'pending' | 'approved' | 'rejected';
export type EventPublicationStatus = 'draft' | 'published' | 'archived';
export type EventLocationType = 'in_person' | 'online' | 'hybrid';
export type EventSubmissionReviewStatus = 'pending' | 'approved' | 'rejected';
export type EventSubmissionRejectionCategory =
  | 'calendar_fit'
  | 'insufficient_information'
  | 'duplicate'
  | 'event_passed'
  | 'other';
export type EventSubmissionEmailKind = 'receipt' | 'approved' | 'rejected' | 'amendment_approved' | 'amendment_rejected' | 'withdrawn';
export type EventSubmissionAmendmentStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type EventSubmissionEmailDeliveryStatus = 'pending' | 'accepted' | 'failed';
export type EventRegistrationCampaignStatus = 'draft' | 'open' | 'closed';
export type EventRegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled';
export type RegistrationEmailDeliveryStatus = 'pending' | 'accepted' | 'failed';
export type RegistrationEmailKind = 'confirmation' | 'promotion';
export type EventBlastStatus = 'preparing' | 'scheduled' | 'sent' | 'needs_capacity' | 'failed';

// ---- Entities ----
export interface Event {
  id: string;
  name: string;
  description: string | null;
  event_date: string;          // ISO date string
  series_type?: EventSeriesType | null;
  status: EventStatus;
  created_at: string;
  updated_at: string;
  slug?: string | null;
  end_date?: string | null;
  cover?: string | null;
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
  ownership?: EventOwnership;
  format?: EventFormat;
  submission_source?: EventSubmissionSource;
  moderation_status?: EventModerationStatus | null;
  publication_status?: EventPublicationStatus;
  timezone?: string;
  location_type?: EventLocationType;
  venue_address?: string | null;
  online_url?: string | null;
  organizer_name?: string | null;
  organizer_url?: string | null;
  source_submission_id?: string | null;
  external_source?: string | null;
  external_id?: string | null;
  external_url?: string | null;
  external_synced_at?: string | null;
}

export interface EventSubmission {
  id: string;
  title: string;
  summary: string;
  format: EventFormat;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location_type: EventLocationType;
  venue_name: string | null;
  venue_address: string | null;
  online_url: string | null;
  registration_url: string | null;
  organizer_name: string;
  organizer_email: string;
  organizer_website: string | null;
  notes: string | null;
  cover_url: string | null;
  source_app: 'website';
  review_status: EventSubmissionReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_category: EventSubmissionRejectionCategory | null;
  organizer_message: string | null;
  internal_note: string | null;
  email_deliveries: EventSubmissionEmailDelivery[];
  amendments?: EventSubmissionAmendment[];
  replies: EventSubmissionReply[];
  approved_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventSubmissionAmendment {
  id: string;
  submission_id: string;
  status: EventSubmissionAmendmentStatus;
  starts_at: string;
  ends_at: string;
  location_type: EventLocationType;
  venue_name: string | null;
  venue_address: string | null;
  online_url: string | null;
  registration_url: string | null;
  cover_url: string | null;
  organizer_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  decision_message: string | null;
  created_at: string;
  updated_at: string;
}

export type EventSubmissionReplySlackStatus = 'pending' | 'sent' | 'failed';

export interface EventSubmissionReplyAttachment {
  filename: string;
  content_type: string | null;
  size: number | null;
}

export interface EventSubmissionReply {
  id: string;
  sender_email: string;
  subject: string;
  body_text: string;
  received_at: string;
  attachments: EventSubmissionReplyAttachment[];
  slack_status: EventSubmissionReplySlackStatus;
  slack_error: string | null;
}

export interface EventSubmissionEmailDelivery {
  id: string;
  kind: EventSubmissionEmailKind;
  status: EventSubmissionEmailDeliveryStatus;
  attempts: number;
  last_error: string | null;
  last_attempt_at: string | null;
  accepted_at: string | null;
}

export interface EventRegistrationCampaign {
  id: string;
  event_id: string;
  status: EventRegistrationCampaignStatus;
  description: string | null;
  capacity: number;
  opens_at: string | null;
  closes_at: string | null;
  waitlist_enabled: boolean;
  auto_confirm: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  campaign_id: string;
  name: string;
  email: string;
  status: EventRegistrationStatus;
  confirmed_at: string | null;
  cancelled_at: string | null;
  checked_in_at: string | null;
  email_status: RegistrationEmailDeliveryStatus | null;
  email_kind?: RegistrationEmailKind | null;
  created_at: string;
  updated_at: string;
}

export interface EventRegistrationSummary {
  total: number;
  confirmed: number;
  waitlisted: number;
  checked_in: number;
  available: number;
  pending_emails: number;
}

export interface EventBlast {
  id: string;
  event_id: string;
  subject: string;
  body: string;
  status: EventBlastStatus;
  recipient_count: number;
  scheduled_for: string | null;
  sent_at: string | null;
  provider_broadcast_id: string | null;
  provider_segment_id: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
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
  disabled_at?: string | null;
  disabled_by?: string | null;
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
  /**
   * Optional on the compatibility type so pre-discriminator JSON fixtures and
   * callers remain readable. Store and API reads normalize a missing value to
   * `talk`, and all new writes persist an explicit kind.
   */
  kind?: ArchiveItemKind;
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

export interface SpeakerIntakeLink {
  id: string;
  event_id: string;
  event_month: string;
  kind?: ArchiveItemKind;
  purpose?: SpeakerIntakeLinkPurpose;
  speaker_submission_id?: string | null;
  speaker_name?: string | null;
  speaker_email?: string | null;
  talk_title?: string | null;
  talk_id?: string | null;
  requested_fields?: ArchiveMaterialField[];
  token?: string | null;
  token_hash: string;
  email_status?: SpeakerIntakeEmailStatus | null;
  email_provider_id?: string | null;
  email_idempotency_key?: string | null;
  email_sent_at?: string | null;
  email_last_attempt_at?: string | null;
  email_last_error?: string | null;
  expires_at: string;
  used_at: string | null;
  used_talk_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpeakerSubmission {
  id: string;
  event_id: string;
  kind?: ArchiveItemKind;
  speaker_name: string;
  speaker_email: string;
  github_username: string | null;
  title: string;
  topic: string;
  abstract: string | null;
  bio: string | null;
  status: SpeakerSubmissionStatus;
  internal_note: string | null;
  selected_intake_link_id: string | null;
  selected_talk_id: string | null;
  decided_at: string | null;
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
  type: 'networking' | 'talk' | 'product_demo' | 'panel' | 'workshop' | 'system_design' | 'open_discussion' | 'break';
  lead: string | null;
  description?: string | null;
  system_design_title?: string | null;
  resources: {
    title: string;
    url: string;
  }[];
  shared_links?: string[];
}

export interface PublicMeetup {
  id: string;
  slug: string;
  name: string;
  series_type: EventSeriesType | null;
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

export interface PublicEvent {
  id: string;
  slug: string;
  title: string;
  summary: string;
  ownership: EventOwnership;
  series: EventSeriesType | null;
  format: EventFormat;
  source: EventSubmissionSource;
  moderation_status: EventModerationStatus | null;
  publication_status: EventPublicationStatus;
  classification: 'official' | 'community';
  starts_at: string;
  ends_at: string;
  timezone: string;
  location_type: EventLocationType;
  venue_name: string | null;
  venue_address: string | null;
  online_url: string | null;
  registration_url: string | null;
  organizer_name: string;
  organizer_website: string | null;
  cover_url: string | null;
  updated_at: string;
}

export interface PublicArchiveEvent {
  id: string;
  name: string;
  description: string | null;
  event_date: string;
  series_type: EventSeriesType | null;
  cover: string;
  schedule: PublicMeetupScheduleItem[];
  photos: {
    url: string;
    type: 'image' | 'folder';
  }[];
}

export interface PublicArchiveTalk {
  id: string;
  event_id: string;
  event_name: string;
  kind: ArchiveItemKind;
  title: string;
  speaker_name: string;
  topic: string;
  abstract: string | null;
  bio: string | null;
  slides_url: string | null;
  updated_at: string;
}

// New archive-facing name. Public payloads retain `talks` during migration.
export type PublicArchiveItem = PublicArchiveTalk;

export interface PublicArchiveResponse {
  events: PublicArchiveEvent[];
  talks: PublicArchiveTalk[];
  archive_items: PublicArchiveItem[];
}

export interface PublicArchiveEventResponse {
  event: PublicArchiveEvent;
  talks: PublicArchiveTalk[];
  archive_items: PublicArchiveItem[];
  feedback: {
    available: boolean;
    closes_at: string | null;
    public_url: string | null;
  };
}

export interface PublicHomeRegular {
  key: string;
  name: string;
  registered_count: number;
  checked_in_count: number;
  check_in_rate: number;
  last_seen_at: string | null;
}

export interface PublicHomeResponse {
  completed_events_count: number;
  published_talks_count: number;
  recent_talks: PublicArchiveTalk[];
  regulars: PublicHomeRegular[];
  cfp_event: {
    id: string;
    name: string;
  } | null;
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
  expires_at?: string | null;
  released_question_ids?: string[];
  purpose?: 'quiz' | 'system_design_learning';
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
  explanation?: string | null;
  source_url?: string | null;
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
  response_token_hash?: string | null;
  created_at: string;
}

export interface VolunteerApplication {
  id: string;
  campaign_id: 'december-mega-meetup';
  name: string;
  email: string;
  x_handle: string;
  slack_name: string;
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

export interface AttendanceLedgerMonthEvent {
  event: Event;
  import: EventAttendanceImport | null;
  summary: EventAttendanceSummary;
  upload_status: 'uploaded' | 'missing';
  upload_available: boolean;
  upload_unavailable_reason: string | null;
  upload_unlocks_at: string | null;
}

export interface AttendanceLedgerMonth {
  attendance_month: string;
  month_label: string;
  events: AttendanceLedgerMonthEvent[];
  event_count: number;
  uploaded_event_count: number;
  completed_event_count: number;
  has_import: boolean;
  upload_status: 'uploaded' | 'missing';
  upload_available: boolean;
  upload_unavailable_reason: string | null;
  upload_unlocks_at: string | null;
  summary: EventAttendanceSummary;
}

export interface AttendanceSourceInsight {
  label: string;
  registrations: number;
  checked_in: number;
  check_in_rate: number;
}

export interface AttendanceRepeatAttendeeTrail {
  event_id: string;
  event_name: string;
  event_date: string;
  outcome: 'came' | 'missed';
}

export interface AttendanceRepeatAttendee {
  key: string;
  name: string;
  email: string | null;
  trail: AttendanceRepeatAttendeeTrail[];
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
  repeat_attendee_profiles: AttendanceRepeatAttendee[];
  source_quality: AttendanceSourceInsight[];
  best_month: AttendanceLedgerMonth | null;
  weakest_month: AttendanceLedgerMonth | null;
}

// ---- API payloads ----
export interface QuizStateResponse {
  session: Pick<QuizSession, 'id' | 'status' | 'current_question_index' | 'join_code' | 'question_phase' | 'purpose'>;
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
  reveal_explanation?: string | null;
  player_result?: {                                           // if player already answered
    is_correct: boolean;
    points_awarded: number;
    correct_index: number;                                    // reveal after answered
    streak_count: number;                                     // current streak
  };
  player_standing?: {                                         // finished System Design room, requesting player only
    rank: number;
    nickname: string;
    participant_count: number;
    avatar_seed: string;
  };
}

export interface LeaderboardEntry {
  user_id: string;
  nickname: string;
  total_score: number;
  rank: number;
  streak_count: number;                                       // display streak indicator
  avatar_seed?: string;                                       // session participant identity for Navii
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
