import { describe, expect, it } from 'vitest';
import {
  annualConferenceTasksForMember,
  isAnnualConferenceTaskAssignedTo,
  volunteerCanUpdateAssignedTask,
} from './annual-conference-access';
import type { AnnualConferenceTask } from './annual-conference-work-plan';

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

  it('returns only assigned tasks and removes organizer-only notes for volunteers', () => {
    const assigned = task();
    const unrelated = task({ id: 'task-2', accountable_owner: 'someone@example.com' });

    const visible = annualConferenceTasksForMember(
      [assigned, unrelated],
      'volunteer',
      'volunteer@example.com',
    );

    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ id: assigned.id, internal_note: null });
  });

  it('does not filter organizer work plans', () => {
    const tasks = [task(), task({ id: 'task-2' })];
    expect(annualConferenceTasksForMember(tasks, 'organizer', 'organizer@example.com')).toBe(tasks);
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
});
