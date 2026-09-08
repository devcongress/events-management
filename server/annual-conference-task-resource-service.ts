import {
  ANNUAL_CONFERENCE_TASK_RESOURCE_LIMIT,
  ANNUAL_CONFERENCE_TASK_RESOURCE_LABEL_MAX_LENGTH,
  AnnualConferenceTaskResourceLimitError,
  normalizeTaskResourceActorEmail,
  normalizeTaskResourceLabel,
  normalizeTaskResourceUrl,
  type AnnualConferenceTaskResource,
  type AnnualConferenceTaskResourceCreateInput,
  type AnnualConferenceTaskResourceUpdateInput,
} from '@/lib/annual-conference-task-resources';
import {
  annualConferenceCapabilities,
  canEditAnnualConferenceTask,
  isAnnualConferenceTaskAssignedTo,
  type AnnualConferenceActor,
} from '@/lib/annual-conference-access';
import type { AnnualConferenceRepository } from '@/server/annual-conference-repository';
import type { AnnualConferenceTaskResourceRepository } from '@/server/annual-conference-task-resource-repository';

export type AnnualConferenceTaskResourceErrorCode = 'invalid_input' | 'forbidden' | 'not_found' | 'conflict';

export class AnnualConferenceTaskResourceServiceError extends Error {
  constructor(readonly code: AnnualConferenceTaskResourceErrorCode, message: string) {
    super(message);
    this.name = 'AnnualConferenceTaskResourceServiceError';
  }
}

export function annualConferenceTaskResourceErrorStatus(
  error: AnnualConferenceTaskResourceServiceError,
): 400 | 403 | 404 | 409 {
  if (error.code === 'forbidden') return 403;
  if (error.code === 'not_found') return 404;
  if (error.code === 'conflict') return 409;
  return 400;
}

export interface AnnualConferenceTaskResourceServiceDependencies {
  workPlanRepository: AnnualConferenceRepository;
  resourceRepository: AnnualConferenceTaskResourceRepository;
  actor: AnnualConferenceActor;
  accessGrants(editionId: string): Promise<AnnualConferenceActor['granted_capabilities']>;
  audit(event: {
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

function normalizeCreateInput(input: AnnualConferenceTaskResourceCreateInput): AnnualConferenceTaskResourceCreateInput {
  const url = normalizeTaskResourceUrl(input.url);
  if (!url) {
    throw new AnnualConferenceTaskResourceServiceError(
      'invalid_input',
      'Enter a valid HTTP or HTTPS resource link without embedded credentials.',
    );
  }
  const label = validatedLabel(input.label);
  return { url, label };
}

function validatedLabel(value: string | null | undefined): string | null {
  const label = normalizeTaskResourceLabel(value);
  if (label && label.length > ANNUAL_CONFERENCE_TASK_RESOURCE_LABEL_MAX_LENGTH) {
    throw new AnnualConferenceTaskResourceServiceError(
      'invalid_input',
      `Resource label must be ${ANNUAL_CONFERENCE_TASK_RESOURCE_LABEL_MAX_LENGTH} characters or fewer.`,
    );
  }
  return label;
}

function normalizeUpdateInput(input: AnnualConferenceTaskResourceUpdateInput): AnnualConferenceTaskResourceUpdateInput {
  const normalized: AnnualConferenceTaskResourceUpdateInput = {};
  if ('url' in input) {
    const url = normalizeTaskResourceUrl(input.url ?? '');
    if (!url) {
      throw new AnnualConferenceTaskResourceServiceError(
        'invalid_input',
        'Enter a valid HTTP or HTTPS resource link without embedded credentials.',
      );
    }
    normalized.url = url;
  }
  if ('label' in input) normalized.label = validatedLabel(input.label);
  return normalized;
}

function presentResource(resource: AnnualConferenceTaskResource, canEdit: boolean) {
  return { ...resource, can_manage: canEdit };
}

export function createAnnualConferenceTaskResourceService(
  dependencies: AnnualConferenceTaskResourceServiceDependencies,
) {
  const { actor, workPlanRepository, resourceRepository } = dependencies;

  async function context(year: number, taskId: string) {
    const workspace = await workPlanRepository.getWorkspace(year);
    if (!workspace) {
      throw new AnnualConferenceTaskResourceServiceError('not_found', `Annual conference ${year} was not found.`);
    }
    const task = workspace.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new AnnualConferenceTaskResourceServiceError('not_found', 'Annual conference task was not found.');
    const actorEmail = normalizeTaskResourceActorEmail(actor.email ?? '');
    if (!actorEmail) throw new AnnualConferenceTaskResourceServiceError('forbidden', 'Conference access required.');
    const editionActor: AnnualConferenceActor = {
      ...actor,
      email: actorEmail,
      granted_capabilities: await dependencies.accessGrants(workspace.edition.id) ?? [],
    };
    const assigned = isAnnualConferenceTaskAssignedTo(task, actorEmail);
    if (actor.role === 'volunteer' && !assigned) {
      throw new AnnualConferenceTaskResourceServiceError(
        'forbidden',
        'Volunteers can access resource links only for tasks assigned to them.',
      );
    }
    const permissions = annualConferenceCapabilities(editionActor, workspace.edition);
    const canManageAll = actor.role !== 'volunteer' && (
      permissions.can_edit_all_tasks
      || canEditAnnualConferenceTask(task, actorEmail, workspace.edition.task_creator_email)
    );
    const canAdd = actor.role === 'volunteer' ? assigned : canManageAll;
    return { actorEmail, canAdd, canManageAll, task, workspace };
  }

  function canEdit(resource: AnnualConferenceTaskResource, actorEmail: string, canManageAll: boolean): boolean {
    return canManageAll
      || (actor.role === 'volunteer'
        && normalizeTaskResourceActorEmail(resource.created_by_email) === actorEmail);
  }

  return {
    async list(year: number, taskId: string) {
      const access = await context(year, taskId);
      const resources = await resourceRepository.list(taskId);
      return {
        resources: resources.map((resource) => presentResource(
          resource,
          canEdit(resource, access.actorEmail, access.canManageAll),
        )),
        permissions: {
          can_add: access.canAdd,
          can_manage_all: access.canManageAll,
          max_resources: ANNUAL_CONFERENCE_TASK_RESOURCE_LIMIT,
        },
      };
    },

    async create(year: number, taskId: string, input: AnnualConferenceTaskResourceCreateInput) {
      const access = await context(year, taskId);
      if (!access.canAdd) {
        throw new AnnualConferenceTaskResourceServiceError(
          'forbidden',
          'Only assigned task members can add resource links.',
        );
      }
      try {
        const resource = await resourceRepository.create(taskId, normalizeCreateInput(input), access.actorEmail);
        await dependencies.audit({
          action: 'annual_conference.task_resource.create',
          targetType: 'annual_conference_task_resource',
          targetId: resource.id,
          metadata: { edition_year: year, task_id: taskId },
        });
        return { resource: presentResource(resource, true) };
      } catch (error) {
        if (error instanceof AnnualConferenceTaskResourceLimitError) {
          throw new AnnualConferenceTaskResourceServiceError('conflict', error.message);
        }
        throw error;
      }
    },

    async update(
      year: number,
      taskId: string,
      resourceId: string,
      input: AnnualConferenceTaskResourceUpdateInput,
    ) {
      const access = await context(year, taskId);
      const existing = (await resourceRepository.list(taskId)).find((resource) => resource.id === resourceId);
      if (!existing) throw new AnnualConferenceTaskResourceServiceError('not_found', 'Task resource link was not found.');
      if (!canEdit(existing, access.actorEmail, access.canManageAll)) {
        throw new AnnualConferenceTaskResourceServiceError(
          'forbidden',
          actor.role === 'volunteer'
            ? 'Volunteers can edit only resource links they added.'
            : 'Only a task editor can edit this resource link.',
        );
      }
      const creatorConstraint = actor.role === 'volunteer' ? access.actorEmail : undefined;
      const resource = await resourceRepository.update(
        taskId,
        resourceId,
        normalizeUpdateInput(input),
        access.actorEmail,
        creatorConstraint,
      );
      if (!resource) throw new AnnualConferenceTaskResourceServiceError('not_found', 'Task resource link was not found.');
      await dependencies.audit({
        action: 'annual_conference.task_resource.update',
        targetType: 'annual_conference_task_resource',
        targetId: resource.id,
        metadata: { edition_year: year, task_id: taskId, changed_fields: Object.keys(input) },
      });
      return { resource: presentResource(resource, true) };
    },

    async delete(year: number, taskId: string, resourceId: string) {
      const access = await context(year, taskId);
      const existing = (await resourceRepository.list(taskId)).find((resource) => resource.id === resourceId);
      if (!existing) throw new AnnualConferenceTaskResourceServiceError('not_found', 'Task resource link was not found.');
      if (!canEdit(existing, access.actorEmail, access.canManageAll)) {
        throw new AnnualConferenceTaskResourceServiceError(
          'forbidden',
          actor.role === 'volunteer'
            ? 'Volunteers can delete only resource links they added.'
            : 'Only a task editor can delete this resource link.',
        );
      }
      const creatorConstraint = actor.role === 'volunteer' ? access.actorEmail : undefined;
      const deleted = await resourceRepository.delete(taskId, resourceId, creatorConstraint);
      if (!deleted) throw new AnnualConferenceTaskResourceServiceError('not_found', 'Task resource link was not found.');
      await dependencies.audit({
        action: 'annual_conference.task_resource.delete',
        targetType: 'annual_conference_task_resource',
        targetId: resourceId,
        metadata: { edition_year: year, task_id: taskId },
      });
      return { deleted: true as const };
    },
  };
}

export type AnnualConferenceTaskResourceService = ReturnType<typeof createAnnualConferenceTaskResourceService>;
