import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type Context } from 'hono';
import { CONFERENCE_REGISTRATION_ACTION } from '@/lib/annual-conference-registration';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), role: 'owner', capability: true, challenge: false, turnstile: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
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
  mocks.role = 'owner';
  mocks.capability = true;
  mocks.challenge = false;
  mocks.turnstile.mockReset().mockImplementation(async (c: Context) => mocks.challenge ? c.json({ error: 'Challenge required' }, 403) : null);
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'get_annual_conference_registration_overview' ? overview
    : name === 'get_annual_conference_registration_testing' ? { enabled: false, tester_emails: [] } : [], error: null }));
});

describe('annual conference registration access and privacy', () => {
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
});
