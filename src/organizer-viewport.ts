import { adminPath } from './admin-routes';

export const ORGANIZER_PHONE_MAX_WIDTH_PX = 767;
export const ORGANIZER_PHONE_MEDIA_QUERY = `(max-width: ${ORGANIZER_PHONE_MAX_WIDTH_PX}px)`;
export const ORGANIZER_PHONE_ROUTE_NAME = 'admin-mobile';
export const ORGANIZER_PHONE_ROUTE_PATH = adminPath('mobile');
export const ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME = 'admin-mobile-check-in';

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
}

export function organizerPhoneCheckInPath(eventId: string): string {
  return adminPath(`mobile/events/${encodeURIComponent(eventId)}/check-in`);
}

export function isOrganizerPhoneRouteName(routeName: string | symbol | null | undefined): boolean {
  return routeName === ORGANIZER_PHONE_ROUTE_NAME || routeName === ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME;
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

    return ORGANIZER_PHONE_ROUTE_PATH;
  }

  if (normalizedRouteName === ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME && eventId) {
    return adminPath(`events/${encodeURIComponent(eventId)}/registrations`);
  }

  return normalizedRouteName === ORGANIZER_PHONE_ROUTE_NAME ? adminPath('events') : null;
}
