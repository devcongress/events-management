import { describe, expect, it } from 'vitest';
import { shouldShowAuthenticatedAppHeader } from './app-shell';

describe('authenticated app header visibility', () => {
  it('stays hidden while an authenticated callback is still transitioning', () => {
    expect(shouldShowAuthenticatedAppHeader({
      authenticated: true,
      isLoginRoute: true,
      isStandaloneRoute: false,
    })).toBe(false);
  });

  it('shows on an authenticated workspace route', () => {
    expect(shouldShowAuthenticatedAppHeader({
      authenticated: true,
      isLoginRoute: false,
      isStandaloneRoute: false,
    })).toBe(true);
  });

  it('stays hidden on standalone and unauthenticated routes', () => {
    expect(shouldShowAuthenticatedAppHeader({
      authenticated: true,
      isLoginRoute: false,
      isStandaloneRoute: true,
    })).toBe(false);
    expect(shouldShowAuthenticatedAppHeader({
      authenticated: false,
      isLoginRoute: false,
      isStandaloneRoute: false,
    })).toBe(false);
  });
});
