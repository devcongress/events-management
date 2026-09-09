import { describe, expect, it } from 'vitest';
import {
  normalizedVolunteerEmailKey,
  VOLUNTEER_EMAIL_RETRY_LIMIT,
  VOLUNTEER_NETWORK_BURST_LIMIT,
  VOLUNTEER_NETWORK_DAILY_LIMIT,
} from '@/lib/volunteer-rate-limit';

describe('volunteer intake rate-limit policy', () => {
  it('uses a short burst guard and a higher shared-network daily ceiling', () => {
    expect(VOLUNTEER_NETWORK_BURST_LIMIT).toEqual({
      action: 'volunteer_application_burst',
      maxAttempts: 3,
      windowSeconds: 60,
    });
    expect(VOLUNTEER_NETWORK_DAILY_LIMIT).toEqual({
      action: 'volunteer_application_network_daily',
      maxAttempts: 10,
      windowSeconds: 86_400,
    });
  });

  it('bounds repeated new attempts for the same normalized email', () => {
    expect(normalizedVolunteerEmailKey('  PERSON@Example.com ')).toBe('person@example.com');
    expect(VOLUNTEER_EMAIL_RETRY_LIMIT).toEqual({
      action: 'volunteer_application_email_daily',
      maxAttempts: 3,
      windowSeconds: 86_400,
    });
  });
});
