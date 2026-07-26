import { describe, expect, it } from 'vitest';
import {
  ORGANIZER_PHONE_MEDIA_QUERY,
  ORGANIZER_PHONE_ROUTE_PATH,
  matchesOrganizerPhoneViewport,
  organizerViewportRedirect,
} from './organizer-viewport';

describe('organizer viewport policy', () => {
  it('uses one shared phone breakpoint', () => {
    const queries: string[] = [];
    const matches = matchesOrganizerPhoneViewport({
      matchMedia(query) {
        queries.push(query);
        return { matches: true } as MediaQueryList;
      },
    });

    expect(matches).toBe(true);
    expect(queries).toEqual([ORGANIZER_PHONE_MEDIA_QUERY]);
  });

  it('routes authenticated phone organizers to the limited surface', () => {
    expect(organizerViewportRedirect({
      authenticated: true,
      isAdminRoute: true,
      isPhone: true,
      routeName: 'admin-talks',
    })).toBe(ORGANIZER_PHONE_ROUTE_PATH);
  });

  it('keeps phone-safe organizer displays and auth routes available', () => {
    for (const routeName of [
      'admin-login',
      'admin-auth-callback',
      'admin-feedback-display',
      'admin-annual-conference-volunteer-display',
      'admin-mobile',
    ]) {
      expect(organizerViewportRedirect({
        authenticated: true,
        isAdminRoute: true,
        isPhone: true,
        routeName,
      })).toBeNull();
    }
  });

  it('returns tablets and desktops from the limited route to the full console', () => {
    expect(organizerViewportRedirect({
      authenticated: true,
      isAdminRoute: true,
      isPhone: false,
      routeName: 'admin-mobile',
    })).toBe('/organizer-console/events');
  });

  it('does not redirect before authentication or outside organizer routes', () => {
    expect(organizerViewportRedirect({
      authenticated: false,
      isAdminRoute: true,
      isPhone: true,
      routeName: 'admin-events',
    })).toBeNull();
    expect(organizerViewportRedirect({
      authenticated: true,
      isAdminRoute: false,
      isPhone: true,
      routeName: 'event-feedback',
    })).toBeNull();
  });
});
