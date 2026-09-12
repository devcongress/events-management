import { adminPath } from './admin-routes';
import { annualConferencePath, mobileAnnualConferencePath } from './annual-conference';

export const ORGANIZER_PHONE_MAX_WIDTH_PX = 767;
export const ORGANIZER_PHONE_MEDIA_QUERY = `(max-width: ${ORGANIZER_PHONE_MAX_WIDTH_PX}px)`;
export const ORGANIZER_PHONE_ROUTE_NAME = 'admin-mobile';
export const ORGANIZER_PHONE_ROUTE_PATH = adminPath('mobile');
export const ORGANIZER_PHONE_EVENTS_ROUTE_NAME = 'admin-mobile-events';
export const ORGANIZER_PHONE_EVENTS_ROUTE_PATH = adminPath('mobile/events');
export const ORGANIZER_PHONE_EVENT_ROUTE_NAME = 'admin-mobile-event';
export const ORGANIZER_PHONE_EVENT_BLASTS_ROUTE_NAME = 'admin-mobile-event-blasts';
export const ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME = 'admin-mobile-check-in';
export const ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME = 'admin-mobile-annual-conference';

export type OrganizerMobileEventSection = 'overview' | 'guests' | 'submissions';
export type OrganizerMobileConferenceSection = 'overview' | 'tasks' | 'timeline' | 'volunteers';

export interface OrganizerViewportRedirectTarget {
  path: string;
  query?: Record<string, string>;
  replace: true;
}

type OrganizerRouteQuery = Record<string, unknown>;

const PHONE_ALLOWED_ADMIN_ROUTE_NAMES = new Set([
  'admin-login',
  'admin-auth-callback',
  'admin-feedback-display',
  'admin-registration-display',
  'admin-annual-conference-volunteer-display',
  'admin-public-events-preview',
  'admin-public-event-preview',
  'admin-organizers',
]);

interface OrganizerViewportRouteInput {
  authenticated: boolean;
  isAdminRoute: boolean;
  isPhone: boolean;
  routeName: string | symbol | null | undefined;
  eventId?: string | null;
  conferenceYear?: string | null;
  query?: OrganizerRouteQuery;
}

const DESKTOP_CONFERENCE_ROUTE_SECTIONS = new Map<string, OrganizerMobileConferenceSection>([
  ['admin-annual-conference', 'overview'],
  ['admin-annual-conference-work-plan', 'tasks'],
  ['admin-annual-conference-timeline', 'timeline'],
  ['admin-annual-conference-volunteers', 'volunteers'],
]);

const DESKTOP_CONFERENCE_ROUTE_NAMES = new Set([
  ...DESKTOP_CONFERENCE_ROUTE_SECTIONS.keys(),
  'admin-annual-conference-speakers',
  'admin-annual-conference-finance',
]);

const DESKTOP_EVENT_ROUTE_SECTIONS = new Map<string, OrganizerMobileEventSection>([
  ['admin-event', 'overview'],
  ['admin-registrations', 'guests'],
  ['admin-attendance', 'guests'],
  ['admin-talks', 'submissions'],
  ['admin-speakers', 'submissions'],
]);

const CONFERENCE_STATUSES = new Set(['all', 'not_started', 'in_progress', 'blocked', 'done']);
const CONFERENCE_ATTENTION_FILTERS = new Set(['overdue', 'due_soon', 'needs_planning']);
const CONFERENCE_WORKSTREAMS = new Set([
  'programme',
  'volunteers',
  'website_registration',
  'sponsors_partners',
  'venue_production_logistics',
  'creative_marketing',
  'photo_video_livestream',
  'feedback_reporting',
]);

function queryString(query: OrganizerRouteQuery | undefined, key: string): string | null {
  const value = query?.[key];

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  return trimmed || null;
}

function boundedQueryString(query: OrganizerRouteQuery | undefined, key: string, maxLength: number): string | null {
  const value = queryString(query, key);

  return value && value.length <= maxLength ? value : null;
}

function redirectTarget(path: string, query: Record<string, string> = {}): OrganizerViewportRedirectTarget {
  return {
    path,
    ...(Object.keys(query).length ? { query } : {}),
    replace: true,
  };
}

export function organizerMobileEventSection(query: OrganizerRouteQuery | undefined): OrganizerMobileEventSection {
  const section = queryString(query, 'section');

  return section === 'guests' || section === 'submissions' ? section : 'overview';
}

export function organizerMobileConferenceSection(query: OrganizerRouteQuery | undefined): OrganizerMobileConferenceSection {
  const section = queryString(query, 'section');

  if (section === 'tasks' || section === 'timeline' || section === 'volunteers') return section;

  return 'overview';
}

export function organizerConferenceContextQuery(
  query: OrganizerRouteQuery | undefined,
  section = organizerMobileConferenceSection(query),
): Record<string, string> {
  const context: Record<string, string> = { section };
  const status = queryString(query, 'status');
  const attention = queryString(query, 'attention');
  const workstream = queryString(query, 'workstream');
  const phase = boundedQueryString(query, 'phase', 100);
  const owner = boundedQueryString(query, 'owner', 254);
  const task = boundedQueryString(query, 'task', 100);

  if (status && CONFERENCE_STATUSES.has(status)) context.status = status;
  if (attention && CONFERENCE_ATTENTION_FILTERS.has(attention)) context.attention = attention;
  if (workstream && CONFERENCE_WORKSTREAMS.has(workstream)) context.workstream = workstream;
  if (phase && /^[a-z0-9][a-z0-9-]*$/i.test(phase)) context.phase = phase;
  if (owner) context.owner = owner;
  if (task && /^[a-z0-9][a-z0-9-]*$/i.test(task)) context.task = task;

  return context;
}

export function organizerEventContextQuery(
  query: OrganizerRouteQuery | undefined,
  section = organizerMobileEventSection(query),
): Record<string, string> {
  return { section };
}

export function organizerPhoneCheckInPath(eventId: string): string {
  return adminPath(`mobile/events/${encodeURIComponent(eventId)}/check-in`);
}

export function organizerPhoneEventPath(eventId: string): string {
  return adminPath(`mobile/events/${encodeURIComponent(eventId)}`);
}

export function organizerPhoneEventBlastsPath(eventId: string): string {
  return adminPath(`mobile/events/${encodeURIComponent(eventId)}/blasts`);
}

export function isOrganizerPhoneRouteName(routeName: string | symbol | null | undefined): boolean {
  return routeName === ORGANIZER_PHONE_ROUTE_NAME
    || routeName === ORGANIZER_PHONE_EVENTS_ROUTE_NAME
    || routeName === ORGANIZER_PHONE_EVENT_ROUTE_NAME
    || routeName === ORGANIZER_PHONE_EVENT_BLASTS_ROUTE_NAME
    || routeName === ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME
    || routeName === ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME;
}

export function matchesOrganizerPhoneViewport(
  target: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window,
): boolean {
  return target?.matchMedia(ORGANIZER_PHONE_MEDIA_QUERY).matches ?? false;
}

export function organizerPostAuthLanding(
  target: string,
  role: 'owner' | 'organizer' | 'volunteer' | undefined,
  isPhone: boolean,
): string {
  if (role === 'volunteer') return annualConferencePath();
  if (!isPhone) return target;

  const isConferenceOverview = new RegExp(`^${adminPath('annual-conference/')}\\d{4}/?$`).test(target);
  const isMobileConferenceOverview = new RegExp(
    `^${adminPath('mobile/annual-conference/')}\\d{4}/?(?:\\?section=overview)?$`,
  ).test(target);

  return isConferenceOverview || isMobileConferenceOverview
    ? ORGANIZER_PHONE_ROUTE_PATH
    : target;
}

export function organizerViewportRedirect({
  authenticated,
  isAdminRoute,
  isPhone,
  routeName,
  eventId,
  conferenceYear,
  query,
}: OrganizerViewportRouteInput): OrganizerViewportRedirectTarget | null {
  if (!authenticated || !isAdminRoute) return null;

  const normalizedRouteName = typeof routeName === 'string' ? routeName : '';

  if (isPhone) {
    if (
      isOrganizerPhoneRouteName(normalizedRouteName)
      || PHONE_ALLOWED_ADMIN_ROUTE_NAMES.has(normalizedRouteName)
    ) {
      return null;
    }

    if (DESKTOP_CONFERENCE_ROUTE_NAMES.has(normalizedRouteName)) {
      const section = DESKTOP_CONFERENCE_ROUTE_SECTIONS.get(normalizedRouteName) ?? 'overview';

      return redirectTarget(
        mobileAnnualConferencePath(conferenceYear ?? undefined),
        organizerConferenceContextQuery(query, section),
      );
    }

    if (eventId) {
      const section = DESKTOP_EVENT_ROUTE_SECTIONS.get(normalizedRouteName) ?? 'overview';

      return redirectTarget(
        organizerPhoneEventPath(eventId),
        organizerEventContextQuery(query, section),
      );
    }

    return redirectTarget(ORGANIZER_PHONE_ROUTE_PATH);
  }

  if (normalizedRouteName === ORGANIZER_PHONE_EVENT_ROUTE_NAME && eventId) {
    const section = organizerMobileEventSection(query);

    if (section === 'guests') return redirectTarget(adminPath(`events/${encodeURIComponent(eventId)}/registrations`));
    if (section === 'submissions') return redirectTarget(adminPath(`events/${encodeURIComponent(eventId)}/talks/proposals`));

    return redirectTarget(adminPath(`events/${encodeURIComponent(eventId)}`));
  }

  if (normalizedRouteName === ORGANIZER_PHONE_EVENT_BLASTS_ROUTE_NAME && eventId) {
    return redirectTarget(adminPath(`events/${encodeURIComponent(eventId)}/registrations`));
  }

  if (normalizedRouteName === ORGANIZER_PHONE_CHECK_IN_ROUTE_NAME && eventId) {
    return redirectTarget(adminPath(`events/${encodeURIComponent(eventId)}/registrations`));
  }

  if (normalizedRouteName === ORGANIZER_PHONE_EVENTS_ROUTE_NAME) {
    return redirectTarget(adminPath('events'));
  }

  if (normalizedRouteName === ORGANIZER_PHONE_ANNUAL_CONFERENCE_ROUTE_NAME) {
    const context = organizerConferenceContextQuery(query);
    const section = organizerMobileConferenceSection(context);
    const targetQuery = { ...context };

    delete targetQuery.section;
    if (section === 'tasks') {
      return redirectTarget(annualConferencePath('work-plan', conferenceYear ?? undefined), targetQuery);
    }
    if (section === 'timeline') {
      const timelineQuery = Object.fromEntries(
        Object.entries(targetQuery).filter(([key]) => key === 'phase' || key === 'task'),
      );

      return redirectTarget(annualConferencePath('timeline', conferenceYear ?? undefined), timelineQuery);
    }
    if (section === 'volunteers') return redirectTarget(annualConferencePath('volunteers', conferenceYear ?? undefined));

    return redirectTarget(annualConferencePath('', conferenceYear ?? undefined));
  }

  return normalizedRouteName === ORGANIZER_PHONE_ROUTE_NAME
    ? redirectTarget(adminPath('events'))
    : null;
}
