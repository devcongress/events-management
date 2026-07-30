import type { EventBlast, EventBlastStatus } from '@/types';
import { generateId, now } from '@/lib/utils';
import { readData, updateData } from './index';

const BLASTS_FILE = 'event-blasts';

export async function getMockEventBlasts(eventId: string): Promise<EventBlast[]> {
  return (await readData<EventBlast>(BLASTS_FILE))
    .filter((blast) => blast.event_id === eventId)
    .sort((first, second) => second.created_at.localeCompare(first.created_at));
}

export async function createMockEventBlast(input: Omit<EventBlast, 'id' | 'created_at' | 'updated_at'>): Promise<EventBlast> {
  const timestamp = now();
  const blast: EventBlast = {
    ...input,
    id: generateId(),
    created_at: timestamp,
    updated_at: timestamp,
  };
  await updateData<EventBlast, void>(BLASTS_FILE, (blasts) => ({
    data: [...blasts, blast],
    result: undefined,
  }));
  return blast;
}

export async function updateMockEventBlast(
  id: string,
  input: Partial<Pick<EventBlast, 'status' | 'sent_at' | 'provider_broadcast_id' | 'provider_segment_id'>>,
): Promise<EventBlast | undefined> {
  return updateData<EventBlast, EventBlast | undefined>(BLASTS_FILE, (blasts) => {
    const index = blasts.findIndex((blast) => blast.id === id);
    if (index < 0) return { data: blasts, result: undefined };
    blasts[index] = { ...blasts[index], ...input, updated_at: now() };
    return { data: blasts, result: blasts[index] };
  });
}

export function mockBlastStatus(input: { scheduledFor: string | null }): EventBlastStatus {
  return input.scheduledFor ? 'scheduled' : 'sent';
}
