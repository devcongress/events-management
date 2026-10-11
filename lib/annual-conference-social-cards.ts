import crypto from 'node:crypto';

export const DEVCON26_SOCIAL_CARD_BUCKET = 'annual-conference-social-cards';
export const DEVCON26_SOCIAL_CARD_MAX_NAME_LENGTH = 120;
export const DEVCON26_SOCIAL_CARD_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type Devcon26SocialCardRole = 'attendee' | 'speaker';
export type Devcon26SocialCardCrop = { x: number; y: number; scale: number };

export function createDevcon26SocialCardCapability(): string { return crypto.randomBytes(32).toString('base64url'); }
export function hashDevcon26SocialCardCapability(capability: string): string { return crypto.createHash('sha256').update(capability).digest('hex'); }
export function createDevcon26SocialCardSlug(): string { return crypto.randomBytes(24).toString('base64url'); }
export function normalizeDevcon26SocialCardName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');

  return normalized.length > 0 && normalized.length <= DEVCON26_SOCIAL_CARD_MAX_NAME_LENGTH ? normalized : null;
}
export function validateDevcon26SocialCardCrop(value: Devcon26SocialCardCrop): boolean {
  return [value.x, value.y].every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)
    && Number.isFinite(value.scale) && value.scale >= 1 && value.scale <= 4;
}
export function validateDevcon26SocialCardImage(file: File): string | null {
  if (file.size < 1 || file.size > DEVCON26_SOCIAL_CARD_MAX_IMAGE_BYTES) return 'Image must be 5MB or smaller.';
  if (!['image/avif', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use an AVIF, JPEG, PNG, or WebP image.';

  return null;
}
export function isEligibleDevcon26Attendee(input: { status: 'pending' | 'issued' | 'cancelled' | 'checked_in'; attendee_name: string | null }): boolean {
  return (input.status === 'issued' || input.status === 'checked_in') && normalizeDevcon26SocialCardName(input.attendee_name ?? '') !== null;
}
export function isEligibleDevcon26Speaker(input: { submission_status: 'submitted' | 'selected' | 'not_selected' | 'withdrawn'; session_status: 'confirmed' | 'archived' | null; speaker_name: string | null }): boolean {
  return input.submission_status === 'selected' && input.session_status === 'confirmed' && normalizeDevcon26SocialCardName(input.speaker_name ?? '') !== null;
}
