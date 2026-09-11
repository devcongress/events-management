import { describe, expect, it } from 'vitest';
import {
  ORGANIZER_PHONE_MEDIA_QUERY,
  ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME,
  ORGANIZER_PHONE_EVENT_BLASTS_ROUTE_NAME,
  ORGANIZER_PHONE_EVENT_ROUTE_NAME,
  ORGANIZER_PHONE_EVENTS_ROUTE_NAME,
  ORGANIZER_PHONE_EVENTS_ROUTE_PATH,
  ORGANIZER_PHONE_ROUTE_PATH,
  matchesOrganizerPhoneViewport,
  organizerConferenceContextQuery,
  organizerMobileConferenceSection,
  organizerMobileEventSection,
  organizerPostAuthLanding,
  organizerPhoneCheckInPath,
  organizerPhoneEventBlastsPath,
  organizerPhoneEventPath,
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
      authenticated: true, isAdminRoute: true, isPhone: true, routeName: 'admin-talks',
    })).toEqual({ path: ORGANIZER_PHONE_ROUTE_PATH, replace: true });
  });

  it('lands phone organizers on Home after broad conference login redirects', () => {
    expect(organizerPostAuthLanding(
      '/organizer-console/annual-conference/2026',
      'organizer',
      true,
    )).toBe(ORGANIZER_PHONE_ROUTE_PATH);
    expect(organizerPostAuthLanding(
      '/organizer-console/mobile/annual-conference/2026?section=overview',
      'owner',
      true,
    )).toBe(ORGANIZER_PHONE_ROUTE_PATH);
  });

  it('preserves intentional post-login destinations and volunteer routing', () => {
    const taskTarget = '/organizer-console/mobile/annual-conference/2026?section=tasks&task=task-1';
    const eventTarget = '/organizer-console/mobile/events/event-1/check-in';

    expect(organizerPostAuthLanding(taskTarget, 'organizer', true)).toBe(taskTarget);
    expect(organizerPostAuthLanding(eventTarget, 'owner', true)).toBe(eventTarget);
    expect(organizerPostAuthLanding('/organizer-console/annual-conference/2026', 'owner', false))
      .toBe('/organizer-console/annual-conference/2026');
    expect(organizerPostAuthLanding(eventTarget, 'volunteer', true))
      .toBe('/organizer-console/annual-conference/2026');
  });

  it('keeps phone-safe organizer displays and auth routes available', () => {
    for (const routeName of [
      'admin-login', 'admin-auth-callback', 'admin-feedback-display', 'admin-registration-display',
      'admin-annual-conference-volunteer-display', 'admin-public-events-preview', 'admin-public-event-preview',
      'admin-organizers',
      'admin-mobile', ORGANIZER_PHONE_EVENTS_ROUTE_NAME, ORGANIZER_PHONE_EVENT_ROUTE_NAME,
      ORGANIZER_PHONE_EVENT_BLASTS_ROUTE_NAME, 'admin-mobile-check-in', ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME,
    ]) {
      expect(organizerViewportRedirect({
        authenticated: true, isAdminRoute: true, isPhone: true, routeName,
      })).toBeNull();
    }
  });

  it('preserves conference section, filters, and task context across phone redirects', () => {
    expect(organizerViewportRedirect({
      authenticated: true,
      isAdminRoute: true,
      isPhone: true,
      routeName: 'admin-annual-conference-work-plan',
      conferenceYear: '2027',
      query: {
        phase: 'phase-2', status: 'blocked', workstream: 'programme',
        owner: 'organizer@example.com', task: 'task-42',
      },
    })).toEqual({
      path: '/organizer-console/mobile/annual-conference/2027',
      query: {
        section: 'tasks', status: 'blocked', workstream: 'programme', phase: 'phase-2',
        owner: 'organizer@example.com', task: 'task-42',
      },
      replace: true,
    });

    expect(organizerViewportRedirect({
      authenticated: true,
      isAdminRoute: true,
      isPhone: false,
      routeName: ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME,
      conferenceYear: '2027',
      query: { section: 'tasks', phase: 'phase-2', owner: 'organizer@example.com', task: 'task-42' },
    })).toEqual({
      path: '/organizer-console/annual-conference/2027/work-plan',
      query: { phase: 'phase-2', owner: 'organizer@example.com', task: 'task-42' },
      replace: true,
    });
  });

  it('maps event subpages to mobile sections without losing the event', () => {
    expect(organizerViewportRedirect({
      authenticated: true, isAdminRoute: true, isPhone: true,
      routeName: 'admin-registrations', eventId: 'event/one',
    })).toEqual({
      path: '/organizer-console/mobile/events/event%2Fone',
      query: { section: 'guests' },
      replace: true,
    });

    expect(organizerViewportRedirect({
      authenticated: true, isAdminRoute: true, isPhone: false,
      routeName: ORGANIZER_PHONE_EVENT_ROUTE_NAME, eventId: 'event/one', query: { section: 'submissions' },
    })).toEqual({ path: '/organizer-console/events/event%2Fone/talks/proposals', replace: true });
  });

  it('keeps timeline task context when returning to desktop', () => {
    expect(organizerViewportRedirect({
      authenticated: true,
      isAdminRoute: true,
      isPhone: false,
      routeName: ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME,
      conferenceYear: '2027',
      query: { section: 'timeline', phase: 'phase-3', task: 'task-9', owner: 'ignored@example.com' },
    })).toEqual({
      path: '/organizer-console/annual-conference/2027/timeline',
      query: { phase: 'phase-3', task: 'task-9' },
      replace: true,
    });
  });

  it('degrades unsupported context to safe defaults', () => {
    const context = organizerConferenceContextQuery({
      section: 'finance', status: 'unknown', workstream: 'not-real', phase: '../phase',
      task: 'task with spaces', owner: ['not', 'a', 'string'],
    });

    expect(context).toEqual({ section: 'overview' });
    expect(organizerMobileConferenceSection(context)).toBe('overview');
    expect(organizerMobileEventSection({ section: 'unknown' })).toBe('overview');
  });

  it('preserves supported conference attention filters across viewport changes', () => {
    expect(organizerConferenceContextQuery({
      section: 'tasks', phase: 'all', attention: 'overdue',
    })).toEqual({ section: 'tasks', phase: 'all', attention: 'overdue' });
    expect(organizerConferenceContextQuery({
      section: 'tasks', attention: 'not-a-filter',
    })).toEqual({ section: 'tasks' });
  });

  it('returns tablets and desktops from the limited route to the full console', () => {
    expect(organizerViewportRedirect({
      authenticated: true, isAdminRoute: true, isPhone: false, routeName: 'admin-mobile',
    })).toEqual({ path: '/organizer-console/events', replace: true });
    expect(organizerViewportRedirect({
      authenticated: true, isAdminRoute: true, isPhone: false, routeName: ORGANIZER_PHONE_EVENTS_ROUTE_NAME,
    })).toEqual({ path: '/organizer-console/events', replace: true });
    expect(organizerViewportRedirect({
      authenticated: true, isAdminRoute: true, isPhone: false,
      routeName: ORGANIZER_PHONE_EVENT_ROUTE_NAME, eventId: 'event-one',
    })).toEqual({ path: '/organizer-console/events/event-one', replace: true });
    expect(organizerViewportRedirect({
      authenticated: true, isAdminRoute: true, isPhone: false,
      routeName: ORGANIZER_PHONE_EVENT_BLASTS_ROUTE_NAME, eventId: 'event-one',
    })).toEqual({ path: '/organizer-console/events/event-one/registrations', replace: true });
    expect(organizerViewportRedirect({
      authenticated: true, isAdminRoute: true, isPhone: false,
      routeName: 'admin-mobile-check-in', eventId: 'event-one',
    })).toEqual({ path: '/organizer-console/events/event-one/registrations', replace: true });
  });

  it('builds encoded dedicated phone routes', () => {
    expect(ORGANIZER_PHONE_EVENTS_ROUTE_PATH).toBe('/organizer-console/mobile/events');
    expect(organizerPhoneCheckInPath('event / one')).toBe('/organizer-console/mobile/events/event%20%2F%20one/check-in');
    expect(organizerPhoneEventPath('event / one')).toBe('/organizer-console/mobile/events/event%20%2F%20one');
    expect(organizerPhoneEventBlastsPath('event / one')).toBe('/organizer-console/mobile/events/event%20%2F%20one/blasts');
  });

  it('does not redirect before authentication or outside organizer routes', () => {
    expect(organizerViewportRedirect({
      authenticated: false, isAdminRoute: true, isPhone: true, routeName: 'admin-events',
    })).toBeNull();
    expect(organizerViewportRedirect({
      authenticated: true, isAdminRoute: false, isPhone: true, routeName: 'event-feedback',
    })).toBeNull();
  });
});
