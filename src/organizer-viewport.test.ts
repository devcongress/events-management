import { describe, expect, it } from 'vitest';
import {
  ORGANIZER_PHONE_MEDIA_QUERY,
  ORGANIZER_PHONE_ROUTE_PATH,
  organizerPhoneCheckInPath,
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
      'admin-public-events-preview',
      'admin-public-event-preview',
      'admin-mobile',
      'admin-mobile-check-in',
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

    expect(organizerViewportRedirect({
      authenticated: true,
      isAdminRoute: true,
      isPhone: false,
      routeName: 'admin-mobile-check-in',
      eventId: 'event-one',
    })).toBe('/organizer-console/events/event-one/registrations');
  });

  it('builds an encoded dedicated phone check-in route', () => {
    expect(organizerPhoneCheckInPath('event / one')).toBe(
      '/organizer-console/mobile/events/event%20%2F%20one/check-in',
    );
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
