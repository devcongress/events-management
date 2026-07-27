import { readData, updateData } from './index';
import type { ArchiveItemKind, Talk } from '@/types';
import { generateId, now } from '@/lib/utils';

const FILE = 'talks';

function normalizeArchiveItemKind(value: Talk['kind']): ArchiveItemKind {
  return value === 'product_demo' ? 'product_demo' : 'talk';
}

function normalizeTalk(talk: Talk): Talk {
  return {
    ...talk,
    kind: normalizeArchiveItemKind(talk.kind),
  };
}

async function readTalks(): Promise<Talk[]> {
  return (await readData<Talk>(FILE)).map(normalizeTalk);
}

export async function getAllTalks(): Promise<Talk[]> {
  return readTalks();
}

export async function getTalkById(id: string): Promise<Talk | undefined> {
  const talks = await readTalks();
  return talks.find(t => t.id === id);
}

export async function getTalksByEvent(eventId: string): Promise<Talk[]> {
  const talks = await readTalks();
  return talks.filter(t => t.event_id === eventId);
}

export async function getTalksBySpeaker(email: string): Promise<Talk[]> {
  const talks = await readTalks();
  return talks.filter(t => t.speaker_email === email);
}

export async function createTalk(
  data: Omit<Talk, 'id' | 'created_at' | 'updated_at' | 'status' | 'reminder_sent_count' | 'last_reminder_sent_at'>
): Promise<Talk> {
  const newTalk: Talk = {
    ...data,
    id: generateId(),
    kind: normalizeArchiveItemKind(data.kind),
    status: 'submitted',
    reminder_sent_count: 0,
    last_reminder_sent_at: null,
    created_at: now(),
    updated_at: now(),
  };

  return updateData<Talk, Talk>(FILE, (storedTalks) => {
    const talks = storedTalks.map(normalizeTalk);
    const duplicate = talks.some((talk) => (
      talk.event_id === newTalk.event_id
      && normalizeArchiveItemKind(talk.kind) === normalizeArchiveItemKind(newTalk.kind)
      && talk.speaker_email.toLowerCase() === newTalk.speaker_email.toLowerCase()
      && talk.title.trim().toLowerCase() === newTalk.title.trim().toLowerCase()
    ));

    if (duplicate) {
      throw new Error('This archive item already exists for this event');
    }

    return {
      data: [...talks, newTalk],
      result: newTalk,
    };
  });
}

export async function updateTalk(
  id: string,
  updates: Partial<Omit<Talk, 'id' | 'created_at'>>
): Promise<Talk> {
  return updateData<Talk, Talk>(FILE, (storedTalks) => {
    const talks = storedTalks.map(normalizeTalk);
    const index = talks.findIndex(t => t.id === id);

    if (index === -1) {
      throw new Error(`Talk ${id} not found`);
    }

    const updatedTalk: Talk = {
      ...talks[index],
      ...updates,
      kind: normalizeArchiveItemKind(updates.kind ?? talks[index].kind),
      updated_at: now(),
    };
    const nextTalks = [...talks];
    nextTalks[index] = updatedTalk;

    return {
      data: nextTalks,
      result: updatedTalk,
    };
  });
}

export async function deleteTalk(id: string): Promise<void> {
  await updateData<Talk, void>(FILE, (storedTalks) => ({
    data: storedTalks.map(normalizeTalk).filter(t => t.id !== id),
    result: undefined,
  }));
}
