import type { ParticipantIdentityMode, QuizSession } from '@/types';

const ALIAS_ADJECTIVES = [
  'Bold',
  'Bright',
  'Calm',
  'Clever',
  'Curious',
  'Kind',
  'Quick',
  'Sharp',
  'Steady',
  'Thoughtful',
  'Wise',
  'Witty',
] as const;

const ALIAS_NOUNS = [
  'Badger',
  'Falcon',
  'Fox',
  'Heron',
  'Koala',
  'Otter',
  'Owl',
  'Panda',
  'Raven',
  'Tiger',
  'Turtle',
  'Wolf',
] as const;

const aliasCount = ALIAS_ADJECTIVES.length * ALIAS_NOUNS.length;

export function participantIdentityMode(session: Pick<QuizSession, 'participant_identity_mode'>): ParticipantIdentityMode {
  return session.participant_identity_mode === 'self_named' ? 'self_named' : 'generated';
}

export function validateParticipantDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (normalized.length < 1 || normalized.length > 24) return null;
  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'-]*$/u.test(normalized)) return null;
  return normalized;
}

export function generateParticipantAlias(
  existingNames: Iterable<string>,
  randomIndex: (upperBound: number) => number = secureRandomIndex,
): string {
  const taken = new Set(Array.from(existingNames, (name) => name.toLocaleLowerCase()));
  const start = normalizeIndex(randomIndex(aliasCount), aliasCount);

  for (let offset = 0; offset < aliasCount; offset += 1) {
    const alias = aliasAt((start + offset) % aliasCount);
    if (!taken.has(alias.toLocaleLowerCase())) return alias;
  }

  let suffix = aliasCount + 1;
  while (taken.has(`curious owl ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `Curious Owl ${suffix}`;
}

function aliasAt(index: number): string {
  const adjective = ALIAS_ADJECTIVES[Math.floor(index / ALIAS_NOUNS.length)]!;
  const noun = ALIAS_NOUNS[index % ALIAS_NOUNS.length]!;
  return `${adjective} ${noun}`;
}

function normalizeIndex(value: number, upperBound: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(Math.floor(value)) % upperBound;
}

function secureRandomIndex(upperBound: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]! % upperBound;
}
