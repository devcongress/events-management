import { readData, updateData } from './index';
import type { LeaderboardEntry, Response } from '@/types';
import type { Database, Json } from '@/types/supabase';
import { generateId, now } from '@/lib/utils';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

const FILE = 'responses';
type ResponseRow = Database['public']['Tables']['quiz_responses']['Row'];

export interface AtomicQuizAnswerResult {
  accepted: boolean;
  is_correct: boolean;
  points_awarded: number;
  correct_index: number;
  streak_count: number;
}

export interface QuizStateAnalytics {
  participants_count: number;
  answers_count: number;
  leaderboard: LeaderboardEntry[];
  answer_distribution: { option_index: number; count: number; percentage: number }[];
  player_response: Response | null;
}

export class QuizAnswerConflictError extends Error {
  constructor(readonly reason: 'already_answered' | 'not_accepting' | 'too_late' | 'participant_missing') {
    super(reason);
    this.name = 'QuizAnswerConflictError';
  }
}

function fromSupabaseRow(row: ResponseRow): Response {
  return {
    id: row.id,
    question_id: row.question_id,
    user_id: row.user_id,
    answer_index: row.answer_index,
    answered_at: row.answered_at,
    time_taken_ms: row.time_taken_ms,
    points_awarded: row.points_awarded,
    is_correct: row.is_correct,
    created_at: row.created_at,
  };
}

export async function getAllResponses(): Promise<Response[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_responses').select('*').order('created_at', { ascending: true });
    if (error) throw new Error('Unable to load quiz responses');
    return (data ?? []).map(fromSupabaseRow);
  }
  return readData<Response>(FILE);
}

export async function getResponseById(id: string): Promise<Response | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_responses').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('Unable to load quiz response');
    return data ? fromSupabaseRow(data) : undefined;
  }
  const responses = await readData<Response>(FILE);
  return responses.find((response) => response.id === id);
}

export async function getResponsesByQuestion(questionId: string): Promise<Response[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_responses').select('*').eq('question_id', questionId).order('created_at');
    if (error) throw new Error('Unable to load question responses');
    return (data ?? []).map(fromSupabaseRow);
  }
  const responses = await readData<Response>(FILE);
  return responses.filter((response) => response.question_id === questionId);
}

export async function getResponsesByUser(userId: string): Promise<Response[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_responses').select('*').eq('user_id', userId).order('created_at');
    if (error) throw new Error('Unable to load user responses');
    return (data ?? []).map(fromSupabaseRow);
  }
  const responses = await readData<Response>(FILE);
  return responses.filter((response) => response.user_id === userId);
}

export async function getResponseByQuestionAndUser(
  questionId: string,
  userId: string,
): Promise<Response | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_responses').select('*').eq('question_id', questionId).eq('user_id', userId).maybeSingle();
    if (error) throw new Error('Unable to load quiz response');
    return data ? fromSupabaseRow(data) : undefined;
  }
  const responses = await readData<Response>(FILE);
  return responses.find((response) => response.question_id === questionId && response.user_id === userId);
}

export async function createResponse(data: Omit<Response, 'id' | 'created_at'>): Promise<Response> {
  const newResponse: Response = { ...data, id: generateId(), created_at: now() };
  if (isSupabaseRuntimeEnabled()) {
    const { data: stored, error } = await getSupabaseAdminClient()
      .from('quiz_responses').insert(newResponse).select('*').single();
    if (error?.code === '23505') throw new Error('Response already exists for this question and user');
    if (error || !stored) throw new Error('Unable to create quiz response');
    return fromSupabaseRow(stored);
  }
  return updateData<Response, Response>(FILE, (responses) => {
    if (responses.some((response) => response.question_id === data.question_id && response.user_id === data.user_id)) {
      throw new Error('Response already exists for this question and user');
    }
    return { data: [...responses, newResponse], result: newResponse };
  });
}

export async function updateResponse(
  id: string,
  updates: Partial<Omit<Response, 'id' | 'created_at'>>,
): Promise<Response> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_responses').update(updates).eq('id', id).select('*').single();
    if (error || !data) throw new Error(`Response ${id} not found`);
    return fromSupabaseRow(data);
  }
  return updateData<Response, Response>(FILE, (responses) => {
    const index = responses.findIndex((response) => response.id === id);
    if (index === -1) throw new Error(`Response ${id} not found`);
    const updated = { ...responses[index]!, ...updates };
    responses[index] = updated;
    return { data: responses, result: updated };
  });
}

export async function deleteResponse(id: string): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().from('quiz_responses').delete().eq('id', id);
    if (error) throw new Error('Unable to delete quiz response');
    return;
  }
  await updateData<Response, void>(FILE, (responses) => ({
    data: responses.filter((response) => response.id !== id), result: undefined,
  }));
}

export async function deleteResponsesByQuestionIds(questionIds: string[]): Promise<number> {
  if (questionIds.length === 0) return 0;
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_responses').delete().in('question_id', questionIds).select('id');
    if (error) throw new Error('Unable to clear quiz responses');
    return data?.length ?? 0;
  }
  const questionIdSet = new Set(questionIds);
  return updateData<Response, number>(FILE, (responses) => {
    const retained = responses.filter((response) => !questionIdSet.has(response.question_id));
    return { data: retained, result: responses.length - retained.length };
  });
}

export async function submitQuizAnswerAtomically(
  sessionId: string,
  userId: string,
  answerIndex: number,
): Promise<AtomicQuizAnswerResult | null> {
  if (!isSupabaseRuntimeEnabled()) return null;
  const { data, error } = await getSupabaseAdminClient().rpc('submit_quiz_answer', {
    p_session_id: sessionId,
    p_user_id: userId,
    p_answer_index: answerIndex,
  });
  if (error) {
    if (error.code === '23505' || error.message.includes('answer_already_submitted')) {
      throw new QuizAnswerConflictError('already_answered');
    }
    if (error.message.includes('answer_too_late')) throw new QuizAnswerConflictError('too_late');
    if (error.message.includes('participant_not_found')) throw new QuizAnswerConflictError('participant_missing');
    if (error.message.includes('quiz_not_accepting_answers') || error.message.includes('active_question_missing')) {
      throw new QuizAnswerConflictError('not_accepting');
    }
    throw new Error('Unable to submit quiz answer');
  }
  const result = data?.[0];
  if (!result) throw new Error('Quiz answer transaction returned no result');
  return result;
}

export async function getHostedQuizStateAnalytics(
  sessionId: string,
  userId?: string | null,
): Promise<QuizStateAnalytics | null> {
  if (!isSupabaseRuntimeEnabled()) return null;
  const { data, error } = await getSupabaseAdminClient().rpc('get_quiz_state_analytics', {
    p_session_id: sessionId,
    p_user_id: userId ?? null,
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Unable to load quiz state analytics');
  }
  const analytics = data as Record<string, Json | undefined>;
  return {
    participants_count: Number(analytics.participants_count ?? 0),
    answers_count: Number(analytics.answers_count ?? 0),
    leaderboard: (analytics.leaderboard ?? []) as unknown as LeaderboardEntry[],
    answer_distribution: (analytics.answer_distribution ?? []) as unknown as QuizStateAnalytics['answer_distribution'],
    player_response: (analytics.player_response ?? null) as unknown as Response | null,
  };
}
