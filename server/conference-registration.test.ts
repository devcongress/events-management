import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type Context } from 'hono';
import { CONFERENCE_REGISTRATION_ACTION } from '@/lib/annual-conference-registration';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), role: 'owner', capability: true, challenge: false, turnstile: vi.fn(), tickets: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: async (c: Context, roles: string[]) => roles.includes(mocks.role) ? null : c.json({ error: 'Forbidden' }, 403),
  getAdminSession: async () => ({ authenticated: true, email: 'owner@example.test' }),
}));
vi.mock('@/server/annual-conference-request', () => ({
  requireAnnualConferenceCapability: async (c: Context) => mocks.capability ? null : c.json({ error: 'Forbidden' }, 403),
  getAnnualConferenceEditionByYear: async () => ({ id: '10000000-0000-4000-8000-000000000001' }),
}));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: vi.fn() }));
vi.mock('@/server/http/public-intake-protection', () => ({
  enforcePublicRateLimit: async () => null,
  publicClientKey: () => 'fixture',
  publicEmailErrorPayload: () => ({}),
  assessPublicSubmissionEmail: async () => ({ status: 'valid' }),
  requirePublicTurnstile: mocks.turnstile,
}));
vi.mock('@/server/annual-conference-admission-email-delivery', () => ({ retryAnnualConferenceAdmissionEmails: vi.fn() }));
vi.mock('@/server/annual-conference-attendee-updates', () => ({ retryAnnualConferenceAttendeeUpdates: vi.fn() }));

import { registerAnnualConferenceRegistrationRoutes } from './routes/annual-conference-registration';
import { registerAnnualConferenceCheckInRoutes } from './routes/annual-conference-check-in';

const app = new Hono<AppBindings>();

registerAnnualConferenceRegistrationRoutes(app);
registerAnnualConferenceCheckInRoutes(app);
const publicPath = '/api/public/annual-conference/2026/registration';
const privatePath = '/api/annual-conference/2026/registrations';
const overview = { edition_id: '10000000-0000-4000-8000-000000000001', mode: 'free', status: 'open', capacity: 1, reserved: 1, confirmed: 1, waitlisted: 0 };
const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.tickets = [];
  mocks.role = 'owner';
  mocks.capability = true;
  mocks.challenge = false;
  mocks.turnstile.mockReset().mockImplementation(async (c: Context) => mocks.challenge ? c.json({ error: 'Challenge required' }, 403) : null);
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_annual_conference_registration_overview' ? overview
    : name === 'get_annual_conference_registration_testing' ? { enabled: false, tester_emails: [] } : [], error: null }));
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    returns: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.returns.mockImplementation(async () => ({ data: mocks.tickets, error: null }));
  query.range.mockImplementation(async () => ({ data: mocks.tickets, error: null }));
  mocks.from.mockReturnValue(query);
});

describe('annual conference registration access and privacy', () => {
  it('joins manager registrations to minimal admission identities within the edition', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_annual_conference_registration_overview' ? overview : [{ id: 'registration-1', name: 'Ada' }], error: null }));
    mocks.tickets = [{ id: 'ticket-1', registration_id: 'registration-1' }];
    const response = await app.request(privatePath);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ overview, registrations: [{ id: 'registration-1', name: 'Ada', ticket_id: 'ticket-1', email_status: 'not_sent' }] });
    const query = mocks.from.mock.results[0]!.value;

    expect(query.select).toHaveBeenCalledWith('id,registration_id');
    expect(query.eq).toHaveBeenCalledWith('edition_id', overview.edition_id);
    expect(query.in).toHaveBeenCalledWith('registration_id', ['registration-1']);
  });

  it('fails closed when admission identities cannot be loaded', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_annual_conference_registration_overview' ? overview : [{ id: 'registration-1' }], error: null }));
    const query = mocks.from();

    query.returns.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    expect((await app.request(privatePath)).status).toBe(503);
  });

  it('uses the locked local registration RPC only for enabled approved testing', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    try {
      const request = () => app.request(`http://localhost:5173${publicPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:4321' },
        body: JSON.stringify({ name: 'Ada', email: 'ada@example.test' }),
      });

      expect((await request()).status).toBe(403);
      mocks.rpc.mockImplementation(async (name: string) => ({
        data: name === 'get_annual_conference_registration_overview' ? overview : { enabled: true, tester_emails: ['ada@example.test'] },
        error: null,
      }));
      expect((await request()).status).toBe(202);
      expect(mocks.turnstile).not.toHaveBeenCalled();
      expect(mocks.rpc).toHaveBeenCalledWith('register_for_annual_conference_test', expect.objectContaining({ p_email: 'ada@example.test' }));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('restricts testing settings to owners without exposing the list publicly', async () => {
    mocks.role = 'organizer';
    expect((await app.request(`${privatePath}/testing`)).status).toBe(403);
    expect((await app.request(`${privatePath}/testing`, { method: 'PATCH' })).status).toBe(403);
    mocks.role = 'owner';
    expect((await app.request(`${privatePath}/testing`)).status).toBe(200);
    expect(await (await app.request(publicPath)).json()).toEqual({ mode: 'free', waitlist: true });
  });

  it('normalizes and deduplicates dynamic tester settings', async () => {
    const response = await app.request(`${privatePath}/testing`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, tester_emails: ['ADA@example.test', ' ada@example.test '] }) });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('configure_annual_conference_registration_testing', expect.objectContaining({ p_emails: ['ada@example.test'] }));
  });

  it('blocks unapproved registration while testing is enabled', async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_annual_conference_registration_overview' ? overview : { enabled: true, tester_emails: ['ada@example.test'] }, error: null }));
    expect((await post(publicPath, { name: 'Other', email: 'other@example.test' })).status).toBe(403);
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'register_for_annual_conference')).toBe(false);
  });
  it('protects both the collection and nested blast endpoints', async () => {
    mocks.role = 'volunteer';
    expect((await app.request(privatePath)).status).toBe(403);
    expect((await app.request(`${privatePath}/blasts`)).status).toBe(403);
    expect((await post(`${privatePath}/blasts`, { subject: 'Hello', body: 'Hi' })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires edition capability and owner permission for mode changes', async () => {
    mocks.capability = false;
    expect((await app.request(privatePath)).status).toBe(403);
    mocks.capability = true;
    mocks.role = 'organizer';
    expect((await app.request(`${privatePath}/settings`, { method: 'PATCH' })).status).toBe(403);
  });

  it('returns the same accepted response without exposing attendee or ticket data', async () => {
    const body = { name: 'Fixture Person', email: 'fixture@example.test', turnstile_token: 'fixture', turnstile_action: CONFERENCE_REGISTRATION_ACTION };
    const first = await post(publicPath, body);
    const duplicate = await post(publicPath, body);

    expect(first.status).toBe(202);
    expect(mocks.turnstile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ expectedAction: CONFERENCE_REGISTRATION_ACTION, submittedAction: CONFERENCE_REGISTRATION_ACTION }));
    expect(mocks.turnstile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      expectedHostname: [
        'devcongress.org',
        'www.devcongress.org',
        'em.devcongress.org',
        'feature-devcon26-public-checkout-devcongress-website.admins-a7d.workers.dev',
      ],
    }));
    expect(await first.json()).toEqual(await duplicate.json());
  });

  it('requires challenge verification before registration', async () => {
    mocks.challenge = true;
    expect((await post(publicPath, { name: 'Fixture', email: 'fixture@example.test', turnstile_token: 'fixture', turnstile_action: CONFERENCE_REGISTRATION_ACTION })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('allows an explicitly delegated volunteer to search but denies an undelegated volunteer', async () => {
    mocks.role = 'volunteer';
    expect((await post('/api/annual-conference/2026/check-in/search', { search: 'Fixture' })).status).toBe(200);
    mocks.capability = false;
    expect((await post('/api/annual-conference/2026/check-in/search', { search: 'Fixture' })).status).toBe(403);
  });

  it('loads only a paged edition roster after volunteer check-in authorization', async () => {
    mocks.role = 'volunteer';
    mocks.tickets = [
      { id: 'ticket-1', attendee_name: 'Adjoa Mensah', attendee_email: 'private@example.test', status: 'issued', checked_in_at: null, order_seat_number: 1 },
      { id: 'ticket-2', attendee_name: null, status: 'checked_in', checked_in_at: '2026-12-19T10:00:00.000Z', order_seat_number: 2 },
      { id: 'ticket-3', attendee_name: 'Not returned', status: 'issued', checked_in_at: null, order_seat_number: 3 },
    ];

    const response = await app.request('/api/annual-conference/2026/check-in/attendees?page=2&page_size=2');

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      attendees: [
        { ticket_id: 'ticket-1', attendee_name: 'Adjoa Mensah', status: 'issued', checked_in_at: null, order_seat_number: 1 },
        { ticket_id: 'ticket-2', attendee_name: null, status: 'checked_in', checked_in_at: '2026-12-19T10:00:00.000Z', order_seat_number: 2 },
      ],
      page: 2,
      page_size: 2,
      has_more: true,
    });
    expect(mocks.from).toHaveBeenCalledWith('annual_conference_tickets');
    const query = mocks.from.mock.results[0]?.value;

    expect(query.select).toHaveBeenCalledWith('id,attendee_name,status,checked_in_at,order_seat_number');
    expect(query.eq).toHaveBeenCalledWith('edition_id', overview.edition_id);
    expect(query.in).toHaveBeenCalledWith('status', ['issued', 'checked_in']);
    expect(query.order).toHaveBeenCalledWith('id', { ascending: true });
    expect(query.range).toHaveBeenCalledWith(2, 4);
  });

  it('rejects malformed roster pages and prevents unauthorized roster queries', async () => {
    mocks.role = 'volunteer';
    expect((await app.request('/api/annual-conference/2026/check-in/attendees?page=0')).status).toBe(400);
    expect((await app.request('/api/annual-conference/2026/check-in/attendees?page_size=101')).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();

    mocks.capability = false;
    expect((await app.request('/api/annual-conference/2026/check-in/attendees')).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('cancelled registration recovery', () => {
  const sourceId = '20000000-0000-4000-8000-000000000001';
  const newId = '20000000-0000-4000-8000-000000000002';
  const path = `${privatePath}/${sourceId}/recover`;

  it('requires Owner access as well as edition management permission', async () => {
    mocks.role = 'organizer';
    expect((await post(path, { confirmed: true })).status).toBe(403);
    mocks.role = 'owner';
    mocks.capability = false;
    expect((await post(path, { confirmed: true })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([{}, { confirmed: false }, { confirmed: true, email: 'other@example.test' }])('requires strict explicit confirmation %j', async (body) => {
    expect((await post(path, body)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([true, false])('returns whether recovery actually queued a fresh registration: %s', async (created) => {
    const recovery = { registration_id: newId, status: 'waitlisted', created };

    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_annual_conference_registration_overview' ? overview : recovery, error: null }));
    const response = await post(path, { confirmed: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recovery });
    expect(mocks.rpc).toHaveBeenCalledWith('recover_annual_conference_registration', { p_edition_id: overview.edition_id, p_registration_id: sourceId });
  });

  it('explains testing restrictions without leaking database errors', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'get_annual_conference_registration_overview'
      ? { data: overview, error: null }
      : { data: null, error: { message: 'conference_recovery_testing_disabled' } });
    const response = await post(path, { confirmed: true });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('approved-tester') });
  });
});
