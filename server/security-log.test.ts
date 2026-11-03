import { describe, expect, it } from 'vitest';
import { safeErrorName, securitySafeRequestPath } from './security-log';

describe('security log redaction', () => {
  it('removes speaker bearer tokens from request paths', () => {
    expect(securitySafeRequestPath(
      '/api/events/event-1/speaker-intake/raw-private-token',
    )).toBe('/api/events/event-1/speaker-intake/[redacted]');
  });

  it('redacts conference workspace and material tokens', () => {
    expect(securitySafeRequestPath('/api/conferences/2026/speaker-intake/secret/badge/photo')).toBe('/api/conferences/2026/speaker-intake/[redacted]/badge/photo');
    expect(securitySafeRequestPath('/api/conference-speaker-materials/2026/secret')).toBe('/api/conference-speaker-materials/2026/[redacted]');
    expect(securitySafeRequestPath('/api/conference-speaker-materials/2026/secret/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe('/api/conference-speaker-materials/2026/[redacted]/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
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

  it('removes private short-link capabilities from resolver paths', () => {
    expect(securitySafeRequestPath(
      '/api/internal/short-links/P_AAAAAAAAAAAAAAAAAAAAAA_AAAAAAAAAAAAAAAA',
    )).toBe('/api/internal/short-links/[redacted]');
  });

  it('retains useful non-sensitive path and error classification', () => {
    expect(securitySafeRequestPath('/api/events/event-1/registrations')).toBe(
      '/api/events/event-1/registrations',
    );
    expect(safeErrorName(new TypeError('private detail'))).toBe('TypeError');
  });
});
