import { readData, updateData } from './index';
import type { QuizSession } from '@/types';
import type { Database } from '@/types/supabase';
import { generateId, now, generateJoinCode } from '@/lib/utils';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

const FILE = 'quiz-sessions';
type QuizSessionRow = Database['public']['Tables']['quiz_sessions']['Row'];

export function quizSessionFromRow(row: QuizSessionRow): QuizSession {
  return {
    id: row.id,
    event_id: row.event_id,
    join_code: row.join_code,
    status: row.status,
    current_question_index: row.current_question_index,
    question_phase: row.question_phase,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
    question_started_at: row.question_started_at,
    phase_started_at: row.phase_started_at,
    expires_at: row.expires_at,
    released_question_ids: row.released_question_ids,
    purpose: row.purpose,
  };
}

export async function getAllQuizSessions(): Promise<QuizSession[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_sessions')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw new Error('Unable to load quiz sessions');
    return (data ?? []).map(quizSessionFromRow);
  }
  return readData<QuizSession>(FILE);
}

export async function getQuizSessionById(id: string): Promise<QuizSession | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_sessions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('Unable to load quiz session');
    return data ? quizSessionFromRow(data) : undefined;
  }
  const sessions = await readData<QuizSession>(FILE);
  return sessions.find((session) => session.id === id);
}

export async function getQuizSessionByCode(joinCode: string): Promise<QuizSession | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_sessions').select('*').eq('join_code', joinCode).maybeSingle();
    if (error) throw new Error('Unable to load quiz session');
    return data ? quizSessionFromRow(data) : undefined;
  }
  const sessions = await readData<QuizSession>(FILE);
  return sessions.find((session) => session.join_code === joinCode);
}

export async function getQuizSessionsByEvent(eventId: string): Promise<QuizSession[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_sessions').select('*').eq('event_id', eventId).order('created_at', { ascending: true });
    if (error) throw new Error('Unable to load event quiz sessions');
    return (data ?? []).map(quizSessionFromRow);
  }
  const sessions = await readData<QuizSession>(FILE);
  return sessions.filter((session) => session.event_id === eventId);
}

export async function createQuizSession(
  data: Pick<QuizSession, 'event_id' | 'expires_at' | 'purpose'>,
): Promise<QuizSession> {
  if (isSupabaseRuntimeEnabled()) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const newSession: QuizSession = {
        ...data,
        id: generateId(),
        join_code: generateJoinCode(),
        status: 'draft',
        current_question_index: -1,
        question_phase: null,
        started_at: null,
        finished_at: null,
        question_started_at: null,
        phase_started_at: null,
        expires_at: data.expires_at ?? null,
        released_question_ids: [],
        purpose: data.purpose,
        created_at: now(),
      };
      const { data: stored, error } = await getSupabaseAdminClient()
        .from('quiz_sessions').insert(newSession).select('*').single();
      if (error?.code === '23505') continue;
      if (error || !stored) throw new Error('Unable to create quiz session');
      return quizSessionFromRow(stored);
    }
    throw new Error('Unable to reserve a unique quiz join code');
  }

  return updateData<QuizSession, QuizSession>(FILE, (sessions) => {
    let joinCode = generateJoinCode();
    while (sessions.some((session) => session.join_code === joinCode)) joinCode = generateJoinCode();
    const newSession: QuizSession = {
      ...data,
      id: generateId(),
      join_code: joinCode,
      status: 'draft',
      current_question_index: -1,
      question_phase: null,
      started_at: null,
      finished_at: null,
      question_started_at: null,
      phase_started_at: null,
      expires_at: data.expires_at ?? null,
      released_question_ids: [],
      purpose: data.purpose,
      created_at: now(),
    };
    return { data: [...sessions, newSession], result: newSession };
  });
}

export async function updateQuizSession(
  id: string,
  updates: Partial<Omit<QuizSession, 'id' | 'created_at' | 'join_code'>>,
): Promise<QuizSession> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('quiz_sessions').update(updates).eq('id', id).select('*').single();
    if (error || !data) throw new Error(`Quiz session ${id} not found`);
    return quizSessionFromRow(data);
  }
  return updateData<QuizSession, QuizSession>(FILE, (sessions) => {
    const index = sessions.findIndex((session) => session.id === id);
    if (index === -1) throw new Error(`Quiz session ${id} not found`);
    const updated = { ...sessions[index]!, ...updates };
    sessions[index] = updated;
    return { data: sessions, result: updated };
  });
}

export async function deleteQuizSession(id: string): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().from('quiz_sessions').delete().eq('id', id);
    if (error) throw new Error('Unable to delete quiz session');
    return;
  }
  await updateData<QuizSession, void>(FILE, (sessions) => ({
    data: sessions.filter((session) => session.id !== id),
    result: undefined,
  }));
}

export async function advanceHostedQuizSessionState(
  id: string,
): Promise<{ session: QuizSession | null; advanced: boolean } | null> {
  if (!isSupabaseRuntimeEnabled()) return null;
  const { data, error } = await getSupabaseAdminClient().rpc('advance_quiz_session_state', {
    p_session_id: id,
  });
  if (error) throw new Error('Unable to advance quiz session state');
  if (!data) return { session: null, advanced: false };
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid quiz state transition result');
  const result = data as { advanced?: unknown; session?: unknown };
  if (!result.session || typeof result.session !== 'object' || Array.isArray(result.session)) {
    return { session: null, advanced: false };
  }
  return {
    session: quizSessionFromRow(result.session as QuizSessionRow),
    advanced: result.advanced === true,
  };
}
