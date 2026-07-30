import type { Context } from 'hono';
import type { EventBlast } from '@/types';
import type { Database } from '@/types/supabase';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from './server';

type BlastInsert = Database['public']['Tables']['event_blasts']['Insert'];
type BlastUpdate = Database['public']['Tables']['event_blasts']['Update'];

export class EventBlastStorageError extends Error {
  constructor(readonly code: string | null) {
    super('Event blast storage is unavailable.');
    this.name = 'EventBlastStorageError';
  }
}

export function canUseSupabaseEventBlasts(c?: Context): boolean {
  return isSupabaseRuntimeEnabled(c);
}

export async function getSupabaseEventBlasts(
  eventId: string,
  c?: Context,
): Promise<EventBlast[] | null> {
  if (!canUseSupabaseEventBlasts(c)) return null;
  const { data, error } = await getSupabaseAdminClient(c)
    .from('event_blasts')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw new EventBlastStorageError(error.code ?? null);
  return data;
}

export async function createSupabaseEventBlast(
  input: BlastInsert,
  c?: Context,
): Promise<EventBlast | null> {
  if (!canUseSupabaseEventBlasts(c)) return null;
  const { data, error } = await getSupabaseAdminClient(c).from('event_blasts').insert(input).select('*').single();
  if (error) throw new EventBlastStorageError(error.code ?? null);
  return data;
}

export async function updateSupabaseEventBlast(
  id: string,
  input: BlastUpdate,
  c?: Context,
): Promise<EventBlast | null | undefined> {
  if (!canUseSupabaseEventBlasts(c)) return null;
  const { data, error } = await getSupabaseAdminClient(c)
    .from('event_blasts')
    .update(input)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw new EventBlastStorageError(error.code ?? null);
  return data;
}
