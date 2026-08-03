import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnualConferenceTask } from '@/lib/annual-conference-work-plan';

const mocks = vi.hoisted(() => ({
  session: {
    authenticated: true as const,
    user_id: 'volunteer-user',
    membership_id: 'volunteer-membership',
    email: 'volunteer@example.com',
    display_name: 'Conference Volunteer',
    role: 'volunteer' as const,
    expires_at: '2099-01-01T00:00:00.000Z',
  },
  updateTask: vi.fn(),
}));

const assignedTask: AnnualConferenceTask = {
  id: 'task-assigned',
  edition_id: 'edition-2026',
  title: 'Send speaker invitations',
  details: 'Contact the approved speakers.',
  internal_note: 'Private organizer context.',
  workstream: 'programme_speakers',
  accountable_owner: 'volunteer@example.com',
  collaborators: [],
  priority: 'high',
  target_date: null,
  status: 'not_started',
  dependency_note: null,
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

describe('annual conference volunteer API access', () => {
  beforeEach(() => {
    mocks.updateTask.mockReset();
    mocks.updateTask.mockImplementation(async (_editionId, _taskId, input) => ({
      ...assignedTask,
      status: input.status,
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
});
