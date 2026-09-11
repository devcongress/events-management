import crypto from 'crypto';

export function normalizeSecretAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function hashSecretAnswer(value: string): string {
  const normalized = normalizeSecretAnswer(value);

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function compareSecretAnswer(value: string, hash: string | null): boolean {
  if (!hash) {
    return false;
  }

  return hashSecretAnswer(value) === hash;
}
