import type { Context } from 'hono';
import type { EventBlast } from '@/types';
import {
  createMockEventBlast,
  getMockEventBlasts,
  getRecentMockEventBlasts,
  updateMockEventBlast,
} from '@/lib/mock-db/event-blasts';
import {
  createSupabaseEventBlast,
  getSupabaseEventBlasts,
  getRecentSupabaseEventBlasts,
  updateSupabaseEventBlast,
} from '@/lib/supabase/event-blasts';

export type CreateEventBlastInput = Omit<EventBlast, 'id' | 'created_at' | 'updated_at'>;
export type EventBlastAuditEntry = Pick<EventBlast,
  'id' | 'subject' | 'status' | 'recipient_count' | 'scheduled_for' | 'sent_at' | 'created_at' | 'updated_at'
>;

export async function getEventBlasts(eventId: string, c?: Context): Promise<EventBlast[]> {
  return await getSupabaseEventBlasts(eventId, c) ?? getMockEventBlasts(eventId);
}

export async function getRecentEventBlasts(limit: number, c?: Context): Promise<EventBlastAuditEntry[]> {
  const blasts = (await getRecentSupabaseEventBlasts(limit, c)) ?? await getRecentMockEventBlasts(limit);
  return blasts.map(({ id, subject, status, recipient_count, scheduled_for, sent_at, created_at, updated_at }) => ({
    id,
    subject,
    status,
    recipient_count,
    scheduled_for,
    sent_at,
    created_at,
    updated_at,
  }));
}

export async function createEventBlast(input: CreateEventBlastInput, c?: Context): Promise<EventBlast> {
  return await createSupabaseEventBlast(input, c) ?? createMockEventBlast(input);
}

export async function updateEventBlast(
  id: string,
  input: Partial<Pick<EventBlast, 'status' | 'sent_at' | 'provider_broadcast_id' | 'provider_segment_id'>>,
  c?: Context,
): Promise<EventBlast | undefined> {
  const result = await updateSupabaseEventBlast(id, input, c);
  return result !== null ? result : updateMockEventBlast(id, input);
}
