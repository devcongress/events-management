import { adminPath } from './admin-routes';

export const ORGANIZER_PHONE_MAX_WIDTH_PX = 767;
export const ORGANIZER_PHONE_MEDIA_QUERY = `(max-width: ${ORGANIZER_PHONE_MAX_WIDTH_PX}px)`;
export const ORGANIZER_PHONE_ROUTE_NAME = 'admin-mobile';
export const ORGANIZER_PHONE_ROUTE_PATH = adminPath('mobile');

const PHONE_ALLOWED_ADMIN_ROUTE_NAMES = new Set([
  'admin-login',
  'admin-auth-callback',
  'admin-feedback-display',
  'admin-annual-conference-volunteer-display',
]);

interface OrganizerViewportRouteInput {
  authenticated: boolean;
  isAdminRoute: boolean;
  isPhone: boolean;
  routeName: string | symbol | null | undefined;
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
}: OrganizerViewportRouteInput): string | null {
  if (!authenticated || !isAdminRoute) return null;

  const normalizedRouteName = typeof routeName === 'string' ? routeName : '';
  if (isPhone) {
    if (
      normalizedRouteName === ORGANIZER_PHONE_ROUTE_NAME
      || PHONE_ALLOWED_ADMIN_ROUTE_NAMES.has(normalizedRouteName)
    ) {
      return null;
    }

    return ORGANIZER_PHONE_ROUTE_PATH;
  }

  return normalizedRouteName === ORGANIZER_PHONE_ROUTE_NAME
    ? adminPath('events')
    : null;
}
