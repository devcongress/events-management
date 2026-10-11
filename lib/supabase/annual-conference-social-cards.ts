import type { Context } from 'hono';
import { DEVCON26_SOCIAL_CARD_BUCKET, hashDevcon26SocialCardCapability, type Devcon26SocialCardRole } from '@/lib/annual-conference-social-cards';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

export type AnnualConferenceSocialCard = {
  id: string;
  edition_id: string;
  role: Devcon26SocialCardRole;
  display_name: string;
  public_slug: string;
  photo_path: string | null;
  crop_x: number;
  crop_y: number;
  crop_scale: number;
  public_enabled: boolean;
  revoked_at: string | null;
  ticket_id: string | null;
  session_id: string | null;
};

export type AnnualConferenceSocialCardEmailDelivery = {
  id: string;
  recipient_name: string;
  recipient_email: string;
  capability: string;
  idempotency_key: string;
};

function mapCard(row: Record<string, unknown>): AnnualConferenceSocialCard {
  return {
    id: String(row.id), edition_id: String(row.edition_id), role: row.subject_type as 'attendee' | 'speaker',
    display_name: String(row.display_name), public_slug: String(row.public_slug), photo_path: typeof row.photo_path === 'string' ? row.photo_path : null,
    crop_x: Number(row.crop_x), crop_y: Number(row.crop_y), crop_scale: Number(row.crop_scale), public_enabled: Boolean(row.public_enabled),
    revoked_at: typeof row.revoked_at === 'string' ? row.revoked_at : null,
    ticket_id: typeof row.ticket_id === 'string' ? row.ticket_id : null,
    session_id: typeof row.session_id === 'string' ? row.session_id : null,
  };
}

async function socialCardSubjectIsEligible(card: AnnualConferenceSocialCard, c?: Context): Promise<boolean> {
  const client = getSupabaseAdminClient(c);

  if (card.role === 'attendee') {
    if (!card.ticket_id) return false;
    const result = await client.from('annual_conference_tickets').select('id').eq('id', card.ticket_id).in('status', ['issued', 'checked_in']).maybeSingle();

    if (result.error) throw new Error(result.error.message);

    return Boolean(result.data);
  }

  if (!card.session_id) return false;
  const result = await client
    .from('annual_conference_sessions')
    .select('id, annual_conference_speaker_submissions!inner(status)')
    .eq('id', card.session_id)
    .eq('status', 'confirmed')
    .eq('annual_conference_speaker_submissions.status', 'selected')
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);

  return Boolean(result.data);
}

export async function issueSupabaseAnnualConferenceSocialCardDelivery(input: { editionId: string; subjectType: 'attendee' | 'speaker'; subjectId: string }, c?: Context) {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const result = await getSupabaseAdminClient(c).rpc('issue_annual_conference_social_card_delivery' as never, {
    p_edition_id: input.editionId, p_subject_type: input.subjectType, p_subject_id: input.subjectId,
  } as never) as unknown as { data: Array<{ social_card_id: string; management_capability: string }> | null; error: { message: string } | null };

  if (result.error) throw new Error(result.error.message);

  return result.data?.[0] ?? null;
}

export async function claimSupabaseAnnualConferenceSocialCardEmailDeliveries(claimToken: string, limit: number, c?: Context): Promise<AnnualConferenceSocialCardEmailDelivery[]> {
  if (!isSupabaseRuntimeEnabled(c)) throw new Error('Social-card delivery storage is not configured.');
  const result = await getSupabaseAdminClient(c).rpc('claim_annual_conference_social_card_email_outbox' as never, {
    p_claim_token: claimToken,
    p_limit: limit,
  } as never) as unknown as { data: AnnualConferenceSocialCardEmailDelivery[] | null; error: { message: string } | null };

  if (result.error) throw new Error(result.error.message);

  return result.data ?? [];
}

export async function finalizeSupabaseAnnualConferenceSocialCardEmailDelivery(input: {
  deliveryId: string;
  claimToken: string;
  status: 'accepted' | 'failed';
  providerEmailId?: string;
  lastError?: string;
  nextAttemptAt?: string;
}, c?: Context): Promise<void> {
  if (!isSupabaseRuntimeEnabled(c)) throw new Error('Social-card delivery storage is not configured.');
  const result = await getSupabaseAdminClient(c).rpc('finalize_annual_conference_social_card_email_outbox' as never, {
    p_outbox_id: input.deliveryId,
    p_claim_token: input.claimToken,
    p_status: input.status,
    p_provider_email_id: input.providerEmailId ?? null,
    p_last_error: input.lastError ?? null,
    p_next_attempt_at: input.nextAttemptAt ?? null,
  } as never) as unknown as { error: { message: string } | null };

  if (result.error) throw new Error(result.error.message);
}

export async function getSupabaseAnnualConferenceSocialCardByCapability(capability: string, c?: Context): Promise<AnnualConferenceSocialCard | null | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return undefined;
  const result = await getSupabaseAdminClient(c).from('annual_conference_social_cards' as never).select('*').eq('management_token_hash', hashDevcon26SocialCardCapability(capability)).is('revoked_at', null).maybeSingle() as unknown as { data: Record<string, unknown> | null; error: { message: string } | null };

  if (result.error) throw new Error(result.error.message);

  if (!result.data) return null;
  const card = mapCard(result.data);

  return await socialCardSubjectIsEligible(card, c) ? card : null;
}

export async function getSupabasePublicAnnualConferenceSocialCard(slug: string, c?: Context): Promise<AnnualConferenceSocialCard | null | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return undefined;
  const result = await getSupabaseAdminClient(c).from('annual_conference_social_cards' as never).select('*').eq('public_slug', slug).eq('public_enabled', true).is('revoked_at', null).maybeSingle() as unknown as { data: Record<string, unknown> | null; error: { message: string } | null };

  if (result.error) throw new Error(result.error.message);

  if (!result.data) return null;
  const card = mapCard(result.data);

  return await socialCardSubjectIsEligible(card, c) ? card : null;
}

export async function updateSupabaseAnnualConferenceSocialCard(id: string, input: { displayName?: string; crop?: { x: number; y: number; scale: number }; publicEnabled?: boolean; photoPath?: string | null }, c?: Context): Promise<AnnualConferenceSocialCard | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const payload: Record<string, unknown> = {};

  if (input.displayName !== undefined) payload.display_name = input.displayName;
  if (input.crop) Object.assign(payload, { crop_x: input.crop.x, crop_y: input.crop.y, crop_scale: input.crop.scale });
  if (input.publicEnabled !== undefined) payload.public_enabled = input.publicEnabled;
  if (input.photoPath !== undefined) payload.photo_path = input.photoPath;
  const result = await getSupabaseAdminClient(c).from('annual_conference_social_cards' as never).update(payload as never).eq('id', id).select('*').single() as unknown as { data: Record<string, unknown> | null; error: { message: string } | null };

  if (result.error) throw new Error(result.error.message);

  return result.data ? mapCard(result.data) : null;
}

export async function uploadSupabaseAnnualConferenceSocialCardPhoto(cardId: string, file: File, c?: Context): Promise<string> {
  if (!isSupabaseRuntimeEnabled(c)) throw new Error('Social-card media storage is not configured.');
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.slice('image/'.length);
  const path = `cards/${cardId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await getSupabaseAdminClient(c).storage.from(DEVCON26_SOCIAL_CARD_BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type, cacheControl: '31536000', upsert: false });

  if (error) throw new Error(error.message);

  return path;
}
