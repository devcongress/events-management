import type { Question, QuizSession } from '@/types';
import { deleteQuizParticipantsBySession, getQuizParticipantsBySession } from './quiz-participants';
import { quizSessionFromRow, updateQuizSession } from './quiz-sessions';
import { deleteResponsesByQuestionIds, getResponsesByQuestion } from './responses';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

export function nextUnreleasedLearningQuestion(
  questions: Question[],
  releasedQuestionIds: string[],
): Question | null {
  const released = new Set(releasedQuestionIds);
  return [...questions]
    .filter((question) => !released.has(question.id))
    .sort((left, right) => left.order_index - right.order_index)[0] ?? null;
}

export async function prepareSystemDesignPresentationRun(
  session: QuizSession,
  questions: Question[],
): Promise<{ session: QuizSession; removedParticipants: number; removedResponses: number }> {
  if (isSupabaseRuntimeEnabled()) {
    const [participants, responseGroups] = await Promise.all([
      getQuizParticipantsBySession(session.id),
      Promise.all(questions.map((question) => getResponsesByQuestion(question.id))),
    ]);
    const { data, error } = await getSupabaseAdminClient().rpc('prepare_system_design_presentation', {
      p_session_id: session.id,
    });
    if (error || !data) throw new Error('Unable to prepare System Design presentation');
    return {
      session: quizSessionFromRow(data),
      removedParticipants: participants.length,
      removedResponses: responseGroups.reduce((total, responses) => total + responses.length, 0),
    };
  }
  const [removedParticipants, removedResponses] = await Promise.all([
    deleteQuizParticipantsBySession(session.id),
    deleteResponsesByQuestionIds(questions.map((question) => question.id)),
  ]);
  const preparedSession = await updateQuizSession(session.id, {
    status: 'waiting',
    current_question_index: -1,
    question_phase: null,
    started_at: null,
    finished_at: null,
    question_started_at: null,
    phase_started_at: null,
    expires_at: null,
    released_question_ids: [],
  });

  return {
    session: preparedSession,
    removedParticipants,
    removedResponses,
  };
}

export async function releaseNextSystemDesignQuestion(sessionId: string): Promise<QuizSession | null> {
  if (!isSupabaseRuntimeEnabled()) return null;
  const { data, error } = await getSupabaseAdminClient().rpc('release_system_design_question', {
    p_session_id: sessionId,
  });
  if (error || !data) throw new Error(error?.message ?? 'Unable to release System Design question');
  return quizSessionFromRow(data);
}

export async function revealSystemDesignQuestion(sessionId: string): Promise<QuizSession | null> {
  if (!isSupabaseRuntimeEnabled()) return null;
  const { data, error } = await getSupabaseAdminClient().rpc('reveal_system_design_question', {
    p_session_id: sessionId,
  });
  if (error || !data) throw new Error(error?.message ?? 'Unable to reveal System Design question');
  return quizSessionFromRow(data);
}
