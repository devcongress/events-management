import { selectAvatar } from '@usenavii/core';
import { describe, expect, it } from 'vitest';
import {
  annualConferenceOwnerAvatarSeed,
  annualConferenceOwnerAvatarSeeds,
} from '@/lib/annual-conference-owner-avatar';

function avatarSignature(seed: string): string {
  const avatar = selectAvatar(seed, {
    background: 'ring',
    mood: 'happy',
    tileBg: '#0a0a0a',
  });

  return [
    avatar.palette.id,
    avatar.body,
    avatar.eyes,
    avatar.mouth,
    avatar.antenna,
    avatar.accessory,
    avatar.topper,
    avatar.outfit,
  ].join(':');
}

describe('annualConferenceOwnerAvatarSeeds', () => {
  it('assigns each owner a distinct, stable Navii avatar regardless of roster order', () => {
    const owners = ['Elijah', 'Manuel_son', 'GrandKojo', 'Akosua'];
    const first = annualConferenceOwnerAvatarSeeds(owners);
    const reordered = annualConferenceOwnerAvatarSeeds([...owners].reverse());
    const signatures = owners.map((owner) => avatarSignature(annualConferenceOwnerAvatarSeed(owner, first)));

    expect(new Set(signatures)).toHaveLength(owners.length);
    expect(annualConferenceOwnerAvatarSeed('Elijah', first))
      .toBe(annualConferenceOwnerAvatarSeed('elijah', reordered));
  });

  it('uses one identity for whitespace and case variants of the same owner', () => {
    const seeds = annualConferenceOwnerAvatarSeeds([' Elijah ', 'elijah']);

    expect(seeds).toHaveLength(1);
    expect(annualConferenceOwnerAvatarSeed('Elijah', seeds))
      .toBe(annualConferenceOwnerAvatarSeed('  ELIJAH ', seeds));
  });
});
