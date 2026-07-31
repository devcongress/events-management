export type FeedbackKind = 'bug' | 'confusing' | 'suggestion' | 'praise';
export type FeedbackStatus = 'new' | 'reviewing' | 'done' | 'wont_fix';
export type FeedbackCampaignStatus = 'draft' | 'active' | 'closed';
export type FeedbackQuestionType = 'rating' | 'text' | 'choice' | 'talk_select' | 'yes_no';
export type CommunityEventStatus = 'draft' | 'cfp_open' | 'cfp_closed' | 'upcoming' | 'live' | 'completed';
export type CommunityEventSeriesType = 'monthly' | 'quarterly' | 'special';
export type EventRegistrationCampaignStatus = 'draft' | 'open' | 'closed';
export type EventRegistrationStatus = 'confirmed' | 'waitlisted' | 'cancelled';
export type RegistrationEmailDeliveryStatus = 'pending' | 'accepted' | 'failed';
export type EventBlastStatus = 'preparing' | 'scheduled' | 'sent' | 'needs_capacity' | 'failed';
export type AdminRole = 'owner' | 'organizer';
export type AdminMembershipStatus = 'active' | 'disabled';
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

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
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
      app_json_documents: {
        Row: {
          key: string;
          data: Json[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          data?: Json[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          data?: Json[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      annual_conference_editions: {
        Row: {
          id: string;
          year: number;
          name: string;
          label: string;
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
      annual_conference_tasks: {
        Row: {
          id: string;
          edition_id: string;
          title: string;
          details: string | null;
          internal_note: string | null;
          workstream: AnnualConferenceWorkstream;
          accountable_owner: string | null;
          collaborators: string[];
          priority: AnnualConferenceTaskPriority | null;
          target_date: string | null;
          status: AnnualConferenceTaskStatus;
          dependency_note: string | null;
          source: 'excel_seed' | 'manual';
          source_row: number | null;
          sort_order: number;
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
          internal_note?: string | null;
          workstream: AnnualConferenceWorkstream;
          accountable_owner?: string | null;
          collaborators?: string[];
          priority?: AnnualConferenceTaskPriority | null;
          target_date?: string | null;
          status?: AnnualConferenceTaskStatus;
          dependency_note?: string | null;
          source?: 'excel_seed' | 'manual';
          source_row?: number | null;
          sort_order?: number;
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
          internal_note?: string | null;
          workstream?: AnnualConferenceWorkstream;
          accountable_owner?: string | null;
          collaborators?: string[];
          priority?: AnnualConferenceTaskPriority | null;
          target_date?: string | null;
          status?: AnnualConferenceTaskStatus;
          dependency_note?: string | null;
          source?: 'excel_seed' | 'manual';
          source_row?: number | null;
          sort_order?: number;
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
          website_source_id: string | null;
          external_source: string | null;
          external_id: string | null;
          external_url: string | null;
          external_synced_at: string | null;
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
          website_source_id?: string | null;
          external_source?: string | null;
          external_id?: string | null;
          external_url?: string | null;
          external_synced_at?: string | null;
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
          website_source_id?: string | null;
          external_source?: string | null;
          external_id?: string | null;
          external_url?: string | null;
          external_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_registration_campaigns: {
        Row: {
          id: string;
          event_id: string;
          status: EventRegistrationCampaignStatus;
          capacity: number;
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
          capacity?: number;
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
          capacity?: number;
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
          status: 'submitted' | 'selected' | 'not_selected' | 'withdrawn';
          internal_note: string | null;
          selected_intake_link_id: string | null;
          selected_talk_id: string | null;
          decided_at: string | null;
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
          status?: 'submitted' | 'selected' | 'not_selected' | 'withdrawn';
          internal_note?: string | null;
          selected_intake_link_id?: string | null;
          selected_talk_id?: string | null;
          decided_at?: string | null;
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
          status?: 'submitted' | 'selected' | 'not_selected' | 'withdrawn';
          internal_note?: string | null;
          selected_intake_link_id?: string | null;
          selected_talk_id?: string | null;
          decided_at?: string | null;
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
    };
    Enums: {
      feedback_kind: FeedbackKind;
      feedback_status: FeedbackStatus;
      feedback_campaign_status: FeedbackCampaignStatus;
      feedback_question_type: FeedbackQuestionType;
      community_event_status: CommunityEventStatus;
      event_registration_campaign_status: EventRegistrationCampaignStatus;
      event_registration_status: EventRegistrationStatus;
      registration_email_delivery_status: RegistrationEmailDeliveryStatus;
      admin_role: AdminRole;
      admin_membership_status: AdminMembershipStatus;
      annual_conference_task_status: AnnualConferenceTaskStatus;
      annual_conference_workstream: AnnualConferenceWorkstream;
      annual_conference_task_priority: AnnualConferenceTaskPriority;
    };
    CompositeTypes: Record<string, never>;
  };
}
