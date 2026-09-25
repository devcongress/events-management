import type { Context } from 'hono';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { readData, updateData } from '@/lib/mock-db';
import type { Database } from '@/types/supabase';

type SlotRow = Database['public']['Tables']['event_blast_segment_slots']['Row'];

export type EventBlastSegmentSlot = SlotRow;

const SLOT_FILE = 'event-blast-segment-pool';
const EMPTY_SLOT = (slot_number: number): EventBlastSegmentSlot => ({
  slot_number,
  provider_segment_id: null,
  status: 'idle',
  active_event_id: null,
  active_blast_id: null,
  terminal_confirmed_at: null,
  last_error: null,
  updated_at: new Date(0).toISOString(),
});

async function getMockSlots(): Promise<EventBlastSegmentSlot[]> {
  const stored = await readData<EventBlastSegmentSlot>(SLOT_FILE);
  const slots = [1, 2, 3].map((number) => stored.find((slot) => slot.slot_number === number) ?? EMPTY_SLOT(number));

  if (stored.length !== slots.length) await updateData<EventBlastSegmentSlot, void>(SLOT_FILE, () => ({ data: slots, result: undefined }));

  return slots;
}

export async function claimEventBlastSegmentSlot(blastId: string, eventId: string, c?: Context): Promise<EventBlastSegmentSlot | null> {
  if (isSupabaseRuntimeEnabled(c)) {
    const { data, error } = await getSupabaseAdminClient(c).rpc('claim_event_blast_segment_slot', { p_blast_id: blastId, p_event_id: eventId });

    if (error) throw new Error('Unable to reserve an event blast segment slot.');

    return data[0] ?? null;
  }

  return updateData<EventBlastSegmentSlot, EventBlastSegmentSlot | null>(SLOT_FILE, (stored) => {
    const slots = [1, 2, 3].map((number) => stored.find((slot) => slot.slot_number === number) ?? EMPTY_SLOT(number));
    const existing = slots.find((slot) => slot.active_blast_id === blastId && slot.active_event_id === eventId);

    if (existing) return { data: slots, result: existing };

    const free = slots.find((slot) => slot.status === 'idle' && slot.active_blast_id === null);

    if (!free) return { data: slots, result: null };

    const claimed = { ...free, status: 'reserved', active_event_id: eventId, active_blast_id: blastId, terminal_confirmed_at: null, last_error: null, updated_at: new Date().toISOString() };

    return {
      data: slots.map((slot) => slot.slot_number === free.slot_number ? claimed : slot),
      result: claimed,
    };
  });
}

export async function setEventBlastSegmentSlotProviderId(
  blastId: string,
  slotNumber: number,
  providerSegmentId: string,
  c?: Context,
): Promise<boolean> {
  if (isSupabaseRuntimeEnabled(c)) {
    const { data, error } = await getSupabaseAdminClient(c).rpc('set_event_blast_segment_slot_provider_id', {
      p_blast_id: blastId,
      p_slot_number: slotNumber,
      p_provider_segment_id: providerSegmentId,
    });

    if (error) throw new Error('Unable to save the provider segment for this slot.');

    return data;
  }

  return updateData<EventBlastSegmentSlot, boolean>(SLOT_FILE, (stored) => {
    const slots = [1, 2, 3].map((number) => stored.find((slot) => slot.slot_number === number) ?? EMPTY_SLOT(number));
    const slot = slots.find((item) => item.slot_number === slotNumber && item.active_blast_id === blastId);

    if (!slot) return { data: slots, result: false };
    slot.provider_segment_id = providerSegmentId;
    slot.updated_at = new Date().toISOString();

    return { data: slots, result: true };
  });
}

export async function markEventBlastSegmentTerminal(blastId: string, slotNumber: number, c?: Context): Promise<boolean> {
  if (isSupabaseRuntimeEnabled(c)) {
    const { data, error } = await getSupabaseAdminClient(c).rpc('mark_event_blast_segment_terminal', {
      p_blast_id: blastId,
      p_slot_number: slotNumber,
    });

    if (error) throw new Error('Unable to record terminal provider status for the blast segment.');

    return data;
  }

  return updateData<EventBlastSegmentSlot, boolean>(SLOT_FILE, (stored) => {
    const slots = [1, 2, 3].map((number) => stored.find((slot) => slot.slot_number === number) ?? EMPTY_SLOT(number));
    const slot = slots.find((item) => item.slot_number === slotNumber && item.active_blast_id === blastId);

    if (!slot) return { data: slots, result: false };
    slot.status = 'clearing';
    slot.terminal_confirmed_at = new Date().toISOString();
    slot.updated_at = new Date().toISOString();

    return { data: slots, result: true };
  });
}

export async function releaseEventBlastSegmentSlot(blastId: string, slotNumber: number, c?: Context): Promise<boolean> {
  if (isSupabaseRuntimeEnabled(c)) {
    const { data, error } = await getSupabaseAdminClient(c).rpc('release_event_blast_segment_slot', {
      p_blast_id: blastId,
      p_slot_number: slotNumber,
    });

    if (error) throw new Error('Unable to release the cleared event blast segment slot.');

    return data;
  }

  return updateData<EventBlastSegmentSlot, boolean>(SLOT_FILE, (stored) => {
    const slots = [1, 2, 3].map((number) => stored.find((slot) => slot.slot_number === number) ?? EMPTY_SLOT(number));
    const slot = slots.find((item) => item.slot_number === slotNumber && item.active_blast_id === blastId);

    if (!slot || slot.status !== 'clearing' || !slot.terminal_confirmed_at) return { data: slots, result: false };
    const released = { ...slot, status: 'idle', active_event_id: null, active_blast_id: null, terminal_confirmed_at: null, last_error: null, updated_at: new Date().toISOString() };

    return {
      data: slots.map((item) => item.slot_number === slotNumber ? released : item),
      result: true,
    };
  });
}

export async function findOwnedEventBlastSegmentSlot(
  blastId: string,
  eventId: string,
  slotNumber: number,
  c?: Context,
): Promise<EventBlastSegmentSlot | null> {
  const slots = await listEventBlastSegmentSlots(c);

  return slots.find((slot) => slot.slot_number === slotNumber
    && slot.active_blast_id === blastId
    && slot.active_event_id === eventId) ?? null;
}

export async function recordEventBlastSegmentSlotError(
  blastId: string,
  slotNumber: number,
  errorMessage: string,
  c?: Context,
): Promise<boolean> {
  if (isSupabaseRuntimeEnabled(c)) {
    const { data, error } = await getSupabaseAdminClient(c).rpc('record_event_blast_segment_slot_error', {
      p_blast_id: blastId,
      p_slot_number: slotNumber,
      p_last_error: errorMessage.slice(0, 500),
    });

    if (error) throw new Error('Unable to record the event blast segment cleanup error.');

    return data;
  }

  return updateData<EventBlastSegmentSlot, boolean>(SLOT_FILE, (stored) => {
    const slots = [1, 2, 3].map((number) => stored.find((slot) => slot.slot_number === number) ?? EMPTY_SLOT(number));
    const slot = slots.find((item) => item.slot_number === slotNumber && item.active_blast_id === blastId);

    if (!slot) return { data: slots, result: false };
    slot.last_error = errorMessage.slice(0, 500);
    slot.updated_at = new Date().toISOString();

    return { data: slots, result: true };
  });
}

export async function listEventBlastSegmentSlots(c?: Context): Promise<EventBlastSegmentSlot[]> {
  if (isSupabaseRuntimeEnabled(c)) {
    const { data, error } = await getSupabaseAdminClient(c).rpc('list_event_blast_segment_slots');

    if (error) throw new Error('Unable to load event blast segment slots.');

    return data;
  }

  return getMockSlots();
}
