import type { Context } from 'hono';
import type {
  AnnualConferenceTaskResource,
  AnnualConferenceTaskResourceCreateInput,
  AnnualConferenceTaskResourceUpdateInput,
} from '@/lib/annual-conference-task-resources';
import {
  createMockAnnualConferenceTaskResource,
  deleteMockAnnualConferenceTaskResource,
  listMockAnnualConferenceTaskResources,
  updateMockAnnualConferenceTaskResource,
} from '@/lib/mock-db/annual-conference-task-resources';
import {
  createSupabaseAnnualConferenceTaskResource,
  deleteSupabaseAnnualConferenceTaskResource,
  listSupabaseAnnualConferenceTaskResources,
  updateSupabaseAnnualConferenceTaskResource,
} from '@/lib/supabase/annual-conference-task-resources';

export interface AnnualConferenceTaskResourceRepository {
  list(taskId: string): Promise<AnnualConferenceTaskResource[]>;
  create(taskId: string, input: AnnualConferenceTaskResourceCreateInput, actorEmail: string): Promise<AnnualConferenceTaskResource>;
  update(
    taskId: string,
    resourceId: string,
    input: AnnualConferenceTaskResourceUpdateInput,
    actorEmail: string,
    creatorEmailConstraint?: string,
  ): Promise<AnnualConferenceTaskResource | undefined>;
  delete(taskId: string, resourceId: string, creatorEmailConstraint?: string): Promise<boolean>;
}

export function createAnnualConferenceTaskResourceRepository(c?: Context): AnnualConferenceTaskResourceRepository {
  return {
    async list(taskId) {
      return await listSupabaseAnnualConferenceTaskResources(taskId, c)
        ?? listMockAnnualConferenceTaskResources(taskId);
    },
    async create(taskId, input, actorEmail) {
      return await createSupabaseAnnualConferenceTaskResource(taskId, input, actorEmail, c)
        ?? createMockAnnualConferenceTaskResource(taskId, input, actorEmail);
    },
    async update(taskId, resourceId, input, actorEmail, creatorEmailConstraint) {
      const resource = await updateSupabaseAnnualConferenceTaskResource(
        taskId,
        resourceId,
        input,
        actorEmail,
        creatorEmailConstraint,
        c,
      );
      return resource === null
        ? updateMockAnnualConferenceTaskResource(taskId, resourceId, input, actorEmail, creatorEmailConstraint)
        : resource;
    },
    async delete(taskId, resourceId, creatorEmailConstraint) {
      const deleted = await deleteSupabaseAnnualConferenceTaskResource(taskId, resourceId, creatorEmailConstraint, c);
      return deleted === null
        ? deleteMockAnnualConferenceTaskResource(taskId, resourceId, creatorEmailConstraint)
        : deleted;
    },
  };
}
