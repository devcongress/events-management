import { readData, updateData, writeData } from './index';
import { Response } from '@/types';
import { generateId, now } from '@/lib/utils';

const FILE = 'responses';

export async function getAllResponses(): Promise<Response[]> {
  return readData<Response>(FILE);
}

export async function getResponseById(id: string): Promise<Response | undefined> {
  const responses = await readData<Response>(FILE);
  return responses.find(r => r.id === id);
}

export async function getResponsesByQuestion(questionId: string): Promise<Response[]> {
  const responses = await readData<Response>(FILE);
  return responses.filter(r => r.question_id === questionId);
}

export async function getResponsesByUser(userId: string): Promise<Response[]> {
  const responses = await readData<Response>(FILE);
  return responses.filter(r => r.user_id === userId);
}

export async function getResponseByQuestionAndUser(
  questionId: string,
  userId: string
): Promise<Response | undefined> {
  const responses = await readData<Response>(FILE);
  return responses.find(r => r.question_id === questionId && r.user_id === userId);
}

export async function createResponse(
  data: Omit<Response, 'id' | 'created_at'>
): Promise<Response> {
  const responses = await readData<Response>(FILE);

  // Check if response already exists for this question+user
  const existing = responses.find(
    r => r.question_id === data.question_id && r.user_id === data.user_id
  );

  if (existing) {
    throw new Error('Response already exists for this question and user');
  }

  const newResponse: Response = {
    ...data,
    id: generateId(),
    created_at: now(),
  };

  responses.push(newResponse);
  await writeData(FILE, responses);
  return newResponse;
}

export async function updateResponse(
  id: string,
  updates: Partial<Omit<Response, 'id' | 'created_at'>>
): Promise<Response> {
  const responses = await readData<Response>(FILE);
  const index = responses.findIndex(r => r.id === id);

  if (index === -1) {
    throw new Error(`Response ${id} not found`);
  }

  responses[index] = {
    ...responses[index],
    ...updates,
  };

  await writeData(FILE, responses);
  return responses[index];
}

export async function deleteResponse(id: string): Promise<void> {
  const responses = await readData<Response>(FILE);
  const filtered = responses.filter(r => r.id !== id);
  await writeData(FILE, filtered);
}

export async function deleteResponsesByQuestionIds(questionIds: string[]): Promise<number> {
  const questionIdSet = new Set(questionIds);
  return updateData<Response, number>(FILE, (responses) => {
    const retained = responses.filter((response) => !questionIdSet.has(response.question_id));
    return {
      data: retained,
      result: responses.length - retained.length,
    };
  });
}
