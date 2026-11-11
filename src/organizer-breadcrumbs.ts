import type { AdminRole } from '@/types/supabase';
import type { LocationQuery, RouteLocationRaw } from 'vue-router';
import {
  hasAnyAnnualConferenceCapability,
  isAnnualConferenceCapability,
  VOLUNTEER_SECTION_CAPABILITIES,
  type AnnualConferenceCapability,
} from '@/lib/annual-conference-capabilities';
import { adminPath } from './admin-routes';
import { annualConferencePath, canCreateConferenceBadge, mobileAnnualConferencePath, RESTRICTED_CONFERENCE_HOME, volunteerCanAccessOrganizerPath } from './annual-conference';
import { queryKeys } from './lib/api';
import { resolveTicketingSection, ticketingSectionLabel } from './ticketing-navigation';
import { resolveAuditLogSection } from './lib/organizer-workspace-sections';
import { resolveVolunteerCampaignTab, resolveVolunteerView } from './lib/volunteer-navigation';

export type OrganizerBreadcrumbRole = AdminRole | null;

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
  'admin-reports',
  'admin-organizers',
  'admin-audit-log',
  'admin-present-forms',
  'admin-annual-conference',
  'admin-annual-conference-work-plan',
  'admin-annual-conference-speakers',
  'admin-annual-conference-programme',
  'admin-annual-conference-ticketing',
  'admin-annual-conference-registrations',
  'admin-annual-conference-check-in',
  'admin-annual-conference-volunteers',
  'admin-annual-conference-finance',
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
  const ancestors: OrganizerBreadcrumb[] = context.from
    ? [
        { label: 'Reports', to: adminPath('reports') },
        { label: context.from === 'attendance' ? 'Attendance' : 'Feedback', to: { path: adminPath('reports'), query: { section: context.from, ...(context.month ? { month: context.month } : {}) } } },
      ]
    : [{ label: 'Events', to: adminPath(mobile ? 'mobile/events' : 'events') }];
  const event: OrganizerBreadcrumb = { label: label(labels.eventName) ?? 'Event' };

  if (name === 'admin-event' || name === 'admin-community-event') return [...ancestors, event];

  if (name === 'admin-mobile-event') {
    const section = query.section === 'guests' || query.section === 'submissions' ? query.section : 'overview';

    return section === 'overview'
      ? [...ancestors, event]
      : [...ancestors, { ...event, to: eventTo }, { label: section === 'guests' ? 'Guests' : 'Submissions' }];
  }

  if (name === 'admin-mobile-event-blasts') return [...ancestors, { ...event, to: eventTo }, { label: 'Blasts' }];

  if (name === 'admin-talks') {
    const section = scalar(route.params?.talksSection);
    const current = section && talkSections[section] ? section : 'cfp';
    const talksPath = `${path}/talks/cfp`;

    return [
      ...ancestors,
      { ...event, to: eventTo },
      { label: 'Talks', ...(current === 'cfp' ? {} : { to: context.query ? { path: talksPath, query: context.query } : talksPath }) },
      { label: talkSections[current] },
    ];
  }

  const leaf = eventLeaves[name];

  return leaf ? [...ancestors, { ...event, to: eventTo }, { label: leaf }] : [];
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

  const query = route.query ?? {};

  if (phone) {
    const overviewCrumb: OrganizerBreadcrumb = { label: 'Overview', ...(canLink(overview) ? { to: overviewTo } : {}) };

    if (mobile) {
      const section = query.section === 'tasks' || query.section === 'volunteers' ? query.section : 'overview';

      if (query.section === 'badge' && canCreateConferenceBadge(year, role)) return [overviewCrumb, { label: 'Conference badge' }];
      if (section === 'overview') return [{ label: 'Overview' }];
      if (section === 'volunteers') {
        if (!hasAnyAnnualConferenceCapability(capabilities, VOLUNTEER_SECTION_CAPABILITIES)) return [{ label: 'Overview' }];
        const canReview = year === '2026' && capabilities.includes('volunteers.reviews.view');
        const canCampaign = year === '2026' && capabilities.includes('volunteers.campaign.view');
        const canDirectory = capabilities.includes('volunteers.directory.view') || capabilities.includes('volunteers.intake.share');

        if (!canReview && !canCampaign) return [overviewCrumb, { label: 'Volunteers' }];
        const view = resolveVolunteerView(query.volunteerView, canReview, canCampaign, canDirectory);
        const titles = { directory: 'Directory', reviews: 'Reviews', campaign: 'Campaign' };

        const volunteerCrumb: OrganizerBreadcrumb = { label: 'Volunteers', to: { path: overview, query: { ...query, section: 'volunteers', volunteerView: resolveVolunteerView(undefined, canReview, canCampaign, canDirectory) } } };

        if (view === 'campaign') {
          const tab = resolveVolunteerCampaignTab(query.campaignTab);
          const tabLabels = { updates: 'Updates', outcomes: 'Outcomes', invitations: 'Invitations', settings: 'Settings' };

          return [
            overviewCrumb,
            volunteerCrumb,
            { label: 'Campaign', to: { path: overview, query: { ...query, section: 'volunteers', volunteerView: 'campaign', campaignTab: 'updates' } } },
            { label: tabLabels[tab] },
          ];
        }

        return [overviewCrumb, volunteerCrumb, { label: titles[view] }];
      }

      return [overviewCrumb, { label: labels.assignedAccess ? 'My tasks' : 'Work plan' }];
    }

    if (name === 'admin-annual-conference-ticketing') {
      const path = annualConferencePath('ticketing', year);

      if (!canLink(path)) return [];
      const section = resolveTicketingSection(query.section, year);

      return [overviewCrumb, { label: 'Ticketing', to: { path, query: { section: 'overview' } } }, { label: ticketingSectionLabel(section) }];
    }

    if (name === 'admin-annual-conference-registrations') {
      const path = annualConferencePath('registrations', year);

      if (!canLink(path)) return [];
      const raw = scalar(query.section);
      const allowed = Object.keys(registrationSections).filter((key) => (key !== 'community' || year === '2026')
        && hasAnyAnnualConferenceCapability(capabilities, [`registration.${key}.view` as AnnualConferenceCapability]));
      const section = raw && allowed.includes(raw) ? raw : allowed[0] ?? 'summary';

      return [overviewCrumb, { label: 'Registration', to: { path, query: { section: allowed[0] ?? 'summary' } } }, { label: registrationSections[section] }];
    }

    if (name === 'admin-annual-conference-speakers') {
      const path = annualConferencePath('speakers', year);

      if (!canLink(path)) return [];
      const sectionLabel = query.section === 'participation' ? 'Participation'
        : role === 'owner' && query.section === 'delivery' ? 'Delivery'
          : role === 'owner' && query.section === 'outcome-messages' ? 'Outcome messages' : 'Proposals';

      return [overviewCrumb, { label: 'Speakers', to: { path, query: { section: 'proposals' } } }, { label: sectionLabel }];
    }

    const phoneSections: Record<string, { path: string; label: string }> = {
      'admin-annual-conference-work-plan': { path: 'work-plan', label: 'Work plan' },
      'admin-annual-conference-programme': { path: 'programme', label: 'Programme' },
      'admin-annual-conference-check-in': { path: 'check-in', label: 'Guests' },
      'admin-annual-conference-volunteers': { path: 'volunteers', label: 'Volunteers' },
    };
    const section = phoneSections[name];

    return section && canLink(annualConferencePath(section.path, year)) ? [overviewCrumb, { label: section.label }] : [];

  }

  if (name === 'admin-annual-conference') {
    if (!canLink(overview)) return [];

    return query.section === 'badge' && canCreateConferenceBadge(year, role)
      ? [base[0], { ...base[1], to: overviewTo }, { label: 'Conference badge' }]
      : base;
  }

  if (mobile) {
    const section = query.section === 'tasks' || query.section === 'volunteers' || (query.section === 'badge' && canCreateConferenceBadge(year, role)) ? query.section : 'overview';
    const title = section === 'tasks' ? labels.assignedAccess ? 'My tasks' : 'Work plan' : section === 'volunteers' ? 'Volunteers' : section === 'badge' ? 'Conference badge' : 'Overview';
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
    const section = resolveTicketingSection(query.section, year);

    return [...base, { label: 'Ticketing', ...(section === 'overview' ? {} : { to: { path: annualConferencePath('ticketing', year), query: { section: 'overview' } } }) }, { label: ticketingSectionLabel(section) }];
  }

  if (name === 'admin-annual-conference-registrations') {
    const path = annualConferencePath('registrations', year);

    if (!canLink(path)) return [];
    const raw = scalar(query.section);
    const allowed = Object.keys(registrationSections).filter((key) => (key !== 'community' || year === '2026')
      && hasAnyAnnualConferenceCapability(capabilities, [`registration.${key}.view` as AnnualConferenceCapability]));
    const section = raw && allowed.includes(raw) ? raw : allowed[0] ?? 'summary';

    return [...base, { label: 'Registration', ...(section === allowed[0] ? {} : { to: { path, query: { section: allowed[0] ?? 'summary' } } }) }, { label: registrationSections[section] }];
  }

  if (name === 'admin-annual-conference-speakers') {
    const path = annualConferencePath('speakers', year);

    if (!canLink(path)) return [];
    const sectionLabel = query.section === 'participation' ? 'Participation'
      : role === 'owner' && query.section === 'delivery' ? 'Delivery'
        : role === 'owner' && query.section === 'outcome-messages' ? 'Outcome messages' : 'Proposals';

    return [...base, { label: 'Speakers', ...(sectionLabel !== 'Proposals' ? { to: { path, query: { section: 'proposals' } } } : {}) }, { label: sectionLabel }];
  }

  const sections: Record<string, { path: string; label: string }> = {
    'admin-annual-conference-work-plan': { path: 'work-plan', label: 'Work plan' },
    'admin-annual-conference-programme': { path: 'programme', label: 'Programme' },
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

  if (input.role === 'member') return [{ label: 'Your conference access', to: RESTRICTED_CONFERENCE_HOME }];
  if (name.startsWith('admin-annual-conference') || name === 'admin-mobile-annual-conference') return conferenceBreadcrumbs(input, input.role, labels, input.phone);
  if (input.role === 'volunteer') return [];
  if (name === 'admin-mobile') return [{ label: 'Home' }];
  if (name === 'admin-mobile-events') return [{ label: 'Home', to: adminPath('mobile') }, { label: 'Events' }];
  if (name === 'admin-events-new') return [{ label: 'Events', to: adminPath('events') }, { label: 'Create event' }];
  if (name === 'admin-event-submissions') return [{ label: 'Events', to: adminPath('events') }, { label: 'Community submissions' }];

  const topLevel: Record<string, string> = {
    'admin-events': 'Events',
    'admin-organizers': 'People & Access',
    'admin-audit-log': 'Audit Log',
    'admin-present-forms': 'Present forms',
  };

  if (name === 'admin-reports') return [
    ...(input.phone ? [{ label: 'Home', to: adminPath('mobile') }] : []),
    { label: 'Reports', to: adminPath('reports') },
    { label: input.query?.section === 'feedback' ? 'Feedback' : 'Attendance' },
  ];

  if (name === 'admin-audit-log' || name === 'admin-present-forms') {
    if (input.role !== 'owner') return [];
    if (name === 'admin-audit-log' && input.phone) {
      const section = resolveAuditLogSection(input.query?.section);
      const sections = { activity: 'Activity', 'email-delivery': 'Email delivery', 'email-previews': 'Email previews', 'short-links': 'Short links', 'archived-events': 'Archived events' };

      return [{ label: 'Home', to: adminPath('mobile') }, { label: 'Audit Log', to: { path: adminPath('audit-log'), query: { ...input.query, section: 'activity' } } }, { label: sections[section] }];
    }

    return [...(input.phone ? [{ label: 'Home', to: adminPath('mobile') }] : []), { label: topLevel[name] }];
  }
  if (topLevel[name]) return [...(input.phone ? [{ label: 'Home', to: adminPath('mobile') }] : []), { label: topLevel[name] }];

  return eventBreadcrumbs(input, labels);
}
