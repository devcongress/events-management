import { readData, updateData } from './index';
import type { Question } from '@/types';
import type { Database } from '@/types/supabase';
import { generateId, now } from '@/lib/utils';
import { DEFAULT_TIME_LIMIT, DEFAULT_POINTS } from '@/lib/constants';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

const FILE = 'questions';
type QuestionRow = Database['public']['Tables']['quiz_questions']['Row'];

function fromSupabaseRow(row: QuestionRow): Question {
  return {
    id: row.id,
    quiz_session_id: row.quiz_session_id,
    question_text: row.question_text,
    options: row.options,
    correct_index: row.correct_index,
    time_limit_seconds: row.time_limit_seconds,
    points: row.points,
    order_index: row.order_index,
    created_at: row.created_at,
    explanation: row.explanation,
    source_url: row.source_url,
  };
}

export async function getAllQuestions(): Promise<Question[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_questions').select('*').order('created_at', { ascending: true });
    if (error) throw new Error('Unable to load quiz questions');
    return (data ?? []).map(fromSupabaseRow);
  }
  return readData<Question>(FILE);
}

export async function getQuestionById(id: string): Promise<Question | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_questions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('Unable to load quiz question');
    return data ? fromSupabaseRow(data) : undefined;
  }
  const questions = await readData<Question>(FILE);
  return questions.find((question) => question.id === id);
}

export async function getQuestionsBySession(sessionId: string): Promise<Question[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_questions').select('*').eq('quiz_session_id', sessionId).order('order_index');
    if (error) throw new Error('Unable to load session questions');
    return (data ?? []).map(fromSupabaseRow);
  }
  const questions = await readData<Question>(FILE);
  return questions.filter((question) => question.quiz_session_id === sessionId)
    .sort((left, right) => left.order_index - right.order_index);
}

export async function createQuestion(
  data: Omit<Question, 'id' | 'created_at' | 'time_limit_seconds' | 'points'> & {
    time_limit_seconds?: number;
    points?: number;
  },
): Promise<Question> {
  const newQuestion: Question = {
    ...data,
    id: generateId(),
    time_limit_seconds: data.time_limit_seconds ?? DEFAULT_TIME_LIMIT,
    points: data.points ?? DEFAULT_POINTS,
    created_at: now(),
  };
  if (isSupabaseRuntimeEnabled()) {
    const { data: stored, error } = await getSupabaseAdminClient()
      .from('quiz_questions').insert(newQuestion).select('*').single();
    if (error || !stored) throw new Error('Unable to create quiz question');
    return fromSupabaseRow(stored);
  }
  return updateData<Question, Question>(FILE, (questions) => ({
    data: [...questions, newQuestion],
    result: newQuestion,
  }));
}

export async function updateQuestion(
  id: string,
  updates: Partial<Omit<Question, 'id' | 'created_at'>>,
): Promise<Question> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_questions').update(updates).eq('id', id).select('*').single();
    if (error || !data) throw new Error(`Question ${id} not found`);
    return fromSupabaseRow(data);
  }
  return updateData<Question, Question>(FILE, (questions) => {
    const index = questions.findIndex((question) => question.id === id);
    if (index === -1) throw new Error(`Question ${id} not found`);
    const updated = { ...questions[index]!, ...updates };
    questions[index] = updated;
    return { data: questions, result: updated };
  });
}

export async function deleteQuestion(id: string): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().from('quiz_questions').delete().eq('id', id);
    if (error) throw new Error('Unable to delete quiz question');
    return;
  }
  await updateData<Question, void>(FILE, (questions) => ({
    data: questions.filter((question) => question.id !== id),
    result: undefined,
  }));
}

export async function reorderQuestions(sessionId: string, questionIds: string[]): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().rpc('reorder_quiz_questions', {
      p_session_id: sessionId,
      p_question_ids: questionIds,
    });
    if (error) throw new Error('Unable to reorder quiz questions');
    return;
  }
  await updateData<Question, void>(FILE, (questions) => {
    const orderById = new Map(questionIds.map((id, index) => [id, index]));
    for (const question of questions) {
      if (question.quiz_session_id !== sessionId) continue;
      const orderIndex = orderById.get(question.id);
      if (orderIndex !== undefined) question.order_index = orderIndex;
    }
    return { data: questions, result: undefined };
  });
}
