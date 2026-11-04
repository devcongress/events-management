import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearOrganizerSessionLock,
  organizerDeadlineState,
  matchesObservedOrganizerSession,
  readOrganizerSessionLock,
  saveOrganizerSessionLock,
  shouldRedirectUnauthenticatedOrganizer,
} from './organizer-session-continuation';

function installStorage() {
  const values = new Map<string, string>();

  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('organizer session continuation', () => {
  it('keeps a safe protected route and query for this tab only', () => {
    installStorage();
    saveOrganizerSessionLock('/organizer-console/annual-conference/2026/volunteers?volunteerView=reviews');
    expect(readOrganizerSessionLock()).toBe('/organizer-console/annual-conference/2026/volunteers?volunteerView=reviews');
    saveOrganizerSessionLock('/organizer-console/events?section=attendance&token=secret#private');
    expect(readOrganizerSessionLock()).toBe('/organizer-console/events?section=attendance');
    clearOrganizerSessionLock();
    expect(readOrganizerSessionLock()).toBeNull();
  });

  it('rejects external, public and login destinations', () => {
    installStorage();
    for (const path of ['//evil.example', '/public', '/organizer-console/login', '/organizer-console/auth/callback']) {
      saveOrganizerSessionLock(path);
      expect(readOrganizerSessionLock()).toBeNull();
    }
  });

  it('checks elapsed time and absolute expiry before recording activity', () => {
    const minute = 60_000;

    expect(organizerDeadlineState(28 * minute - 1, 0, null)).toBe('active');
    expect(organizerDeadlineState(28 * minute, 0, null)).toBe('warning');
    expect(organizerDeadlineState(30 * minute, 0, null)).toBe('expired');
    expect(organizerDeadlineState(5 * minute, 0, 5 * minute)).toBe('expired');
  });

  it('does not resume an expired, different-account, or changed-role session after an outage', () => {
    const observed = { instanceId: 'old-session', email: 'organizer@example.org', role: 'owner' };
    const session = {
      authenticated: true,
      auth_mode: 'supabase' as const,
      auth_configured: true,
      session_instance_id: 'old-session',
      user: { email: 'organizer@example.org', role: 'owner' as const, display_name: null },
    };

    expect(matchesObservedOrganizerSession(observed, session)).toBe(true);
    expect(matchesObservedOrganizerSession(observed, { ...session, authenticated: false })).toBe(false);
    expect(matchesObservedOrganizerSession(observed, { ...session, session_instance_id: 'new-session' })).toBe(false);
    expect(matchesObservedOrganizerSession(observed, { ...session, user: { ...session.user, email: 'other@example.org' } })).toBe(false);
    expect(matchesObservedOrganizerSession(observed, { ...session, user: { ...session.user, role: 'volunteer' } })).toBe(false);
  });

  it('redirects a cold unauthenticated entry but not a warning or lock', () => {
    expect(shouldRedirectUnauthenticatedOrganizer({ authenticated: false, warningOpen: false, sessionEnding: false })).toBe(true);
    expect(shouldRedirectUnauthenticatedOrganizer({ authenticated: false, warningOpen: true, sessionEnding: false })).toBe(false);
    expect(shouldRedirectUnauthenticatedOrganizer({ authenticated: false, warningOpen: false, sessionEnding: true })).toBe(false);
  });
});
