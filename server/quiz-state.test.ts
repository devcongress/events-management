import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question, QuizParticipant, QuizSession, Response } from '@/types';

const getQuizSessionById = vi.fn();
const updateQuizSession = vi.fn();
const getQuestionsBySession = vi.fn();
const getResponsesByQuestion = vi.fn();
const getQuizParticipantsBySession = vi.fn();
const getResponseByQuestionAndUser = vi.fn();

vi.mock('@/lib/mock-db/quiz-sessions', () => ({
  getQuizSessionById,
  updateQuizSession,
}));

vi.mock('@/lib/mock-db/questions', () => ({
  getQuestionsBySession,
}));

vi.mock('@/lib/mock-db/responses', () => ({
  getResponsesByQuestion,
  getResponseByQuestionAndUser,
}));

vi.mock('@/lib/mock-db/quiz-participants', () => ({
  getQuizParticipantsBySession,
}));

const activeSession: QuizSession = {
  id: 'session-1',
  event_id: 'event-1',
  join_code: 'ABC123',
  status: 'active',
  current_question_index: 0,
  question_phase: 'answering',
  started_at: '2026-06-15T10:00:00.000Z',
  finished_at: null,
  created_at: '2026-06-15T09:00:00.000Z',
  question_started_at: '2026-06-15T10:00:00.000Z',
  phase_started_at: '2026-06-15T10:00:00.000Z',
  purpose: 'system_design_learning',
};

const question: Question = {
  id: 'question-1',
  quiz_session_id: 'session-1',
  question_text: 'What is the answer?',
  options: ['A', 'B', 'C', 'D'],
  correct_index: 2,
  time_limit_seconds: 20,
  points: 1000,
  order_index: 0,
  created_at: '2026-06-15T09:01:00.000Z',
};

const participant: QuizParticipant = {
  id: 'participant-1',
  quiz_session_id: 'session-1',
  user_id: 'user-1',
  nickname_used: 'Ada',
  total_score: 500,
  current_streak: 1,
  joined_at: '2026-06-15T09:59:00.000Z',
};

const response: Response = {
  id: 'response-1',
  question_id: 'question-1',
  user_id: 'user-1',
  answer_index: 2,
  answered_at: '2026-06-15T10:00:05.000Z',
  time_taken_ms: 5000,
  points_awarded: 500,
  is_correct: true,
  created_at: '2026-06-15T10:00:05.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T10:00:25.000Z'));
  getQuizSessionById.mockResolvedValue(activeSession);
  getQuestionsBySession.mockResolvedValue([question]);
  getResponsesByQuestion.mockResolvedValue([]);
  getQuizParticipantsBySession.mockResolvedValue([participant]);
  getResponseByQuestionAndUser.mockResolvedValue(null);
  updateQuizSession.mockImplementation(async (_id, updates) => ({ ...activeSession, ...updates }));
});

describe('quiz state helpers', () => {
  it('never auto-reveals an answer; the facilitator controls the discussion reveal', async () => {
    const { advanceQuizSessionState } = await import('./quiz-state');

    const result = await advanceQuizSessionState('session-1');

    expect(result.advanced).toBe(false);
    expect(updateQuizSession).not.toHaveBeenCalled();
  });

  it('preserves timed auto-reveal for the separate quiz flow', async () => {
    const { advanceQuizSessionState } = await import('./quiz-state');
    getQuizSessionById.mockResolvedValue({ ...activeSession, purpose: 'quiz' });

    const result = await advanceQuizSessionState('session-1');

    expect(result.advanced).toBe(true);
    expect(updateQuizSession).toHaveBeenCalledWith('session-1', expect.objectContaining({
      question_phase: 'revealing',
    }));
  });

  it('withholds the answer until reveal, then returns the attendee result', async () => {
    const { buildQuizStateResponse } = await import('./quiz-state');
    getResponsesByQuestion.mockResolvedValue([response]);
    getResponseByQuestionAndUser.mockResolvedValue(response);

    const answeringState = await buildQuizStateResponse('session-1', 'user-1');

    expect(updateQuizSession).not.toHaveBeenCalled();
    expect(answeringState?.current_question).toEqual(expect.not.objectContaining({ correct_index: expect.any(Number) }));
    expect(answeringState?.player_result).toBeUndefined();
    expect(answeringState?.answer_distribution).toBeUndefined();

    const presenterState = await buildQuizStateResponse('session-1', null, {
      includeAnswerDistribution: true,
      includePresenterLeaderboard: true,
    });
    expect(presenterState?.answer_distribution).toEqual([
      { option_index: 0, count: 0, percentage: 0 },
      { option_index: 1, count: 0, percentage: 0 },
      { option_index: 2, count: 1, percentage: 100 },
      { option_index: 3, count: 0, percentage: 0 },
    ]);
    expect(presenterState?.leaderboard[0]?.nickname).toBe('Ada');

    getQuizSessionById.mockResolvedValue({ ...activeSession, question_phase: 'revealing' });
    const revealedState = await buildQuizStateResponse('session-1', 'user-1');
    expect(revealedState?.player_result).toMatchObject({ is_correct: true, correct_index: 2, points_awarded: 500 });
    expect(revealedState?.participants_count).toBe(1);
    expect(revealedState?.answers_count).toBe(1);
    expect(revealedState?.leaderboard).toEqual([]);

    const presenterRevealState = await buildQuizStateResponse('session-1', null, {
      includeAnswerDistribution: true,
      includePresenterLeaderboard: true,
    });
    expect(presenterRevealState?.answer_distribution?.[2]).toEqual({
      option_index: 2,
      count: 1,
      percentage: 100,
    });
  });

  it('returns the final leaderboard to the presenter and only the requesting player standing publicly', async () => {
    const { buildQuizStateResponse } = await import('./quiz-state');
    getQuizSessionById.mockResolvedValue({ ...activeSession, status: 'finished', question_phase: null });

    const playerState = await buildQuizStateResponse('session-1', 'user-1');
    expect(playerState?.leaderboard).toEqual([]);
    expect(playerState?.player_standing).toEqual({
      rank: 1,
      nickname: 'Ada',
      participant_count: 1,
      avatar_seed: 'participant-1',
    });

    const presenterState = await buildQuizStateResponse('session-1', null, {
      includeAnswerDistribution: true,
      includePresenterLeaderboard: true,
    });
    expect(presenterState?.leaderboard).toEqual([
      expect.objectContaining({ user_id: 'user-1', nickname: 'Ada', rank: 1, total_score: 500 }),
    ]);
    expect(presenterState?.player_standing).toBeUndefined();
  });
});
