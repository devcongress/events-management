import crypto from 'crypto';
import { readData, updateData } from './index';
import type { ArchiveItemKind, SpeakerIntakeEmailStatus, SpeakerIntakeLink } from '@/types';
import { generateId, now } from '@/lib/utils';

const FILE = 'speaker-intake-links';
const TOKEN_BYTES = 32;

function normalizeArchiveItemKind(value: SpeakerIntakeLink['kind']): ArchiveItemKind {
  return value === 'product_demo' ? 'product_demo' : 'talk';
}

function normalizeSpeakerIntakeLink(link: SpeakerIntakeLink): SpeakerIntakeLink {
  return {
    ...link,
    kind: normalizeArchiveItemKind(link.kind),
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

export function speakerIntakeLinkExpired(link: Pick<SpeakerIntakeLink, 'expires_at'>, at = new Date()): boolean {
  return new Date(link.expires_at).getTime() <= at.getTime();
}

export async function getSpeakerIntakeLinksByEvent(eventId: string): Promise<SpeakerIntakeLink[]> {
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
    token,
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
  const links = await readData<SpeakerIntakeLink>(FILE);
  const link = links.find((item) => item.event_id === eventId && item.token_hash === tokenHash);
  return link ? normalizeSpeakerIntakeLink(link) : undefined;
}

export async function consumeSpeakerIntakeLink(eventId: string, token: string, talkId: string): Promise<SpeakerIntakeLink> {
  const tokenHash = hashSpeakerIntakeToken(token);

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
