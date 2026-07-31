import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question, QuizParticipant, QuizSession, Response } from '@/types';

const originalCwd = process.cwd();
let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-learning-room-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('System Design presentation runs', () => {
  it('releases the next unreleased question in the reviewed order', async () => {
    const { nextUnreleasedLearningQuestion } = await import('./system-design-learning-room');
    const questions: Question[] = [2, 0, 1].map((orderIndex) => ({
      id: `question-${orderIndex + 1}`,
      quiz_session_id: 'room-1',
      question_text: `Question ${orderIndex + 1}`,
      options: ['A', 'B', 'C', 'D'],
      correct_index: 0,
      time_limit_seconds: 20,
      points: 1000,
      order_index: orderIndex,
      created_at: '2026-07-01T09:05:00.000Z',
      explanation: 'Because it fits.',
    }));

    expect(nextUnreleasedLearningQuestion(questions, ['question-1'])?.id).toBe('question-2');
    expect(nextUnreleasedLearningQuestion(questions, questions.map((question) => question.id))).toBeNull();
  });

  it('starts a fresh reusable run while preserving its reviewed questions and unrelated room data', async () => {
    const { readData, writeData } = await import('./index');
    const { prepareSystemDesignPresentationRun } = await import('./system-design-learning-room');
    const session: QuizSession = {
      id: 'room-1', event_id: 'event-1', join_code: 'ABC234', purpose: 'system_design_learning',
      status: 'finished', current_question_index: 4, question_phase: null,
      started_at: '2026-07-01T10:00:00.000Z', finished_at: '2026-07-01T11:00:00.000Z',
      created_at: '2026-07-01T09:00:00.000Z', question_started_at: null, phase_started_at: null,
      expires_at: '2026-07-01T11:00:00.000Z', released_question_ids: ['question-1'],
    };
    const questions: Question[] = Array.from({ length: 5 }, (_, index) => ({
      id: `question-${index + 1}`, quiz_session_id: session.id, question_text: `Question ${index + 1}`,
      options: ['A', 'B', 'C', 'D'], correct_index: 0, time_limit_seconds: 20, points: 1000,
      order_index: index, created_at: '2026-07-01T09:05:00.000Z', explanation: 'Because it fits.',
    }));
    const participants: QuizParticipant[] = [
      { id: 'participant-1', quiz_session_id: session.id, user_id: 'user-1', nickname_used: 'Anonymous', total_score: 100, current_streak: 1, joined_at: '2026-07-01T10:00:00.000Z' },
      { id: 'participant-2', quiz_session_id: 'room-2', user_id: 'user-2', nickname_used: 'Anonymous', total_score: 0, current_streak: 0, joined_at: '2026-07-01T10:00:00.000Z' },
    ];
    const responses: Response[] = [
      { id: 'response-1', question_id: 'question-1', user_id: 'user-1', answer_index: 0, answered_at: '2026-07-01T10:01:00.000Z', time_taken_ms: 1000, points_awarded: 100, is_correct: true, created_at: '2026-07-01T10:01:00.000Z' },
      { id: 'response-2', question_id: 'other-question', user_id: 'user-2', answer_index: 1, answered_at: '2026-07-01T10:01:00.000Z', time_taken_ms: 1000, points_awarded: 0, is_correct: false, created_at: '2026-07-01T10:01:00.000Z' },
    ];

    await writeData('quiz-sessions', [session]);
    await writeData('questions', questions);
    await writeData('quiz-participants', participants);
    await writeData('responses', responses);

    const result = await prepareSystemDesignPresentationRun(session, questions);

    expect(result).toMatchObject({ removedParticipants: 1, removedResponses: 1 });
    expect(result.session).toMatchObject({
      status: 'waiting', current_question_index: -1, question_phase: null,
      started_at: null, finished_at: null, expires_at: null, released_question_ids: [],
    });
    await expect(readData<Question>('questions')).resolves.toEqual(questions);
    await expect(readData<QuizParticipant>('quiz-participants')).resolves.toEqual([participants[1]]);
    await expect(readData<Response>('responses')).resolves.toEqual([responses[1]]);
  });
});
