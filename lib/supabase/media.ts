import type { Context } from 'hono';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from './server';

const MEETUP_MEDIA_BUCKET = 'meetup-media';
const MEETUP_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const MEETUP_MEDIA_MAX_EDGE_PIXELS = 4096;
const MEETUP_MEDIA_MAX_TOTAL_PIXELS = 16_777_216;
const MEETUP_MEDIA_HEADER_MAX_BYTES = 512 * 1024;
const MEETUP_MEDIA_TYPES = new Map([
  ['image/avif', 'avif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export type MeetupMediaPurpose = 'cover' | 'photo';

export type UploadedEventSubmissionCover = {
  path: string;
  publicUrl: string;
};

export function meetupMediaPath(
  eventSlug: string,
  purpose: MeetupMediaPurpose,
  extension: string,
  fileId: string,
): string {
  const safeSlug = slugify(eventSlug) || 'event';
  return purpose === 'cover'
    ? `events/${safeSlug}/covers/${fileId}.${extension}`
    : `events/${safeSlug}/photos/${fileId}.${extension}`;
}

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
  const bytes = new Uint8Array(await file.slice(0, MEETUP_MEDIA_HEADER_MAX_BYTES).arrayBuffer());
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
      && avifFtypHasSupportedBrand(bytes),
  } as const;

  if (!matches[file.type as keyof typeof matches]) {
    return 'The file contents do not match the selected image type';
  }

  const dimensions = imageDimensions(bytes, file.type);
  if (!dimensions) return 'Image dimensions could not be verified';
  if (
    dimensions.width > MEETUP_MEDIA_MAX_EDGE_PIXELS
    || dimensions.height > MEETUP_MEDIA_MAX_EDGE_PIXELS
    || dimensions.width * dimensions.height > MEETUP_MEDIA_MAX_TOTAL_PIXELS
  ) {
    return 'Image dimensions must be 4096 × 4096 pixels or smaller';
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

  const fileId = crypto.randomUUID();
  const path = meetupMediaPath(eventSlug, purpose, extension, fileId);

  const { error } = await getSupabaseAdminClient(c)
    .storage
    .from(MEETUP_MEDIA_BUCKET)
    .upload(path, await file.arrayBuffer(), {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
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

/**
 * Stores an untrusted community-submission cover outside the event namespace.
 * It only becomes an event cover after the associated submission is approved.
 */
export async function uploadEventSubmissionCover(
  file: File,
  c?: Context,
): Promise<UploadedEventSubmissionCover> {
  if (!isMeetupMediaConfigured(c)) {
    throw new Error('Supabase media storage is not configured');
  }

  const extension = MEETUP_MEDIA_TYPES.get(file.type);
  if (!extension) throw new Error('Unsupported image type');

  const path = `event-submissions/covers/${crypto.randomUUID()}.${extension}`;
  const client = getSupabaseAdminClient(c);
  const { error } = await client.storage.from(MEETUP_MEDIA_BUCKET).upload(path, await file.arrayBuffer(), {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return {
    path,
    publicUrl: client.storage.from(MEETUP_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
  };
}

export async function removeMeetupMedia(path: string, c?: Context): Promise<void> {
  if (!path || !isMeetupMediaConfigured(c)) return;
  await getSupabaseAdminClient(c).storage.from(MEETUP_MEDIA_BUCKET).remove([path]);
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

type ImageDimensions = { width: number; height: number };

function imageDimensions(bytes: Uint8Array, type: string): ImageDimensions | null {
  const dimensions = type === 'image/png'
    ? pngDimensions(bytes)
    : type === 'image/jpeg'
      ? jpegDimensions(bytes)
      : type === 'image/webp'
        ? webpDimensions(bytes)
        : type === 'image/avif'
          ? avifDimensions(bytes)
          : null;

  return dimensions && validDimensions(dimensions) ? dimensions : null;
}

function validDimensions(value: ImageDimensions): boolean {
  return Number.isInteger(value.width)
    && Number.isInteger(value.height)
    && value.width > 0
    && value.height > 0;
}

function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24 || ascii(bytes, 12, 16) !== 'IHDR') return null;
  return {
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20),
  };
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (JPEG_START_OF_FRAME_MARKERS.has(marker) && segmentLength >= 7) {
      return {
        height: readUint16BigEndian(bytes, offset + 3),
        width: readUint16BigEndian(bytes, offset + 5),
      };
    }
    offset += segmentLength;
  }

  return null;
}

function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 12) !== 'WEBP') return null;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, offset + 4);
    const chunkSize = readUint32LittleEndian(bytes, offset + 4);
    const payloadOffset = offset + 8;
    if (payloadOffset + chunkSize > bytes.length) return null;

    if (chunkType === 'VP8X' && chunkSize >= 10) {
      return {
        width: readUint24LittleEndian(bytes, payloadOffset + 4) + 1,
        height: readUint24LittleEndian(bytes, payloadOffset + 7) + 1,
      };
    }
    if (
      chunkType === 'VP8 '
      && chunkSize >= 10
      && bytes[payloadOffset + 3] === 0x9d
      && bytes[payloadOffset + 4] === 0x01
      && bytes[payloadOffset + 5] === 0x2a
    ) {
      return {
        width: readUint16LittleEndian(bytes, payloadOffset + 6) & 0x3fff,
        height: readUint16LittleEndian(bytes, payloadOffset + 8) & 0x3fff,
      };
    }
    if (chunkType === 'VP8L' && chunkSize >= 5 && bytes[payloadOffset] === 0x2f) {
      const b1 = bytes[payloadOffset + 1] ?? 0;
      const b2 = bytes[payloadOffset + 2] ?? 0;
      const b3 = bytes[payloadOffset + 3] ?? 0;
      const b4 = bytes[payloadOffset + 4] ?? 0;
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    }

    offset = payloadOffset + chunkSize + (chunkSize % 2);
  }

  return null;
}

function avifDimensions(bytes: Uint8Array): ImageDimensions | null {
  return findAvifDimensions(bytes, 0, bytes.length, 0);
}

function avifFtypHasSupportedBrand(bytes: Uint8Array): boolean {
  const ftypSize = readUint32BigEndian(bytes, 0);
  if (ftypSize < 16 || ftypSize > bytes.length || ascii(bytes, 4, 8) !== 'ftyp') return false;

  for (let offset = 8; offset + 4 <= ftypSize; offset += 4) {
    const brand = ascii(bytes, offset, offset + 4);
    if (brand === 'avif' || brand === 'avis') return true;
  }
  return false;
}

function findAvifDimensions(
  bytes: Uint8Array,
  start: number,
  end: number,
  depth: number,
): ImageDimensions | null {
  if (depth > 6) return null;

  let offset = start;
  while (offset + 8 <= end) {
    let boxSize = readUint32BigEndian(bytes, offset);
    const boxType = ascii(bytes, offset + 4, offset + 8);
    let headerSize = 8;
    if (boxSize === 1) {
      if (offset + 16 > end) return null;
      const high = readUint32BigEndian(bytes, offset + 8);
      const low = readUint32BigEndian(bytes, offset + 12);
      if (high !== 0) return null;
      boxSize = low;
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = end - offset;
    }
    if (boxSize < headerSize || offset + boxSize > end) return null;

    const payloadStart = offset + headerSize;
    const boxEnd = offset + boxSize;
    if (boxType === 'ispe' && boxEnd - payloadStart >= 12) {
      return {
        width: readUint32BigEndian(bytes, payloadStart + 4),
        height: readUint32BigEndian(bytes, payloadStart + 8),
      };
    }

    if (boxType === 'meta' || boxType === 'iprp' || boxType === 'ipco') {
      const childStart = boxType === 'meta' ? payloadStart + 4 : payloadStart;
      const nested = findAvifDimensions(bytes, childStart, boxEnd, depth + 1);
      if (nested) return nested;
    }

    offset = boxEnd;
  }

  return null;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0)
    | ((bytes[offset + 1] ?? 0) << 8)
    | ((bytes[offset + 2] ?? 0) << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000)
    + ((bytes[offset + 1] ?? 0) << 16)
    + ((bytes[offset + 2] ?? 0) << 8)
    + (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0)
    + ((bytes[offset + 1] ?? 0) << 8)
    + ((bytes[offset + 2] ?? 0) << 16)
    + ((bytes[offset + 3] ?? 0) * 0x1000000)
  ) >>> 0;
}
