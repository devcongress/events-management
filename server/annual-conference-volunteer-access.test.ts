import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnualConferenceTask } from '@/lib/annual-conference-work-plan';
import type { VolunteerApplication } from '@/types';
import type { AdminRole } from '@/types/supabase';

const mocks = vi.hoisted(() => ({
  session: {
    authenticated: true as const,
    user_id: 'volunteer-user',
    membership_id: 'volunteer-membership',
    email: 'volunteer@example.com',
    display_name: 'Conference Volunteer',
    role: 'volunteer' as AdminRole,
    expires_at: '2099-01-01T00:00:00.000Z',
  },
  updateTask: vi.fn(),
  setGrant: vi.fn(),
  grants: [] as Array<import('@/lib/annual-conference-capabilities').AnnualConferenceCapability>,
  applications: [] as VolunteerApplication[],
  team: [] as Array<{ id: string; email: string; display_name: string; role: 'volunteer' }>,
}));

const assignedTask: AnnualConferenceTask = {
  id: 'task-assigned',
  edition_id: 'edition-2026',
  title: 'Send speaker invitations',
  details: 'Contact the approved speakers.',
  internal_note: 'Private organizer context.',
  phase_id: null,
  workstream: 'programme_speakers',
  accountable_owner: 'volunteer@example.com',
  collaborators: [],
  priority: 'high',
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
  created_at: '2026-08-03T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
};

const unrelatedTask: AnnualConferenceTask = {
  ...assignedTask,
  id: 'task-unrelated',
  title: 'Approve the conference budget',
  accountable_owner: 'owner@example.com',
};

vi.mock('@/lib/supabase/admin-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/admin-auth')>('@/lib/supabase/admin-auth');
  return {
    ...actual,
    getAdminSession: vi.fn(async () => mocks.session),
    requireAdmin: vi.fn(async (c: { set: (key: string, value: unknown) => void }, roles = ['owner', 'organizer']) => {
      if (!roles.includes(mocks.session.role)) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      c.set('adminSession', mocks.session);
      return null;
    }),
    recordAdminAudit: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/supabase/server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/server')>('@/lib/supabase/server');
  return {
    ...actual,
    getSupabaseAdminClient: vi.fn(() => ({
      from: vi.fn(() => {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data: { id: 'edition-2026', task_creator_email: 'owner@example.com' },
            error: null,
          })),
        };
        return builder;
      }),
    })),
  };
});

vi.mock('@/lib/supabase/annual-conference-work-plan', () => ({
  getSupabaseAnnualConferenceWorkPlan: vi.fn(async () => ({
    edition: {
      id: 'edition-2026',
      year: 2026,
      name: 'DevCongress Annual Conference',
      label: 'December 2026',
      provisional_date: '2026-12-19',
      date_status: 'provisional',
      venue_note: null,
      keynote_note: null,
      task_creator_email: 'owner@example.com',
      created_at: '2026-08-03T00:00:00.000Z',
      updated_at: '2026-08-03T00:00:00.000Z',
    },
    tasks: [assignedTask, unrelatedTask],
  })),
  createSupabaseAnnualConferenceTask: vi.fn(),
  updateSupabaseAnnualConferenceTask: mocks.updateTask,
}));

vi.mock('@/lib/supabase/annual-conference-access-grants', () => ({
  clearAnnualConferenceAccessGrantsForMembership: vi.fn(async () => undefined),
  getAnnualConferenceAccessGrants: vi.fn(async () => mocks.grants),
  listAnnualConferenceAccessMembers: vi.fn(),
  listAnnualConferenceVolunteerTeam: vi.fn(async () => mocks.team),
  setAnnualConferenceAccessGrant: mocks.setGrant,
}));

vi.mock('@/lib/mock-db/volunteer-applications', () => ({
  createVolunteerApplication: vi.fn(),
  getVolunteerApplications: vi.fn(async () => mocks.applications),
}));

describe('annual conference volunteer API access', () => {
  beforeEach(() => {
    mocks.session.email = 'volunteer@example.com';
    mocks.session.display_name = 'Conference Volunteer';
    mocks.session.role = 'volunteer';
    mocks.updateTask.mockReset();
    mocks.setGrant.mockReset();
    mocks.grants = [];
    mocks.applications = [];
    mocks.team = [];
    mocks.updateTask.mockImplementation(async (_editionId, _taskId, input) => ({
      ...assignedTask,
      ...input,
      internal_note: 'Private organizer context.',
    }));
  });

  it('returns only assigned work without organizer-only notes', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/annual-conference/2026/work-plan');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [{ id: 'task-assigned', internal_note: null }],
      permissions: {
        access_scope: 'assigned',
        can_create_tasks: false,
        can_edit_all_tasks: false,
        can_edit_assigned_tasks: false,
        can_update_assigned_task_status: true,
      },
    });
  });

  it('allows status-only updates to assigned tasks', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/annual-conference/2026/work-plan/task-assigned', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updateTask).toHaveBeenCalledWith(
      'edition-2026',
      'task-assigned',
      { status: 'in_progress' },
      'volunteer@example.com',
      expect.anything(),
    );
    await expect(response.json()).resolves.toMatchObject({ status: 'in_progress', internal_note: null });
  });

  it('expands a volunteer workspace only after an explicit edition grant', async () => {
    mocks.grants = ['work_plan.view_all'];
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/annual-conference/2026/work-plan');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [
        { id: 'task-assigned', internal_note: null },
        { id: 'task-unrelated', internal_note: null },
      ],
      permissions: {
        access_scope: 'all',
        can_create_tasks: false,
      },
    });
  });

  it('lets a delegated volunteer manager edit any task and see internal notes', async () => {
    mocks.grants = ['work_plan.manage'];
    const { default: app } = await import('./app');
    const workspaceResponse = await app.request('http://localhost/api/annual-conference/2026/work-plan');
    const updateResponse = await app.request('http://localhost/api/annual-conference/2026/work-plan/task-unrelated', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Delegated manager update' }),
    });

    expect(workspaceResponse.status).toBe(200);
    await expect(workspaceResponse.json()).resolves.toMatchObject({
      tasks: expect.arrayContaining([
        expect.objectContaining({ id: 'task-assigned', internal_note: 'Private organizer context.' }),
      ]),
      permissions: { can_edit_all_tasks: true, can_create_tasks: true },
    });
    expect(updateResponse.status).toBe(200);
    expect(mocks.updateTask).toHaveBeenCalledWith(
      'edition-2026',
      'task-unrelated',
      expect.objectContaining({ title: 'Delegated manager update' }),
      'volunteer@example.com',
      expect.anything(),
    );
  });

  it('rejects task detail changes and unrelated organizer APIs', async () => {
    const { default: app } = await import('./app');
    const taskResponse = await app.request('http://localhost/api/annual-conference/2026/work-plan/task-assigned', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Changed title' }),
    });
    const organizerResponse = await app.request('http://localhost/api/admin/organizers');

    expect(taskResponse.status).toBe(403);
    expect(organizerResponse.status).toBe(403);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it('rejects an organizer editing a task they do not own or collaborate on', async () => {
    mocks.session.role = 'organizer';
    mocks.session.email = 'organizer@example.com';
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/annual-conference/2026/work-plan/task-unrelated', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Changed title' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it('allows an assigned organizer to edit their task details', async () => {
    mocks.session.role = 'organizer';
    mocks.session.email = 'volunteer@example.com';
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/annual-conference/2026/work-plan/task-assigned', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated speaker invitations' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updateTask).toHaveBeenCalledWith(
      'edition-2026',
      'task-assigned',
      expect.objectContaining({ title: 'Updated speaker invitations' }),
      'volunteer@example.com',
      expect.anything(),
    );
  });

  it('allows a platform owner to edit any task without being the edition planning owner', async () => {
    mocks.session.role = 'owner';
    mocks.session.email = 'platform-owner@example.com';
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/annual-conference/2026/work-plan/task-assigned', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Platform owner update' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.updateTask).toHaveBeenCalled();
  });

  it('returns full planning capabilities to a platform owner', async () => {
    mocks.session.role = 'owner';
    mocks.session.email = 'platform-owner@example.com';
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/annual-conference/2026/work-plan');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      permissions: {
        can_create_tasks: true,
        can_manage_phases: true,
        can_edit_all_tasks: true,
        access_scope: 'all',
      },
    });
  });

  it('rejects responsibility delegation to a member role that cannot receive it', async () => {
    mocks.session.role = 'owner';
    mocks.session.email = 'platform-owner@example.com';
    mocks.setGrant.mockResolvedValue('not_eligible');
    const { default: app } = await import('./app');

    const response = await app.request('http://localhost/api/annual-conference/2026/access-grants/10000000-0000-4000-8000-000000000001', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability: 'timeline.view', enabled: true }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'This responsibility cannot be delegated to that member role.',
    });
  });

  it('marks matching applicants active without exposing team email addresses', async () => {
    mocks.grants = ['volunteers.view_team', 'volunteers.review_applications'];
    mocks.applications = [
      {
        id: 'application-active',
        campaign_id: 'december-mega-meetup',
        name: 'Active Applicant',
        email: 'active@example.com',
        x_handle: '@active',
        slack_name: 'active',
        created_at: '2026-07-26T15:05:00.000Z',
      },
      {
        id: 'application-pending',
        campaign_id: 'december-mega-meetup',
        name: 'Pending Applicant',
        email: 'pending@example.com',
        x_handle: '@pending',
        slack_name: 'pending',
        created_at: '2026-07-25T15:05:00.000Z',
      },
    ];
    mocks.team = [{
      id: 'membership-active',
      email: 'ACTIVE@example.com',
      display_name: 'Active Applicant',
      role: 'volunteer',
    }];
    const { default: app } = await import('./app');

    const applicationsResponse = await app.request('http://localhost/api/annual-conference/2026/volunteer-applications');
    const teamResponse = await app.request('http://localhost/api/annual-conference/2026/team');

    expect(applicationsResponse.status).toBe(200);
    await expect(applicationsResponse.json()).resolves.toMatchObject({
      applications: [
        { id: 'application-active', membership_id: 'membership-active', status: 'active' },
        { id: 'application-pending', membership_id: null, status: 'applicant' },
      ],
    });
    expect(teamResponse.status).toBe(200);
    await expect(teamResponse.json()).resolves.toEqual({
      members: [{
        id: 'membership-active',
        display_name: 'Active Applicant',
        role: 'volunteer',
      }],
    });
  });
});
