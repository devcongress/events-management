import type { Question, QuizSession } from '@/types';
import { deleteQuizParticipantsBySession } from './quiz-participants';
import { updateQuizSession } from './quiz-sessions';
import { deleteResponsesByQuestionIds } from './responses';

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
