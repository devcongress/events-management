import { describe, expect, it } from 'vitest';
import { MINIMUM_SHARED_SECRET_BYTES, secureSharedSecret, sharedSecretStatus } from './shared-secret';

describe('shared application secrets', () => {
  it('accepts secrets containing at least 32 bytes after trimming', () => {
    const secret = 'a'.repeat(MINIMUM_SHARED_SECRET_BYTES);
    expect(secureSharedSecret(`  ${secret}  `)).toBe(secret);
  });

  it('rejects missing, short, and short multi-byte secrets', () => {
    expect(secureSharedSecret(undefined)).toBeNull();
    expect(secureSharedSecret('short-secret')).toBeNull();
    expect(secureSharedSecret('é'.repeat(15))).toBeNull();
  });

  it('reports non-sensitive preflight status without returning the value', () => {
    expect(sharedSecretStatus(undefined)).toBe('missing');
    expect(sharedSecretStatus('short')).toBe('weak');
    expect(sharedSecretStatus('a'.repeat(MINIMUM_SHARED_SECRET_BYTES))).toBe('ready');
  });
});
