import type { Context } from 'hono';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from './server';
import type { EventFeedbackSubmission, FeedbackCampaign, FeedbackQuestion } from '@/types';
import type { Database, Json } from '@/types/supabase';

type FeedbackCampaignRow = Database['public']['Tables']['feedback_campaigns']['Row'];
type FeedbackCampaignUpdate = Database['public']['Tables']['feedback_campaigns']['Update'];
type FeedbackQuestionRow = Database['public']['Tables']['feedback_questions']['Row'];

export function canUseSupabaseFeedbackCampaigns(c?: Context): boolean {
  return isSupabaseRuntimeEnabled(c);
}

function toFeedbackQuestion(row: FeedbackQuestionRow): FeedbackQuestion {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    required: row.required,
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    order_index: row.order_index,
  };
}

function toFeedbackCampaign(row: FeedbackCampaignRow, questions: FeedbackQuestionRow[]): FeedbackCampaign {
  return {
    id: row.id,
    event_id: row.event_id,
    title: row.title,
    intro: row.intro,
    status: row.status,
    auto_open_on_event_completion: row.auto_open_on_event_completion,
    opens_at: row.opens_at,
    closes_at: row.closes_at,
    questions: questions
      .map(toFeedbackQuestion)
      .sort((a, b) => a.order_index - b.order_index),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getQuestionsForCampaign(campaignId: string, c?: Context): Promise<FeedbackQuestionRow[]> {
  const { data, error } = await getSupabaseAdminClient(c)
    .from('feedback_questions')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('order_index', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function getSupabaseFeedbackCampaignByEvent(eventId: string, c?: Context): Promise<FeedbackCampaign | null | undefined> {
  if (!canUseSupabaseFeedbackCampaigns(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('feedback_campaigns')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return undefined;
  return toFeedbackCampaign(data, await getQuestionsForCampaign(data.id, c));
}

export async function createSupabaseFeedbackCampaign(campaign: FeedbackCampaign, c?: Context): Promise<FeedbackCampaign | null> {
  if (!canUseSupabaseFeedbackCampaigns(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('feedback_campaigns')
    .insert({
      id: campaign.id,
      event_id: campaign.event_id,
      title: campaign.title,
      intro: campaign.intro,
      status: campaign.status,
      auto_open_on_event_completion: campaign.auto_open_on_event_completion,
      opens_at: campaign.opens_at,
      closes_at: campaign.closes_at,
      created_at: campaign.created_at,
      updated_at: campaign.updated_at,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (campaign.questions.length > 0) {
    const { error: questionError } = await getSupabaseAdminClient(c)
      .from('feedback_questions')
      .insert(campaign.questions.map((question) => ({
        id: question.id,
        campaign_id: data.id,
        type: question.type,
        label: question.label,
        required: question.required,
        options: question.options as Json[],
        order_index: question.order_index,
      })));

    if (questionError) {
      throw new Error(questionError.message);
    }
  }

  return toFeedbackCampaign(data, await getQuestionsForCampaign(data.id, c));
}

export async function updateSupabaseFeedbackCampaign(
  eventId: string,
  updates: Partial<Omit<FeedbackCampaign, 'id' | 'event_id' | 'created_at'>>,
  c?: Context,
): Promise<FeedbackCampaign | null | undefined> {
  if (!canUseSupabaseFeedbackCampaigns(c)) return null;

  const existing = await getSupabaseFeedbackCampaignByEvent(eventId, c);
  if (existing === null || existing === undefined) return existing;

  const update: FeedbackCampaignUpdate = {};
  if (typeof updates.title === 'string') update.title = updates.title;
  if ('intro' in updates) update.intro = updates.intro ?? null;
  if (typeof updates.status === 'string') update.status = updates.status;
  if (typeof updates.auto_open_on_event_completion === 'boolean') update.auto_open_on_event_completion = updates.auto_open_on_event_completion;
  if ('opens_at' in updates) update.opens_at = updates.opens_at ?? null;
  if ('closes_at' in updates) update.closes_at = updates.closes_at ?? null;
  if (typeof updates.updated_at === 'string') update.updated_at = updates.updated_at;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('feedback_campaigns')
    .update(update)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (updates.questions) {
    const { error: deleteError } = await getSupabaseAdminClient(c)
      .from('feedback_questions')
      .delete()
      .eq('campaign_id', existing.id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (updates.questions.length > 0) {
      const { error: insertError } = await getSupabaseAdminClient(c)
        .from('feedback_questions')
        .insert(updates.questions.map((question) => ({
          id: question.id,
          campaign_id: existing.id,
          type: question.type,
          label: question.label,
          required: question.required,
          options: question.options as Json[],
          order_index: question.order_index,
        })));

      if (insertError) {
        throw new Error(insertError.message);
      }
    }
  }

  return toFeedbackCampaign(data, await getQuestionsForCampaign(existing.id, c));
}

export async function deleteSupabaseFeedbackCampaignByEvent(eventId: string, c?: Context): Promise<FeedbackCampaign | null | undefined> {
  if (!canUseSupabaseFeedbackCampaigns(c)) return null;

  const existing = await getSupabaseFeedbackCampaignByEvent(eventId, c);
  if (!existing) return existing;

  const { error } = await getSupabaseAdminClient(c)
    .from('feedback_campaigns')
    .delete()
    .eq('id', existing.id);

  if (error) {
    throw new Error(error.message);
  }

  return existing;
}

export async function getSupabaseFeedbackSubmissionsByEvent(eventId: string, c?: Context): Promise<EventFeedbackSubmission[] | null> {
  if (!canUseSupabaseFeedbackCampaigns(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('feedback_submissions')
    .select('id, event_id, campaign_id, tester_name, tester_email, structured_answers, page_path, user_agent, response_token_hash, created_at')
    .eq('event_id', eventId)
    .eq('trigger_source', 'event_feedback_form')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    campaign_id: row.campaign_id ?? '',
    event_id: row.event_id ?? eventId,
    respondent_name: row.tester_name,
    respondent_email: row.tester_email,
    answers: Array.isArray(row.structured_answers) ? row.structured_answers as EventFeedbackSubmission['answers'] : [],
    page_path: row.page_path,
    user_agent: row.user_agent,
    response_token_hash: row.response_token_hash,
    created_at: row.created_at,
  }));
}

export async function createSupabaseEventFeedbackSubmission(
  data: Omit<EventFeedbackSubmission, 'id' | 'created_at'>,
  c?: Context,
): Promise<EventFeedbackSubmission | null> {
  if (!canUseSupabaseFeedbackCampaigns(c)) return null;

  const { data: row, error } = await getSupabaseAdminClient(c)
    .from('feedback_submissions')
    .insert({
      event_id: data.event_id,
      campaign_id: data.campaign_id,
      tester_name: data.respondent_name ?? 'Anonymous attendee',
      tester_email: data.respondent_email,
      type: 'suggestion',
      message: JSON.stringify(data.answers),
      structured_answers: data.answers as unknown as Json[],
      response_token_hash: data.response_token_hash ?? null,
      trigger_source: 'event_feedback_form',
      page_path: data.page_path,
      user_agent: data.user_agent,
    })
    .select('id, event_id, campaign_id, tester_name, tester_email, structured_answers, page_path, user_agent, response_token_hash, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: row.id,
    campaign_id: row.campaign_id ?? data.campaign_id,
    event_id: row.event_id ?? data.event_id,
    respondent_name: row.tester_name,
    respondent_email: row.tester_email,
    answers: Array.isArray(row.structured_answers) ? row.structured_answers as EventFeedbackSubmission['answers'] : [],
    page_path: row.page_path,
    user_agent: row.user_agent,
    response_token_hash: row.response_token_hash,
    created_at: row.created_at,
  };
}
