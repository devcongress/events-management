import type { Context } from 'hono';
import {
  createMockAnnualConferenceEdition,
  createMockAnnualConferencePhase,
  createMockAnnualConferenceTask,
  deleteMockAnnualConferencePhase,
  getMockAnnualConferenceWorkPlan,
  listMockAnnualConferenceEditions,
  reorderMockAnnualConferencePhases,
  updateMockAnnualConferencePhase,
  updateMockAnnualConferenceSpeakerCallStatus,
  updateMockAnnualConferenceTask,
} from '@/lib/mock-db/annual-conference-work-plan';
import {
  createSupabaseAnnualConferenceEdition,
  createSupabaseAnnualConferencePhase,
  createSupabaseAnnualConferenceTask,
  deleteSupabaseAnnualConferencePhase,
  getSupabaseAnnualConferenceWorkPlan,
  listSupabaseAnnualConferenceEditions,
  reorderSupabaseAnnualConferencePhases,
  updateSupabaseAnnualConferencePhase,
  updateSupabaseAnnualConferenceSpeakerCallStatus,
  updateSupabaseAnnualConferenceTask,
} from '@/lib/supabase/annual-conference-work-plan';
import type {
  AnnualConferenceEdition,
  AnnualConferenceEditionCreateInput,
  AnnualConferencePhase,
  AnnualConferencePhaseCreateInput,
  AnnualConferencePhaseUpdateInput,
  AnnualConferenceTask,
  AnnualConferenceTaskCreateInput,
  AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';

export interface AnnualConferenceSnapshot {
  edition: AnnualConferenceEdition;
  phases: AnnualConferencePhase[];
  tasks: AnnualConferenceTask[];
}

export interface AnnualConferenceRepository {
  listEditions(): Promise<AnnualConferenceEdition[]>;
  getWorkspace(year: number): Promise<AnnualConferenceSnapshot | undefined>;
  createEdition(input: AnnualConferenceEditionCreateInput, planningOwnerEmail: string): Promise<AnnualConferenceEdition>;
  createPhase(editionId: string, input: AnnualConferencePhaseCreateInput, actorEmail: string): Promise<AnnualConferencePhase>;
  updatePhase(editionId: string, phaseId: string, input: AnnualConferencePhaseUpdateInput, actorEmail: string): Promise<AnnualConferencePhase | undefined>;
  deletePhase(editionId: string, phaseId: string): Promise<boolean>;
  reorderPhases(editionId: string, phases: AnnualConferencePhase[], actorEmail: string): Promise<AnnualConferencePhase[]>;
  createTask(edition: AnnualConferenceEdition, input: AnnualConferenceTaskCreateInput, actorEmail: string): Promise<AnnualConferenceTask>;
  updateTask(editionId: string, taskId: string, input: AnnualConferenceTaskUpdateInput, actorEmail: string): Promise<AnnualConferenceTask | undefined>;
  updateEditionSpeakerCallStatus(editionId: string, status: 'open' | 'closed'): Promise<AnnualConferenceEdition>;
}

type Backend = 'supabase' | 'mock';

export function createAnnualConferenceRepository(c?: Context): AnnualConferenceRepository {
  let backend: Backend | null = null;

  function selectedBackend(): Backend {
    if (!backend) {
      throw new Error('Annual Conference repository must load an edition or workspace before mutating it.');
    }
    return backend;
  }

  return {
    async listEditions() {
      const editions = await listSupabaseAnnualConferenceEditions(c);
      backend = editions === null ? 'mock' : 'supabase';
      return editions ?? listMockAnnualConferenceEditions();
    },

    async getWorkspace(year) {
      const workspace = await getSupabaseAnnualConferenceWorkPlan(year, c);
      backend = workspace === null ? 'mock' : 'supabase';
      return workspace === null ? getMockAnnualConferenceWorkPlan(year) : workspace;
    },

    async createEdition(input, planningOwnerEmail) {
      if (selectedBackend() === 'supabase') {
        const edition = await createSupabaseAnnualConferenceEdition(input, planningOwnerEmail, c);
        if (!edition) throw new Error('Supabase Annual Conference storage became unavailable during the request.');
        return edition;
      }
      return createMockAnnualConferenceEdition(input, planningOwnerEmail);
    },

    async createPhase(editionId, input, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const phase = await createSupabaseAnnualConferencePhase(editionId, input, actorEmail, c);
        if (!phase) throw new Error('Supabase Annual Conference storage became unavailable during the request.');
        return phase;
      }
      return createMockAnnualConferencePhase(editionId, input, actorEmail);
    },

    async updatePhase(editionId, phaseId, input, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const phase = await updateSupabaseAnnualConferencePhase(editionId, phaseId, input, actorEmail, c);
        if (phase === null) throw new Error('Supabase Annual Conference storage became unavailable during the request.');
        return phase;
      }
      return updateMockAnnualConferencePhase(editionId, phaseId, input, actorEmail);
    },

    async deletePhase(editionId, phaseId) {
      if (selectedBackend() === 'supabase') {
        const deleted = await deleteSupabaseAnnualConferencePhase(editionId, phaseId, c);
        if (deleted === null) throw new Error('Supabase Annual Conference storage became unavailable during the request.');
        return deleted;
      }
      return deleteMockAnnualConferencePhase(editionId, phaseId);
    },

    async reorderPhases(editionId, phases, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const reordered = await reorderSupabaseAnnualConferencePhases(phases, actorEmail, c);
        if (!reordered) throw new Error('Supabase Annual Conference storage became unavailable during the request.');
        return reordered;
      }
      return reorderMockAnnualConferencePhases(editionId, phases.map((phase) => phase.id), actorEmail);
    },

    async createTask(edition, input, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const task = await createSupabaseAnnualConferenceTask(edition, input, actorEmail, c);
        if (!task) throw new Error('Supabase Annual Conference storage became unavailable during the request.');
        return task;
      }
      return createMockAnnualConferenceTask(edition, input, actorEmail);
    },

    async updateTask(editionId, taskId, input, actorEmail) {
      if (selectedBackend() === 'supabase') {
        const task = await updateSupabaseAnnualConferenceTask(editionId, taskId, input, actorEmail, c);
        if (task === null) throw new Error('Supabase Annual Conference storage became unavailable during the request.');
        return task;
      }
      return updateMockAnnualConferenceTask(editionId, taskId, input, actorEmail);
    },

    async updateEditionSpeakerCallStatus(editionId, status) {
      if (selectedBackend() === 'supabase') {
        const edition = await updateSupabaseAnnualConferenceSpeakerCallStatus(editionId, status, c);
        if (edition === null) throw new Error('Supabase Annual Conference storage became unavailable during the request.');
        if (!edition) throw new Error('Annual conference edition not found.');
        return edition;
      }
      const edition = await updateMockAnnualConferenceSpeakerCallStatus(editionId, status);
      if (!edition) throw new Error('Annual conference edition not found.');
      return edition;
    },
  };
}
