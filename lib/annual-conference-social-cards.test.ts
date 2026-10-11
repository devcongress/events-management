import { describe, expect, it } from 'vitest';
import { createDevcon26SocialCardCapability, createDevcon26SocialCardSlug, hashDevcon26SocialCardCapability, isEligibleDevcon26Attendee, isEligibleDevcon26Speaker, normalizeDevcon26SocialCardName, validateDevcon26SocialCardCrop } from './annual-conference-social-cards';

describe('DevCon26 social cards', () => {
  it('creates independent opaque management and public identifiers', () => {
    const capability = createDevcon26SocialCardCapability();

    expect(capability).not.toHaveLength(0);
    expect(hashDevcon26SocialCardCapability(capability)).not.toBe(capability);
    expect(createDevcon26SocialCardSlug()).toMatch(/^[A-Za-z0-9_-]{22,80}$/);
  });
  it('permits only named issued attendees', () => {
    expect(isEligibleDevcon26Attendee({ status: 'issued', attendee_name: 'Ama Mensah' })).toBe(true);
    expect(isEligibleDevcon26Attendee({ status: 'checked_in', attendee_name: 'Ama Mensah' })).toBe(true);
    expect(isEligibleDevcon26Attendee({ status: 'pending', attendee_name: 'Ama Mensah' })).toBe(false);
    expect(isEligibleDevcon26Attendee({ status: 'issued', attendee_name: null })).toBe(false);
  });
  it('permits only selected speakers with confirmed sessions', () => {
    expect(isEligibleDevcon26Speaker({ submission_status: 'selected', session_status: 'confirmed', speaker_name: 'Kojo Owusu' })).toBe(true);
    expect(isEligibleDevcon26Speaker({ submission_status: 'submitted', session_status: 'confirmed', speaker_name: 'Kojo Owusu' })).toBe(false);
    expect(isEligibleDevcon26Speaker({ submission_status: 'selected', session_status: 'archived', speaker_name: 'Kojo Owusu' })).toBe(false);
  });
  it('normalizes safe display names and bounded crop settings', () => {
    expect(normalizeDevcon26SocialCardName('  Ama   Mensah ')).toBe('Ama Mensah');
    expect(normalizeDevcon26SocialCardName('   ')).toBeNull();
    expect(validateDevcon26SocialCardCrop({ x: 0.5, y: 0.5, scale: 1.25 })).toBe(true);
    expect(validateDevcon26SocialCardCrop({ x: 1.1, y: 0.5, scale: 1 })).toBe(false);
  });
});
