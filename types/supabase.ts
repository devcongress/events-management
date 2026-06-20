export type FeedbackKind = 'bug' | 'confusing' | 'suggestion' | 'praise';
export type FeedbackStatus = 'new' | 'reviewing' | 'done' | 'wont_fix';
export type FeedbackCampaignStatus = 'draft' | 'active' | 'closed';
export type FeedbackQuestionType = 'rating' | 'text' | 'choice' | 'talk_select' | 'yes_no';
export type CommunityEventStatus = 'draft' | 'cfp_open' | 'cfp_closed' | 'upcoming' | 'live' | 'completed';
export type CommunityEventSeriesType = 'monthly' | 'quarterly' | 'special';
export type AdminRole = 'owner' | 'organizer';
export type AdminMembershipStatus = 'active' | 'disabled';

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      feedback_kind: FeedbackKind;
      feedback_status: FeedbackStatus;
      feedback_campaign_status: FeedbackCampaignStatus;
      feedback_question_type: FeedbackQuestionType;
      community_event_status: CommunityEventStatus;
      admin_role: AdminRole;
      admin_membership_status: AdminMembershipStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
