import crypto from 'crypto';
import { readData, updateData } from './index';
import type { SpeakerIntakeLink } from '@/types';
import { generateId, now } from '@/lib/utils';

const FILE = 'speaker-intake-links';
const TOKEN_BYTES = 32;

export function speakerIntakeLinkExpired(link: Pick<SpeakerIntakeLink, 'expires_at'>, at = new Date()): boolean {
  return new Date(link.expires_at).getTime() <= at.getTime();
}

export async function getSpeakerIntakeLinksByEvent(eventId: string): Promise<SpeakerIntakeLink[]> {
  const links = await readData<SpeakerIntakeLink>(FILE);
  return links
    .filter((link) => link.event_id === eventId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createSpeakerIntakeLink(data: {
  event_id: string;
  event_month: string;
  expires_at: string;
}): Promise<{ link: SpeakerIntakeLink; token: string }> {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashSpeakerIntakeToken(token);
  const createdAt = now();
  const link: SpeakerIntakeLink = {
    id: generateId(),
    event_id: data.event_id,
    event_month: data.event_month,
    token_hash: tokenHash,
    expires_at: data.expires_at,
    used_at: null,
    used_talk_id: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  await updateData<SpeakerIntakeLink, SpeakerIntakeLink>(FILE, (links) => ({
    data: [...links, link],
    result: link,
  }));

  return { link, token };
}

export async function getSpeakerIntakeLinkByToken(eventId: string, token: string): Promise<SpeakerIntakeLink | undefined> {
  const tokenHash = hashSpeakerIntakeToken(token);
  const links = await readData<SpeakerIntakeLink>(FILE);
  return links.find((link) => link.event_id === eventId && link.token_hash === tokenHash);
}

export async function consumeSpeakerIntakeLink(eventId: string, token: string, talkId: string): Promise<SpeakerIntakeLink> {
  const tokenHash = hashSpeakerIntakeToken(token);

  return updateData<SpeakerIntakeLink, SpeakerIntakeLink>(FILE, (links) => {
    const index = links.findIndex((link) => link.event_id === eventId && link.token_hash === tokenHash);

    if (index === -1) {
      throw new Error('Speaker form link is invalid');
    }

    const link = links[index];

    if (link.used_at) {
      throw new Error('Speaker form link has already been used');
    }

    if (speakerIntakeLinkExpired(link)) {
      throw new Error('Speaker form link has expired');
    }

    const updatedLink: SpeakerIntakeLink = {
      ...link,
      used_at: now(),
      used_talk_id: talkId,
      updated_at: now(),
    };
    const nextLinks = [...links];
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
