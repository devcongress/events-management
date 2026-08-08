import crypto from 'crypto';
import { readData, updateData } from './index';
import type { ArchiveItemKind, ArchiveMaterialField, SpeakerIntakeEmailStatus, SpeakerIntakeLink } from '@/types';
import type { Database } from '@/types/supabase';
import { generateId, now } from '@/lib/utils';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

const FILE = 'speaker-intake-links';
const TOKEN_BYTES = 32;
type SpeakerIntakeLinkRow = Database['public']['Tables']['speaker_intake_links']['Row'];

function normalizeArchiveItemKind(value: SpeakerIntakeLink['kind']): ArchiveItemKind {
  return value === 'product_demo' ? 'product_demo' : 'talk';
}

function normalizeSpeakerIntakeLink(link: SpeakerIntakeLink): SpeakerIntakeLink {
  return {
    ...link,
    // Raw bearer tokens are intentionally never retained. The hash is enough
    // to validate the token supplied by the presenter.
    token: null,
    kind: normalizeArchiveItemKind(link.kind),
    purpose: link.purpose === 'selected_speaker_confirmation' || link.purpose === 'archive_materials_follow_up'
      ? link.purpose
      : 'archive_backfill',
    talk_id: link.talk_id ?? null,
    requested_fields: (link.requested_fields ?? []).filter((field): field is ArchiveMaterialField => (
      field === 'abstract' || field === 'bio' || field === 'slides_url'
    )),
    email_status: link.email_status === 'pending' || link.email_status === 'accepted' || link.email_status === 'failed'
      ? link.email_status
      : null,
    email_provider_id: link.email_provider_id ?? null,
    email_idempotency_key: link.email_idempotency_key ?? null,
    email_sent_at: link.email_sent_at ?? null,
    email_last_attempt_at: link.email_last_attempt_at ?? null,
    email_last_error: link.email_last_error ?? null,
  };
}

function fromSupabaseRow(row: SpeakerIntakeLinkRow): SpeakerIntakeLink {
  return normalizeSpeakerIntakeLink({
    ...row,
    kind: row.kind === 'product_demo' ? 'product_demo' : 'talk',
    purpose: row.purpose === 'selected_speaker_confirmation' || row.purpose === 'archive_materials_follow_up'
      ? row.purpose
      : 'archive_backfill',
    talk_id: row.talk_id ?? null,
    requested_fields: (row.requested_fields ?? []).filter((field): field is ArchiveMaterialField => (
      field === 'abstract' || field === 'bio' || field === 'slides_url'
    )),
    email_status: row.email_status === 'pending' || row.email_status === 'accepted' || row.email_status === 'failed'
      ? row.email_status
      : null,
    token: null,
  });
}

export function speakerIntakeLinkExpired(link: Pick<SpeakerIntakeLink, 'expires_at'>, at = new Date()): boolean {
  return new Date(link.expires_at).getTime() <= at.getTime();
}

export async function getSpeakerIntakeLinksByEvent(eventId: string): Promise<SpeakerIntakeLink[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('speaker_intake_links')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Unable to load archive request links');
    return (data ?? []).map(fromSupabaseRow);
  }

  const links = await readData<SpeakerIntakeLink>(FILE);
  return links
    .map(normalizeSpeakerIntakeLink)
    .filter((link) => link.event_id === eventId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createSpeakerIntakeLink(data: {
  event_id: string;
  event_month: string;
  expires_at: string;
  kind?: ArchiveItemKind;
  purpose?: SpeakerIntakeLink['purpose'];
  speaker_submission_id?: string | null;
  speaker_name?: string | null;
  speaker_email?: string | null;
  talk_title?: string | null;
  talk_id?: string | null;
  requested_fields?: ArchiveMaterialField[];
}): Promise<{ link: SpeakerIntakeLink; token: string }> {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashSpeakerIntakeToken(token);
  const createdAt = now();
  const link: SpeakerIntakeLink = {
    id: generateId(),
    event_id: data.event_id,
    event_month: data.event_month,
    kind: normalizeArchiveItemKind(data.kind),
    purpose: data.purpose ?? 'archive_backfill',
    speaker_submission_id: data.speaker_submission_id ?? null,
    speaker_name: data.speaker_name ?? null,
    speaker_email: data.speaker_email ?? null,
    talk_title: data.talk_title ?? null,
    talk_id: data.talk_id ?? null,
    requested_fields: data.requested_fields ?? [],
    token: null,
    token_hash: tokenHash,
    email_status: null,
    email_provider_id: null,
    email_idempotency_key: null,
    email_sent_at: null,
    email_last_attempt_at: null,
    email_last_error: null,
    expires_at: data.expires_at,
    used_at: null,
    used_talk_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  if (isSupabaseRuntimeEnabled()) {
    const { data: stored, error } = await getSupabaseAdminClient()
      .from('speaker_intake_links')
      .insert({
        id: link.id,
        event_id: link.event_id,
        event_month: link.event_month,
        kind: normalizeArchiveItemKind(link.kind),
        purpose: link.purpose ?? 'archive_backfill',
        speaker_submission_id: link.speaker_submission_id ?? null,
        speaker_name: link.speaker_name ?? null,
        speaker_email: link.speaker_email ?? null,
        talk_title: link.talk_title ?? null,
        talk_id: link.talk_id ?? null,
        requested_fields: link.requested_fields ?? [],
        token_hash: link.token_hash,
        email_status: link.email_status ?? null,
        email_provider_id: link.email_provider_id ?? null,
        email_idempotency_key: link.email_idempotency_key ?? null,
        email_sent_at: link.email_sent_at ?? null,
        email_last_attempt_at: link.email_last_attempt_at ?? null,
        email_last_error: link.email_last_error ?? null,
        expires_at: link.expires_at,
        used_at: link.used_at,
        used_talk_id: link.used_talk_id,
        created_at: link.created_at,
        updated_at: link.updated_at,
      })
      .select('*')
      .single();

    if (error || !stored) throw new Error('Unable to create archive request link');
    return { link: fromSupabaseRow(stored), token };
  }

  await updateData<SpeakerIntakeLink, SpeakerIntakeLink>(FILE, (links) => ({
    data: [...links.map(normalizeSpeakerIntakeLink), link],
    result: link,
  }));

  return { link, token };
}

export async function updateSpeakerIntakeLinkEmailDeliveries(
  eventId: string,
  updates: {
    id: string;
    status: SpeakerIntakeEmailStatus;
    provider_id?: string | null;
    idempotency_key: string;
    error?: string | null;
  }[],
): Promise<SpeakerIntakeLink[]> {
  if (updates.length === 0) return [];

  if (isSupabaseRuntimeEnabled()) {
    const client = getSupabaseAdminClient();
    const updateIds = updates.map((update) => update.id);
    const { data: existing, error: existingError } = await client
      .from('speaker_intake_links')
      .select('*')
      .eq('event_id', eventId)
      .in('id', updateIds);

    if (existingError || (existing ?? []).length !== updateIds.length) {
      throw new Error('One or more archive request links were not found');
    }

    const attemptedAt = now();
    const updatedRows = await Promise.all(updates.map(async (update) => {
      const changes: Database['public']['Tables']['speaker_intake_links']['Update'] = {
        email_status: update.status,
        email_provider_id: update.provider_id ?? null,
        email_idempotency_key: update.idempotency_key,
        email_last_attempt_at: attemptedAt,
        email_last_error: update.status === 'failed' ? update.error ?? 'Email send failed' : null,
      };
      if (update.status === 'accepted') {
        changes.email_sent_at = attemptedAt;
      }

      const { data, error } = await client
        .from('speaker_intake_links')
        .update(changes)
        .eq('event_id', eventId)
        .eq('id', update.id)
        .select('*')
        .single();

      if (error || !data) throw new Error('Unable to update archive request email status');
      return fromSupabaseRow(data);
    }));

    return updatedRows;
  }

  return updateData<SpeakerIntakeLink, SpeakerIntakeLink[]>(FILE, (links) => {
    const normalizedLinks = links.map(normalizeSpeakerIntakeLink);
    const updatesById = new Map(updates.map((update) => [update.id, update]));
    const matchingIds = new Set(normalizedLinks
      .filter((link) => link.event_id === eventId && updatesById.has(link.id))
      .map((link) => link.id));

    if (matchingIds.size !== updatesById.size) {
      throw new Error('One or more archive request links were not found');
    }

    const attemptedAt = now();
    const updatedLinks: SpeakerIntakeLink[] = [];
    const nextLinks = normalizedLinks.map((link) => {
      if (link.event_id !== eventId) return link;

      const update = updatesById.get(link.id);
      if (!update) return link;

      const updatedLink: SpeakerIntakeLink = {
        ...link,
        email_status: update.status,
        email_provider_id: update.provider_id ?? null,
        email_idempotency_key: update.idempotency_key,
        email_sent_at: update.status === 'accepted' ? attemptedAt : link.email_sent_at ?? null,
        email_last_attempt_at: attemptedAt,
        email_last_error: update.status === 'failed' ? update.error ?? 'Email send failed' : null,
        updated_at: attemptedAt,
      };
      updatedLinks.push(updatedLink);
      return updatedLink;
    });

    return {
      data: nextLinks,
      result: updatedLinks,
    };
  });
}

export async function deleteSpeakerIntakeLink(eventId: string, linkId: string): Promise<SpeakerIntakeLink> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('speaker_intake_links')
      .delete()
      .eq('event_id', eventId)
      .eq('id', linkId)
      .select('*')
      .maybeSingle();

    if (error) throw new Error('Unable to remove archive request link');
    if (!data) throw new Error('Archive request link not found');
    return fromSupabaseRow(data);
  }

  return updateData<SpeakerIntakeLink, SpeakerIntakeLink>(FILE, (links) => {
    const normalizedLinks = links.map(normalizeSpeakerIntakeLink);
    const link = normalizedLinks.find((item) => item.event_id === eventId && item.id === linkId);

    if (!link) {
      throw new Error('Archive request link not found');
    }

    return {
      data: normalizedLinks.filter((item) => item.id !== linkId),
      result: link,
    };
  });
}

export async function deleteActiveSpeakerIntakeLinksBySubmission(
  eventId: string,
  submissionId: string,
  keepLinkId: string | null = null,
): Promise<SpeakerIntakeLink[]> {
  if (isSupabaseRuntimeEnabled()) {
    let query = getSupabaseAdminClient()
      .from('speaker_intake_links')
      .select('*')
      .eq('event_id', eventId)
      .eq('purpose', 'selected_speaker_confirmation')
      .eq('speaker_submission_id', submissionId)
      .is('used_at', null)
      .gt('expires_at', now());

    if (keepLinkId) {
      query = query.neq('id', keepLinkId);
    }

    const { data: removable, error: selectError } = await query;
    if (selectError) throw new Error('Unable to verify superseded archive request links');
    if (!removable?.length) return [];

    const removableIds = removable.map((link) => link.id);
    const { error: deleteError } = await getSupabaseAdminClient()
      .from('speaker_intake_links')
      .delete()
      .in('id', removableIds);
    if (deleteError) throw new Error('Unable to remove superseded archive request links');
    return removable.map(fromSupabaseRow);
  }

  return updateData<SpeakerIntakeLink, SpeakerIntakeLink[]>(FILE, (links) => {
    const normalizedLinks = links.map(normalizeSpeakerIntakeLink);
    const removed = normalizedLinks.filter((link) => (
      link.event_id === eventId
      && link.purpose === 'selected_speaker_confirmation'
      && link.speaker_submission_id === submissionId
      && link.id !== keepLinkId
      && !link.used_at
      && !speakerIntakeLinkExpired(link)
    ));
    const removedIds = new Set(removed.map((link) => link.id));

    return {
      data: normalizedLinks.filter((link) => !removedIds.has(link.id)),
      result: removed,
    };
  });
}

export async function getSpeakerIntakeLinkByToken(eventId: string, token: string): Promise<SpeakerIntakeLink | undefined> {
  const tokenHash = hashSpeakerIntakeToken(token);

  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('speaker_intake_links')
      .select('*')
      .eq('event_id', eventId)
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) throw new Error('Unable to verify archive request link');
    return data ? fromSupabaseRow(data) : undefined;
  }

  const links = await readData<SpeakerIntakeLink>(FILE);
  const link = links.find((item) => item.event_id === eventId && item.token_hash === tokenHash);
  return link ? normalizeSpeakerIntakeLink(link) : undefined;
}

export async function claimSpeakerIntakeLink(
  eventId: string,
  token: string,
): Promise<{ link: SpeakerIntakeLink; claimId: string | null }> {
  if (!isSupabaseRuntimeEnabled()) {
    const link = await getSpeakerIntakeLinkByToken(eventId, token);
    if (!link) throw new Error('Archive request link is invalid');
    if (link.used_at) throw new Error('Archive request link has already been used');
    if (speakerIntakeLinkExpired(link)) throw new Error('Archive request link has expired');
    return { link, claimId: null };
  }

  const tokenHash = hashSpeakerIntakeToken(token);
  const claimId = crypto.randomUUID();
  const { data, error } = await getSupabaseAdminClient()
    .rpc('claim_speaker_intake_link', {
      p_event_id: eventId,
      p_token_hash: tokenHash,
      p_claim_id: claimId,
    });

  if (error) {
    if (error.message.includes('speaker_intake_link_used')) {
      throw new Error('Archive request link has already been used');
    }
    if (error.message.includes('speaker_intake_link_expired')) {
      throw new Error('Archive request link has expired');
    }
    if (error.message.includes('speaker_intake_link_claimed')) {
      throw new Error('Archive request link is already being submitted');
    }
    if (error.message.includes('speaker_intake_link_invalid')) {
      throw new Error('Archive request link is invalid');
    }
    throw new Error('Unable to claim archive request link');
  }
  if (!data) throw new Error('Archive request link is invalid');

  return {
    link: fromSupabaseRow(data),
    claimId,
  };
}

export async function releaseSpeakerIntakeLinkClaim(
  eventId: string,
  token: string,
  claimId: string | null,
): Promise<void> {
  if (!claimId || !isSupabaseRuntimeEnabled()) return;

  const { error } = await getSupabaseAdminClient()
    .rpc('release_speaker_intake_link_claim', {
      p_event_id: eventId,
      p_token_hash: hashSpeakerIntakeToken(token),
      p_claim_id: claimId,
    });

  if (error) {
    console.error(JSON.stringify({
      event: 'speaker_intake_claim_release_failed',
      event_id: eventId,
      error_code: error.code ?? null,
    }));
  }
}

export async function consumeSpeakerIntakeLink(
  eventId: string,
  token: string,
  talkId: string,
  claimId: string | null = null,
): Promise<SpeakerIntakeLink> {
  const tokenHash = hashSpeakerIntakeToken(token);

  if (isSupabaseRuntimeEnabled()) {
    if (!claimId) throw new Error('Archive request link claim is missing');

    const { data, error } = await getSupabaseAdminClient()
      .rpc('consume_speaker_intake_link', {
        p_event_id: eventId,
        p_token_hash: tokenHash,
        p_claim_id: claimId,
        p_talk_id: talkId,
      });

    if (error) {
      if (error.message.includes('speaker_intake_link_used')) {
        throw new Error('Archive request link has already been used');
      }
      if (error.message.includes('speaker_intake_link_expired')) {
        throw new Error('Archive request link has expired');
      }
      if (error.message.includes('speaker_intake_link_invalid')) {
        throw new Error('Archive request link is invalid');
      }
      throw new Error('Unable to consume archive request link');
    }
    if (!data) throw new Error('Archive request link is invalid');
    return fromSupabaseRow(data);
  }

  return updateData<SpeakerIntakeLink, SpeakerIntakeLink>(FILE, (links) => {
    const normalizedLinks = links.map(normalizeSpeakerIntakeLink);
    const index = normalizedLinks.findIndex((link) => link.event_id === eventId && link.token_hash === tokenHash);

    if (index === -1) {
      throw new Error('Archive request link is invalid');
    }

    const link = normalizedLinks[index];

    if (link.used_at) {
      throw new Error('Archive request link has already been used');
    }

    if (speakerIntakeLinkExpired(link)) {
      throw new Error('Archive request link has expired');
    }

    const updatedLink: SpeakerIntakeLink = {
      ...link,
      used_at: now(),
      used_talk_id: talkId,
      updated_at: now(),
    };
    const nextLinks = [...normalizedLinks];
    nextLinks[index] = updatedLink;

    return {
      data: nextLinks,
      result: updatedLink,
    };
  });
}

function hashSpeakerIntakeToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
