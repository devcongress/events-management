import { describe, expect, it } from 'vitest';
import { safeErrorName, securitySafeRequestPath } from './security-log';

describe('security log redaction', () => {
  it('removes speaker bearer tokens from request paths', () => {
    expect(securitySafeRequestPath(
      '/api/events/event-1/speaker-intake/raw-private-token',
    )).toBe('/api/events/event-1/speaker-intake/[redacted]');
  });

  it('removes event-management capabilities from API and page paths', () => {
    const capability = '30000000-0000-4000-8000-000000000001.private-signature';
    expect(securitySafeRequestPath(
      `/api/public/event-submissions/manage/${capability}/with-cover`,
    )).toBe('/api/public/event-submissions/manage/[redacted]/with-cover');
    expect(securitySafeRequestPath(`/event-amendments/${capability}`)).toBe(
      '/event-amendments/[redacted]',
    );
  });

  it('retains useful non-sensitive path and error classification', () => {
    expect(securitySafeRequestPath('/api/events/event-1/registrations')).toBe(
      '/api/events/event-1/registrations',
    );
    expect(safeErrorName(new TypeError('private detail'))).toBe('TypeError');
  });
});
