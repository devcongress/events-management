import crypto from 'crypto';
import {
  LEGACY_SPEAKER_INTAKE_SHORT_LINK_CODE_PATTERN,
  SPEAKER_INTAKE_SHORT_LINK_CODE_PATTERN,
} from '@/short-links/code-patterns';

const SHORT_CAPABILITY_BYTES = 16;
const LEGACY_SIGNATURE_BYTES = 12;

function uuidBytes(id: string): Buffer {
  const hex = id.replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('Speaker intake link ID is invalid.');
  return Buffer.from(hex, 'hex');
}

function uuidFromBytes(value: Buffer): string | null {
  if (value.byteLength !== 16) return null;
  const hex = value.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function signature(linkId: string, eventId: string, secret: string, bytes: number, version = ''): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`selected-speaker${version}:${linkId}:${eventId}`)
    .digest()
    .subarray(0, bytes)
    .toString('base64url');
}

export function selectedSpeakerShortCode(linkId: string, eventId: string, secret: string): string {
  return `P_${signature(linkId, eventId, secret, SHORT_CAPABILITY_BYTES, '-v2')}`;
}

export function legacySelectedSpeakerShortCode(linkId: string, eventId: string, secret: string): string {
  const encodedId = uuidBytes(linkId).toString('base64url');
  return `P_${encodedId}_${signature(linkId, eventId, secret, LEGACY_SIGNATURE_BYTES)}`;
}

export function selectedSpeakerLinkIdFromShortCode(code: string): string | null {
  if (!LEGACY_SPEAKER_INTAKE_SHORT_LINK_CODE_PATTERN.test(code)) return null;
  const encodedId = code.slice(2, 24);

  try {
    return uuidFromBytes(Buffer.from(encodedId, 'base64url'));
  } catch {
    return null;
  }
}

export function verifySelectedSpeakerShortCode(
  code: string,
  linkId: string,
  eventId: string,
  secret: string,
): boolean {
  const expected = selectedSpeakerShortCode(linkId, eventId, secret);
  if (code.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected));
}

export function verifyLegacySelectedSpeakerShortCode(
  code: string,
  linkId: string,
  eventId: string,
  secret: string,
): boolean {
  if (!LEGACY_SPEAKER_INTAKE_SHORT_LINK_CODE_PATTERN.test(code)) return false;
  const expected = legacySelectedSpeakerShortCode(linkId, eventId, secret);
  if (code.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected));
}

export function speakerIntakeTokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
