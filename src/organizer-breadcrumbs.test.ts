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
    ['admin-attendance-overview', 'Attendance'],
    ['admin-feedback-overview', 'Feedback'],
    ['admin-organizers', 'People & Access'],
  ])('names the top-level %s view', (name, label) => {
    expect(resolve(name, { role: 'organizer' })).toEqual([{ label }]);
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
      { label: 'Feedback', to: { path: adminPath('feedback'), query: { month: '2026-09' } } },
      { label: 'September Meetup', to: { path: adminPath('events/private-event-id'), query: { from: 'feedback', month: '2026-09' } } },
      { label: 'Talks', to: { path: adminPath('events/private-event-id/talks/cfp'), query: { from: 'feedback', month: '2026-09' } } },
      { label: 'Talks Archive' },
    ]);
  });

  it('returns attendance navigation to Attendance and retains valid context', () => {
    const crumbs = resolve('admin-attendance', { params: eventParams, query: { from: 'attendance', month: '2026-10' } });

    expect(crumbs[0]).toEqual({ label: 'Attendance', to: { path: adminPath('attendance'), query: { month: '2026-10' } } });
    expect(crumbs[1].to).toEqual({ path: adminPath('events/private-event-id'), query: { from: 'attendance', month: '2026-10' } });
    expect(crumbs.at(-1)).toEqual({ label: 'Attendance' });
  });

  it.each([{ from: ['feedback', 'attendance'], month: '2026-09' }, { from: 'https://elsewhere.test', month: '2026-09' }])('ignores invalid or repeated return sources', query => {
    const crumbs = resolve('admin-feedback', { params: eventParams, query });

    expect(crumbs[0]).toEqual({ label: 'Events', to: adminPath('events') });
    expect(crumbs[1].to).toBe(adminPath('events/private-event-id'));
  });

  it.each(['2026-13', '2026-00', 'September', ['2026-09', '2026-10']])('discards invalid or repeated month %s', month => {
    const crumbs = resolve('admin-feedback', { params: eventParams, query: { from: 'feedback', month } });

    expect(crumbs[0]).toEqual({ label: 'Feedback', to: { path: adminPath('feedback') } });
    expect(crumbs[1].to).toEqual({ path: adminPath('events/private-event-id'), query: { from: 'feedback' } });
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

  it.each(['admin-annual-conference-ticketing', 'admin-annual-conference-registrations'])('uses the same-year phone conference ancestor from %s', name => {
    const crumbs = resolve(name, { params: { year }, phone: true, query: { section: 'orders' } });

    expect(crumbs[1].to).toEqual({ path: adminPath('mobile/annual-conference/2026'), query: { section: 'overview' } });
    expect(crumbs.map(crumb => crumb.label).join(' ')).not.toContain('Home');
    expect(crumbs.slice(-2).map(crumb => crumb.label)).toEqual([year, name.endsWith('ticketing') ? 'Ticketing' : 'Registration']);
    expect(crumbs.at(-1)?.to).toBeUndefined();
  });

  it('supports a local phone conference trail without linking volunteers to Home', () => {
    const mobile = { params: { year }, phone: true, query: { section: 'tasks' } };
    const crumbs = resolve('admin-mobile-annual-conference', mobile);

    expect(isOrganizerBreadcrumbRoute('admin-mobile-annual-conference')).toBe(true);
    expect(crumbs.map(crumb => crumb.label)).toEqual(['Home', 'Annual Conference', year, 'Work plan']);
    expect(crumbs[0].to).toBe(adminPath('mobile'));
    expect(crumbs[2].to).toEqual({ path: adminPath('mobile/annual-conference/2026'), query: { section: 'overview' } });
    const volunteer = resolve('admin-mobile-annual-conference', { ...mobile, role: 'volunteer', labels: { assignedAccess: true } });

    expect(volunteer.map(crumb => crumb.label)).toEqual(['Annual Conference', year, 'My tasks']);
    expect(volunteer.some(crumb => crumb.to === adminPath('mobile'))).toBe(false);
  });

  it('uses a plain edition ancestor on the current phone overview destination', () => {
    const crumbs = resolve('admin-mobile-annual-conference', { params: { year }, phone: true, query: { section: ['tasks', 'volunteers'] } });

    expect(crumbs.at(-1)).toEqual({ label: 'Overview' });
    expect(crumbs.at(-2)?.to).toBeUndefined();
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
