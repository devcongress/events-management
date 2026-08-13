export const MINIMUM_SHARED_SECRET_BYTES = 32;

export type SharedSecretStatus = 'missing' | 'weak' | 'ready';

export function sharedSecretStatus(value: string | null | undefined): SharedSecretStatus {
  const secret = value?.trim();
  if (!secret) return 'missing';
  return new TextEncoder().encode(secret).byteLength < MINIMUM_SHARED_SECRET_BYTES ? 'weak' : 'ready';
}

export function secureSharedSecret(value: string | null | undefined): string | null {
  const secret = value?.trim();
  return secret && sharedSecretStatus(secret) === 'ready' ? secret : null;
}
