import { readData, writeData } from './index';
import { Event, EventStatus } from '@/types';
import { generateId, now } from '@/lib/utils';

const FILE = 'events';

export async function getAllEvents(): Promise<Event[]> {
  return readData<Event>(FILE);
}

export async function getEventById(id: string): Promise<Event | undefined> {
  const events = await readData<Event>(FILE);
  return events.find(e => e.id === id);
}

export async function createEvent(
  data: Omit<Event, 'id' | 'created_at' | 'updated_at' | 'status'>
): Promise<Event> {
  const events = await readData<Event>(FILE);
  const publishToWebsite = data.publish_to_website ?? true;
  const newEvent: Event = {
    ...data,
    id: generateId(),
    publish_to_website: publishToWebsite,
    status: publishToWebsite ? 'upcoming' : 'draft',
    created_at: now(),
    updated_at: now(),
  };
  events.push(newEvent);
  await writeData(FILE, events);
  return newEvent;
}

export async function updateEvent(
  id: string,
  updates: Partial<Omit<Event, 'id' | 'created_at'>>
): Promise<Event> {
  const events = await readData<Event>(FILE);
  const index = events.findIndex(e => e.id === id);

  if (index === -1) {
    throw new Error(`Event ${id} not found`);
  }

  events[index] = {
    ...events[index],
    ...updates,
    updated_at: now(),
  };

  await writeData(FILE, events);
  return events[index];
}

export async function deleteEvent(id: string): Promise<void> {
  const events = await readData<Event>(FILE);
  const filtered = events.filter(e => e.id !== id);
  await writeData(FILE, filtered);
}
