import { describe, expect, it } from 'vitest';
import {
  legacySelectedSpeakerShortCode,
  selectedSpeakerLinkIdFromShortCode,
  selectedSpeakerShortCode,
  speakerIntakeTokenHash,
  verifyLegacySelectedSpeakerShortCode,
  verifySelectedSpeakerShortCode,
} from './speaker-intake-short-links';

const linkId = '10000000-0000-4000-8000-000000000001';
const eventId = '20000000-0000-4000-8000-000000000001';
const secret = 'selected-speaker-private-link-secret-for-tests-2026';

describe('selected speaker short links', () => {
  it('derives a compact 128-bit HMAC capability without exposing the link identity', () => {
    const code = selectedSpeakerShortCode(linkId, eventId, secret);

    expect(code).toMatch(/^P_[A-Za-z0-9_-]{22}$/);
    expect(selectedSpeakerLinkIdFromShortCode(code)).toBeNull();
    expect(verifySelectedSpeakerShortCode(code, linkId, eventId, secret)).toBe(true);
    expect(verifySelectedSpeakerShortCode(code, linkId, 'another-event', secret)).toBe(false);
  });

  it('keeps legacy links decodable when their base64url identity contains underscores', () => {
    const linkId = 'd82e328d-9bd8-446a-9bec-2fd0605f67fc';
    const eventId = 'event-selected-speakers';
    const code = legacySelectedSpeakerShortCode(linkId, eventId, secret);

    expect(code.slice(2, 24)).toContain('_');
    expect(selectedSpeakerLinkIdFromShortCode(code)).toBe(linkId);
    expect(verifyLegacySelectedSpeakerShortCode(code, linkId, eventId, secret)).toBe(true);
  });

  it('does not retain the capability when only its hash is persisted', () => {
    const code = selectedSpeakerShortCode(linkId, eventId, secret);

    expect(speakerIntakeTokenHash(code)).toMatch(/^[a-f0-9]{64}$/);
    expect(speakerIntakeTokenHash(code)).not.toContain(code);
  });
});
