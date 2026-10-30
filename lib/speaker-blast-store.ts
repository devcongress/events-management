import type { Context } from 'hono';
import { readData, updateData } from '@/lib/mock-db';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import type { SpeakerBlast } from '@/lib/speaker-blasts';
import type { Json } from '@/types/supabase';

type Stored = { id: string; event_id: string; revision: number; payload: SpeakerBlast };
const FILE = 'speaker-blasts';

export async function listSpeakerBlasts(eventId: string, c?: Context, historyOnly = false): Promise<Stored[]> {
  if (!isSupabaseRuntimeEnabled(c)) {
    return (await readData<Stored>(FILE))
      .filter((row) => row.event_id === eventId && (!historyOnly || row.payload.status !== 'preview'))
      .sort((a, b) => b.payload.created_at.localeCompare(a.payload.created_at))
      .slice(0, 50);
  }
  let query = getSupabaseAdminClient(c).from('speaker_blasts').select('*').eq('event_id', eventId);

  if (historyOnly) query = query.neq('payload->>status', 'preview');
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

  if (error) throw new Error('Speaker blast storage is unavailable.');

  return data.map((row) => ({ ...row, payload: row.payload as unknown as SpeakerBlast }));
}

export async function getSpeakerBlast(id: string, eventId: string, c?: Context): Promise<Stored | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return (await readData<Stored>(FILE)).find((row) => row.id === id && row.event_id === eventId);
  const { data, error } = await getSupabaseAdminClient(c).from('speaker_blasts').select('*').eq('id', id).eq('event_id', eventId).maybeSingle();

  if (error) throw new Error('Speaker blast storage is unavailable.');

  return data ? { ...data, payload: data.payload as unknown as SpeakerBlast } : undefined;
}

export async function createSpeakerBlast(payload: SpeakerBlast, c?: Context): Promise<void> {
  const row = { id: payload.id, event_id: payload.event_id, revision: 1, payload };

  if (!isSupabaseRuntimeEnabled(c)) {
    await updateData<Stored, void>(FILE, (rows) => ({ data: [...rows, row], result: undefined }));

    return;
  }
  const { error } = await getSupabaseAdminClient(c).from('speaker_blasts').insert({ ...row, payload: payload as unknown as Json });

  if (error) throw new Error('Speaker blast preview could not be saved.');
}

/** Compare-and-set owns the send lease across Workers, not only within one process. */
export async function replaceSpeakerBlast(previous: Stored, payload: SpeakerBlast, c?: Context): Promise<Stored | null> {
  const next = { ...previous, revision: previous.revision + 1, payload };

  if (!isSupabaseRuntimeEnabled(c)) {
    return updateData<Stored, Stored | null>(FILE, (rows) => {
      const index = rows.findIndex((row) => row.id === previous.id && row.revision === previous.revision);

      if (index < 0) return { data: rows, result: null };
      rows[index] = next;

      return { data: rows, result: next };
    });
  }
  const { data, error } = await getSupabaseAdminClient(c).from('speaker_blasts')
    .update({ payload: payload as unknown as Json, revision: next.revision })
    .eq('id', previous.id).eq('event_id', previous.event_id).eq('revision', previous.revision).select('id').maybeSingle();

  if (error) throw new Error('Speaker blast state could not be saved.');

  return data ? next : null;
}
