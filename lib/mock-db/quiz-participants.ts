import { readData, updateData, writeData } from './index';
import { QuizParticipant } from '@/types';
import { generateId, now } from '@/lib/utils';

const FILE = 'quiz-participants';

export async function getAllQuizParticipants(): Promise<QuizParticipant[]> {
  return readData<QuizParticipant>(FILE);
}

export async function getQuizParticipantById(id: string): Promise<QuizParticipant | undefined> {
  const participants = await readData<QuizParticipant>(FILE);
  return participants.find(p => p.id === id);
}

export async function getQuizParticipantsBySession(sessionId: string): Promise<QuizParticipant[]> {
  const participants = await readData<QuizParticipant>(FILE);
  return participants.filter(p => p.quiz_session_id === sessionId);
}

export async function getQuizParticipantBySessionAndUser(
  sessionId: string,
  userId: string
): Promise<QuizParticipant | undefined> {
  const participants = await readData<QuizParticipant>(FILE);
  return participants.find(p => p.quiz_session_id === sessionId && p.user_id === userId);
}

export async function createQuizParticipant(
  data: Omit<QuizParticipant, 'id' | 'joined_at' | 'total_score' | 'current_streak'>
): Promise<QuizParticipant> {
  const participants = await readData<QuizParticipant>(FILE);

  // Check if participant already exists
  const existing = participants.find(
    p => p.quiz_session_id === data.quiz_session_id && p.user_id === data.user_id
  );

  if (existing) {
    return existing; // Return existing participant
  }

  const newParticipant: QuizParticipant = {
    ...data,
    id: generateId(),
    total_score: 0,
    current_streak: 0,
    joined_at: now(),
  };

  participants.push(newParticipant);
  await writeData(FILE, participants);
  return newParticipant;
}

export async function updateQuizParticipant(
  id: string,
  updates: Partial<Omit<QuizParticipant, 'id' | 'joined_at'>>
): Promise<QuizParticipant> {
  const participants = await readData<QuizParticipant>(FILE);
  const index = participants.findIndex(p => p.id === id);

  if (index === -1) {
    throw new Error(`Quiz participant ${id} not found`);
  }

  participants[index] = {
    ...participants[index],
    ...updates,
  };

  await writeData(FILE, participants);
  return participants[index];
}

export async function deleteQuizParticipant(id: string): Promise<void> {
  const participants = await readData<QuizParticipant>(FILE);
  const filtered = participants.filter(p => p.id !== id);
  await writeData(FILE, filtered);
}

export async function deleteQuizParticipantsBySession(sessionId: string): Promise<number> {
  return updateData<QuizParticipant, number>(FILE, (participants) => {
    const retained = participants.filter((participant) => participant.quiz_session_id !== sessionId);
    return {
      data: retained,
      result: participants.length - retained.length,
    };
  });
}
