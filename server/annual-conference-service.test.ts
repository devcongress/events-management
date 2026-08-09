import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnualConferenceRepository } from './annual-conference-repository';
import { createAnnualConferenceService, AnnualConferenceServiceError } from './annual-conference-service';
import type { AnnualConferenceTask } from '@/lib/annual-conference-work-plan';

const task: AnnualConferenceTask = {
  id: 'task-1',
  edition_id: 'edition-2026',
  title: 'Invite speakers',
  details: null,
  internal_note: 'Private note',
  phase_id: 'phase-1',
  workstream: 'programme_speakers',
  accountable_owner: 'volunteer@example.com',
  collaborators: [],
  priority: 'high',
  target_date: '2026-08-20',
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

const workspace = {
  edition: {
    id: 'edition-2026',
    year: 2026,
    name: 'DevCongress Annual Conference',
    label: 'December 2026',
    provisional_date: '2026-12-19',
    date_status: 'provisional' as const,
    venue_note: null,
    keynote_note: null,
    task_creator_email: 'owner@example.com',
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  },
  phases: [{
    id: 'phase-1',
    edition_id: 'edition-2026',
    name: 'Phase 1',
    starts_on: '2026-08-01',
    ends_on: '2026-08-31',
    sort_order: 1,
    created_by_email: 'owner@example.com',
    updated_by_email: 'owner@example.com',
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  }],
  tasks: [task],
};

function repository(): AnnualConferenceRepository {
  return {
    listEditions: vi.fn(async () => [workspace.edition]),
    getWorkspace: vi.fn(async () => workspace),
    createEdition: vi.fn(),
    createPhase: vi.fn(),
    updatePhase: vi.fn(),
    deletePhase: vi.fn(),
    reorderPhases: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(async (_editionId, _taskId, changes) => ({ ...task, ...changes })),
    updateEditionSpeakerCallStatus: vi.fn(),
  };
}

describe('Annual Conference service boundary', () => {
  const audit = vi.fn(async () => undefined);

  beforeEach(() => vi.clearAllMocks());

  it('returns a capability-bearing, redacted workspace to an assigned volunteer', async () => {
    const service = createAnnualConferenceService({
      repository: repository(),
      actor: { role: 'volunteer', email: 'volunteer@example.com' },
      activeOrganizerEmails: async () => [],
      audit,
    });

    const result = await service.getWorkspace(2026);
    expect(result.tasks).toEqual([expect.objectContaining({ id: 'task-1', internal_note: null })]);
    expect(result.permissions.access_scope).toBe('assigned');
  });

  it('allows only the assigned volunteer status patch and audits the constrained update', async () => {
    const repo = repository();
    const service = createAnnualConferenceService({
      repository: repo,
      actor: { role: 'volunteer', email: 'volunteer@example.com' },
      activeOrganizerEmails: async () => [],
      audit,
    });

    await expect(service.updateTask(2026, 'task-1', { status: 'done' }))
      .resolves.toMatchObject({ status: 'done', internal_note: null });
    expect(repo.updateTask).toHaveBeenCalledWith(
      'edition-2026',
      'task-1',
      { status: 'done' },
      'volunteer@example.com',
    );
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'annual_conference.task.status_update' }));

    await expect(service.updateTask(2026, 'task-1', { title: 'Changed' }))
      .rejects.toMatchObject({ code: 'forbidden' } satisfies Partial<AnnualConferenceServiceError>);
  });

  it('rejects phase dates before calling persistence', async () => {
    const repo = repository();
    const service = createAnnualConferenceService({
      repository: repo,
      actor: { role: 'owner', email: 'owner@example.com' },
      activeOrganizerEmails: async () => ['owner@example.com'],
      audit,
    });

    await expect(service.createPhase(2026, {
      name: 'Overlap',
      starts_on: '2026-08-15',
      ends_on: '2026-09-15',
    })).rejects.toMatchObject({ code: 'invalid_input' } satisfies Partial<AnnualConferenceServiceError>);
    expect(repo.createPhase).not.toHaveBeenCalled();
  });

  it('rejects task dependencies outside the current conference workspace', async () => {
    const repo = repository();
    const service = createAnnualConferenceService({
      repository: repo,
      actor: { role: 'owner', email: 'owner@example.com' },
      activeOrganizerEmails: async () => ['owner@example.com'],
      audit,
    });

    await expect(service.updateTask(2026, 'task-1', { dependency_task_ids: ['missing-task'] }))
      .rejects.toMatchObject({ code: 'invalid_input' } satisfies Partial<AnnualConferenceServiceError>);
    expect(repo.updateTask).not.toHaveBeenCalled();
  });
});
