import { getQuestionsBySession } from '@/lib/mock-db/questions';
import { getQuizParticipantsBySession } from '@/lib/mock-db/quiz-participants';
import { advanceHostedQuizSessionState, getQuizSessionById, updateQuizSession } from '@/lib/mock-db/quiz-sessions';
import { advanceSystemDesignQuestion } from '@/lib/mock-db/system-design-learning-room';
import { getHostedQuizStateAnalytics, getResponsesByQuestion } from '@/lib/mock-db/responses';
import type { Question, QuizSession, QuizStateResponse, Response } from '@/types';

export interface QuizAdvanceResult {
  session: QuizSession | null;
  advanced: boolean;
}

export interface QuizStateOptions {
  includeAnswerDistribution?: boolean;
  includePresenterLeaderboard?: boolean;
  includePresenterQuestion?: boolean;
}

export async function advanceQuizSessionState(sessionId: string): Promise<QuizAdvanceResult> {
  let session = await getQuizSessionById(sessionId);
  if (!session) return { session: null, advanced: false };

  if (session.purpose === 'system_design_learning' && session.question_phase === 'presenting') {
    if (!session.question_started_at || Date.now() < new Date(session.question_started_at).getTime()) {
      return { session, advanced: false };
    }
    const hostedSession = await advanceSystemDesignQuestion(sessionId);
    if (hostedSession) {
      return { session: hostedSession, advanced: hostedSession.question_phase === 'answering' };
    }
    session = await updateQuizSession(sessionId, {
      question_phase: 'answering',
      phase_started_at: new Date().toISOString(),
    });
    return { session, advanced: true };
  }

  const hostedResult = await advanceHostedQuizSessionState(sessionId);
  if (hostedResult) return hostedResult;

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
  const [questions, hostedAnalytics] = await Promise.all([
    hasCurrentQuestion ? getQuestionsBySession(sessionId) : Promise.resolve([]),
    getHostedQuizStateAnalytics(sessionId, userId),
  ]);
  const participants = hostedAnalytics ? [] : await getQuizParticipantsBySession(sessionId);

  let currentQuestion: QuizStateResponse['current_question'] = null;
  let questionStartedAt: string | null = session.question_phase === 'presenting'
    ? session.question_started_at || null
    : null;
  let fullCurrentQuestion: Question | null = null;

  const mayViewCurrentQuestion = session.question_phase !== 'presenting' || options.includePresenterQuestion;
  if (hasCurrentQuestion && mayViewCurrentQuestion) {
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
    responses = hostedAnalytics
      ? hostedAnalytics.player_response ? [hostedAnalytics.player_response] : []
      : await getResponsesByQuestion(fullCurrentQuestion.id);
    answersCount = hostedAnalytics?.answers_count ?? responses.length;
  }

  let fullLeaderboard = hostedAnalytics?.leaderboard ?? [...participants]
    .sort((left, right) => right.total_score - left.total_score || left.joined_at.localeCompare(right.joined_at))
    .map((participant, index) => ({
      user_id: participant.user_id,
      nickname: participant.nickname_used,
      total_score: participant.total_score,
      streak_count: participant.current_streak,
      rank: index + 1,
      avatar_seed: participant.id,
    }));
  if (session.purpose === 'system_design_learning' && options.includePresenterLeaderboard && questions.length > 0) {
    const responseGroups = await Promise.all(questions.map((question) => getResponsesByQuestion(question.id)));
    const correctAnswers = new Map<string, number>();
    for (const response of responseGroups.flat()) {
      if (!response.is_correct) continue;
      correctAnswers.set(response.user_id, (correctAnswers.get(response.user_id) ?? 0) + 1);
    }
    fullLeaderboard = fullLeaderboard.map((entry) => ({
      ...entry,
      correct_answers: correctAnswers.get(entry.user_id) ?? 0,
    }));
  }
  const leaderboard = session.purpose === 'system_design_learning' && !options.includePresenterLeaderboard
    ? []
    : fullLeaderboard.slice(0, 10);

  // A shared presenter screen is visible to people still deciding. Keep the
  // live response split private until the facilitator reveals the answer for
  // System Design rooms; a visible distribution would steer late votes.
  const answerDistribution = fullCurrentQuestion && (
    (session.purpose !== 'system_design_learning' && options.includeAnswerDistribution)
    || session.question_phase === 'revealing'
    || session.question_phase === 'scoreboard'
  )
    ? hostedAnalytics?.answer_distribution ?? [0, 1, 2, 3].map((optionIndex) => {
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
      const leaderboardEntry = fullLeaderboard.find((candidate) => candidate.user_id === userId);

      playerResult = {
        is_correct: response.is_correct!,
        points_awarded: response.points_awarded,
        correct_index: fullCurrentQuestion.correct_index,
        streak_count: leaderboardEntry?.streak_count ?? participant?.current_streak ?? 0,
      };
    }
  }

  const playerStanding = session.purpose === 'system_design_learning' && session.status === 'finished' && userId
    ? (() => {
        const entry = fullLeaderboard.find((candidate) => candidate.user_id === userId);
        return entry ? {
          rank: entry.rank,
          nickname: entry.nickname,
          participant_count: hostedAnalytics?.participants_count ?? participants.length,
          avatar_seed: entry.avatar_seed!,
        } : undefined;
      })()
    : undefined;

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
    participants_count: hostedAnalytics?.participants_count ?? participants.length,
    answers_count: answersCount,
    leaderboard,
    answer_distribution: answerDistribution,
    reveal_explanation: session.question_phase === 'revealing'
      ? fullCurrentQuestion?.explanation ?? null
      : undefined,
    player_result: playerResult,
    player_standing: playerStanding,
  };
}
