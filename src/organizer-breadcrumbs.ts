import type { LocationQuery, RouteLocationRaw } from 'vue-router';
import {
  isAnnualConferenceCapability,
  type AnnualConferenceCapability,
} from '@/lib/annual-conference-capabilities';
import { adminPath } from './admin-routes';
import { annualConferencePath, mobileAnnualConferencePath, volunteerCanAccessOrganizerPath } from './annual-conference';
import { queryKeys } from './lib/api';
import { resolveTicketingSection, ticketingSectionLabel } from './ticketing-navigation';

export type OrganizerBreadcrumbRole = 'owner' | 'organizer' | 'volunteer' | null;

export type OrganizerBreadcrumb = {
  label: string;
  to?: RouteLocationRaw;
};

export type OrganizerBreadcrumbRoute = {
  name: unknown;
  params?: Record<string, unknown>;
  query?: LocationQuery;
};

export type OrganizerBreadcrumbLabels = {
  eventName?: string;
  editionLabel?: string;
  capabilities?: readonly AnnualConferenceCapability[];
  assignedAccess?: boolean;
};

const breadcrumbRoutes = new Set([
  'admin-mobile',
  'admin-mobile-events',
  'admin-mobile-event',
  'admin-mobile-event-blasts',
  'admin-mobile-annual-conference',
  'admin-events',
  'admin-event-submissions',
  'admin-events-new',
  'admin-event',
  'admin-community-event',
  'admin-talks',
  'admin-speakers',
  'admin-attendance',
  'admin-registrations',
  'admin-system-design',
  'admin-feedback',
  'admin-attendance-overview',
  'admin-feedback-overview',
  'admin-organizers',
  'admin-audit-log',
  'admin-present-forms',
  'admin-annual-conference',
  'admin-annual-conference-work-plan',
  'admin-annual-conference-speakers',
  'admin-annual-conference-ticketing',
  'admin-annual-conference-registrations',
  'admin-annual-conference-check-in',
  'admin-annual-conference-volunteers',
]);

const eventLeaves: Record<string, string> = {
  'admin-speakers': 'Speakers',
  'admin-attendance': 'Attendance',
  'admin-registrations': 'Registration',
  'admin-system-design': 'System Design',
  'admin-feedback': 'Feedback',
};
const talkSections: Record<string, string> = {
  cfp: 'CFP',
  proposals: 'Talks review',
  program: 'Talks Archive',
  backfill: 'Archive Requests',
};
const registrationSections: Record<string, string> = {
  summary: 'Summary',
  guests: 'Guests',
  form: 'Form & capacity',
  emails: 'Emails',
  blasts: 'Blasts',
  community: 'Community seats',
};

export function isOrganizerBreadcrumbRoute(name: unknown): boolean {
  return typeof name === 'string' && breadcrumbRoutes.has(name);
}

function scalar(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function label(value: unknown): string | undefined {
  return scalar(value)?.trim();
}

export function readOrganizerBreadcrumbLabels(
  route: OrganizerBreadcrumbRoute,
  readCached: (key: readonly unknown[]) => unknown,
): OrganizerBreadcrumbLabels {
  const eventId = scalar(route.params?.eventId);
  const year = scalar(route.params?.year);
  const result: OrganizerBreadcrumbLabels = {};

  if (eventId) {
    const event = record(readCached(queryKeys.event(eventId)));
    const registration = record(readCached(queryKeys.eventRegistrations(eventId)));
    const events = readCached(queryKeys.events);
    const listedEvent = Array.isArray(events)
      ? events.find(item => record(item)?.id === eventId)
      : undefined;

    result.eventName = label(event?.name)
      ?? label(record(registration?.event)?.name)
      ?? label(record(listedEvent)?.name);
  }

  if (year && /^\d{4}$/.test(year)) {
    const workspace = record(readCached(queryKeys.annualConferenceWorkPlan(year)));
    const editions = record(readCached(queryKeys.annualConferenceEditions))?.editions;
    const listedEdition = Array.isArray(editions)
      ? editions.find(item => String(record(item)?.year) === year)
      : undefined;
    const permissions = record(workspace?.permissions);
    const capabilities = permissions?.capabilities;

    if (permissions?.access_scope === 'assigned' || permissions?.access_scope === 'all') {
      result.assignedAccess = permissions.access_scope === 'assigned';
    }

    result.editionLabel = label(record(workspace?.edition)?.label) ?? label(record(listedEdition)?.label);
    result.capabilities = Array.isArray(capabilities) ? capabilities.filter(isAnnualConferenceCapability) : [];
  }

  return result;
}

function eventReturnContext(query: LocationQuery) {
  const from = query.from === 'attendance' || query.from === 'feedback' ? query.from : null;
  const month = typeof query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)
    ? query.month
    : null;

  return { from, month, query: from ? { from, ...(month ? { month } : {}) } : undefined };
}

function eventBreadcrumbs(
  route: OrganizerBreadcrumbRoute,
  labels: OrganizerBreadcrumbLabels,
): OrganizerBreadcrumb[] {
  const eventId = scalar(route.params?.eventId);

  if (!eventId) return [];

  const name = String(route.name);
  const query = route.query ?? {};
  const context = eventReturnContext(query);
  const mobile = name.startsWith('admin-mobile-');
  const path = adminPath(`${mobile ? 'mobile/' : ''}events/${encodeURIComponent(eventId)}`);
  const eventTo = context.query ? { path, query: context.query } : path;
  const ancestor: OrganizerBreadcrumb = context.from
    ? { label: context.from === 'attendance' ? 'Attendance' : 'Feedback', to: { path: adminPath(context.from), ...(context.month ? { query: { month: context.month } } : {}) } }
    : { label: 'Events', to: adminPath(mobile ? 'mobile/events' : 'events') };
  const event: OrganizerBreadcrumb = { label: label(labels.eventName) ?? 'Event' };

  if (name === 'admin-event' || name === 'admin-community-event') return [ancestor, event];

  if (name === 'admin-mobile-event') {
    const section = query.section === 'guests' || query.section === 'submissions' ? query.section : 'overview';

    return section === 'overview'
      ? [ancestor, event]
      : [ancestor, { ...event, to: eventTo }, { label: section === 'guests' ? 'Guests' : 'Submissions' }];
  }

  if (name === 'admin-mobile-event-blasts') return [ancestor, { ...event, to: eventTo }, { label: 'Blasts' }];

  if (name === 'admin-talks') {
    const section = scalar(route.params?.talksSection);
    const current = section && talkSections[section] ? section : 'cfp';
    const talksPath = `${path}/talks/cfp`;

    return [
      ancestor,
      { ...event, to: eventTo },
      { label: 'Talks', ...(current === 'cfp' ? {} : { to: context.query ? { path: talksPath, query: context.query } : talksPath }) },
      { label: talkSections[current] },
    ];
  }

  const leaf = eventLeaves[name];

  return leaf ? [ancestor, { ...event, to: eventTo }, { label: leaf }] : [];
}

function conferenceBreadcrumbs(
  route: OrganizerBreadcrumbRoute,
  role: Exclude<OrganizerBreadcrumbRole, null>,
  labels: OrganizerBreadcrumbLabels,
  phone = false,
): OrganizerBreadcrumb[] {
  const year = scalar(route.params?.year);

  if (!year || !/^\d{4}$/.test(year)) return [];

  const name = String(route.name);
  const capabilities = labels.capabilities ?? [];
  const mobile = name === 'admin-mobile-annual-conference';
  const overview = phone || mobile ? mobileAnnualConferencePath(year) : annualConferencePath('', year);
  const overviewTo = phone || mobile ? { path: overview, query: { section: 'overview' } } : overview;
  const canLink = (path: string) => role !== 'volunteer' || volunteerCanAccessOrganizerPath(path, capabilities);
  const base: OrganizerBreadcrumb[] = [
    { label: 'Annual Conference' },
    { label: label(labels.editionLabel) ?? year, ...(name === 'admin-annual-conference' || !canLink(overview) ? {} : { to: overviewTo }) },
  ];

  if (name === 'admin-annual-conference') return canLink(overview) ? base : [];

  const query = route.query ?? {};

  if (mobile) {
    const section = query.section === 'tasks' || query.section === 'volunteers' ? query.section : 'overview';
    const title = section === 'tasks' ? labels.assignedAccess ? 'My tasks' : 'Work plan' : section === 'volunteers' ? 'Volunteers' : 'Overview';
    const edition = { ...base[1], ...(section === 'overview' ? { to: undefined } : { to: overviewTo }) };

    return [
      ...(role === 'volunteer' ? [] : [{ label: 'Home', to: adminPath('mobile') }]),
      base[0],
      edition,
      { label: title },
    ];
  }

  if (name === 'admin-annual-conference-ticketing') {
    if (!canLink(annualConferencePath('ticketing', year))) return [];
    if (phone) return [...base, { label: 'Ticketing' }];
    const section = resolveTicketingSection(query.section, year);

    return [...base, { label: 'Ticketing', ...(section === 'overview' ? {} : { to: { path: annualConferencePath('ticketing', year), query: { section: 'overview' } } }) }, { label: ticketingSectionLabel(section) }];
  }

  if (name === 'admin-annual-conference-registrations') {
    const path = annualConferencePath('registrations', year);

    if (!canLink(path)) return [];
    if (phone) return [...base, { label: 'Registration' }];
    const raw = scalar(query.section);
    const section = raw && registrationSections[raw] && (raw !== 'community' || (role === 'owner' && year === '2026')) ? raw : 'summary';

    return [...base, { label: 'Registration', ...(section === 'summary' ? {} : { to: { path, query: { section: 'summary' } } }) }, { label: registrationSections[section] }];
  }

  const sections: Record<string, { path: string; label: string }> = {
    'admin-annual-conference-work-plan': { path: 'work-plan', label: 'Work plan' },
    'admin-annual-conference-speakers': { path: 'speakers', label: 'Speakers' },
    'admin-annual-conference-check-in': { path: 'check-in', label: 'Guests' },
    'admin-annual-conference-volunteers': { path: 'volunteers', label: 'Volunteers' },
  };
  const section = sections[name];

  return section && canLink(annualConferencePath(section.path, year)) ? [...base, { label: section.label }] : [];
}

export function resolveOrganizerBreadcrumbs(
  input: OrganizerBreadcrumbRoute & { role: OrganizerBreadcrumbRole; labels?: OrganizerBreadcrumbLabels; phone?: boolean },
): OrganizerBreadcrumb[] {
  if (!input.role || !isOrganizerBreadcrumbRoute(input.name)) return [];
  const name = String(input.name);
  const labels = input.labels ?? {};

  if (name.startsWith('admin-annual-conference') || name === 'admin-mobile-annual-conference') return conferenceBreadcrumbs(input, input.role, labels, input.phone);
  if (input.role === 'volunteer') return [];
  if (name === 'admin-mobile') return [{ label: 'Home' }];
  if (name === 'admin-mobile-events') return [{ label: 'Home', to: adminPath('mobile') }, { label: 'Events' }];
  if (name === 'admin-events-new') return [{ label: 'Events', to: adminPath('events') }, { label: 'Create event' }];
  if (name === 'admin-event-submissions') return [{ label: 'Events', to: adminPath('events') }, { label: 'Community submissions' }];

  const topLevel: Record<string, string> = {
    'admin-events': 'Events',
    'admin-attendance-overview': 'Attendance',
    'admin-feedback-overview': 'Feedback',
    'admin-organizers': 'People & Access',
    'admin-audit-log': 'Audit Log',
    'admin-present-forms': 'Present forms',
  };

  if (name === 'admin-audit-log' || name === 'admin-present-forms') {
    return input.role === 'owner' ? [{ label: topLevel[name] }] : [];
  }
  if (topLevel[name]) return [{ label: topLevel[name] }];

  return eventBreadcrumbs(input, labels);
}
