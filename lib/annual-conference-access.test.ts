import { describe, expect, it } from 'vitest';
import {
  annualConferenceCapabilities,
  annualConferenceTasksForMember,
  canCreateAnnualConferenceEdition,
  canUpdateAnnualConferenceTask,
  canUpdateAnnualConferenceTaskStatus,
  isAnnualConferenceTaskAssignedTo,
  presentAnnualConferenceWorkspace,
  type AnnualConferenceActor,
  volunteerCanUpdateAssignedTask,
} from './annual-conference-access';
import type { AnnualConferenceEdition, AnnualConferenceTask } from './annual-conference-work-plan';

const edition: AnnualConferenceEdition = {
  id: 'edition-1',
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
};

function task(overrides: Partial<AnnualConferenceTask> = {}): AnnualConferenceTask {
  return {
    id: 'task-1',
    edition_id: 'edition-1',
    title: 'Contact conference speakers',
    details: 'Send the approved invitation.',
    internal_note: 'Organizer-only negotiation context.',
    phase_id: null,
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
    ...overrides,
    dependency_task_ids: overrides.dependency_task_ids ?? [],
  };
}

describe('annual conference volunteer access', () => {
  it('matches accountable owners and collaborators by normalized email', () => {
    expect(isAnnualConferenceTaskAssignedTo(task(), ' Volunteer@Example.com ')).toBe(true);
    expect(isAnnualConferenceTaskAssignedTo(
      task({ accountable_owner: 'owner@example.com', collaborators: ['Volunteer@Example.com'] }),
      'volunteer@example.com',
    )).toBe(true);
    expect(isAnnualConferenceTaskAssignedTo(task(), 'someone@example.com')).toBe(false);
  });

  it.each([
    ['Angela', 'angelateyvi@gmail.com', task({ accountable_owner: 'angelateyvi@gmail.com' })],
    ['Dede', 'blossomddb@gmail.com', task({ accountable_owner: 'blossomddb@gmail.com' })],
    ['Ernest', 'essienernest.kojoowusu@gmail.com', task({ collaborators: ['essienernest.kojoowusu@gmail.com'] })],
    ['Philipa', 'abenabennett@gmail.com', task({ collaborators: ['abenabennett@gmail.com'] })],
  ])('authorizes the mapped %s assignment for status changes', (_legacyLabel, email, assignedTask) => {
    expect(canUpdateAnnualConferenceTaskStatus(
      { role: 'volunteer', email },
      edition,
      assignedTask,
    )).toBe(true);
    expect(canUpdateAnnualConferenceTaskStatus(
      { role: 'volunteer', email: 'unrelated@example.com' },
      edition,
      assignedTask,
    )).toBe(false);
  });

  it('returns only assigned tasks and removes organizer-only notes for volunteers', () => {
    const assigned = task();
    const unrelated = task({ id: 'task-2', accountable_owner: 'someone@example.com' });

    const visible = annualConferenceTasksForMember(
      [assigned, unrelated],
      { role: 'volunteer', email: 'volunteer@example.com' },
      [],
    );

    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ id: assigned.id, internal_note: null });
  });

  it('does not filter organizer work plans', () => {
    const tasks = [task(), task({ id: 'task-2' })];

    expect(annualConferenceTasksForMember(
      tasks,
      { role: 'organizer', email: 'organizer@example.com' },
      ['work_plan.view_all'],
    )).toEqual(tasks);
  });

  it('honors an edition override that removes an organizer work-plan default', () => {
    const permissions = annualConferenceCapabilities({
      role: 'organizer',
      email: 'organizer@example.com',
      capability_overrides: [{ capability: 'work_plan.view_all', enabled: false }],
    }, edition);

    expect(permissions.access_scope).toBe('assigned');
    expect(canUpdateAnnualConferenceTaskStatus(
      { role: 'organizer', email: 'organizer@example.com', capability_overrides: [{ capability: 'work_plan.view_all', enabled: false }] },
      edition,
      task({ accountable_owner: 'someone@example.com' }),
    )).toBe(false);
  });

  it('shows delegated volunteers the full plan while keeping internal notes private', () => {
    const tasks = [task(), task({ id: 'task-2', accountable_owner: 'someone@example.com' })];
    const visible = annualConferenceTasksForMember(
      tasks,
      { role: 'volunteer', email: 'volunteer@example.com', granted_capabilities: ['work_plan.view_all'] },
      ['work_plan.view_all'],
    );

    expect(visible).toHaveLength(2);
    expect(visible.every((item) => item.internal_note === null)).toBe(true);
  });

  it('lets volunteers change only status on tasks assigned to them', () => {
    expect(volunteerCanUpdateAssignedTask(task(), { status: 'in_progress' }, 'volunteer@example.com')).toBe(true);
    expect(volunteerCanUpdateAssignedTask(task(), { title: 'Changed' }, 'volunteer@example.com')).toBe(false);
    expect(volunteerCanUpdateAssignedTask(
      task(),
      { status: 'done', title: 'Changed' },
      'volunteer@example.com',
    )).toBe(false);
    expect(volunteerCanUpdateAssignedTask(task(), { status: 'done' }, 'someone@example.com')).toBe(false);
  });

  it('derives client capabilities from the same planning-owner policy', () => {
    expect(annualConferenceCapabilities({ role: 'owner', email: 'platform-owner@example.com' }, edition)).toMatchObject({
      can_create_tasks: true,
      can_manage_phases: true,
      can_edit_all_tasks: true,
      can_update_all_task_status: true,
      access_scope: 'all',
    });
    expect(annualConferenceCapabilities({ role: 'volunteer', email: 'volunteer@example.com' }, edition)).toMatchObject({
      can_create_tasks: false,
      can_edit_assigned_tasks: false,
      can_update_all_task_status: false,
      can_update_assigned_task_status: true,
      access_scope: 'assigned',
    });
    expect(annualConferenceCapabilities({ role: 'volunteer', email: edition.task_creator_email }, edition)).toMatchObject({
      can_create_tasks: false,
      can_manage_phases: false,
      access_scope: 'assigned',
    });
  });

  it('uses one task-update decision for organizers and volunteers', () => {
    expect(canUpdateAnnualConferenceTask(
      { role: 'owner', email: 'platform-owner@example.com' },
      edition,
      task({ accountable_owner: 'someone@example.com' }),
      { title: 'Platform owner correction' },
    )).toBe(true);
    expect(canUpdateAnnualConferenceTask(
      { role: 'organizer', email: 'volunteer@example.com' },
      edition,
      task(),
      { title: 'Updated' },
    )).toBe(true);
    expect(canUpdateAnnualConferenceTask(
      { role: 'volunteer', email: 'volunteer@example.com' },
      edition,
      task(),
      { title: 'Updated' },
    )).toBe(false);
    expect(canUpdateAnnualConferenceTask(
      { role: 'volunteer', email: 'volunteer@example.com' },
      edition,
      task(),
      { status: 'done' },
    )).toBe(true);
    expect(canUpdateAnnualConferenceTask(
      { role: 'volunteer', email: 'volunteer@example.com', granted_capabilities: ['work_plan.manage'] },
      edition,
      task({ accountable_owner: 'someone@example.com' }),
      { title: 'Delegated manager update' },
    )).toBe(true);
  });

  it('limits regular members to moving their own cards while retaining owner and planning-owner authority', () => {
    const unrelated = task({ accountable_owner: 'someone@example.com' });
    const collaboratorTask = task({ accountable_owner: 'someone@example.com', collaborators: ['volunteer@example.com'] });
    const delegatedManager: AnnualConferenceActor = {
      role: 'volunteer',
      email: 'manager@example.com',
      granted_capabilities: ['work_plan.manage'],
    };

    expect(canUpdateAnnualConferenceTaskStatus(
      { role: 'volunteer', email: 'volunteer@example.com' },
      edition,
      task(),
    )).toBe(true);
    expect(canUpdateAnnualConferenceTaskStatus(
      { role: 'volunteer', email: 'volunteer@example.com' },
      edition,
      collaboratorTask,
    )).toBe(true);
    expect(canUpdateAnnualConferenceTaskStatus(
      { role: 'organizer', email: 'organizer@example.com' },
      edition,
      unrelated,
    )).toBe(false);
    expect(canUpdateAnnualConferenceTaskStatus(delegatedManager, edition, unrelated)).toBe(true);
    expect(canUpdateAnnualConferenceTaskStatus(
      { role: 'owner', email: 'platform-owner@example.com' },
      edition,
      unrelated,
    )).toBe(true);
    expect(canUpdateAnnualConferenceTaskStatus(
      { role: 'organizer', email: 'owner@example.com' },
      edition,
      unrelated,
    )).toBe(true);
  });

  it('lets a delegated work-plan manager move another person’s task', () => {
    const delegatedManager: AnnualConferenceActor = {
      role: 'volunteer',
      email: 'manager@example.com',
      granted_capabilities: ['work_plan.manage'],
    };
    const unrelated = task({ accountable_owner: 'someone@example.com' });

    expect(canUpdateAnnualConferenceTask(
      delegatedManager,
      edition,
      unrelated,
      { status: 'done' },
    )).toBe(true);
    expect(canUpdateAnnualConferenceTask(
      delegatedManager,
      edition,
      unrelated,
      { title: 'Delegated manager update' },
    )).toBe(true);
  });

  it('lets a platform owner create the next edition without replacing its planning owner', () => {
    expect(canCreateAnnualConferenceEdition(
      { role: 'owner', email: 'platform-owner@example.com' },
      edition,
    )).toBe(true);
    expect(canCreateAnnualConferenceEdition(
      { role: 'organizer', email: 'unassigned@example.com' },
      edition,
    )).toBe(false);
    expect(canCreateAnnualConferenceEdition(
      { role: 'owner', email: null },
      edition,
    )).toBe(false);
  });

  it('presents a capability-bearing, redacted workspace for volunteers', () => {
    const workspace = presentAnnualConferenceWorkspace({
      edition,
      phases: [],
      tasks: [task(), task({ id: 'task-2', accountable_owner: 'someone@example.com' })],
    }, { role: 'volunteer', email: 'volunteer@example.com' });

    expect(workspace.tasks).toEqual([expect.objectContaining({ id: 'task-1', internal_note: null })]);
    expect(workspace.summary.total).toBe(1);
    expect(workspace.permissions.access_scope).toBe('assigned');
  });
});
