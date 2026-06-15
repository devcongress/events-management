import type { Context } from 'hono';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from './server';

const MEETUP_MEDIA_BUCKET = 'meetup-media';
const MEETUP_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const MEETUP_MEDIA_TYPES = new Map([
  ['image/avif', 'avif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export type MeetupMediaPurpose = 'cover' | 'photo';

export function validateMeetupMediaFile(file: File): string | null {
  if (file.size > MEETUP_MEDIA_MAX_BYTES) {
    return 'Image must be 5MB or smaller';
  }

  if (!MEETUP_MEDIA_TYPES.has(file.type)) {
    return 'Use an AVIF, JPEG, PNG, or WebP image';
  }

  const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  const allowedExtensions = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);
  if (!allowedExtensions.has(extension)) {
    return 'Image file extension must be .avif, .jpg, .jpeg, .png, or .webp';
  }

  return null;
}

export function isMeetupMediaConfigured(c?: Context): boolean {
  return isSupabaseServerConfigured(c);
}

export async function uploadMeetupMedia(
  eventSlug: string,
  purpose: MeetupMediaPurpose,
  file: File,
  c?: Context,
): Promise<string> {
  if (!isMeetupMediaConfigured(c)) {
    throw new Error('Supabase media storage is not configured');
  }

  const extension = MEETUP_MEDIA_TYPES.get(file.type);
  if (!extension) {
    throw new Error('Unsupported image type');
  }

  const safeSlug = slugify(eventSlug) || 'event';
  const fileId = crypto.randomUUID();
  const path = purpose === 'cover'
    ? `events/${safeSlug}/cover.${extension}`
    : `events/${safeSlug}/photos/${fileId}.${extension}`;

  const { error } = await getSupabaseAdminClient(c)
    .storage
    .from(MEETUP_MEDIA_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: purpose === 'cover',
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = getSupabaseAdminClient(c)
    .storage
    .from(MEETUP_MEDIA_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
