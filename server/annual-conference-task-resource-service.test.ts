import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnualConferenceActor } from '@/lib/annual-conference-access';
import {
  AnnualConferenceTaskResourceLimitError,
  type AnnualConferenceTaskResource,
} from '@/lib/annual-conference-task-resources';
import type { AnnualConferenceRepository } from '@/server/annual-conference-repository';
import type { AnnualConferenceTaskResourceRepository } from '@/server/annual-conference-task-resource-repository';
import {
  AnnualConferenceTaskResourceServiceError,
  createAnnualConferenceTaskResourceService,
} from '@/server/annual-conference-task-resource-service';

const task = {
  id: '10000000-0000-4000-8000-000000000001',
  edition_id: '20000000-0000-4000-8000-000000000001',
  title: 'Publish the programme',
  details: null,
  details_format: 'plain_text' as const,
  internal_note: null,
  phase_id: null,
  workstream: 'programme_speakers' as const,
  accountable_owner: 'volunteer@example.com',
  collaborators: ['organizer@example.com'],
  priority: null,
  target_date: null,
  status: 'not_started' as const,
  dependency_note: null,
  dependency_task_ids: [],
  source: 'manual' as const,
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
  name: 'DevCongress Annual Conference',
  label: 'December 2026',
  speaker_call_status: 'closed' as const,
  speaker_logistics_deadline: null,
  provisional_date: '2026-12-19',
  date_status: 'provisional' as const,
  venue_note: null,
  keynote_note: null,
  task_creator_email: 'planning@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const ownResource: AnnualConferenceTaskResource = {
  id: '30000000-0000-4000-8000-000000000001',
  task_id: task.id,
  url: 'https://example.com/brief',
  label: 'Brief',
  created_by_email: 'volunteer@example.com',
  updated_by_email: 'volunteer@example.com',
  created_at: '2026-09-08T00:00:00.000Z',
  updated_at: '2026-09-08T00:00:00.000Z',
};
const otherResource: AnnualConferenceTaskResource = {
  ...ownResource,
  id: '30000000-0000-4000-8000-000000000002',
  created_by_email: 'someone@example.com',
  updated_by_email: 'someone@example.com',
};

const resourceRepository = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
} satisfies AnnualConferenceTaskResourceRepository;

const workPlanRepository = {
  getWorkspace: vi.fn(),
} as unknown as AnnualConferenceRepository;
const audit = vi.fn();

function service(actor: AnnualConferenceActor, grants: AnnualConferenceActor['granted_capabilities'] = []) {
  return createAnnualConferenceTaskResourceService({
    actor,
    workPlanRepository,
    resourceRepository,
    accessGrants: vi.fn(async () => grants),
    audit,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  workPlanRepository.getWorkspace = vi.fn(async () => ({ edition, phases: [], tasks: [task] }));
  resourceRepository.list.mockResolvedValue([ownResource, otherResource]);
  resourceRepository.create.mockImplementation(async (_taskId, input, actorEmail) => ({
    ...ownResource,
    ...input,
    created_by_email: actorEmail,
    updated_by_email: actorEmail,
  }));
  resourceRepository.update.mockImplementation(async (_taskId, _resourceId, input, actorEmail) => ({
    ...ownResource,
    ...input,
    updated_by_email: actorEmail,
  }));
  resourceRepository.delete.mockResolvedValue(true);
});

describe('Annual Conference task resource authorization', () => {
  it('lets an assigned volunteer add links and manage only their own rows', async () => {
    const subject = service({ role: 'volunteer', email: 'Volunteer@Example.com' });

    await expect(subject.list(2026, task.id)).resolves.toMatchObject({
      resources: [
        { id: ownResource.id, can_manage: true },
        { id: otherResource.id, can_manage: false },
      ],
      permissions: { can_add: true, can_manage_all: false, max_resources: 20 },
    });
    await expect(subject.create(2026, task.id, {
      url: 'http://example.com/working-notes',
      label: '  Working notes  ',
    })).resolves.toMatchObject({
      resource: { url: 'http://example.com/working-notes', label: 'Working notes', can_manage: true },
    });
    expect(resourceRepository.create).toHaveBeenCalledWith(
      task.id,
      { url: 'http://example.com/working-notes', label: 'Working notes' },
      'volunteer@example.com',
    );
  });

  it('keeps elevated volunteers assignment- and creator-scoped', async () => {
    const unassignedTask = { ...task, accountable_owner: 'someone@example.com', collaborators: [] };
    workPlanRepository.getWorkspace = vi.fn(async () => ({ edition, phases: [], tasks: [unassignedTask] }));
    const unassigned = service(
      { role: 'volunteer', email: 'volunteer@example.com' },
      ['work_plan.manage'],
    );
    await expect(unassigned.list(2026, task.id)).rejects.toMatchObject({ code: 'forbidden' });

    workPlanRepository.getWorkspace = vi.fn(async () => ({ edition, phases: [], tasks: [task] }));
    const assigned = service(
      { role: 'volunteer', email: 'volunteer@example.com' },
      ['work_plan.manage'],
    );
    await expect(assigned.update(2026, task.id, otherResource.id, { label: 'Changed' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    expect(resourceRepository.update).not.toHaveBeenCalled();
  });

  it('applies the volunteer creator predicate again in persistence', async () => {
    const subject = service({ role: 'volunteer', email: 'volunteer@example.com' });
    await subject.update(2026, task.id, ownResource.id, { label: null });
    await subject.delete(2026, task.id, ownResource.id);

    expect(resourceRepository.update).toHaveBeenCalledWith(
      task.id,
      ownResource.id,
      { label: null },
      'volunteer@example.com',
      'volunteer@example.com',
    );
    expect(resourceRepository.delete).toHaveBeenCalledWith(
      task.id,
      ownResource.id,
      'volunteer@example.com',
    );
  });

  it('lets a task-editing organizer manage every resource but keeps other organizers read-only', async () => {
    const assigned = service({ role: 'organizer', email: 'organizer@example.com' });
    await expect(assigned.list(2026, task.id)).resolves.toMatchObject({
      resources: [{ can_manage: true }, { can_manage: true }],
      permissions: { can_add: true, can_manage_all: true },
    });
    await assigned.delete(2026, task.id, otherResource.id);
    expect(resourceRepository.delete).toHaveBeenCalledWith(task.id, otherResource.id, undefined);

    const readOnly = service({ role: 'organizer', email: 'readonly@example.com' });
    await expect(readOnly.list(2026, task.id)).resolves.toMatchObject({
      resources: [{ can_manage: false }, { can_manage: false }],
      permissions: { can_add: false, can_manage_all: false },
    });
    await expect(readOnly.create(2026, task.id, { url: 'https://example.com' }))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('Annual Conference task resource validation and limits', () => {
  it('rejects unsafe schemes and embedded credentials', async () => {
    const subject = service({ role: 'volunteer', email: 'volunteer@example.com' });
    await expect(subject.create(2026, task.id, { url: 'javascript:alert(1)' }))
      .rejects.toBeInstanceOf(AnnualConferenceTaskResourceServiceError);
    await expect(subject.create(2026, task.id, { url: 'https://user:secret@example.com' }))
      .rejects.toMatchObject({ code: 'invalid_input' });
    expect(resourceRepository.create).not.toHaveBeenCalled();
  });

  it('enforces the label limit in the service as well as the HTTP schema and database', async () => {
    const subject = service({ role: 'volunteer', email: 'volunteer@example.com' });
    await expect(subject.create(2026, task.id, {
      url: 'https://example.com/resource',
      label: 'x'.repeat(121),
    })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(resourceRepository.create).not.toHaveBeenCalled();
  });

  it('maps the atomic persistence cap to a conflict response', async () => {
    resourceRepository.create.mockRejectedValueOnce(new AnnualConferenceTaskResourceLimitError());
    const subject = service({ role: 'volunteer', email: 'volunteer@example.com' });
    await expect(subject.create(2026, task.id, { url: 'https://example.com/resource' }))
      .rejects.toMatchObject({ code: 'conflict' });
  });
});
