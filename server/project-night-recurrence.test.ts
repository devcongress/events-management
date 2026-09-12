import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  role: 'organizer' as string,
  event: { id: 'project-night', name: 'Project Night', event_date: '2026-09-17T18:30:00Z', timezone: 'Africa/Accra' },
  load: vi.fn(), configure: vi.fn(), advance: vi.fn(), audit: vi.fn(),
}));

vi.mock('../lib/mock-db/events', async (original) => ({
  ...await original<Record<string, unknown>>(),
  getEventById: vi.fn(async () => mocks.event),
}));
vi.mock('../lib/supabase/project-night-recurrence', () => ({
  getProjectNightRecurrence: mocks.load,
  configureProjectNight: mocks.configure,
  advanceProjectNight: mocks.advance,
}));
vi.mock('../lib/supabase/admin-auth', async (original) => ({
  ...await original<Record<string, unknown>>(),
  getAdminSession: vi.fn(async () => ({ authenticated: true, role: mocks.role })),
  requireAdmin: vi.fn(async (_c, roles = ['owner', 'organizer']) => roles.includes(mocks.role) ? null : new Response('Forbidden', { status: 403 })),
  recordAdminAudit: mocks.audit,
}));

import app from './app';

const testSchedulerSecret = 'fixture-only-'.repeat(4);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', testSchedulerSecret);
  mocks.role = 'organizer';
  mocks.event.name = 'Project Night';
  mocks.event.event_date = '2026-09-17T18:30:00Z';
  mocks.load.mockResolvedValue(null);
  mocks.configure.mockResolvedValue({ enabled: true, next_date: '2026-09-24' });
  mocks.advance.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

function configure(action: string) {
  return app.request('/api/events/project-night/recurrence', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  });
}

describe('Project Night recurrence authorization and API', () => {
  it('loads without enabling the series', async () => {
    expect((await app.request('/api/events/project-night/recurrence')).status).toBe(200);
    expect(mocks.configure).not.toHaveBeenCalled();
  });
  it('rejects volunteers', async () => {
    mocks.role = 'volunteer';
    expect((await configure('enable')).status).toBe(403);
    expect(mocks.configure).not.toHaveBeenCalled();
  });
  it('rejects other event types and invalid actions', async () => {
    expect((await configure('delete')).status).toBe(400);
    mocks.event.name = 'September Meetup';
    expect((await configure('enable')).status).toBe(404);
    expect(mocks.configure).not.toHaveBeenCalled();
  });
  it('requires a Thursday template', async () => {
    mocks.event.event_date = '2026-09-18T18:30:00Z';
    expect((await configure('enable')).status).toBe(409);
    expect(mocks.configure).not.toHaveBeenCalled();
  });
  it('saves and audits organizer changes', async () => {
    expect((await configure('enable')).status).toBe(200);
    expect(mocks.configure).toHaveBeenCalledWith('project-night', 'enable', expect.anything());
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'event.recurrence.enable' }));
  });
  it('requires the scheduler secret even for organizers', async () => {
    expect((await app.request('/api/internal/project-night/advance', { method: 'POST' })).status).toBe(404);
    expect(mocks.advance).not.toHaveBeenCalled();
    expect((await app.request('/api/internal/project-night/advance', {
      method: 'POST', headers: { 'x-scheduled-job-secret': testSchedulerSecret },
    })).status).toBe(200);
    expect(mocks.advance).toHaveBeenCalledOnce();
  });
});
