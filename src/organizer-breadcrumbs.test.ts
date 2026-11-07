import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import OrganizerBreadcrumbs from './components/OrganizerBreadcrumbs.vue';
import { adminPath } from './admin-routes';
import { annualConferencePath, currentAnnualConferenceYear } from './annual-conference';
import { queryKeys } from './lib/api';
import {
  isOrganizerBreadcrumbRoute,
  readOrganizerBreadcrumbLabels,
  resolveOrganizerBreadcrumbs,
  type OrganizerBreadcrumbRole,
} from './organizer-breadcrumbs';

const eventParams = { eventId: 'private-event-id' };
const year = '2026';

function resolve(name: string, options: Partial<Parameters<typeof resolveOrganizerBreadcrumbs>[0]> = {}) {
  return resolveOrganizerBreadcrumbs({ name, role: 'owner', ...options });
}

describe('organizer breadcrumb routes', () => {
  it('links the badge back to the same conference overview', () => {
    const currentYear = currentAnnualConferenceYear();

    if (currentYear !== '2026') return;
    expect(resolve('admin-annual-conference', { role: 'volunteer', params: { year: '2026' }, query: { section: 'badge' } })).toEqual([
      { label: 'Annual Conference' },
      { label: '2026', to: annualConferencePath('', '2026') },
      { label: 'Conference badge' },
    ]);
  });

  it('shows the phone badge trail only to an authenticated volunteer role for 2026', () => {
    const input = { params: { year: '2026' }, phone: true, query: { section: 'badge' } };

    expect(resolve('admin-mobile-annual-conference', { ...input, role: 'volunteer' })).toEqual([
      { label: 'Overview', to: { path: adminPath('mobile/annual-conference/2026'), query: { section: 'overview' } } },
      { label: 'Conference badge' },
    ]);
    expect(resolve('admin-mobile-annual-conference', { ...input, role: 'organizer' })).toEqual([{ label: 'Overview' }]);
  });

  it.each([
    'admin-login', 'admin-auth-callback', 'admin-access-request', 'admin-not-found',
    'admin-public-events-preview', 'admin-public-event-preview',
    'admin-present-forms-display', 'admin-feedback-display', 'admin-registration-display',
    'admin-mobile-check-in',
    'admin-volunteer-follow-up-form-preview', 'admin-annual-conference-volunteer-display',
    'system-design-presenter', 'system-design-participant', 'conference-speaker-intake',
    'speaker-talk-intake', 'event-cfp', 'event-registration', 'unknown-route',
  ])('suppresses standalone, preview, public, and unknown route %s', name => {
    expect(isOrganizerBreadcrumbRoute(name)).toBe(false);
    expect(resolve(name, { params: { ...eventParams, year } })).toEqual([]);
  });

  it('requires a known route name and authenticated role', () => {
    expect(isOrganizerBreadcrumbRoute(Symbol('admin-events'))).toBe(false);
    expect(isOrganizerBreadcrumbRoute(undefined)).toBe(false);
    expect(resolve('admin-events', { role: null })).toEqual([]);
    expect(resolve('admin-events', { role: 'volunteer' })).toEqual([]);
  });

  it.each([
    ['admin-events', 'Events'],
    ['admin-organizers', 'People & Access'],
  ])('names the top-level %s view', (name, label) => {
    expect(resolve(name, { role: 'organizer' })).toEqual([{ label }]);
  });

  it('shows the active Reports section', () => {
    expect(resolve('admin-reports')).toEqual([{ label: 'Reports', to: adminPath('reports') }, { label: 'Attendance' }]);
    expect(resolve('admin-reports', { query: { section: 'feedback' } })).toEqual([{ label: 'Reports', to: adminPath('reports') }, { label: 'Feedback' }]);
  });

  it('does not invent Audit Log sub-navigation from local UI state', () => {
    expect(resolve('admin-audit-log', { query: { section: 'short-links' } })).toEqual([{ label: 'Audit Log' }]);
    expect(resolve('admin-audit-log', { role: 'organizer' })).toEqual([]);
    expect(resolve('admin-present-forms', { role: 'volunteer' })).toEqual([]);
  });

  it('links event creation and community submission views to Events', () => {
    expect(resolve('admin-events-new')).toEqual([{ label: 'Events', to: adminPath('events') }, { label: 'Create event' }]);
    expect(resolve('admin-event-submissions')).toEqual([{ label: 'Events', to: adminPath('events') }, { label: 'Community submissions' }]);
  });
});

describe('event breadcrumb context', () => {
  it('uses the cached event name without exposing the event ID', () => {
    expect(resolve('admin-event', { params: eventParams, labels: { eventName: 'Project Night — October' } })).toEqual([
      { label: 'Events', to: adminPath('events') }, { label: 'Project Night — October' },
    ]);
    expect(resolve('admin-event', { params: eventParams }).at(-1)).toEqual({ label: 'Event' });
  });

  it('preserves feedback return month and from context on event ancestors', () => {
    expect(resolve('admin-talks', { params: { ...eventParams, talksSection: 'program' }, query: { from: 'feedback', month: '2026-09' }, labels: { eventName: 'September Meetup' } })).toEqual([
      { label: 'Reports', to: adminPath('reports') },
      { label: 'Feedback', to: { path: adminPath('reports'), query: { section: 'feedback', month: '2026-09' } } },
      { label: 'September Meetup', to: { path: adminPath('events/private-event-id'), query: { from: 'feedback', month: '2026-09' } } },
      { label: 'Talks', to: { path: adminPath('events/private-event-id/talks/cfp'), query: { from: 'feedback', month: '2026-09' } } },
      { label: 'Talks Archive' },
    ]);
  });

  it('returns attendance navigation to Attendance and retains valid context', () => {
    const crumbs = resolve('admin-attendance', { params: eventParams, query: { from: 'attendance', month: '2026-10' } });

    expect(crumbs[0]).toEqual({ label: 'Reports', to: adminPath('reports') });
    expect(crumbs[1]).toEqual({ label: 'Attendance', to: { path: adminPath('reports'), query: { section: 'attendance', month: '2026-10' } } });
    expect(crumbs[2].to).toEqual({ path: adminPath('events/private-event-id'), query: { from: 'attendance', month: '2026-10' } });
    expect(crumbs.at(-1)).toEqual({ label: 'Attendance' });
  });

  it.each([{ from: ['feedback', 'attendance'], month: '2026-09' }, { from: 'https://elsewhere.test', month: '2026-09' }])('ignores invalid or repeated return sources', query => {
    const crumbs = resolve('admin-feedback', { params: eventParams, query });

    expect(crumbs[0]).toEqual({ label: 'Events', to: adminPath('events') });
    expect(crumbs[1].to).toBe(adminPath('events/private-event-id'));
  });

  it.each(['2026-13', '2026-00', 'September', ['2026-09', '2026-10']])('discards invalid or repeated month %s', month => {
    const crumbs = resolve('admin-feedback', { params: eventParams, query: { from: 'feedback', month } });

    expect(crumbs[1]).toEqual({ label: 'Feedback', to: { path: adminPath('reports'), query: { section: 'feedback' } } });
    expect(crumbs[2].to).toEqual({ path: adminPath('events/private-event-id'), query: { from: 'feedback' } });
  });

  it('keeps non-URL registration state out of the breadcrumb', () => {
    expect(resolve('admin-registrations', { params: eventParams, query: { section: 'emails' } }).map(crumb => crumb.label)).toEqual(['Events', 'Event', 'Registration']);
  });

  it('does not link the Talks ancestor back to the current CFP destination', () => {
    expect(resolve('admin-talks', { params: { ...eventParams, talksSection: 'cfp' } }).slice(-2)).toEqual([{ label: 'Talks' }, { label: 'CFP' }]);
  });

  it('handles phone event sections and encodes identifiers only in destinations', () => {
    const crumbs = resolve('admin-mobile-event', { params: { eventId: 'event / private' }, query: { section: 'guests' } });

    expect(crumbs).toEqual([{ label: 'Events', to: adminPath('mobile/events') }, { label: 'Event', to: adminPath('mobile/events/event%20%2F%20private') }, { label: 'Guests' }]);
    expect(resolve('admin-event', { params: { eventId: ['first', 'second'] } })).toEqual([]);
  });
});

describe('conference breadcrumb context', () => {
  it('resolves speaker sections with same-year links and owner-only outcomes', () => {
    const input = { params: { year: '2027' }, query: { section: 'outcome-messages' } };
    const crumbs = resolve('admin-annual-conference-speakers', input);

    expect(crumbs.slice(-2)).toEqual([
      { label: 'Speakers', to: { path: annualConferencePath('speakers', '2027'), query: { section: 'proposals' } } },
      { label: 'Outcome messages' },
    ]);
    expect(resolve('admin-annual-conference-speakers', { ...input, role: 'organizer' }).at(-1)).toEqual({ label: 'Proposals' });
    expect(resolve('admin-annual-conference-speakers', { ...input, query: { section: 'participation' }, role: 'organizer' }).at(-1)).toEqual({ label: 'Participation' });
    expect(resolve('admin-annual-conference-speakers', { ...input, query: { section: 'delivery' } }).at(-1)).toEqual({ label: 'Delivery' });
    expect(resolve('admin-annual-conference-speakers', { ...input, query: { section: 'delivery' }, role: 'organizer' }).at(-1)).toEqual({ label: 'Proposals' });
    expect(resolve('admin-annual-conference-speakers', { ...input, role: 'volunteer' })).toEqual([]);
    expect(resolve('admin-annual-conference-speakers', { ...input, phone: true }).at(-1)).toEqual({ label: 'Outcome messages' });
  });

  it('links Programme back to the same conference year', () => {
    const crumbs = resolve('admin-annual-conference-programme', { params: { year: '2027' } });

    expect(crumbs.at(-1)).toEqual({ label: 'Programme' });
    expect(JSON.stringify(crumbs)).toContain('2027');
  });

  it('shows real edition labels and a separate Ticketing section destination', () => {
    expect(resolve('admin-annual-conference-ticketing', { params: { year }, query: { section: 'orders' }, labels: { editionLabel: 'DevCon 2026' } })).toEqual([
      { label: 'Annual Conference' },
      { label: 'DevCon 2026', to: annualConferencePath('', year) },
      { label: 'Ticketing', to: { path: annualConferencePath('ticketing', year), query: { section: 'overview' } } },
      { label: 'Orders' },
    ]);
  });

  it.each([undefined, null, 'invalid', ['orders', 'delivery']])('resolves invalid ticketing section %s to Overview', section => {
    const crumbs = resolve('admin-annual-conference-ticketing', { params: { year }, query: section === undefined ? {} : { section } });

    expect(crumbs.map(crumb => crumb.label)).toEqual(['Annual Conference', year, 'Ticketing', 'Overview']);
    expect(crumbs.at(-2)?.to).toBeUndefined();
  });

  it('does not invent a December edition label or accept invalid year values', () => {
    expect(resolve('admin-annual-conference', { params: { year: '2028' } })).toEqual([{ label: 'Annual Conference' }, { label: '2028' }]);
    expect(resolve('admin-annual-conference-work-plan', { params: { year: ['2026', '2027'] } })).toEqual([]);
    expect(resolve('admin-annual-conference-ticketing', { params: { year: '2027' }, query: { section: 'testing' } }).at(-1)).toEqual({ label: 'Overview' });
  });

  it('maps annual registration query sections and restricts Community seats', () => {
    expect(resolve('admin-annual-conference-registrations', { params: { year }, query: { section: 'form' } }).map(crumb => crumb.label)).toEqual(['Annual Conference', year, 'Registration', 'Form & capacity']);
    expect(resolve('admin-annual-conference-registrations', { params: { year }, query: { section: 'community' }, role: 'organizer' }).at(-1)).toEqual({ label: 'Summary' });
    expect(resolve('admin-annual-conference-registrations', { params: { year }, query: { section: ['emails', 'guests'] } }).at(-1)).toEqual({ label: 'Summary' });
  });

  it('links phone ticketing and registration subsections to same-year parent views', () => {
    const ticketing = resolve('admin-annual-conference-ticketing', { params: { year: '2027' }, phone: true, query: { section: 'orders' } });
    const registration = resolve('admin-annual-conference-registrations', { params: { year }, phone: true, query: { section: 'guests' } });

    expect(ticketing).toEqual([
      { label: 'Overview', to: { path: adminPath('mobile/annual-conference/2027'), query: { section: 'overview' } } },
      { label: 'Ticketing', to: { path: annualConferencePath('ticketing', '2027'), query: { section: 'overview' } } },
      { label: 'Orders' },
    ]);
    expect(registration).toEqual([
      { label: 'Overview', to: { path: adminPath('mobile/annual-conference/2026'), query: { section: 'overview' } } },
      { label: 'Registration', to: { path: annualConferencePath('registrations', year), query: { section: 'summary' } } },
      { label: 'Guests' },
    ]);
    expect(resolve('admin-annual-conference-ticketing', { params: { year: '2027' }, phone: true, query: { section: 'delivery' } }).at(-1)).toEqual({ label: 'Delivery' });
  });

  it('shows phone speaker subsections with linked parents and preserves access restrictions', () => {
    expect(resolve('admin-annual-conference-speakers', { params: { year }, phone: true, query: { section: 'participation' } })).toEqual([
      { label: 'Overview', to: { path: adminPath('mobile/annual-conference/2026'), query: { section: 'overview' } } },
      { label: 'Speakers', to: { path: annualConferencePath('speakers', year), query: { section: 'proposals' } } },
      { label: 'Participation' },
    ]);
    expect(resolve('admin-annual-conference-speakers', { params: { year }, phone: true, role: 'organizer', query: { section: 'delivery' } }).at(-1)).toEqual({ label: 'Proposals' });
    expect(resolve('admin-annual-conference-speakers', { params: { year }, phone: true, role: 'volunteer' })).toEqual([]);
  });

  it('supports a phone task trail without exposing Home to volunteers', () => {
    const mobile = { params: { year }, phone: true, query: { section: 'tasks' } };
    const crumbs = resolve('admin-mobile-annual-conference', mobile);

    expect(crumbs.map(crumb => crumb.label)).toEqual(['Overview', 'Work plan']);
    expect(crumbs[0].to).toEqual({ path: adminPath('mobile/annual-conference/2026'), query: { section: 'overview' } });
    const volunteer = resolve('admin-mobile-annual-conference', { ...mobile, role: 'volunteer', labels: { assignedAccess: true } });

    expect(volunteer.map(crumb => crumb.label)).toEqual(['Overview', 'My tasks']);
    expect(volunteer.some(crumb => crumb.to === adminPath('mobile'))).toBe(false);
  });

  it('shows permitted volunteer subsections with a same-year directory parent', () => {
    const input = { params: { year }, phone: true, labels: { capabilities: ['volunteers.review_applications'] as const }, query: { section: 'volunteers', volunteerView: 'reviews' } };

    expect(resolve('admin-mobile-annual-conference', input)).toEqual([
      { label: 'Overview', to: { path: adminPath('mobile/annual-conference/2026'), query: { section: 'overview' } } },
      { label: 'Volunteers', to: { path: adminPath('mobile/annual-conference/2026'), query: { section: 'volunteers', volunteerView: 'directory' } } },
      { label: 'Reviews' },
    ]);
    expect(resolve('admin-mobile-annual-conference', { ...input, query: { section: 'volunteers', volunteerView: 'campaign', campaignTab: 'outcomes' } }).slice(-2)).toEqual([
      { label: 'Campaign', to: { path: adminPath('mobile/annual-conference/2026'), query: { section: 'volunteers', volunteerView: 'campaign', campaignTab: 'updates' } } },
      { label: 'Outcomes' },
    ]);
    expect(resolve('admin-mobile-annual-conference', { ...input, query: { section: 'volunteers', volunteerView: 'campaign', campaignTab: ['settings'] } }).at(-1)).toEqual({ label: 'Updates' });
    expect(resolve('admin-mobile-annual-conference', { ...input, role: 'organizer', query: { section: 'volunteers', volunteerView: 'campaign' } }).at(-1)).toEqual({ label: 'Directory' });
    expect(resolve('admin-mobile-annual-conference', { ...input, role: 'volunteer', labels: { capabilities: ['volunteers.view_team'] } }).at(-1)).toEqual({ label: 'Volunteers' });
    expect(resolve('admin-mobile-annual-conference', { ...input, role: 'volunteer', labels: { capabilities: [] } })).toEqual([{ label: 'Overview' }]);
  });

  it('shows Audit Log subsection on phones and keeps it owner-only', () => {
    expect(resolve('admin-audit-log', { phone: true, query: { section: 'short-links', month: '2026-11' } })).toEqual([
      { label: 'Home', to: adminPath('mobile') },
      { label: 'Audit Log', to: { path: adminPath('audit-log'), query: { section: 'activity', month: '2026-11' } } },
      { label: 'Short links' },
    ]);
    expect(resolve('admin-audit-log', { phone: true, role: 'organizer' })).toEqual([]);
  });

  it('shows phone Home and Reports or People parents without changing desktop trails', () => {
    expect(resolve('admin-reports', { phone: true, query: { section: 'feedback' } })).toEqual([
      { label: 'Home', to: adminPath('mobile') },
      { label: 'Reports', to: adminPath('reports') },
      { label: 'Feedback' },
    ]);
    expect(resolve('admin-organizers', { phone: true })).toEqual([
      { label: 'Home', to: adminPath('mobile') },
      { label: 'People & Access' },
    ]);
    expect(resolve('admin-organizers')).toEqual([{ label: 'People & Access' }]);
  });

  it('uses a plain edition ancestor on the current phone overview destination', () => {
    const crumbs = resolve('admin-mobile-annual-conference', { params: { year }, phone: true, query: { section: ['tasks', 'volunteers'] } });

    expect(crumbs.at(-1)).toEqual({ label: 'Overview' });
    expect(crumbs).toEqual([{ label: 'Overview' }]);
    expect(resolve('admin-mobile-annual-conference', { params: { year: 'bad' }, phone: true })).toEqual([]);
  });

  it('gives volunteers only accessible conference ancestors', () => {
    const activeYear = currentAnnualConferenceYear();
    const input = { params: { year: activeYear }, role: 'volunteer' as OrganizerBreadcrumbRole };
    const crumbs = resolve('admin-annual-conference-work-plan', input);

    expect(crumbs.map(crumb => crumb.label)).toEqual(['Annual Conference', activeYear, 'Work plan']);
    expect(crumbs[0].to).toBeUndefined();
    expect(crumbs[1].to).toBe(annualConferencePath('', activeYear));
    expect(resolve('admin-annual-conference-ticketing', input)).toEqual([]);
    expect(resolve('admin-annual-conference-volunteers', input)).toEqual([]);
    expect(resolve('admin-annual-conference-volunteers', { ...input, labels: { capabilities: ['volunteers.view_team'] } }).at(-1)).toEqual({ label: 'Volunteers' });
    expect(resolve('admin-annual-conference-check-in', { ...input, labels: { capabilities: ['ticketing.check_in'] } }).at(-1)).toEqual({ label: 'Guests' });
  });
});

describe('cached breadcrumb labels and markup', () => {
  it('reads existing event and edition queries without creating queries or requests', () => {
    const client = new QueryClient();

    client.setQueryData(queryKeys.events, [{ id: eventParams.eventId, name: 'Cached meetup' }]);
    client.setQueryData(queryKeys.annualConferenceEditions, { editions: [{ year: 2026, label: 'Cached edition' }] });
    const readCached = (key: readonly unknown[]) => client.getQueryData(key);
    const count = client.getQueryCache().getAll().length;

    expect(readOrganizerBreadcrumbLabels({ name: 'admin-event', params: eventParams }, readCached).eventName).toBe('Cached meetup');
    expect(readOrganizerBreadcrumbLabels({ name: 'admin-annual-conference', params: { year } }, readCached).editionLabel).toBe('Cached edition');
    expect(client.getQueryCache().getAll()).toHaveLength(count);
    client.setQueryData(queryKeys.event(eventParams.eventId), { name: 'Updated event title' });
    client.setQueryData(queryKeys.annualConferenceWorkPlan(year), { edition: { label: 'Updated edition' }, permissions: { capabilities: ['ticketing.check_in', 'invalid'] } });
    expect(readOrganizerBreadcrumbLabels({ name: 'admin-event', params: eventParams }, readCached).eventName).toBe('Updated event title');
    expect(readOrganizerBreadcrumbLabels({ name: 'admin-annual-conference', params: { year } }, readCached)).toEqual({ editionLabel: 'Updated edition', capabilities: ['ticketing.check_in'] });
    client.clear();
  });

  it('uses the event already returned by registration data', () => {
    const client = new QueryClient();

    client.setQueryData(queryKeys.eventRegistrations(eventParams.eventId), { event: { name: 'Registration event' } });
    expect(readOrganizerBreadcrumbLabels({ name: 'admin-registrations', params: eventParams }, key => client.getQueryData(key)).eventName).toBe('Registration event');
    client.clear();
  });

  it.each([
    ['admin-annual-conference-ticketing', 'ticketing', 'orders', 'Orders'],
    ['admin-annual-conference-registrations', 'registrations', 'emails', 'Emails'],
  ])('marks only the leaf current when %s ancestors share its pathname', async (name, path, section, current) => {
    const client = new QueryClient();
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: `/organizer-console/annual-conference/:year/${path}`, name, component: { template: '<div />' } }] });

    await router.push({ name, params: { year }, query: { section } });
    const app = createSSRApp(OrganizerBreadcrumbs, { role: 'owner' });

    app.use(router).use(VueQueryPlugin, { queryClient: client });
    const html = await renderToString(app);

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<span aria-current="page"[^>]*>${current}<\\/span>`));
    expect(html).not.toMatch(/<a[^>]*aria-current="page"/);
    client.clear();
  });

  it('renders an ordered breadcrumb with a plain current page and no fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = new QueryClient();
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', name: 'admin-talks', component: { template: '<div />' } }] });

    await router.push({ name: 'admin-talks', params: { pathMatch: ['organizer-console', 'events', 'private-event-id', 'talks', 'program'] } });
    router.currentRoute.value.params.eventId = eventParams.eventId;
    router.currentRoute.value.params.talksSection = 'program';
    client.setQueryData(queryKeys.event(eventParams.eventId), { name: 'A long cached event title that remains available to assistive technology' });
    const app = createSSRApp(OrganizerBreadcrumbs, { role: 'owner', embedded: true });

    app.use(router).use(VueQueryPlugin, { queryClient: client });
    const html = await renderToString(app);

    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('<ol');
    expect(html).toContain('organizer-breadcrumbs--embedded');
    expect(html).toMatch(/<span aria-current="page" title="Talks Archive"[^>]*>Talks Archive<\/span>/);
    expect(html).toContain('title="A long cached event title that remains available to assistive technology"');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    client.clear();
  });
});
