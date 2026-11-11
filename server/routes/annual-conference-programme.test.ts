import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({ role: 'owner', exists: true, conflict: false, unavailable: false, mockReads: 0, capability: true }));

vi.mock('@/lib/supabase/admin-auth', () => ({
  requireAdmin: async (c: { json: (value: object, status: number) => Response }, roles: string[]) => mocks.role === 'anonymous'
    ? c.json({ error: 'Unauthenticated' }, 401)
    : roles.includes(mocks.role) ? null : c.json({ error: 'Forbidden' }, 403),
  getAdminSession: async () => ({ authenticated: true, email: 'actor@example.com', role: mocks.role }),
}));
vi.mock('@/server/annual-conference-repository', () => ({
  createAnnualConferenceRepository: () => ({ getWorkspace: async () => mocks.exists ? { edition: { id: 'edition' } } : undefined }),
}));
vi.mock('@/server/annual-conference-programme-repository', () => ({
  createAnnualConferenceProgrammeRepository: () => ({
    get: async () => {
      if (mocks.unavailable) throw new Error('supabase unavailable');

      return { rows: [], revision: 0, updated_at: null, updated_by: null };
    },
    save: async () => mocks.conflict ? null : { rows: [], revision: 1, updated_at: null, updated_by: null },
  }),
}));
vi.mock('@/server/annual-conference-request', () => ({ requireAnnualConferenceCapability: async (c: { json: (value: object, status: number) => Response }) => mocks.capability && mocks.role !== 'volunteer' ? null : c.json({ error: 'Forbidden' }, 403) }));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: async () => {} }));

import { registerAnnualConferenceProgrammeRoutes } from './annual-conference-programme';

const app = new Hono<AppBindings>();

registerAnnualConferenceProgrammeRoutes(app);
const url = 'http://localhost/api/annual-conference/2026/programme';
const put = (body: unknown) => app.request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('programme API', () => {
  beforeEach(() => {
    Object.assign(mocks, { role: 'owner', exists: true, conflict: false, unavailable: false, mockReads: 0, capability: true });
  });

  it.each([['anonymous', 401], ['volunteer', 403], ['owner', 200], ['organizer', 200]])('enforces the %s role', async (role, status) => {
    mocks.role = role;
    expect((await app.request(url)).status).toBe(status);
  });

  it('rejects unknown editions, malformed input and stale revisions', async () => {
    mocks.exists = false;
    expect((await app.request(url)).status).toBe(404);
    mocks.exists = true;
    expect((await put({ revision: 0, rows: [{ title: 'Incomplete' }] })).status).toBe(400);
    mocks.conflict = true;
    expect((await put({ revision: 0, rows: [] })).status).toBe(409);
  });

  it('does not turn a configured storage failure into a successful read', async () => {
    mocks.unavailable = true;
    expect((await app.request(url)).status).toBe(500);
  });

  it('enforces programme capabilities for speaker data and programme edits', async () => {
    mocks.role = 'organizer';
    mocks.capability = false;
    expect((await app.request(`${url}/speakers`)).status).toBe(403);
    expect((await app.request(`${url}/speakers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo`)).status).toBe(403);
    expect((await app.request(`${url}/speakers/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo`, { method: 'DELETE' })).status).toBe(403);
    expect((await put({ revision: 0, rows: [] })).status).toBe(403);
    const row = { id: '33333333-3333-4333-8333-333333333333', time: '', title: 'Talk', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '', speakerProposalIds: ['11111111-1111-4111-8111-111111111111'] };

    expect((await put({ revision: 0, rows: [row] })).status).toBe(403);
  });

  it('rejects a member admitted by the middleware without a programme grant', async () => {
    mocks.role = 'member';
    mocks.capability = false;

    expect((await app.request(url)).status).toBe(403);
    expect((await put({ revision: 0, rows: [] })).status).toBe(403);
  });

});
