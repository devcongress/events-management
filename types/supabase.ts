export type FeedbackKind = 'bug' | 'confusing' | 'suggestion' | 'praise';
export type FeedbackStatus = 'new' | 'reviewing' | 'done' | 'wont_fix';
export type FeedbackCampaignStatus = 'draft' | 'active' | 'closed';
export type FeedbackQuestionType = 'rating' | 'text' | 'choice' | 'talk_select' | 'yes_no';
export type CommunityEventStatus = 'draft' | 'cfp_open' | 'cfp_closed' | 'upcoming' | 'live' | 'completed';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      community_events: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
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
          trigger_source: string | null;
          page_path: string | null;
          user_agent: string | null;
          viewport_width: number | null;
          viewport_height: number | null;
          status: FeedbackStatus;
          admin_note: string | null;
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
          trigger_source?: string | null;
          page_path?: string | null;
          user_agent?: string | null;
          viewport_width?: number | null;
          viewport_height?: number | null;
          status?: FeedbackStatus;
          admin_note?: string | null;
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
          trigger_source?: string | null;
          page_path?: string | null;
          user_agent?: string | null;
          viewport_width?: number | null;
          viewport_height?: number | null;
          status?: FeedbackStatus;
          admin_note?: string | null;
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
    };
    CompositeTypes: Record<string, never>;
  };
}
