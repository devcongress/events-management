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

export async function validateMeetupMediaContent(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const matches = {
    'image/jpeg': bytes.length >= 3
      && bytes[0] === 0xff
      && bytes[1] === 0xd8
      && bytes[2] === 0xff,
    'image/png': bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a,
    'image/webp': bytes.length >= 12
      && ascii(bytes, 0, 4) === 'RIFF'
      && ascii(bytes, 8, 12) === 'WEBP',
    'image/avif': bytes.length >= 16
      && ascii(bytes, 4, 8) === 'ftyp'
      && ['avif', 'avis'].some((brand) => ascii(bytes, 8, bytes.length).includes(brand)),
  } as const;

  return matches[file.type as keyof typeof matches]
    ? null
    : 'The file contents do not match the selected image type';
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

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
