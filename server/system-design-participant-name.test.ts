import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizParticipant, QuizSession, User } from '@/types';

const originalCwd = process.cwd();
let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-participant-name-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('System Design participant name endpoint', () => {
  it('allows only the owning device to rename while waiting and closes edits after start', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const participantId = '22222222-2222-4222-8222-222222222222';
    const userId = '33333333-3333-4333-8333-333333333333';
    const deviceId = '44444444-4444-4444-8444-444444444444';
    const session: QuizSession = {
      id: sessionId,
      event_id: 'event-1',
      join_code: 'ABC234',
      status: 'waiting',
      current_question_index: -1,
      question_phase: null,
      started_at: null,
      finished_at: null,
      created_at: '2026-07-31T20:00:00.000Z',
      question_started_at: null,
      phase_started_at: null,
      purpose: 'system_design_learning',
    };
    const participants: QuizParticipant[] = [
      { id: participantId, quiz_session_id: sessionId, user_id: userId, nickname_used: 'Bright Fox', total_score: 0, current_streak: 0, joined_at: '2026-07-31T20:01:00.000Z' },
      { id: '55555555-5555-4555-8555-555555555555', quiz_session_id: sessionId, user_id: '66666666-6666-4666-8666-666666666666', nickname_used: 'Calm Owl', total_score: 0, current_streak: 0, joined_at: '2026-07-31T20:01:01.000Z' },
    ];
    const users: User[] = [{
      id: userId,
      device_id: deviceId,
      nickname: 'Bright Fox',
      username: null,
      email: null,
      secret_question: null,
      secret_answer_hash: null,
      is_claimed: false,
      is_admin: false,
      merged_into_user_id: null,
      total_points: 0,
      events_participated: 1,
      created_at: '2026-07-31T20:01:00.000Z',
    }];
    const { writeData } = await import('@/lib/mock-db');
    await writeData('quiz-sessions', [session]);
    await writeData('quiz-participants', participants);
    await writeData('users', users);
    const { default: app } = await import('./app');
    const endpoint = `http://localhost/api/quiz/participants/${participantId}/name`;

    const wrongDevice = await app.request(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: '77777777-7777-4777-8777-777777777777', nickname: 'Ama' }),
    });
    expect(wrongDevice.status).toBe(403);

    const duplicate = await app.request(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, nickname: 'calm owl' }),
    });
    expect(duplicate.status).toBe(409);

    const renamed = await app.request(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, nickname: 'Ama' }),
    });
    expect(renamed.status).toBe(200);
    await expect(renamed.json()).resolves.toEqual({ display_name: 'Ama', avatar_seed: participantId });

    await writeData('quiz-sessions', [{ ...session, status: 'active' }]);
    const afterStart = await app.request(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, nickname: 'Kojo' }),
    });
    expect(afterStart.status).toBe(409);
    await expect(afterStart.json()).resolves.toMatchObject({ code: 'name_edit_closed' });
  });
});
