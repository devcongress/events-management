export type FeedbackKind = 'bug' | 'confusing' | 'suggestion' | 'praise';
export type FeedbackStatus = 'new' | 'reviewing' | 'done' | 'wont_fix';
export type FeedbackCampaignStatus = 'draft' | 'active' | 'closed';
export type FeedbackQuestionType = 'rating' | 'text' | 'choice' | 'talk_select' | 'yes_no';
export type CommunityEventStatus = 'draft' | 'cfp_open' | 'cfp_closed' | 'upcoming' | 'live' | 'completed';
export type CommunityEventSeriesType = 'monthly' | 'quarterly' | 'special';
export type CommunityEventOwnership = 'devcongress' | 'external';
export type CommunityEventFormat = 'meetup' | 'conference' | 'workshop' | 'hackathon' | 'webinar' | 'other';
export type CommunityEventSubmissionSource = 'internal' | 'public_submission';
export type CommunityEventModerationStatus = 'pending' | 'approved' | 'rejected';
export type CommunityEventPublicationStatus = 'draft' | 'published' | 'archived';
export type CommunityEventLocationType = 'in_person' | 'online' | 'hybrid';
export type EventSubmissionEmailKind = 'receipt' | 'approved' | 'rejected' | 'amendment_approved' | 'amendment_rejected' | 'withdrawn';
export type EventSubmissionEmailDeliveryStatus = 'pending' | 'accepted' | 'failed';
export type EventSubmissionReplySlackStatus = 'pending' | 'sent' | 'failed';
export type EventRegistrationCampaignStatus = 'draft' | 'open' | 'closed';
export type EventRegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled';
export type RegistrationEmailDeliveryStatus = 'pending' | 'accepted' | 'failed';
export type EventBlastStatus = 'waiting' | 'preparing' | 'scheduled' | 'sent' | 'needs_capacity' | 'failed';
export type ShortLinkDestination = 'monthly_cfp' | 'event_registration' | 'event_feedback' | 'conference_cfp' | 'volunteer_intake';
export type ShortLinkStatus = 'active' | 'revoked';
export type AdminRole = 'owner' | 'organizer' | 'volunteer';
export type AdminMembershipStatus = 'active' | 'disabled';
export type AnnualConferenceCapability =
  | 'work_plan.view_all'
  | 'work_plan.manage'
  | 'timeline.view'
  | 'phases.manage'
  | 'volunteers.view_team'
  | 'volunteers.share_intake'
  | 'volunteers.review_applications'
  | 'speakers.view'
  | 'speakers.manage'
  | 'finance.view';
export type AnnualConferenceTaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'done';
export type AnnualConferenceWorkstream =
  | 'programme_speakers'
  | 'volunteers'
  | 'website_registration'
  | 'sponsors_partners'
  | 'venue_production_logistics'
  | 'creative_marketing'
  | 'photo_video_livestream'
  | 'feedback_reporting';
export type AnnualConferenceTaskPriority = 'high' | 'medium' | 'low';
export type QuizStatus = 'draft' | 'waiting' | 'active' | 'finished';
export type QuizQuestionPhase = 'presenting' | 'answering' | 'revealing' | 'scoreboard';
export type QuizPurpose = 'quiz' | 'system_design_learning';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProjectNightRecurrenceRow = {
  id: boolean;
  source_event_id: string;
  enabled: boolean;
  next_date: string;
  cover_url: string;
  updated_at: string;
};

export type VolunteerFollowUpCampaignRow = {
  id: string;
  edition_year: number;
  application_deadline_at: string | null;
  status: 'draft' | 'running' | 'paused' | 'closed';
  launched_at: string | null;
  launched_by: string | null;
  last_drain_at: string | null;
  last_drain_reason: string | null;
  outcome_paused: boolean;
  drain_lease_token: string | null;
  drain_lease_until: string | null;
  created_at: string;
  updated_at: string;
};

export type VolunteerFollowUpRecipientRow = {
  id: string;
  campaign_id: string;
  application_id: string;
  application_created_at: string;
  applicant_name: string;
  applicant_email: string;
  status: 'queued' | 'sending' | 'accepted' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'suppressed' | 'complained';
  idempotency_key: string;
  provider_email_id: string | null;
  attempt_count: number;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  claimed_until: string | null;
  last_error: string | null;
  provider_event_at: string | null;
  submitted_at: string | null;
  motivation: string | null;
  can_attend_accra: boolean | null;
  review_status: 'unreviewed' | 'reviewed' | 'needs_follow_up';
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  decision: 'pending' | 'accepted' | 'not_selected';
  decision_version: number;
  decision_at: string | null;
  decision_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VolunteerFollowUpOutcomeDeliveryRow = {
  id: string;
  campaign_id: string;
  recipient_id: string;
  decision: 'accepted' | 'not_selected';
  decision_version: number;
  recipient_name: string;
  recipient_email: string;
  payload: Record<string, unknown>;
  template_version: string;
  idempotency_key: string;
  status: 'queued' | 'sending' | 'retrying' | 'accepted' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'suppressed' | 'complained' | 'needs_attention' | 'cancelled';
  attempt_count: number;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  claimed_until: string | null;
  claim_token: string | null;
  provider_email_id: string | null;
  provider_event_at: string | null;
  last_error: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      volunteer_follow_up_campaigns: {
        Row: VolunteerFollowUpCampaignRow;
        Insert: Pick<VolunteerFollowUpCampaignRow, 'edition_year'> & Partial<VolunteerFollowUpCampaignRow>;
        Update: Partial<VolunteerFollowUpCampaignRow>;
        Relationships: [];
      };
      volunteer_follow_up_recipients: {
        Row: VolunteerFollowUpRecipientRow;
        Insert: Pick<VolunteerFollowUpRecipientRow, 'campaign_id' | 'application_id' | 'applicant_name' | 'applicant_email' | 'idempotency_key'> & Partial<VolunteerFollowUpRecipientRow>;
        Update: Partial<VolunteerFollowUpRecipientRow>;
        Relationships: [];
      };
      volunteer_follow_up_daily_claims: {
        Row: { campaign_id: string; send_day: string; claimed_count: number };
        Insert: { campaign_id: string; send_day: string; claimed_count?: number };
        Update: { claimed_count?: number };
        Relationships: [];
      };
      volunteer_follow_up_webhook_events: {
        Row: { webhook_event_id: string; provider_email_id: string; event_type: string; provider_created_at: string; processed_at: string };
        Insert: { webhook_event_id: string; provider_email_id: string; event_type: string; provider_created_at: string; processed_at?: string };
        Update: never;
        Relationships: [];
      };
      volunteer_follow_up_outcome_deliveries: {
        Row: VolunteerFollowUpOutcomeDeliveryRow;
        Insert: Pick<VolunteerFollowUpOutcomeDeliveryRow, 'campaign_id' | 'recipient_id' | 'decision' | 'decision_version' | 'recipient_name' | 'recipient_email' | 'payload' | 'template_version' | 'idempotency_key' | 'created_by'> & Partial<VolunteerFollowUpOutcomeDeliveryRow>;
        Update: Partial<VolunteerFollowUpOutcomeDeliveryRow>;
        Relationships: [];
      };
      project_night_recurrence: {
        Row: ProjectNightRecurrenceRow;
        Insert: Pick<ProjectNightRecurrenceRow, 'source_event_id' | 'next_date' | 'cover_url'> & Partial<ProjectNightRecurrenceRow>;
        Update: Partial<ProjectNightRecurrenceRow>;
        Relationships: [];
      };
      admin_memberships: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          role: AdminRole;
          status: AdminMembershipStatus;
          added_by: string | null;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          display_name?: string | null;
          role?: AdminRole;
          status?: AdminMembershipStatus;
          added_by?: string | null;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          role?: AdminRole;
          status?: AdminMembershipStatus;
          added_by?: string | null;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_sessions: {
        Row: {
          id: string;
          token_hash: string;
          user_id: string;
          membership_id: string;
          email: string;
          role: AdminRole;
          created_at: string;
          expires_at: string;
          last_seen_at: string;
          revoked_at: string | null;
          user_agent: string | null;
          ip_address: string | null;
        };
        Insert: {
          id?: string;
          token_hash: string;
          user_id: string;
          membership_id: string;
          email: string;
          role: AdminRole;
          created_at?: string;
          expires_at: string;
          last_seen_at?: string;
          revoked_at?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
        };
        Update: {
          id?: string;
          token_hash?: string;
          user_id?: string;
          membership_id?: string;
          email?: string;
          role?: AdminRole;
          created_at?: string;
          expires_at?: string;
          last_seen_at?: string;
          revoked_at?: string | null;
          user_agent?: string | null;
          ip_address?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_sessions_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'admin_memberships';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_audit_log: {
        Row: {
          id: string;
          actor_user_id: string | null;
          actor_email: string | null;
          actor_role: AdminRole | null;
          action: string;
          target_type: string | null;
          target_id: string | null;
          metadata: Json;
          ip_address: string | null;
          user_agent: string | null;
          request_method: string | null;
          request_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          actor_email?: string | null;
          actor_role?: AdminRole | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          request_method?: string | null;
          request_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_user_id?: string | null;
          actor_email?: string | null;
          actor_role?: AdminRole | null;
          action?: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          request_method?: string | null;
          request_path?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      short_links: {
        Row: {
          id: string;
          code: string;
          destination: ShortLinkDestination;
          event_id: string | null;
          conference_edition_id: string | null;
          status: ShortLinkStatus;
          created_by_membership_id: string | null;
          redirect_count: number;
          last_redirected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          destination: ShortLinkDestination;
          event_id?: string | null;
          conference_edition_id?: string | null;
          status?: ShortLinkStatus;
          created_by_membership_id?: string | null;
          redirect_count?: number;
          last_redirected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['short_links']['Insert']>;
        Relationships: [];
      };
      email_delivery_health: {
        Row: {
          provider: string;
          daily_quota_used: number | null;
          daily_quota_limit: number;
          monthly_quota_used: number | null;
          monthly_quota_limit: number;
          daily_level: 'healthy' | 'warning' | 'high' | 'exhausted';
          monthly_level: 'healthy' | 'warning' | 'high' | 'exhausted';
          last_provider_response_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          provider?: string;
          daily_quota_used?: number | null;
          daily_quota_limit?: number;
          monthly_quota_used?: number | null;
          monthly_quota_limit?: number;
          daily_level?: 'healthy' | 'warning' | 'high' | 'exhausted';
          monthly_level?: 'healthy' | 'warning' | 'high' | 'exhausted';
          last_provider_response_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          provider?: string;
          daily_quota_used?: number | null;
          daily_quota_limit?: number;
          monthly_quota_used?: number | null;
          monthly_quota_limit?: number;
          daily_level?: 'healthy' | 'warning' | 'high' | 'exhausted';
          monthly_level?: 'healthy' | 'warning' | 'high' | 'exhausted';
          last_provider_response_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_json_documents: {
        Row: {
          key: string;
          data: Json[];
          created_at: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          key: string;
          data?: Json[];
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          key?: string;
          data?: Json[];
          created_at?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      annual_conference_editions: {
        Row: {
          id: string;
          year: number;
          name: string;
          label: string;
          speaker_call_status: 'open' | 'closed';
          speaker_logistics_deadline: string | null;
          provisional_date: string | null;
          date_status: 'provisional' | 'confirmed';
          venue_note: string | null;
          keynote_note: string | null;
          task_creator_email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          year: number;
          name: string;
          label: string;
          speaker_call_status?: 'open' | 'closed';
          speaker_logistics_deadline?: string | null;
          provisional_date?: string | null;
          date_status?: 'provisional' | 'confirmed';
          venue_note?: string | null;
          keynote_note?: string | null;
          task_creator_email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          year?: number;
          name?: string;
          label?: string;
          speaker_call_status?: 'open' | 'closed';
          speaker_logistics_deadline?: string | null;
          provisional_date?: string | null;
          date_status?: 'provisional' | 'confirmed';
          venue_note?: string | null;
          keynote_note?: string | null;
          task_creator_email?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      annual_conference_speaker_submissions: {
        Row: {
          id: string;
          edition_id: string;
          speaker_name: string;
          speaker_email: string;
          speaker_profile_id: string | null;
          proposal_schema_version: 1 | 2;
          title: string;
          topic: string;
          session_type: '15-minute short talk' | '25-minute short talk' | '40-minute long talk' | '60-minute workshop';
          learning_outcomes: Json;
          abstract: string | null;
          bio: string | null;
          status: 'submitted' | 'selected' | 'not_selected' | 'withdrawn';
          internal_note: string | null;
          selected_intake_link_id: string | null;
          selected_session_id: string | null;
          decision_email_kind: 'acceptance' | 'rejection' | null;
          decision_email_status: 'pending' | 'accepted' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'suppressed' | 'complained' | null;
          decision_email_recipient: string | null;
          decision_email_provider_id: string | null;
          decision_email_idempotency_key: string | null;
          decision_email_sent_at: string | null;
          decision_email_delivered_at: string | null;
          decision_email_last_attempt_at: string | null;
          decision_email_last_event_at: string | null;
          decision_email_last_error: string | null;
          decision_email_attempt_count: number;
          decision_email_retryable: boolean;
          decided_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['annual_conference_speaker_submissions']['Row'], 'id' | 'created_at' | 'updated_at' | 'proposal_schema_version'> & { id?: string; created_at?: string; updated_at?: string; proposal_schema_version?: 1 | 2 };
        Update: Partial<Database['public']['Tables']['annual_conference_speaker_submissions']['Insert']>;
        Relationships: [];
      };
      annual_conference_sessions: {
        Row: {
          id: string;
          edition_id: string;
          speaker_submission_id: string | null;
          speaker_name: string;
          speaker_email: string;
          title: string;
          topic: string;
          session_type: '15-minute short talk' | '25-minute short talk' | '40-minute long talk' | '60-minute workshop';
          learning_outcomes: Json;
          abstract: string | null;
          bio: string | null;
          slides_url: string | null;
          availability_confirmed: boolean | null;
          technical_requirements: string | null;
          workshop_prerequisites: string | null;
          required_software_equipment: string | null;
          participants_need_laptops: boolean | null;
          preferred_workshop_capacity: number | null;
          logistics_updated_at: string | null;
          status: 'confirmed' | 'archived';
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['annual_conference_sessions']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['annual_conference_sessions']['Insert']>;
        Relationships: [];
      };
      annual_conference_speaker_intake_links: {
        Row: {
          id: string;
          edition_id: string;
          speaker_submission_id: string | null;
          speaker_name: string | null;
          speaker_email: string | null;
          talk_title: string | null;
          token_hash: string;
          email_status: 'pending' | 'accepted' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'suppressed' | 'complained' | null;
          email_recipient: string | null;
          email_provider_id: string | null;
          email_idempotency_key: string | null;
          email_sent_at: string | null;
          email_delivered_at: string | null;
          email_last_attempt_at: string | null;
          email_last_event_at: string | null;
          email_last_error: string | null;
          email_attempt_count: number;
          email_retryable: boolean;
          expires_at: string;
          revoked_at: string | null;
          workspace_session_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['annual_conference_speaker_intake_links']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['annual_conference_speaker_intake_links']['Insert']>;
        Relationships: [];
      };
      annual_conference_email_webhook_events: {
        Row: {
          webhook_event_id: string;
          provider_email_id: string;
          event_type: 'email.delivered' | 'email.delivery_delayed' | 'email.bounced' | 'email.failed' | 'email.suppressed' | 'email.complained';
          provider_created_at: string;
          processed_at: string;
        };
        Insert: Omit<Database['public']['Tables']['annual_conference_email_webhook_events']['Row'], 'processed_at'> & { processed_at?: string };
        Update: Partial<Database['public']['Tables']['annual_conference_email_webhook_events']['Insert']>;
        Relationships: [];
      };
      annual_conference_speaker_profiles: {
        Row: {
          id: string;
          email: string;
          email_normalized: string;
          name: string;
          bio: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          bio: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['annual_conference_speaker_profiles']['Insert']>;
        Relationships: [];
      };
      annual_conference_access_grants: {
        Row: {
          id: string;
          edition_id: string;
          membership_id: string;
          capability: AnnualConferenceCapability;
          enabled: boolean;
          granted_by_membership_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          edition_id: string;
          membership_id: string;
          capability: AnnualConferenceCapability;
          enabled?: boolean;
          granted_by_membership_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          edition_id?: string;
          membership_id?: string;
          capability?: AnnualConferenceCapability;
          enabled?: boolean;
          granted_by_membership_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_conference_access_grants_edition_id_fkey';
            columns: ['edition_id'];
            isOneToOne: false;
            referencedRelation: 'annual_conference_editions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'annual_conference_access_grants_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'admin_memberships';
            referencedColumns: ['id'];
          },
        ];
      };
      annual_conference_finance_budgets: {
        Row: {
          id: string;
          edition_id: string;
          category: string;
          label: string;
          amount_minor: number;
          currency: string;
          created_by_email: string | null;
          updated_by_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          edition_id: string;
          category: string;
          label: string;
          amount_minor: number;
          currency?: string;
          created_by_email?: string | null;
          updated_by_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          edition_id?: string;
          category?: string;
          label?: string;
          amount_minor?: number;
          currency?: string;
          created_by_email?: string | null;
          updated_by_email?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_conference_finance_budgets_edition_id_fkey';
            columns: ['edition_id'];
            isOneToOne: false;
            referencedRelation: 'annual_conference_editions';
            referencedColumns: ['id'];
          },
        ];
      };
      annual_conference_finance_entries: {
        Row: {
          id: string;
          edition_id: string;
          kind: string;
          category: string;
          description: string;
          amount_minor: number;
          original_amount_minor: number;
          currency: string;
          status: string;
          source_type: string;
          source_reference: string | null;
          vendor: string | null;
          entry_date: string | null;
          notes: string | null;
          created_by_email: string | null;
          updated_by_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          edition_id: string;
          kind: string;
          category: string;
          description: string;
          amount_minor: number;
          original_amount_minor: number;
          currency?: string;
          status: string;
          source_type?: string;
          source_reference?: string | null;
          vendor?: string | null;
          entry_date?: string | null;
          notes?: string | null;
          created_by_email?: string | null;
          updated_by_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          edition_id?: string;
          kind?: string;
          category?: string;
          description?: string;
          amount_minor?: number;
          original_amount_minor?: number;
          currency?: string;
          status?: string;
          source_type?: string;
          source_reference?: string | null;
          vendor?: string | null;
          entry_date?: string | null;
          notes?: string | null;
          updated_by_email?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_conference_finance_entries_edition_id_fkey';
            columns: ['edition_id'];
            isOneToOne: false;
            referencedRelation: 'annual_conference_editions';
            referencedColumns: ['id'];
          },
        ];
      };
      annual_conference_finance_income_amendments: {
        Row: {
          id: string;
          entry_id: string;
          previous_amount_minor: number;
          next_amount_minor: number;
          action: string;
          reason: string;
          created_by_email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          previous_amount_minor: number;
          next_amount_minor: number;
          action?: string;
          reason: string;
          created_by_email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entry_id?: string;
          previous_amount_minor?: number;
          next_amount_minor?: number;
          action?: string;
          reason?: string;
          created_by_email?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_conference_finance_income_amendments_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'annual_conference_finance_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      annual_conference_finance_income_receipts: {
        Row: {
          id: string;
          idempotency_key: string;
          entry_id: string;
          amount_minor: number;
          received_date: string;
          payment_reference: string | null;
          notes: string | null;
          created_by_email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          entry_id: string;
          amount_minor: number;
          received_date: string;
          payment_reference?: string | null;
          notes?: string | null;
          created_by_email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          entry_id?: string;
          amount_minor?: number;
          received_date?: string;
          payment_reference?: string | null;
          notes?: string | null;
          created_by_email?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_conference_finance_income_receipts_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'annual_conference_finance_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      annual_conference_phases: {
        Row: {
          id: string;
          edition_id: string;
          name: string;
          starts_on: string;
          ends_on: string;
          sort_order: number;
          created_by_email: string | null;
          updated_by_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          edition_id: string;
          name: string;
          starts_on: string;
          ends_on: string;
          sort_order?: number;
          created_by_email?: string | null;
          updated_by_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          edition_id?: string;
          name?: string;
          starts_on?: string;
          ends_on?: string;
          sort_order?: number;
          created_by_email?: string | null;
          updated_by_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_conference_phases_edition_id_fkey';
            columns: ['edition_id'];
            isOneToOne: false;
            referencedRelation: 'annual_conference_editions';
            referencedColumns: ['id'];
          },
        ];
      };
      annual_conference_tasks: {
        Row: {
          id: string;
          edition_id: string;
          title: string;
          details: string | null;
          details_format: 'plain_text' | 'rich_text';
          internal_note: string | null;
          phase_id: string | null;
          workstream: AnnualConferenceWorkstream;
          accountable_owner: string | null;
          collaborators: string[];
          priority: AnnualConferenceTaskPriority | null;
          target_date: string | null;
          status: AnnualConferenceTaskStatus;
          dependency_task_ids: string[];
          dependency_note: string | null;
          source: 'excel_seed' | 'manual';
          source_row: number | null;
          sort_order: number;
          board_entered_at: string | null;
          created_by_email: string | null;
          updated_by_email: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          edition_id: string;
          title: string;
          details?: string | null;
          details_format?: 'plain_text' | 'rich_text';
          internal_note?: string | null;
          phase_id?: string | null;
          workstream: AnnualConferenceWorkstream;
          accountable_owner?: string | null;
          collaborators?: string[];
          priority?: AnnualConferenceTaskPriority | null;
          target_date?: string | null;
          status?: AnnualConferenceTaskStatus;
          dependency_task_ids?: string[];
          dependency_note?: string | null;
          source?: 'excel_seed' | 'manual';
          source_row?: number | null;
          sort_order?: number;
          board_entered_at?: string | null;
          created_by_email?: string | null;
          updated_by_email?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          edition_id?: string;
          title?: string;
          details?: string | null;
          details_format?: 'plain_text' | 'rich_text';
          internal_note?: string | null;
          phase_id?: string | null;
          workstream?: AnnualConferenceWorkstream;
          accountable_owner?: string | null;
          collaborators?: string[];
          priority?: AnnualConferenceTaskPriority | null;
          target_date?: string | null;
          status?: AnnualConferenceTaskStatus;
          dependency_task_ids?: string[];
          dependency_note?: string | null;
          source?: 'excel_seed' | 'manual';
          source_row?: number | null;
          sort_order?: number;
          board_entered_at?: string | null;
          created_by_email?: string | null;
          updated_by_email?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_conference_tasks_edition_id_fkey';
            columns: ['edition_id'];
            isOneToOne: false;
            referencedRelation: 'annual_conference_editions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'annual_conference_tasks_phase_id_fkey';
            columns: ['phase_id'];
            isOneToOne: false;
            referencedRelation: 'annual_conference_phases';
            referencedColumns: ['id'];
          },
        ];
      };
      annual_conference_task_resources: {
        Row: {
          id: string;
          task_id: string;
          url: string;
          label: string | null;
          created_by_email: string;
          updated_by_email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          url: string;
          label?: string | null;
          created_by_email: string;
          updated_by_email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          url?: string;
          label?: string | null;
          created_by_email?: string;
          updated_by_email?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_conference_task_resources_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'annual_conference_tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      community_events: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          series_type: CommunityEventSeriesType | null;
          starts_at: string;
          ends_at: string;
          status: CommunityEventStatus;
          cover_url: string;
          location_label: string | null;
          location_name: string;
          location_url: string | null;
          stream_url: string | null;
          embed_stream: boolean;
          registration_url: string | null;
          schedule: Json[];
          speakers: Json[];
          photos: Json[];
          videos: Json[];
          publish_to_website: boolean;
          event_ownership: CommunityEventOwnership;
          event_format: CommunityEventFormat;
          submission_source: CommunityEventSubmissionSource;
          moderation_status: CommunityEventModerationStatus | null;
          publication_status: CommunityEventPublicationStatus;
          timezone: string;
          location_type: CommunityEventLocationType;
          venue_address: string | null;
          online_url: string | null;
          organizer_name: string | null;
          organizer_url: string | null;
          source_submission_id: string | null;
          website_source_id: string | null;
          external_source: string | null;
          external_id: string | null;
          external_url: string | null;
          external_synced_at: string | null;
          deleted_at: string | null;
          deleted_by_email: string | null;
          delete_reason: string | null;
          restore_until: string | null;
          deletion_snapshot: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          series_type?: CommunityEventSeriesType | null;
          starts_at: string;
          ends_at: string;
          status?: CommunityEventStatus;
          cover_url: string;
          location_label?: string | null;
          location_name: string;
          location_url?: string | null;
          stream_url?: string | null;
          embed_stream?: boolean;
          registration_url?: string | null;
          schedule?: Json[];
          speakers?: Json[];
          photos?: Json[];
          videos?: Json[];
          publish_to_website?: boolean;
          event_ownership?: CommunityEventOwnership;
          event_format?: CommunityEventFormat;
          submission_source?: CommunityEventSubmissionSource;
          moderation_status?: CommunityEventModerationStatus | null;
          publication_status?: CommunityEventPublicationStatus;
          timezone?: string;
          location_type?: CommunityEventLocationType;
          venue_address?: string | null;
          online_url?: string | null;
          organizer_name?: string | null;
          organizer_url?: string | null;
          source_submission_id?: string | null;
          website_source_id?: string | null;
          external_source?: string | null;
          external_id?: string | null;
          external_url?: string | null;
          external_synced_at?: string | null;
          deleted_at?: string | null;
          deleted_by_email?: string | null;
          delete_reason?: string | null;
          restore_until?: string | null;
          deletion_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          series_type?: CommunityEventSeriesType | null;
          starts_at?: string;
          ends_at?: string;
          status?: CommunityEventStatus;
          cover_url?: string;
          location_label?: string | null;
          location_name?: string;
          location_url?: string | null;
          stream_url?: string | null;
          embed_stream?: boolean;
          registration_url?: string | null;
          schedule?: Json[];
          speakers?: Json[];
          photos?: Json[];
          videos?: Json[];
          publish_to_website?: boolean;
          event_ownership?: CommunityEventOwnership;
          event_format?: CommunityEventFormat;
          submission_source?: CommunityEventSubmissionSource;
          moderation_status?: CommunityEventModerationStatus | null;
          publication_status?: CommunityEventPublicationStatus;
          timezone?: string;
          location_type?: CommunityEventLocationType;
          venue_address?: string | null;
          online_url?: string | null;
          organizer_name?: string | null;
          organizer_url?: string | null;
          source_submission_id?: string | null;
          website_source_id?: string | null;
          external_source?: string | null;
          external_id?: string | null;
          external_url?: string | null;
          external_synced_at?: string | null;
          deleted_at?: string | null;
          deleted_by_email?: string | null;
          delete_reason?: string | null;
          restore_until?: string | null;
          deletion_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_page_monitors: {
        Row: {
          event_id: string;
          enabled: boolean;
          source_url: string;
          status: 'pending' | 'unchanged' | 'changed' | 'warning' | 'unavailable' | 'unmonitorable';
          baseline: Json;
          last_observed: Json | null;
          differences: Json;
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
        Insert: {
          event_id: string;
          enabled?: boolean;
          source_url: string;
          status?: 'pending' | 'unchanged' | 'changed' | 'warning' | 'unavailable' | 'unmonitorable';
          baseline?: Json;
          last_observed?: Json | null;
          differences?: Json;
          consecutive_failures?: number;
          last_http_status?: number | null;
          last_error?: string | null;
          last_checked_at?: string | null;
          next_check_at?: string | null;
          last_change_fingerprint?: string | null;
          last_alerted_fingerprint?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          event_id?: string;
          enabled?: boolean;
          source_url?: string;
          status?: 'pending' | 'unchanged' | 'changed' | 'warning' | 'unavailable' | 'unmonitorable';
          baseline?: Json;
          last_observed?: Json | null;
          differences?: Json;
          consecutive_failures?: number;
          last_http_status?: number | null;
          last_error?: string | null;
          last_checked_at?: string | null;
          next_check_at?: string | null;
          last_change_fingerprint?: string | null;
          last_alerted_fingerprint?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_page_monitors_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'community_events';
            referencedColumns: ['id'];
          },
        ];
      };
      event_submissions: {
        Row: {
          id: string;
          title: string;
          summary: string;
          event_format: CommunityEventFormat;
          starts_at: string;
          ends_at: string;
          timezone: string;
          location_type: CommunityEventLocationType;
          location_name: string | null;
          venue_name: string | null;
          venue_address: string | null;
          online_url: string | null;
          registration_url: string | null;
          organizer_name: string;
          organizer_email: string;
          organizer_website: string | null;
          submitter_notes: string | null;
          cover_url: string | null;
          source_app: string;
          review_status: CommunityEventModerationStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_category: string | null;
          organizer_message: string | null;
          internal_note: string | null;
          approved_event_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          summary: string;
          event_format: CommunityEventFormat;
          starts_at: string;
          ends_at: string;
          timezone: string;
          location_type: CommunityEventLocationType;
          location_name?: string | null;
          venue_name?: string | null;
          venue_address?: string | null;
          online_url?: string | null;
          registration_url?: string | null;
          organizer_name: string;
          organizer_email: string;
          organizer_website?: string | null;
          submitter_notes?: string | null;
          cover_url?: string | null;
          source_app?: string;
          review_status?: CommunityEventModerationStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_category?: string | null;
          organizer_message?: string | null;
          internal_note?: string | null;
          approved_event_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['event_submissions']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'event_submissions_approved_event_id_fkey';
            columns: ['approved_event_id'];
            isOneToOne: false;
            referencedRelation: 'community_events';
            referencedColumns: ['id'];
          },
        ];
      };
      event_submission_email_deliveries: {
        Row: {
          id: string;
          submission_id: string;
          amendment_id: string | null;
          kind: EventSubmissionEmailKind;
          status: EventSubmissionEmailDeliveryStatus;
          attempts: number;
          provider_id: string | null;
          idempotency_key: string;
          last_error: string | null;
          last_attempt_at: string | null;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          amendment_id?: string | null;
          kind: EventSubmissionEmailKind;
          status?: EventSubmissionEmailDeliveryStatus;
          attempts?: number;
          provider_id?: string | null;
          idempotency_key: string;
          last_error?: string | null;
          last_attempt_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['event_submission_email_deliveries']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'event_submission_email_deliveries_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'event_submissions';
            referencedColumns: ['id'];
          },
        ];
      };
      event_submission_management_links: {
        Row: { id: string; submission_id: string; expires_at: string; revoked_at: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; submission_id: string; expires_at: string; revoked_at?: string | null; created_at?: string; updated_at?: string; };
        Update: Partial<Database['public']['Tables']['event_submission_management_links']['Insert']>;
        Relationships: [];
      };
      event_submission_amendments: {
        Row: { id: string; submission_id: string; status: string; starts_at: string; ends_at: string; timezone: string; location_type: CommunityEventLocationType; venue_name: string | null; venue_address: string | null; online_url: string | null; registration_url: string | null; cover_url: string | null; organizer_note: string | null; reviewed_by: string | null; reviewed_at: string | null; decision_message: string | null; created_at: string; updated_at: string; };
        Insert: { id?: string; submission_id: string; status?: string; starts_at: string; ends_at: string; timezone?: string; location_type: CommunityEventLocationType; venue_name?: string | null; venue_address?: string | null; online_url?: string | null; registration_url?: string | null; cover_url?: string | null; organizer_note?: string |null; reviewed_by?: string | null; reviewed_at?: string | null; decision_message?: string | null; created_at?: string; updated_at?: string; };
        Update: Partial<Database['public']['Tables']['event_submission_amendments']['Insert']>;
        Relationships: [];
      };
      event_submission_replies: {
        Row: {
          id: string;
          submission_id: string;
          webhook_event_id: string;
          resend_email_id: string;
          sender_email: string;
          subject: string;
          body_text: string;
          received_at: string;
          attachments: Json;
          slack_status: EventSubmissionReplySlackStatus;
          slack_error: string | null;
          slack_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          webhook_event_id: string;
          resend_email_id: string;
          sender_email: string;
          subject?: string;
          body_text?: string;
          received_at: string;
          attachments?: Json;
          slack_status?: EventSubmissionReplySlackStatus;
          slack_error?: string | null;
          slack_sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['event_submission_replies']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'event_submission_replies_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'event_submissions';
            referencedColumns: ['id'];
          },
        ];
      };
      event_registration_campaigns: {
        Row: {
          id: string;
          event_id: string;
          status: EventRegistrationCampaignStatus;
          description: string | null;
          capacity: number;
          blast_transactional_reserve: number | null;
          opens_at: string | null;
          closes_at: string | null;
          waitlist_enabled: boolean;
          auto_confirm: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          status?: EventRegistrationCampaignStatus;
          description?: string | null;
          capacity?: number;
          blast_transactional_reserve?: number | null;
          opens_at?: string | null;
          closes_at?: string | null;
          waitlist_enabled?: boolean;
          auto_confirm?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          status?: EventRegistrationCampaignStatus;
          description?: string | null;
          capacity?: number;
          blast_transactional_reserve?: number | null;
          opens_at?: string | null;
          closes_at?: string | null;
          waitlist_enabled?: boolean;
          auto_confirm?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_registration_campaigns_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'community_events';
            referencedColumns: ['id'];
          },
        ];
      };
      event_blasts: {
        Row: {
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
          recipient_snapshot: Json;
          prepared_recipient_count: number;
          preparation_error: string | null;
          created_by_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          subject: string;
          body: string;
          status: EventBlastStatus;
          recipient_count: number;
          scheduled_for?: string | null;
          sent_at?: string | null;
          provider_broadcast_id?: string | null;
          provider_segment_id?: string | null;
          recipient_snapshot?: Json;
          prepared_recipient_count?: number;
          preparation_error?: string | null;
          created_by_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          subject?: string;
          body?: string;
          status?: EventBlastStatus;
          recipient_count?: number;
          scheduled_for?: string | null;
          sent_at?: string | null;
          provider_broadcast_id?: string | null;
          provider_segment_id?: string | null;
          recipient_snapshot?: Json;
          prepared_recipient_count?: number;
          preparation_error?: string | null;
          created_by_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_blasts_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'community_events';
            referencedColumns: ['id'];
          },
        ];
      };
      event_blast_segment_slots: {
        Row: {
          slot_number: number;
          provider_segment_id: string | null;
          status: string;
          active_event_id: string | null;
          active_blast_id: string | null;
          terminal_confirmed_at: string | null;
          last_error: string | null;
          updated_at: string;
        };
        Insert: {
          slot_number: number;
          provider_segment_id?: string | null;
          status?: string;
          active_event_id?: string | null;
          active_blast_id?: string | null;
          terminal_confirmed_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Update: {
          slot_number?: number;
          provider_segment_id?: string | null;
          status?: string;
          active_event_id?: string | null;
          active_blast_id?: string | null;
          terminal_confirmed_at?: string | null;
          last_error?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_registrations: {
        Row: {
          id: string;
          campaign_id: string;
          name: string;
          email: string;
          normalized_email: string;
          status: EventRegistrationStatus;
          confirmed_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          name: string;
          email: string;
          normalized_email: string;
          status: EventRegistrationStatus;
          confirmed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          name?: string;
          email?: string;
          normalized_email?: string;
          status?: EventRegistrationStatus;
          confirmed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_registrations_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'event_registration_campaigns';
            referencedColumns: ['id'];
          },
        ];
      };
      event_registration_checkins: {
        Row: {
          id: string;
          registration_id: string;
          checked_in_at: string;
          checked_in_by_email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          registration_id: string;
          checked_in_at?: string;
          checked_in_by_email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          registration_id?: string;
          checked_in_at?: string;
          checked_in_by_email?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_registration_checkins_registration_id_fkey';
            columns: ['registration_id'];
            isOneToOne: true;
            referencedRelation: 'event_registrations';
            referencedColumns: ['id'];
          },
        ];
      };
      registration_email_deliveries: {
        Row: {
          id: string;
          registration_id: string;
          kind: string;
          status: RegistrationEmailDeliveryStatus;
          attempts: number;
          provider_id: string | null;
          idempotency_key: string;
          last_error: string | null;
          last_attempt_at: string | null;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          registration_id: string;
          kind?: string;
          status?: RegistrationEmailDeliveryStatus;
          attempts?: number;
          provider_id?: string | null;
          idempotency_key: string;
          last_error?: string | null;
          last_attempt_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          registration_id?: string;
          kind?: string;
          status?: RegistrationEmailDeliveryStatus;
          attempts?: number;
          provider_id?: string | null;
          idempotency_key?: string;
          last_error?: string | null;
          last_attempt_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'registration_email_deliveries_registration_id_fkey';
            columns: ['registration_id'];
            isOneToOne: false;
            referencedRelation: 'event_registrations';
            referencedColumns: ['id'];
          },
        ];
      };
      feedback_testers: {
        Row: {
          id: string;
          display_name: string;
          email: string | null;
          active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          display_name: string;
          email?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          email?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      feedback_submissions: {
        Row: {
          id: string;
          tester_id: string | null;
          event_id: string | null;
          campaign_id: string | null;
          tester_name: string;
          tester_email: string | null;
          type: FeedbackKind;
          message: string;
          structured_answers: unknown[];
          response_token_hash: string | null;
          trigger_source: string | null;
          page_path: string | null;
          user_agent: string | null;
          viewport_width: number | null;
          viewport_height: number | null;
          status: FeedbackStatus;
          admin_note: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tester_id?: string | null;
          event_id?: string | null;
          campaign_id?: string | null;
          tester_name: string;
          tester_email?: string | null;
          type: FeedbackKind;
          message: string;
          structured_answers?: unknown[];
          response_token_hash?: string | null;
          trigger_source?: string | null;
          page_path?: string | null;
          user_agent?: string | null;
          viewport_width?: number | null;
          viewport_height?: number | null;
          status?: FeedbackStatus;
          admin_note?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tester_id?: string | null;
          event_id?: string | null;
          campaign_id?: string | null;
          tester_name?: string;
          tester_email?: string | null;
          type?: FeedbackKind;
          message?: string;
          structured_answers?: unknown[];
          response_token_hash?: string | null;
          trigger_source?: string | null;
          page_path?: string | null;
          user_agent?: string | null;
          viewport_width?: number | null;
          viewport_height?: number | null;
          status?: FeedbackStatus;
          admin_note?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'feedback_submissions_tester_id_fkey';
            columns: ['tester_id'];
            isOneToOne: false;
            referencedRelation: 'feedback_testers';
            referencedColumns: ['id'];
          },
        ];
      };
      feedback_campaigns: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          intro: string | null;
          status: FeedbackCampaignStatus;
          auto_open_on_event_completion: boolean;
          opens_at: string | null;
          closes_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          title: string;
          intro?: string | null;
          status?: FeedbackCampaignStatus;
          auto_open_on_event_completion?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          title?: string;
          intro?: string | null;
          status?: FeedbackCampaignStatus;
          auto_open_on_event_completion?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      feedback_questions: {
        Row: {
          id: string;
          campaign_id: string;
          type: FeedbackQuestionType;
          label: string;
          required: boolean;
          options: unknown[];
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          type: FeedbackQuestionType;
          label: string;
          required?: boolean;
          options?: unknown[];
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          type?: FeedbackQuestionType;
          label?: string;
          required?: boolean;
          options?: unknown[];
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'feedback_questions_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'feedback_campaigns';
            referencedColumns: ['id'];
          },
        ];
      };
      quiz_sessions: {
        Row: {
          id: string;
          event_id: string;
          join_code: string;
          status: QuizStatus;
          current_question_index: number;
          question_phase: QuizQuestionPhase | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
          question_started_at: string | null;
          phase_started_at: string | null;
          expires_at: string | null;
          released_question_ids: string[];
          purpose: QuizPurpose;
          generated_question_count: number;
          skipped_question_ids: string[];
        };
        Insert: {
          id?: string;
          event_id: string;
          join_code: string;
          status?: QuizStatus;
          current_question_index?: number;
          question_phase?: QuizQuestionPhase | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          question_started_at?: string | null;
          phase_started_at?: string | null;
          expires_at?: string | null;
          released_question_ids?: string[];
          purpose?: QuizPurpose;
          generated_question_count?: number;
          skipped_question_ids?: string[];
        };
        Update: Partial<Database['public']['Tables']['quiz_sessions']['Insert']>;
        Relationships: [];
      };
      quiz_questions: {
        Row: {
          id: string;
          quiz_session_id: string;
          question_text: string;
          options: string[];
          correct_index: number;
          time_limit_seconds: number;
          points: number;
          order_index: number;
          created_at: string;
          explanation: string | null;
          source_url: string | null;
          authoring_source: 'manual' | 'generated';
          difficulty: 'foundational' | 'intermediate' | 'advanced';
          category: string | null;
        };
        Insert: {
          id?: string;
          quiz_session_id: string;
          question_text: string;
          options: string[];
          correct_index: number;
          time_limit_seconds?: number;
          points?: number;
          order_index: number;
          created_at?: string;
          explanation?: string | null;
          source_url?: string | null;
          authoring_source?: 'manual' | 'generated';
          difficulty?: 'foundational' | 'intermediate' | 'advanced';
          category?: string | null;
        };
        Update: Partial<Database['public']['Tables']['quiz_questions']['Insert']>;
        Relationships: [];
      };
      quiz_responses: {
        Row: {
          id: string;
          question_id: string;
          user_id: string;
          answer_index: number | null;
          answered_at: string | null;
          time_taken_ms: number | null;
          points_awarded: number;
          is_correct: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          user_id: string;
          answer_index?: number | null;
          answered_at?: string | null;
          time_taken_ms?: number | null;
          points_awarded?: number;
          is_correct?: boolean | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['quiz_responses']['Insert']>;
        Relationships: [];
      };
      quiz_participants: {
        Row: {
          id: string;
          quiz_session_id: string;
          user_id: string;
          nickname_used: string;
          enforce_unique_name: boolean;
          nickname_key: string | null;
          total_score: number;
          current_streak: number;
          joined_at: string;
        };
        Insert: {
          id?: string;
          quiz_session_id: string;
          user_id: string;
          nickname_used: string;
          enforce_unique_name?: boolean;
          total_score?: number;
          current_streak?: number;
          joined_at?: string;
        };
        Update: {
          id?: string;
          quiz_session_id?: string;
          user_id?: string;
          nickname_used?: string;
          enforce_unique_name?: boolean;
          total_score?: number;
          current_streak?: number;
          joined_at?: string;
        };
        Relationships: [];
      };
      public_rate_limit_buckets: {
        Row: {
          action: string;
          key_hash: string;
          window_started_at: string;
          attempt_count: number;
          updated_at: string;
        };
        Insert: {
          action: string;
          key_hash: string;
          window_started_at?: string;
          attempt_count?: number;
          updated_at?: string;
        };
        Update: {
          action?: string;
          key_hash?: string;
          window_started_at?: string;
          attempt_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      speaker_submissions: {
        Row: {
          id: string;
          event_id: string;
          kind: 'talk' | 'product_demo';
          speaker_name: string;
          speaker_email: string;
          github_username: string | null;
          title: string;
          topic: string;
          abstract: string | null;
          bio: string | null;
          resource_url: string | null;
          status: 'submitted' | 'selected' | 'not_selected' | 'withdrawn';
          internal_note: string | null;
          selected_intake_link_id: string | null;
          selected_talk_id: string | null;
          decided_at: string | null;
          decision_email_status: 'pending' | 'accepted' | 'failed' | null;
          decision_email_provider_id: string | null;
          decision_email_idempotency_key: string | null;
          decision_email_sent_at: string | null;
          decision_email_last_attempt_at: string | null;
          decision_email_last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          kind?: 'talk' | 'product_demo';
          speaker_name: string;
          speaker_email: string;
          github_username?: string | null;
          title: string;
          topic: string;
          abstract?: string | null;
          bio?: string | null;
          resource_url?: string | null;
          status?: 'submitted' | 'selected' | 'not_selected' | 'withdrawn';
          internal_note?: string | null;
          selected_intake_link_id?: string | null;
          selected_talk_id?: string | null;
          decided_at?: string | null;
          decision_email_status?: 'pending' | 'accepted' | 'failed' | null;
          decision_email_provider_id?: string | null;
          decision_email_idempotency_key?: string | null;
          decision_email_sent_at?: string | null;
          decision_email_last_attempt_at?: string | null;
          decision_email_last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          kind?: 'talk' | 'product_demo';
          speaker_name?: string;
          speaker_email?: string;
          github_username?: string | null;
          title?: string;
          topic?: string;
          abstract?: string | null;
          bio?: string | null;
          resource_url?: string | null;
          status?: 'submitted' | 'selected' | 'not_selected' | 'withdrawn';
          internal_note?: string | null;
          selected_intake_link_id?: string | null;
          selected_talk_id?: string | null;
          decided_at?: string | null;
          decision_email_status?: 'pending' | 'accepted' | 'failed' | null;
          decision_email_provider_id?: string | null;
          decision_email_idempotency_key?: string | null;
          decision_email_sent_at?: string | null;
          decision_email_last_attempt_at?: string | null;
          decision_email_last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'speaker_submissions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'community_events';
            referencedColumns: ['id'];
          },
        ];
      };
      speaker_intake_links: {
        Row: {
          id: string;
          event_id: string;
          event_month: string;
          kind: string;
          purpose: string;
          speaker_submission_id: string | null;
          speaker_name: string | null;
          speaker_email: string | null;
          talk_title: string | null;
          talk_id: string | null;
          requested_fields: string[];
          token_hash: string;
          email_status: string | null;
          email_provider_id: string | null;
          email_idempotency_key: string | null;
          email_sent_at: string | null;
          email_last_attempt_at: string | null;
          email_last_error: string | null;
          expires_at: string;
          claim_id: string | null;
          claimed_at: string | null;
          used_at: string | null;
          used_talk_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          event_month: string;
          kind?: string;
          purpose?: string;
          speaker_submission_id?: string | null;
          speaker_name?: string | null;
          speaker_email?: string | null;
          talk_title?: string | null;
          talk_id?: string | null;
          requested_fields?: string[];
          token_hash: string;
          email_status?: string | null;
          email_provider_id?: string | null;
          email_idempotency_key?: string | null;
          email_sent_at?: string | null;
          email_last_attempt_at?: string | null;
          email_last_error?: string | null;
          expires_at: string;
          claim_id?: string | null;
          claimed_at?: string | null;
          used_at?: string | null;
          used_talk_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          event_month?: string;
          kind?: string;
          purpose?: string;
          speaker_submission_id?: string | null;
          speaker_name?: string | null;
          speaker_email?: string | null;
          talk_title?: string | null;
          talk_id?: string | null;
          requested_fields?: string[];
          token_hash?: string;
          email_status?: string | null;
          email_provider_id?: string | null;
          email_idempotency_key?: string | null;
          email_sent_at?: string | null;
          email_last_attempt_at?: string | null;
          email_last_error?: string | null;
          expires_at?: string;
          claim_id?: string | null;
          claimed_at?: string | null;
          used_at?: string | null;
          used_talk_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'speaker_intake_links_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'community_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'speaker_intake_links_speaker_submission_id_fkey';
            columns: ['speaker_submission_id'];
            isOneToOne: false;
            referencedRelation: 'speaker_submissions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      acquire_volunteer_follow_up_drain_lease: {
        Args: { p_campaign_id: string; p_lease_token: string };
        Returns: boolean;
      };
      renew_volunteer_follow_up_drain_lease: {
        Args: { p_campaign_id: string; p_lease_token: string };
        Returns: boolean;
      };
      release_volunteer_follow_up_drain_lease: {
        Args: { p_campaign_id: string; p_lease_token: string };
        Returns: boolean;
      };
      claim_volunteer_follow_up_recipient: {
        Args: { p_campaign_id: string; p_safe_slots: number; p_lease_token: string };
        Returns: VolunteerFollowUpRecipientRow[];
      };
      save_volunteer_follow_up_decision: {
        Args: {
          p_recipient_id: string;
          p_expected_version: number;
          p_decision: string;
          p_review_status: string;
          p_review_note: string;
          p_actor: string;
        };
        Returns: VolunteerFollowUpRecipientRow[];
      };
      create_volunteer_follow_up_outcome_preview: {
        Args: { p_campaign_id: string; p_decision: string; p_actor: string };
        Returns: Array<{
          preview_id: string;
          eligible_count: number;
          excluded_count: number;
          recipients: unknown;
        }>;
      };
      confirm_volunteer_follow_up_outcome_preview: {
        Args: { p_preview_id: string; p_actor: string };
        Returns: Array<{ queued_count: number; delivery_ids: string[] }>;
      };
      save_volunteer_follow_up_outcome_preview_payloads: {
        Args: { p_preview_id: string; p_actor: string; p_payloads: unknown };
        Returns: boolean;
      };
      read_volunteer_follow_up_outcome_preview: {
        Args: { p_preview_id: string; p_actor: string };
        Returns: Array<{
          campaign_id: string;
          decision: string;
          recipients: unknown;
          eligible_count: number;
          excluded_count: number;
          expires_at: string;
          confirmed_at: string | null;
        }>;
      };
      claim_event_blast_segment_slot: {
        Args: { p_blast_id: string; p_event_id: string };
        Returns: Array<{
          slot_number: number;
          provider_segment_id: string | null;
          status: string;
          active_event_id: string | null;
          active_blast_id: string | null;
          terminal_confirmed_at: string | null;
          last_error: string | null;
          updated_at: string;
        }>;
      };
      set_event_blast_segment_slot_provider_id: {
        Args: { p_blast_id: string; p_slot_number: number; p_provider_segment_id: string };
        Returns: boolean;
      };
      mark_event_blast_segment_terminal: {
        Args: { p_blast_id: string; p_slot_number: number };
        Returns: boolean;
      };
      release_event_blast_segment_slot: {
        Args: { p_blast_id: string; p_slot_number: number };
        Returns: boolean;
      };
      record_event_blast_segment_slot_error: {
        Args: { p_blast_id: string; p_slot_number: number; p_last_error: string };
        Returns: boolean;
      };
      list_event_blast_segment_slots: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          slot_number: number;
          provider_segment_id: string | null;
          status: string;
          active_event_id: string | null;
          active_blast_id: string | null;
          terminal_confirmed_at: string | null;
          last_error: string | null;
          updated_at: string;
        }>;
      };
      claim_volunteer_follow_up_outcome: {
        Args: { p_campaign_id: string; p_safe_slots: number; p_claim_token: string; p_lease_token: string };
        Returns: Array<Record<string, unknown>>;
      };
      validate_volunteer_follow_up_outcome_send: {
        Args: { p_delivery_id: string; p_claim_token: string; p_lease_token: string };
        Returns: boolean;
      };
      finalize_volunteer_follow_up_outcome_send: {
        Args: {
          p_delivery_id: string;
          p_claim_token: string;
          p_status: string;
          p_provider_email_id: string | null;
          p_last_error: string | null;
          p_next_attempt_at: string | null;
        };
        Returns: boolean;
      };
      configure_project_night: {
        Args: { p_event_id: string; p_action: string };
        Returns: ProjectNightRecurrenceRow;
      };
      advance_project_night: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      register_for_event: {
        Args: {
          p_event_id: string;
          p_name: string;
          p_email: string;
        };
        Returns: Database['public']['Tables']['event_registrations']['Row'];
      };
      cancel_registration_and_promote: {
        Args: {
          p_registration_id: string;
        };
        Returns: {
          cancelled: boolean;
          promoted_registration_id: string | null;
        }[];
      };
      consume_public_rate_limit: {
        Args: {
          p_action: string;
          p_key_hash: string;
          p_max_attempts: number;
          p_window_seconds: number;
        };
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      ensure_active_short_link: {
        Args: {
          input_destination: ShortLinkDestination;
          input_event_id: string | null;
          input_conference_edition_id: string | null;
          input_code: string;
          input_created_by_membership_id: string;
        };
        Returns: Database['public']['Tables']['short_links']['Row'][];
      };
      regenerate_active_short_link: {
        Args: {
          input_link_id: string;
          input_code: string;
          input_created_by_membership_id: string;
        };
        Returns: Database['public']['Tables']['short_links']['Row'][];
      };
      archive_community_event: {
        Args: {
          p_event_id: string;
          p_deleted_by_email: string;
          p_delete_reason?: string | null;
          p_restore_days?: number;
        };
        Returns: Database['public']['Tables']['community_events']['Row'][];
      };
      restore_archived_community_event: {
        Args: { p_event_id: string };
        Returns: Database['public']['Tables']['community_events']['Row'][];
      };
      hard_delete_community_event: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      approve_event_submission: {
        Args: {
          p_submission_id: string;
          p_reviewed_by: string;
          p_publish: boolean;
        };
        Returns: Database['public']['Tables']['event_submissions']['Row'];
      };
      reject_event_submission: {
        Args: {
          p_submission_id: string;
          p_reviewed_by: string;
          p_category: string;
          p_organizer_message: string;
          p_internal_note: string;
        };
        Returns: Database['public']['Tables']['event_submissions']['Row'];
      };
      merge_quiz_participant_users: {
        Args: {
          p_target_user_id: string;
          p_source_user_id: string;
        };
        Returns: undefined;
      };
      submit_quiz_answer: {
        Args: {
          p_session_id: string;
          p_user_id: string;
          p_answer_index: number;
        };
        Returns: {
          accepted: boolean;
          is_correct: boolean;
          points_awarded: number;
          correct_index: number;
          streak_count: number;
        }[];
      };
      prepare_system_design_presentation: {
        Args: { p_session_id: string };
        Returns: Database['public']['Tables']['quiz_sessions']['Row'];
      };
      release_system_design_question: {
        Args: { p_session_id: string };
        Returns: Database['public']['Tables']['quiz_sessions']['Row'];
      };
      present_system_design_question: {
        Args: { p_session_id: string };
        Returns: Database['public']['Tables']['quiz_sessions']['Row'];
      };
      start_system_design_question: {
        Args: { p_session_id: string };
        Returns: Database['public']['Tables']['quiz_sessions']['Row'];
      };
      advance_system_design_question: {
        Args: { p_session_id: string };
        Returns: Database['public']['Tables']['quiz_sessions']['Row'];
      };
      reveal_system_design_question: {
        Args: { p_session_id: string };
        Returns: Database['public']['Tables']['quiz_sessions']['Row'];
      };
      skip_system_design_question: {
        Args: { p_session_id: string };
        Returns: Database['public']['Tables']['quiz_sessions']['Row'];
      };
      get_quiz_state_analytics: {
        Args: { p_session_id: string; p_user_id?: string | null };
        Returns: Json;
      };
      reorder_quiz_questions: {
        Args: { p_session_id: string; p_question_ids: string[] };
        Returns: undefined;
      };
      advance_quiz_session_state: {
        Args: { p_session_id: string };
        Returns: Json;
      };
      claim_speaker_intake_link: {
        Args: {
          p_event_id: string;
          p_token_hash: string;
          p_claim_id: string;
        };
        Returns: Database['public']['Tables']['speaker_intake_links']['Row'];
      };
      consume_speaker_intake_link: {
        Args: {
          p_event_id: string;
          p_token_hash: string;
          p_claim_id: string;
          p_talk_id: string;
        };
        Returns: Database['public']['Tables']['speaker_intake_links']['Row'];
      };
      release_speaker_intake_link_claim: {
        Args: {
          p_event_id: string;
          p_token_hash: string;
          p_claim_id: string;
        };
        Returns: boolean;
      };
      accept_annual_conference_speaker_proposal: {
        Args: {
          p_submission_id: string;
          p_session_id: string;
          p_link_id: string;
          p_token_hash: string;
          p_deadline: string;
          p_email_idempotency_key: string;
          p_internal_note: string;
        };
        Returns: Array<{ session_id: string; link_id: string }>;
      };
      reject_annual_conference_speaker_proposal: {
        Args: {
          p_submission_id: string;
          p_email_idempotency_key: string;
          p_internal_note: string;
        };
        Returns: string;
      };
      rotate_annual_conference_speaker_workspace: {
        Args: {
          p_submission_id: string;
          p_expected_link_id: string | null;
          p_link_id: string;
          p_token_hash: string;
          p_deadline: string;
          p_email_idempotency_key: string;
          p_email_recipient: string;
          p_allow_accepted?: boolean;
        };
        Returns: string;
      };
      claim_annual_conference_speaker_email_attempt: {
        Args: {
          p_submission_id: string;
          p_expected_idempotency_key: string;
          p_expected_attempt_count: number;
          p_attempted_at: string;
          p_allow_non_retryable?: boolean;
        };
        Returns: boolean;
      };
      replace_annual_conference_speaker_email_recipient: {
        Args: {
          p_submission_id: string;
          p_expected_idempotency_key: string | null;
          p_expected_attempt_count: number;
          p_email_recipient: string;
          p_email_idempotency_key: string;
        };
        Returns: boolean;
      };
      apply_annual_conference_speaker_email_event: {
        Args: {
          p_provider_email_id: string;
          p_status: string;
          p_event_at: string;
          p_delivered_at: string | null;
          p_last_error: string | null;
          p_retryable: boolean;
        };
        Returns: boolean;
      };
      review_event_submission_amendment: {
        Args: { p_amendment_id: string; p_reviewed_by: string; p_approve: boolean; p_message: string };
        Returns: Database['public']['Tables']['event_submission_amendments']['Row'];
      };
      withdraw_event_submission: {
        Args: { p_submission_id: string; p_reviewed_by: string; p_message: string };
        Returns: Database['public']['Tables']['event_submissions']['Row'];
      };
      amend_annual_conference_income_expectation: {
        Args: {
          p_entry_id: string;
          p_next_amount_minor: number;
          p_reason: string;
          p_actor_email: string;
        };
        Returns: Database['public']['Tables']['annual_conference_finance_entries']['Row'];
      };
      record_annual_conference_income_receipt: {
        Args: {
          p_entry_id: string;
          p_amount_minor: number;
          p_received_date: string;
          p_payment_reference: string | null;
          p_notes: string | null;
          p_actor_email: string;
          p_idempotency_key: string;
        };
        Returns: Database['public']['Tables']['annual_conference_finance_entries']['Row'];
      };
      replace_app_json_document: {
        Args: {
          p_key: string;
          p_expected_version: number;
          p_data: Json;
        };
        Returns: Database['public']['Tables']['app_json_documents']['Row'];
      };
      cancel_annual_conference_income_expectation: {
        Args: {
          p_entry_id: string;
          p_reason: string;
          p_actor_email: string;
        };
        Returns: Database['public']['Tables']['annual_conference_finance_entries']['Row'];
      };
      resolve_active_short_link: {
        Args: { input_code: string };
        Returns: {
          id: string;
          destination: ShortLinkDestination;
          event_id: string | null;
          conference_edition_id: string | null;
        }[];
      };
    };
    Enums: {
      feedback_kind: FeedbackKind;
      feedback_status: FeedbackStatus;
      feedback_campaign_status: FeedbackCampaignStatus;
      feedback_question_type: FeedbackQuestionType;
      community_event_status: CommunityEventStatus;
      event_submission_email_kind: EventSubmissionEmailKind;
      event_submission_email_delivery_status: EventSubmissionEmailDeliveryStatus;
      event_registration_campaign_status: EventRegistrationCampaignStatus;
      event_registration_status: EventRegistrationStatus;
      registration_email_delivery_status: RegistrationEmailDeliveryStatus;
      admin_role: AdminRole;
      admin_membership_status: AdminMembershipStatus;
      short_link_destination: ShortLinkDestination;
      short_link_status: ShortLinkStatus;
      annual_conference_task_status: AnnualConferenceTaskStatus;
      annual_conference_workstream: AnnualConferenceWorkstream;
      annual_conference_task_priority: AnnualConferenceTaskPriority;
    };
    CompositeTypes: Record<string, never>;
  };
}
