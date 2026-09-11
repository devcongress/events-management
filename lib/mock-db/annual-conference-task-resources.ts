import {
  ANNUAL_CONFERENCE_TASK_RESOURCE_LIMIT,
  AnnualConferenceTaskResourceLimitError,
  normalizeTaskResourceActorEmail,
  type AnnualConferenceTaskResource,
  type AnnualConferenceTaskResourceCreateInput,
  type AnnualConferenceTaskResourceUpdateInput,
} from '@/lib/annual-conference-task-resources';
import { readData, updateData } from '@/lib/mock-db';
import { generateId, now } from '@/lib/utils';

const FILE = 'annual-conference-task-resources';

export async function listMockAnnualConferenceTaskResources(
  taskId: string,
): Promise<AnnualConferenceTaskResource[]> {
  return (await readData<AnnualConferenceTaskResource>(FILE))
    .filter((resource) => resource.task_id === taskId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export async function createMockAnnualConferenceTaskResource(
  taskId: string,
  input: AnnualConferenceTaskResourceCreateInput,
  actorEmail: string,
): Promise<AnnualConferenceTaskResource> {
  return updateData<AnnualConferenceTaskResource, AnnualConferenceTaskResource>(FILE, (current) => {
    if (current.filter((resource) => resource.task_id === taskId).length >= ANNUAL_CONFERENCE_TASK_RESOURCE_LIMIT) {
      throw new AnnualConferenceTaskResourceLimitError();
    }
    const timestamp = now();
    const normalizedActor = normalizeTaskResourceActorEmail(actorEmail);
    const resource: AnnualConferenceTaskResource = {
      id: generateId(),
      task_id: taskId,
      url: input.url,
      label: input.label ?? null,
      created_by_email: normalizedActor,
      updated_by_email: normalizedActor,
      created_at: timestamp,
      updated_at: timestamp,
    };

    return { data: [...current, resource], result: resource };
  });
}

export async function updateMockAnnualConferenceTaskResource(
  taskId: string,
  resourceId: string,
  input: AnnualConferenceTaskResourceUpdateInput,
  actorEmail: string,
  creatorEmailConstraint?: string,
): Promise<AnnualConferenceTaskResource | undefined> {
  return updateData<AnnualConferenceTaskResource, AnnualConferenceTaskResource | undefined>(FILE, (current) => {
    const normalizedCreator = creatorEmailConstraint
      ? normalizeTaskResourceActorEmail(creatorEmailConstraint)
      : null;
    const index = current.findIndex((resource) => (
      resource.id === resourceId
      && resource.task_id === taskId
      && (!normalizedCreator || normalizeTaskResourceActorEmail(resource.created_by_email) === normalizedCreator)
    ));

    if (index < 0) return { data: current, result: undefined };
    const updated: AnnualConferenceTaskResource = {
      ...current[index],
      ...input,
      updated_by_email: normalizeTaskResourceActorEmail(actorEmail),
      updated_at: now(),
    };
    const next = [...current];

    next[index] = updated;

    return { data: next, result: updated };
  });
}

export async function deleteMockAnnualConferenceTaskResource(
  taskId: string,
  resourceId: string,
  creatorEmailConstraint?: string,
): Promise<boolean> {
  return updateData<AnnualConferenceTaskResource, boolean>(FILE, (current) => {
    const normalizedCreator = creatorEmailConstraint
      ? normalizeTaskResourceActorEmail(creatorEmailConstraint)
      : null;
    const next = current.filter((resource) => !(
      resource.id === resourceId
      && resource.task_id === taskId
      && (!normalizedCreator || normalizeTaskResourceActorEmail(resource.created_by_email) === normalizedCreator)
    ));

    return { data: next, result: next.length !== current.length };
  });
}
