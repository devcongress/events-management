import { describe, expect, it } from 'vitest';
import { adminOtpRetryMessage, evaluateAdminOtpRateLimit, recordAdminOtpRequest } from '@/lib/admin-auth-rate-limit';

describe('admin auth rate limit', () => {
  it('allows the first OTP request and blocks the next one during cooldown', () => {
    const email = `organizer-${Date.now()}@devcongress.org`;
    const ip = '203.0.113.10';
    const first = evaluateAdminOtpRateLimit({ email, ip }, 1_000);
    expect(first.allowed).toBe(true);

    recordAdminOtpRequest({ email, ip }, 1_000);

    const blocked = evaluateAdminOtpRateLimit({ email, ip }, 20_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('blocks when one IP fans out across too many emails in the short window', () => {
    const ip = `198.51.100.${Date.now() % 200}`;

    for (let index = 0; index < 5; index += 1) {
      const email = `organizer-${Date.now()}-${index}@devcongress.org`;
      expect(evaluateAdminOtpRateLimit({ email, ip }, 1_000 + index).allowed).toBe(true);
      recordAdminOtpRequest({ email, ip }, 1_000 + index);
    }

    const blocked = evaluateAdminOtpRateLimit({ email: `organizer-${Date.now()}-blocked@devcongress.org`, ip }, 2_000);
    expect(blocked.allowed).toBe(false);
  });

  it('formats a retry message in seconds', () => {
    expect(adminOtpRetryMessage(18_000)).toContain('18 seconds');
  });
});
