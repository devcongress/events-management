import { describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_IDLE_TIMEOUT_SECONDS,
  isAdminSessionIdle,
} from './admin-auth';

describe('organizer session idle expiry', () => {
  const now = Date.UTC(2026, 7, 1, 12, 0, 0);

  it('keeps a session active before the 30-minute idle limit', () => {
    const lastSeenAt = new Date(now - (ADMIN_SESSION_IDLE_TIMEOUT_SECONDS - 1) * 1000).toISOString();
    expect(isAdminSessionIdle(lastSeenAt, now)).toBe(false);
  });

  it('expires a session at the 30-minute idle limit', () => {
    const lastSeenAt = new Date(now - ADMIN_SESSION_IDLE_TIMEOUT_SECONDS * 1000).toISOString();
    expect(isAdminSessionIdle(lastSeenAt, now)).toBe(true);
  });

  it('fails closed when the last-seen timestamp is missing or malformed', () => {
    expect(isAdminSessionIdle(null, now)).toBe(true);
    expect(isAdminSessionIdle('not-a-date', now)).toBe(true);
  });
});
