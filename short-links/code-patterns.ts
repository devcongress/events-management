export const MARKETING_SHORT_LINK_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5,8}$/;
export const SPEAKER_INTAKE_SHORT_LINK_CODE_PATTERN = /^P_[A-Za-z0-9_-]{22}$/;
export const LEGACY_SPEAKER_INTAKE_SHORT_LINK_CODE_PATTERN = /^P_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{16}$/;

export function isSpeakerIntakeShortLinkCode(value: string): boolean {
  return SPEAKER_INTAKE_SHORT_LINK_CODE_PATTERN.test(value)
    || LEGACY_SPEAKER_INTAKE_SHORT_LINK_CODE_PATTERN.test(value);
}

export function isSupportedShortLinkCode(value: string): boolean {
  return MARKETING_SHORT_LINK_CODE_PATTERN.test(value)
    || isSpeakerIntakeShortLinkCode(value);
}
