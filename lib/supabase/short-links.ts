import crypto from 'crypto';
import type { Context } from 'hono';
import type { ShortLinkDestination, ShortLinkStatus } from '@/types/supabase';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from './server';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 5;

export interface ShortLinkRecord {
  id: string;
  code: string;
  destination: ShortLinkDestination;
  event_id: string | null;
  conference_edition_id: string | null;
  status: ShortLinkStatus;
  created_by_membership_id: string | null;
  redirect_count: number;
  last_redirected_at: string | null;
  created_at: string;
  updated_at: string;
}

export class ShortLinkStorageError extends Error {
  constructor(message: string, readonly code: 'not_configured' | 'not_found' | 'unavailable') {
    super(message);
  }
}

function client(c?: Context) {
  if (!isSupabaseServerConfigured(c)) {
    throw new ShortLinkStorageError('Short links are not configured.', 'not_configured');
  }
  return getSupabaseAdminClient(c);
}

function nextCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export async function listShortLinks(c?: Context): Promise<ShortLinkRecord[]> {
  const { data, error } = await client(c).from('short_links').select('*').order('created_at', { ascending: false });
  if (error) throw new ShortLinkStorageError('Unable to load short links.', 'unavailable');
  return (data ?? []) as ShortLinkRecord[];
}

export async function createShortLink(input: {
  destination: ShortLinkDestination;
  eventId?: string | null;
  conferenceEditionId?: string | null;
  createdByMembershipId: string;
}, c?: Context): Promise<ShortLinkRecord> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await client(c).from('short_links').insert({
      code: nextCode(),
      destination: input.destination,
      event_id: input.eventId ?? null,
      conference_edition_id: input.conferenceEditionId ?? null,
      created_by_membership_id: input.createdByMembershipId,
    }).select('*').single();
    if (!error && data) return data as ShortLinkRecord;
    if (error?.code !== '23505') break;
  }
  throw new ShortLinkStorageError('Unable to create a unique short link.', 'unavailable');
}

export async function revokeShortLink(id: string, c?: Context): Promise<ShortLinkRecord> {
  const { data, error } = await client(c).from('short_links').update({ status: 'revoked' }).eq('id', id).eq('status', 'active').select('*').maybeSingle();
  if (error) throw new ShortLinkStorageError('Unable to revoke this short link.', 'unavailable');
  if (!data) throw new ShortLinkStorageError('This short link is no longer active.', 'not_found');
  return data as ShortLinkRecord;
}

export async function resolveShortLink(code: string, c?: Context): Promise<Pick<ShortLinkRecord, 'id' | 'destination' | 'event_id' | 'conference_edition_id'> | null> {
  const { data, error } = await client(c).rpc('resolve_active_short_link', { input_code: code });
  if (error) throw new ShortLinkStorageError('Unable to resolve this short link.', 'unavailable');
  return data?.[0] ?? null;
}
