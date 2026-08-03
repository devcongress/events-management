import { adminPath } from './admin-routes';
import { annualConferencePath, mobileAnnualConferencePath } from './annual-conference';

export const ORGANIZER_PHONE_MAX_WIDTH_PX = 767;
export const ORGANIZER_PHONE_MEDIA_QUERY = `(max-width: ${ORGANIZER_PHONE_MAX_WIDTH_PX}px)`;
export const ORGANIZER_PHONE_ROUTE_NAME = 'admin-mobile';
export const ORGANIZER_PHONE_ROUTE_PATH = adminPath('mobile');
export const ORGANIZER_PHONE_EVENTS_ROUTE_NAME = 'admin-mobile-events';
export const ORGANIZER_PHONE_EVENTS_ROUTE_PATH = adminPath('mobile/events');
export const ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME = 'admin-mobile-check-in';
export const ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME = 'admin-mobile-annual-conference';

const PHONE_ALLOWED_ADMIN_ROUTE_NAMES = new Set([
  'admin-login',
  'admin-auth-callback',
  'admin-feedback-display',
  'admin-annual-conference-volunteer-display',
  'admin-public-events-preview',
  'admin-public-event-preview',
]);

interface OrganizerViewportRouteInput {
  authenticated: boolean;
  isAdminRoute: boolean;
  isPhone: boolean;
  routeName: string | symbol | null | undefined;
  eventId?: string | null;
  conferenceYear?: string | null;
}

export function organizerPhoneCheckInPath(eventId: string): string {
  return adminPath(`mobile/events/${encodeURIComponent(eventId)}/check-in`);
}

export function isOrganizerPhoneRouteName(routeName: string | symbol | null | undefined): boolean {
  return routeName === ORGANIZER_PHONE_ROUTE_NAME
    || routeName === ORGANIZER_PHONE_EVENTS_ROUTE_NAME
    || routeName === ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME
    || routeName === ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME;
}

export function matchesOrganizerPhoneViewport(
  target: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  return target?.matchMedia(ORGANIZER_PHONE_MEDIA_QUERY).matches ?? false;
}

export function organizerViewportRedirect({
  authenticated,
  isAdminRoute,
  isPhone,
  routeName,
  eventId,
  conferenceYear,
}: OrganizerViewportRouteInput): string | null {
  if (!authenticated || !isAdminRoute) return null;

  const normalizedRouteName = typeof routeName === 'string' ? routeName : '';
  if (isPhone) {
    if (
      isOrganizerPhoneRouteName(normalizedRouteName)
      || PHONE_ALLOWED_ADMIN_ROUTE_NAMES.has(normalizedRouteName)
    ) {
      return null;
    }

    if (
      normalizedRouteName === 'admin-annual-conference'
      || normalizedRouteName === 'admin-annual-conference-work-plan'
      || normalizedRouteName === 'admin-annual-conference-timeline'
    ) {
      return mobileAnnualConferencePath(conferenceYear ?? undefined);
    }

    return ORGANIZER_PHONE_ROUTE_PATH;
  }

  if (normalizedRouteName === ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME && eventId) {
    return adminPath(`events/${encodeURIComponent(eventId)}/registrations`);
  }

  if (normalizedRouteName === ORGANIZER_PHONE_EVENTS_ROUTE_NAME) {
    return adminPath('events');
  }

  if (normalizedRouteName === ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME) {
    return annualConferencePath('work-plan', conferenceYear ?? undefined);
  }

  return normalizedRouteName === ORGANIZER_PHONE_ROUTE_NAME ? adminPath('events') : null;
}
