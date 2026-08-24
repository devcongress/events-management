import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldRedirectUnauthenticatedOrganizer } from './organizer-session-continuation';

const appSource = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
const pauseSource = readFileSync(new URL('../components/OrganizerSessionPause.vue', import.meta.url), 'utf8');

describe('organizer session continuation routing', () => {
  it('does not let a revalidation result redirect behind the idle warning', () => {
    expect(shouldRedirectUnauthenticatedOrganizer({
      authenticated: false,
      warningOpen: true,
      sessionEnding: false,
    })).toBe(false);
  });

  it('does not race the deliberate expired-session redirect', () => {
    expect(shouldRedirectUnauthenticatedOrganizer({
      authenticated: false,
      warningOpen: false,
      sessionEnding: true,
    })).toBe(false);
  });

  it('redirects an ordinarily unauthenticated protected route', () => {
    expect(shouldRedirectUnauthenticatedOrganizer({
      authenticated: false,
      warningOpen: false,
      sessionEnding: false,
    })).toBe(true);
  });

  it('uses one normal sign-in surface after a genuinely expired session', () => {
    expect(pauseSource).not.toContain('Welcome back.');
    expect(pauseSource).not.toContain("signIn: []");
    expect(appSource).not.toContain('@sign-in="signInAfterSessionPause"');
    expect(appSource).toContain('query: { redirect: redirectPath }');
  });

  it('keeps a failed continuation retryable instead of ending the session', () => {
    expect(appSource).toContain("organizerStayError.value = 'We could not confirm your session. Check your connection and try again.'");
    expect(pauseSource).toContain("role=\"alert\"");
    expect(pauseSource).toContain("busy ? 'Checking session…' : 'Stay signed in'");
  });
});
