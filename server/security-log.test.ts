import { describe, expect, it } from 'vitest';
import { safeErrorName, securitySafeRequestPath } from './security-log';

describe('security log redaction', () => {
  it('removes speaker bearer tokens from request paths', () => {
    expect(securitySafeRequestPath(
      '/api/events/event-1/speaker-intake/raw-private-token',
    )).toBe('/api/events/event-1/speaker-intake/[redacted]');
  });

  it('retains useful non-sensitive path and error classification', () => {
    expect(securitySafeRequestPath('/api/events/event-1/registrations')).toBe(
      '/api/events/event-1/registrations',
    );
    expect(safeErrorName(new TypeError('private detail'))).toBe('TypeError');
  });
});
