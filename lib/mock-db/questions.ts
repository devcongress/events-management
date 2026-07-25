import { readData, writeData } from './index';
import { Question } from '@/types';
import { generateId, now } from '@/lib/utils';
import { DEFAULT_TIME_LIMIT, DEFAULT_POINTS } from '@/lib/constants';

const FILE = 'questions';

export async function getAllQuestions(): Promise<Question[]> {
  return readData<Question>(FILE);
}

export async function getQuestionById(id: string): Promise<Question | undefined> {
  const questions = await readData<Question>(FILE);
  return questions.find(q => q.id === id);
}

export async function getQuestionsBySession(sessionId: string): Promise<Question[]> {
  const questions = await readData<Question>(FILE);
  return questions
    .filter(q => q.quiz_session_id === sessionId)
    .sort((a, b) => a.order_index - b.order_index);
}

export async function createQuestion(
  data: Omit<Question, 'id' | 'created_at' | 'time_limit_seconds' | 'points'> & {
    time_limit_seconds?: number;
    points?: number;
  }
): Promise<Question> {
  const questions = await readData<Question>(FILE);
  const newQuestion: Question = {
    ...data,
    id: generateId(),
    time_limit_seconds: data.time_limit_seconds ?? DEFAULT_TIME_LIMIT,
    points: data.points ?? DEFAULT_POINTS,
    created_at: now(),
  };
  questions.push(newQuestion);
  await writeData(FILE, questions);
  return newQuestion;
}

export async function updateQuestion(
  id: string,
  updates: Partial<Omit<Question, 'id' | 'created_at'>>
): Promise<Question> {
  const questions = await readData<Question>(FILE);
  const index = questions.findIndex(q => q.id === id);

  if (index === -1) {
    throw new Error(`Question ${id} not found`);
  }

  questions[index] = {
    ...questions[index],
    ...updates,
  };

  await writeData(FILE, questions);
  return questions[index];
}

export async function deleteQuestion(id: string): Promise<void> {
  const questions = await readData<Question>(FILE);
  const filtered = questions.filter(q => q.id !== id);
  await writeData(FILE, filtered);
}

export async function reorderQuestions(sessionId: string, questionIds: string[]): Promise<void> {
  const questions = await readData<Question>(FILE);
  const questionById = new Map(questions.map((question) => [question.id, question]));

  questionIds.forEach((id, index) => {
    const question = questionById.get(id);
    if (question) {
      question.order_index = index;
    }
  });

  await writeData(FILE, questions);
}
