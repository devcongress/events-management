import { selectAvatar } from '@usenavii/core';

export function annualConferenceOwnerAvatarKey(owner: string): string {
  return owner.trim().toLocaleLowerCase();
}

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

/**
 * Gives every known owner a stable Navii seed with a distinct visual signature.
 * The roster is sorted before allocation so filtering or task order cannot alter
 * a person's icon.
 */
export function annualConferenceOwnerAvatarSeeds(owners: Iterable<string>): Map<string, string> {
  const assignedSeeds = new Map<string, string>();
  const usedSignatures = new Set<string>();
  const uniqueOwners = [...new Set([...owners].map(annualConferenceOwnerAvatarKey).filter(Boolean))].sort();

  for (const owner of uniqueOwners) {
    let variant = 0;

    while (variant < 1_000) {
      const seed = variant === 0 ? `annual-conference:${owner}` : `annual-conference:${owner}:${variant}`;
      const signature = avatarSignature(seed);

      if (!usedSignatures.has(signature)) {
        assignedSeeds.set(owner, seed);
        usedSignatures.add(signature);

        break;
      }

      variant += 1;
    }
  }

  return assignedSeeds;
}

export function annualConferenceOwnerAvatarSeed(
  owner: string,
  seeds: ReadonlyMap<string, string>,
): string {
  return seeds.get(annualConferenceOwnerAvatarKey(owner))
    ?? `annual-conference:${annualConferenceOwnerAvatarKey(owner)}`;
}
