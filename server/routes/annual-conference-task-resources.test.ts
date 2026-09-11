import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AdminRole } from '@/types/supabase';
import type { AppBindings } from '@/server/http/app-bindings';

const taskId = '10000000-0000-4000-8000-000000000001';
const resourceId = '30000000-0000-4000-8000-000000000001';
const mocks = vi.hoisted(() => ({
  session: {
    authenticated: true,
    membership_id: 'membership-1',
    user_id: 'user-1',
    email: 'volunteer@example.com',
    display_name: 'Volunteer',
    role: 'volunteer' as AdminRole,
    expires_at: '2099-01-01T00:00:00.000Z',
  },
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  audit: vi.fn(),
}));

const task = {
  id: taskId,
  edition_id: '20000000-0000-4000-8000-000000000001',
  title: 'Publish the programme',
  details: null,
  details_format: 'plain_text',
  internal_note: null,
  phase_id: null,
  workstream: 'programme_speakers',
  accountable_owner: 'volunteer@example.com',
  collaborators: [],
  priority: null,
  target_date: null,
  status: 'not_started',
  dependency_note: null,
  dependency_task_ids: [],
  source: 'manual',
  source_row: null,
  sort_order: 1,
  created_by_email: 'owner@example.com',
  updated_by_email: 'owner@example.com',
  completed_at: null,
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
};
const edition = {
  id: task.edition_id,
  year: 2026,
  name: 'Conference',
  label: 'December 2026',
  speaker_call_status: 'closed',
  speaker_logistics_deadline: null,
  provisional_date: '2026-12-19',
  date_status: 'provisional',
  venue_note: null,
  keynote_note: null,
  task_creator_email: 'owner@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};
const resource = {
  id: resourceId,
  task_id: taskId,
  url: 'https://example.com/brief',
  label: 'Brief',
  created_by_email: 'volunteer@example.com',
  updated_by_email: 'volunteer@example.com',
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
};

vi.mock('@/lib/supabase/admin-auth', () => ({
  getAdminSession: vi.fn(async () => mocks.session),
  requireAdmin: vi.fn(async (
    c: { set: (key: string, value: unknown) => void },
    roles: AdminRole[] = ['owner', 'organizer'],
  ) => {
    if (!mocks.session.authenticated || !roles.includes(mocks.session.role)) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), {
        status: mocks.session.authenticated ? 403 : 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    c.set('adminSession', mocks.session);

    return null;
  }),
}));

vi.mock('@/lib/supabase/annual-conference-access-grants', () => ({
  getAnnualConferenceAccessGrants: vi.fn(async () => ['work_plan.manage']),
}));

vi.mock('@/server/annual-conference-repository', () => ({
  createAnnualConferenceRepository: vi.fn(() => ({
    getWorkspace: vi.fn(async () => ({ edition, phases: [], tasks: [task] })),
  })),
}));

vi.mock('@/server/annual-conference-task-resource-repository', () => ({
  createAnnualConferenceTaskResourceRepository: vi.fn(() => ({
    list: mocks.list,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
  })),
}));

vi.mock('@/server/protected-mutation', () => ({
  recordProtectedMutationAudit: mocks.audit,
}));

import { registerAnnualConferenceTaskResourceRoutes } from './annual-conference-task-resources';

function app() {
  const instance = new Hono<AppBindings>();

  registerAnnualConferenceTaskResourceRoutes(instance);

  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.authenticated = true;
  mocks.session.email = 'volunteer@example.com';
  mocks.session.role = 'volunteer';
  mocks.list.mockResolvedValue([resource]);
  mocks.create.mockResolvedValue(resource);
  mocks.update.mockResolvedValue(resource);
  mocks.delete.mockResolvedValue(true);
});

describe('Annual Conference task resource routes', () => {
  it('requires an authenticated conference membership', async () => {
    mocks.session.authenticated = false;
    const response = await app().request(`http://localhost/api/annual-conference/2026/work-plan/${taskId}/resources`);

    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('returns server-derived row permissions for an assigned volunteer', async () => {
    const response = await app().request(`http://localhost/api/annual-conference/2026/work-plan/${taskId}/resources`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resources: [{ id: resourceId, can_manage: true }],
      permissions: { can_add: true, can_manage_all: false, max_resources: 20 },
    });
  });

  it('admits an assigned volunteer through the full app authorization middleware', async () => {
    const { default: fullApp } = await import('@/server/app');
    const response = await fullApp.request(
      `http://localhost/api/annual-conference/2026/work-plan/${taskId}/resources`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resources: [{ id: resourceId, can_manage: true }],
    });
  });

  it('rejects an unassigned volunteer even when an elevated grant exists', async () => {
    mocks.session.email = 'unassigned@example.com';
    const response = await app().request(`http://localhost/api/annual-conference/2026/work-plan/${taskId}/resources`);

    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('validates route identifiers and mutation bodies before storage', async () => {
    const invalidId = await app().request('http://localhost/api/annual-conference/2026/work-plan/not-a-task/resources');
    const invalidBody = await app().request(
      `http://localhost/api/annual-conference/2026/work-plan/${taskId}/resources`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: '' }) },
    );

    expect(invalidId.status).toBe(404);
    expect(invalidBody.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
