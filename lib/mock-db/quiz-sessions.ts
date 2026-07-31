import { readData, writeData } from './index';
import { QuizSession, QuizStatus } from '@/types';
import { generateId, now, generateJoinCode } from '@/lib/utils';

const FILE = 'quiz-sessions';

export async function getAllQuizSessions(): Promise<QuizSession[]> {
  return readData<QuizSession>(FILE);
}

export async function getQuizSessionById(id: string): Promise<QuizSession | undefined> {
  const sessions = await readData<QuizSession>(FILE);
  return sessions.find(s => s.id === id);
}

export async function getQuizSessionByCode(joinCode: string): Promise<QuizSession | undefined> {
  const sessions = await readData<QuizSession>(FILE);
  return sessions.find(s => s.join_code === joinCode);
}

export async function getQuizSessionsByEvent(eventId: string): Promise<QuizSession[]> {
  const sessions = await readData<QuizSession>(FILE);
  return sessions.filter(s => s.event_id === eventId);
}

export async function createQuizSession(
  data: Pick<QuizSession, 'event_id' | 'expires_at' | 'purpose' | 'participant_identity_mode'>
): Promise<QuizSession> {
  const sessions = await readData<QuizSession>(FILE);

  // Generate unique join code
  let joinCode = generateJoinCode();
  while (sessions.some(s => s.join_code === joinCode)) {
    joinCode = generateJoinCode();
  }

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

  sessions.push(newSession);
  await writeData(FILE, sessions);
  return newSession;
}

export async function updateQuizSession(
  id: string,
  updates: Partial<Omit<QuizSession, 'id' | 'created_at' | 'join_code'>>
): Promise<QuizSession> {
  const sessions = await readData<QuizSession>(FILE);
  const index = sessions.findIndex(s => s.id === id);

  if (index === -1) {
    throw new Error(`Quiz session ${id} not found`);
  }

  sessions[index] = {
    ...sessions[index],
    ...updates,
  };

  await writeData(FILE, sessions);
  return sessions[index];
}

export async function deleteQuizSession(id: string): Promise<void> {
  const sessions = await readData<QuizSession>(FILE);
  const filtered = sessions.filter(s => s.id !== id);
  await writeData(FILE, filtered);
}
