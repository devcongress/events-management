import { readData, updateData } from './index';
import type { EventSpeaker } from '@/types';
import { generateId, now } from '@/lib/utils';

const FILE = 'speakers';

export async function getAllSpeakers(): Promise<EventSpeaker[]> {
  return readData<EventSpeaker>(FILE);
}

export async function getSpeakerById(id: string): Promise<EventSpeaker | undefined> {
  const speakers = await readData<EventSpeaker>(FILE);
  return speakers.find(s => s.id === id);
}

export async function getSpeakersByEvent(eventId: string): Promise<EventSpeaker[]> {
  const speakers = await readData<EventSpeaker>(FILE);
  return speakers.filter(s => s.event_id === eventId);
}

export async function getSpeakerByEmail(eventId: string, email: string): Promise<EventSpeaker | undefined> {
  const speakers = await readData<EventSpeaker>(FILE);
  return speakers.find(s => s.event_id === eventId && s.email.toLowerCase() === email.toLowerCase());
}

export async function addSpeaker(
  data: Omit<EventSpeaker, 'id' | 'added_at'>
): Promise<EventSpeaker> {
  const newSpeaker: EventSpeaker = {
    ...data,
    id: generateId(),
    added_at: now(),
  };

  return updateData<EventSpeaker, EventSpeaker>(FILE, (speakers) => {
    const existing = speakers.find((speaker) => (
      speaker.event_id === data.event_id
      && speaker.email.toLowerCase() === data.email.toLowerCase()
    ));

    if (existing) {
      throw new Error('Speaker with this email already exists for this event');
    }

    return {
      data: [...speakers, newSpeaker],
      result: newSpeaker,
    };
  });
}

export async function removeSpeaker(id: string): Promise<void> {
  await updateData<EventSpeaker, void>(FILE, (speakers) => {
    const filtered = speakers.filter(s => s.id !== id);

    if (filtered.length === speakers.length) {
      throw new Error(`Speaker ${id} not found`);
    }

    return {
      data: filtered,
      result: undefined,
    };
  });
}
