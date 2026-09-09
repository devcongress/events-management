import { describe, expect, it } from 'vitest';
import {
  normalizedVolunteerEmailKey,
  VOLUNTEER_EMAIL_RETRY_LIMIT,
} from '@/lib/volunteer-rate-limit';

describe('volunteer intake rate-limit policy', () => {
  it('bounds repeated new attempts for the same normalized email without a shared-network quota', () => {
    expect(normalizedVolunteerEmailKey('  PERSON@Example.com ')).toBe('person@example.com');
    expect(VOLUNTEER_EMAIL_RETRY_LIMIT).toEqual({
      action: 'volunteer_application_email_daily',
      maxAttempts: 3,
      windowSeconds: 86_400,
    });
  });
});
