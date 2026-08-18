import type { Question, QuizSession } from '@/types';
import { deleteQuizParticipantsBySession, getQuizParticipantsBySession, updateQuizParticipant } from './quiz-participants';
import { quizSessionFromRow, updateQuizSession } from './quiz-sessions';
import { deleteResponsesByQuestionIds, getResponsesByQuestion } from './responses';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

/** Gives connected phones a small, shared runway before answers open. */
export const SYSTEM_DESIGN_ANSWER_START_DELAY_SECONDS = 3;

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
    skipped_question_ids: [],
  });

  return {
    session: preparedSession,
    removedParticipants,
    removedResponses,
  };
}

export async function presentNextSystemDesignQuestion(sessionId: string): Promise<QuizSession | null> {
  if (!isSupabaseRuntimeEnabled()) return null;
  const { data, error } = await getSupabaseAdminClient().rpc('present_system_design_question', {
    p_session_id: sessionId,
  });
  if (error || !data) throw new Error(error?.message ?? 'Unable to present System Design question');
  return quizSessionFromRow(data);
}

export async function advanceSystemDesignQuestion(sessionId: string): Promise<QuizSession | null> {
  if (!isSupabaseRuntimeEnabled()) return null;
  const { data, error } = await getSupabaseAdminClient().rpc('advance_system_design_question', {
    p_session_id: sessionId,
  });
  if (error || !data) throw new Error(error?.message ?? 'Unable to advance System Design question');
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

/** Skip never reveals. It clears the current attempt and takes the question
 * out of the normal release sequence so a facilitator can explicitly reopen it. */
export async function skipSystemDesignQuestion(session: QuizSession, questions: Question[]): Promise<QuizSession> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().rpc('skip_system_design_question', { p_session_id: session.id });
    if (error || !data) throw new Error(error?.message ?? 'question_not_ready_to_skip');
    return quizSessionFromRow(data);
  }
  const current = questions.find((question) => question.order_index === session.current_question_index);
  if (!current || session.status !== 'active' || !['presenting', 'answering'].includes(session.question_phase ?? '')) {
    throw new Error('question_not_ready_to_skip');
  }
  await deleteResponsesByQuestionIds([current.id]);
  const skippedQuestionIds = [...new Set([...(session.skipped_question_ids ?? []), current.id])];
  const nextQuestion = nextUnreleasedLearningQuestion(questions, [
    ...(session.released_question_ids ?? []),
    ...skippedQuestionIds,
  ]);
  const transitionAt = new Date();
  return updateQuizSession(session.id, {
    status: 'active',
    current_question_index: nextQuestion?.order_index ?? -1,
    question_phase: nextQuestion ? 'presenting' : null,
    question_started_at: nextQuestion
      ? new Date(transitionAt.getTime() + (SYSTEM_DESIGN_ANSWER_START_DELAY_SECONDS * 1000)).toISOString()
      : null,
    phase_started_at: transitionAt.toISOString(),
    released_question_ids: nextQuestion
      ? [...(session.released_question_ids ?? []), nextQuestion.id]
      : session.released_question_ids ?? [],
    skipped_question_ids: skippedQuestionIds,
  });
}

export async function reopenSystemDesignQuestion(session: QuizSession, question: Question): Promise<QuizSession> {
  if (session.status === 'finished') throw new Error('session_finished');
  if (!(session.skipped_question_ids ?? []).includes(question.id)) throw new Error('question_not_skipped');
  const transitionAt = new Date().toISOString();
  return updateQuizSession(session.id, {
    status: 'active',
    current_question_index: question.order_index,
    question_phase: 'presenting',
    question_started_at: null,
    phase_started_at: transitionAt,
    started_at: session.started_at ?? transitionAt,
    released_question_ids: [...(session.released_question_ids ?? []), question.id],
    skipped_question_ids: (session.skipped_question_ids ?? []).filter((id) => id !== question.id),
  });
}

/** Rebuild scores after discarding a skipped question. This avoids subtracting
 * a streak bonus blindly: a skipped answer may have changed later streaks. */
export async function rebuildSystemDesignScores(sessionId: string, questions: Question[]): Promise<void> {
  const [participants, responseGroups] = await Promise.all([
    getQuizParticipantsBySession(sessionId),
    Promise.all(questions.map((question) => getResponsesByQuestion(question.id))),
  ]);
  const responses = responseGroups.flat().sort((left, right) => left.created_at.localeCompare(right.created_at));
  await Promise.all(participants.map(async (participant) => {
    const mine = responses.filter((response) => response.user_id === participant.user_id);
    const streak = mine.reduce((value, response) => response.is_correct ? value + 1 : 0, 0);
    await updateQuizParticipant(participant.id, {
      total_score: mine.reduce((total, response) => total + response.points_awarded, 0),
      current_streak: streak,
    });
  }));
}
