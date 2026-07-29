import { beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateRegistrationRateLimit,
  recordRegistrationAttempt,
  resetRegistrationRateLimits,
} from './registration-rate-limit';

describe('registration rate limit', () => {
  beforeEach(() => {
    resetRegistrationRateLimits();
  });

  it('allows twenty attempts from one client within ten minutes', () => {
    const now = Date.UTC(2026, 6, 28, 9, 0);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(evaluateRegistrationRateLimit('client-ip', now + attempt)).toEqual({ allowed: true });
      recordRegistrationAttempt('client-ip', now + attempt);
    }
  });

  it('blocks the twenty-first attempt until the ten-minute window passes', () => {
    const now = Date.UTC(2026, 6, 28, 9, 0);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      recordRegistrationAttempt('client-ip', now + attempt);
    }

    expect(evaluateRegistrationRateLimit('client-ip', now + 20)).toMatchObject({
      allowed: false,
    });
    expect(evaluateRegistrationRateLimit('client-ip', now + (10 * 60 * 1000) + 20)).toEqual({
      allowed: true,
    });
  });

  it('keeps separate clients independent', () => {
    const now = Date.UTC(2026, 6, 28, 9, 0);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      recordRegistrationAttempt('first-client', now + attempt);
    }

    expect(evaluateRegistrationRateLimit('second-client', now + 20)).toEqual({ allowed: true });
  });
});
