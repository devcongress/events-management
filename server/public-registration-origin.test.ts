import { describe, expect, it } from 'vitest';
import { publicRegistrationOrigin } from './public-registration-origin';

describe('publicRegistrationOrigin', () => {
  it('keeps registration links local only for local event storage', () => {
    expect(publicRegistrationOrigin({
      requestOrigin: 'http://localhost:5173',
      configuredOrigin: 'http://localhost:5173',
      usesSharedEventStorage: false,
    })).toBe('http://localhost:5173');
  });

  it('never writes a localhost registration URL to shared event storage', () => {
    expect(publicRegistrationOrigin({
      requestOrigin: 'http://localhost:5173',
      configuredOrigin: 'http://localhost:5173',
      usesSharedEventStorage: true,
    })).toBe('https://em.devcongress.org');
  });

  it('uses the configured hosted EMS origin for shared event storage', () => {
    expect(publicRegistrationOrigin({
      requestOrigin: 'https://events-management.admins-a7d.workers.dev',
      configuredOrigin: 'https://em.devcongress.org',
      usesSharedEventStorage: true,
    })).toBe('https://em.devcongress.org');
  });
});
