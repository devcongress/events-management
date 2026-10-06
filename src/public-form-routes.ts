import type { RouteRecordName } from 'vue-router';

export const PUBLIC_FORM_ROUTE_NAMES = [
  'event-feedback',
  'event-cfp',
  'monthly-cfp',
  'conference-cfp',
  'event-registration-short',
  'event-registration',
  'event-amendment',
  'event-amendment-legacy',
  'speaker-talk-intake',
  'conference-speaker-intake',
  'volunteer-intake',
  'volunteer-follow-up',
  'volunteer-follow-up-test',
  'admin-access-request',
] as const;

const publicFormRouteNameSet = new Set<string>(PUBLIC_FORM_ROUTE_NAMES);

export function isPublicFormRouteName(
  routeName: RouteRecordName | null | undefined,
): boolean {
  return typeof routeName === 'string' && publicFormRouteNameSet.has(routeName);
}
