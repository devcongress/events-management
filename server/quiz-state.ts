import { getQuestionsBySession } from '@/lib/mock-db/questions';
import { getQuizParticipantsBySession } from '@/lib/mock-db/quiz-participants';
import { getQuizSessionById, updateQuizSession } from '@/lib/mock-db/quiz-sessions';
import { getResponsesByQuestion } from '@/lib/mock-db/responses';
import type { Question, QuizSession, QuizStateResponse, Response } from '@/types';

export interface QuizAdvanceResult {
  session: QuizSession | null;
  advanced: boolean;
}

export interface QuizStateOptions {
  includeAnswerDistribution?: boolean;
}

export async function advanceQuizSessionState(sessionId: string): Promise<QuizAdvanceResult> {
  let session = await getQuizSessionById(sessionId);
  if (!session) return { session: null, advanced: false };

  // System Design is discussion-led; the separate presenter controls reveal.
  // The original quiz keeps its timed/all-answered transition behavior.
  if (session.purpose === 'system_design_learning'
    || session.status !== 'active'
    || session.question_phase !== 'answering') {
    return { session, advanced: false };
  }

  const questions = await getQuestionsBySession(sessionId);
  const currentQuestionIndex = session.current_question_index;
  const currentQuestion = questions.find((question) => question.order_index === currentQuestionIndex);
  if (!currentQuestion || !session.question_started_at) return { session, advanced: false };

  const elapsed = Date.now() - new Date(session.question_started_at).getTime();
  const timeLimit = currentQuestion.time_limit_seconds * 1000;
  const [responses, participants] = await Promise.all([
    getResponsesByQuestion(currentQuestion.id),
    getQuizParticipantsBySession(sessionId),
  ]);
  const allAnswered = responses.length >= participants.length && participants.length > 0;
  if (elapsed < timeLimit && !allAnswered) return { session, advanced: false };

  session = await updateQuizSession(sessionId, {
    question_phase: 'revealing',
    phase_started_at: new Date().toISOString(),
  });
  return { session, advanced: true };
}

export async function buildQuizStateResponse(
  sessionId: string,
  userId?: string | null,
  options: QuizStateOptions = {},
): Promise<QuizStateResponse | null> {
  const session = await getQuizSessionById(sessionId);
  if (!session) return null;

  // Fetch the session-scoped collections in parallel; each read is a full
  // document fetch and this runs on every 1.5s poll per connected client.
  const hasCurrentQuestion = session.current_question_index >= 0;
  const [questions, participants] = await Promise.all([
    hasCurrentQuestion ? getQuestionsBySession(sessionId) : Promise.resolve([]),
    getQuizParticipantsBySession(sessionId),
  ]);

  let currentQuestion: QuizStateResponse['current_question'] = null;
  let questionStartedAt: string | null = null;
  let fullCurrentQuestion: Question | null = null;

  if (hasCurrentQuestion) {
    const question = questions.find((candidate) => candidate.order_index === session.current_question_index) ?? null;

    if (question) {
      fullCurrentQuestion = question;
      const { correct_index: _correctIndex, ...safeQuestion } = question;
      currentQuestion = safeQuestion;
      questionStartedAt = session.question_started_at || null;
    }
  }

  let answersCount = 0;
  let responses: Response[] = [];

  if (fullCurrentQuestion) {
    responses = await getResponsesByQuestion(fullCurrentQuestion.id);
    answersCount = responses.length;
  }

  const leaderboard = participants
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 10)
    .map((participant, index) => ({
      user_id: participant.user_id,
      nickname: participant.nickname_used,
      total_score: participant.total_score,
      streak_count: participant.current_streak,
      rank: index + 1,
    }));

  const answerDistribution = fullCurrentQuestion && (
    options.includeAnswerDistribution
    || session.question_phase === 'revealing'
    || session.question_phase === 'scoreboard'
  )
    ? [0, 1, 2, 3].map((optionIndex) => {
      const count = responses.filter((response) => response.answer_index === optionIndex).length;
      return {
        option_index: optionIndex,
        count,
        percentage: responses.length > 0 ? Math.round((count / responses.length) * 100) : 0,
      };
    })
    : undefined;

  let playerResult: QuizStateResponse['player_result'] = undefined;
  if (userId && fullCurrentQuestion) {
    // Derive from the already-fetched responses instead of re-reading the
    // whole collection a second time.
    const response = responses.find((candidate) => candidate.user_id === userId);
    const resultIsVisible = session.purpose !== 'system_design_learning'
      || session.question_phase === 'revealing'
      || session.question_phase === 'scoreboard';
    if (response && resultIsVisible) {
      const participant = participants.find((candidate) => candidate.user_id === userId);

      playerResult = {
        is_correct: response.is_correct!,
        points_awarded: response.points_awarded,
        correct_index: fullCurrentQuestion.correct_index,
        streak_count: participant?.current_streak || 0,
      };
    }
  }

  return {
    session: {
      id: session.id,
      status: session.status,
      current_question_index: session.current_question_index,
      join_code: session.join_code,
      question_phase: session.question_phase,
      purpose: session.purpose,
    },
    current_question: currentQuestion,
    question_started_at: questionStartedAt,
    participants_count: participants.length,
    answers_count: answersCount,
    leaderboard,
    answer_distribution: answerDistribution,
    reveal_explanation: session.question_phase === 'revealing'
      ? fullCurrentQuestion?.explanation ?? null
      : undefined,
    player_result: playerResult,
  };
}
