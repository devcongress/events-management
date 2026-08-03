import {
  annualConferenceOwnershipNeedsActiveOrganizerLookup,
  validateAnnualConferencePhaseDates,
  validateAnnualConferenceTaskOwnership,
  validateAnnualConferenceTaskSchedule,
  type AnnualConferenceEditionCreateInput,
  type AnnualConferencePhaseCreateInput,
  type AnnualConferencePhaseUpdateInput,
  type AnnualConferenceTaskCreateInput,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import {
  canCreateAnnualConferenceEdition,
  canCreateAnnualConferenceTasks,
  canManageAnnualConferencePhases,
  canUpdateAnnualConferenceTask,
  presentAnnualConferenceTask,
  presentAnnualConferenceWorkspace,
  type AnnualConferenceActor,
} from '@/lib/annual-conference-access';
import type { AnnualConferenceRepository } from '@/server/annual-conference-repository';

export type AnnualConferenceErrorCode =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'dependency_unavailable';

export class AnnualConferenceServiceError extends Error {
  constructor(readonly code: AnnualConferenceErrorCode, message: string) {
    super(message);
    this.name = 'AnnualConferenceServiceError';
  }
}

export function annualConferenceErrorStatus(error: AnnualConferenceServiceError): 400 | 403 | 404 | 409 | 500 {
  if (error.code === 'forbidden') return 403;
  if (error.code === 'not_found') return 404;
  if (error.code === 'conflict') return 409;
  if (error.code === 'dependency_unavailable') return 500;
  return 400;
}

export interface AnnualConferenceAuditEvent {
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export interface AnnualConferenceServiceDependencies {
  repository: AnnualConferenceRepository;
  actor: AnnualConferenceActor;
  activeOrganizerEmails(): Promise<string[] | null>;
  audit(event: AnnualConferenceAuditEvent): Promise<void>;
}

export function createAnnualConferenceService(dependencies: AnnualConferenceServiceDependencies) {
  const { repository, actor } = dependencies;

  async function workspace(year: number) {
    const value = await repository.getWorkspace(year);
    if (!value) {
      throw new AnnualConferenceServiceError('not_found', `Annual conference ${year} was not found.`);
    }
    return value;
  }

  function actorEmail(fallback: string): string {
    return actor.email ?? fallback;
  }

  async function verifiedOrganizerEmails(message: string): Promise<string[]> {
    const emails = await dependencies.activeOrganizerEmails();
    if (!emails) throw new AnnualConferenceServiceError('dependency_unavailable', message);
    return emails;
  }

  return {
    async listEditions() {
      return repository.listEditions();
    },

    async getWorkspace(year: number) {
      return presentAnnualConferenceWorkspace(await workspace(year), actor);
    },

    async createEdition(input: AnnualConferenceEditionCreateInput) {
      const editions = await repository.listEditions();
      const latestEdition = editions[0];
      if (!latestEdition || !canCreateAnnualConferenceEdition(actor, latestEdition)) {
        throw new AnnualConferenceServiceError(
          'forbidden',
          'Only the current annual-conference planning owner can create the next edition.',
        );
      }
      if (editions.some((edition) => edition.year === input.year)) {
        throw new AnnualConferenceServiceError('conflict', `Annual conference ${input.year} already exists.`);
      }
      if (input.year <= latestEdition.year) {
        throw new AnnualConferenceServiceError(
          'invalid_input',
          `The next edition year must be after ${latestEdition.year}.`,
        );
      }

      const planningOwnerEmail = input.task_creator_email ?? latestEdition.task_creator_email;
      if (input.task_creator_email) {
        const emails = await verifiedOrganizerEmails('Unable to verify the selected planning owner.');
        if (!emails.map((email) => email.trim().toLowerCase()).includes(planningOwnerEmail)) {
          throw new AnnualConferenceServiceError(
            'invalid_input',
            'The selected planning owner must be an active organizer.',
          );
        }
      }

      const edition = await repository.createEdition(input, planningOwnerEmail);
      await dependencies.audit({
        action: 'annual_conference.edition.create',
        targetType: 'annual_conference_edition',
        targetId: edition.id,
        metadata: { year: edition.year, task_creator_email: edition.task_creator_email },
      });
      return edition;
    },

    async createPhase(year: number, input: AnnualConferencePhaseCreateInput) {
      const plan = await workspace(year);
      if (!canManageAnnualConferencePhases(actor, plan.edition) || !actor.email) {
        throw new AnnualConferenceServiceError('forbidden', 'Only this edition’s planning owner can manage phases.');
      }
      const dateError = validateAnnualConferencePhaseDates(input, plan.phases);
      if (dateError) throw new AnnualConferenceServiceError('invalid_input', dateError);
      const phase = await repository.createPhase(plan.edition.id, input, actor.email);
      await dependencies.audit({
        action: 'annual_conference.phase.create',
        targetType: 'annual_conference_phase',
        targetId: phase.id,
        metadata: { edition_year: year, name: phase.name },
      });
      return phase;
    },

    async reorderPhases(year: number, phaseIds: string[]) {
      const plan = await workspace(year);
      if (!canManageAnnualConferencePhases(actor, plan.edition) || !actor.email) {
        throw new AnnualConferenceServiceError('forbidden', 'Only this edition’s planning owner can manage phases.');
      }
      const uniqueIds = new Set(phaseIds);
      if (uniqueIds.size !== plan.phases.length || plan.phases.some((phase) => !uniqueIds.has(phase.id))) {
        throw new AnnualConferenceServiceError('invalid_input', 'Phase order must contain every phase exactly once.');
      }
      const phaseById = new Map(plan.phases.map((phase) => [phase.id, phase]));
      const phases = await repository.reorderPhases(
        plan.edition.id,
        phaseIds.map((id) => phaseById.get(id)!),
        actor.email,
      );
      await dependencies.audit({
        action: 'annual_conference.phase.reorder',
        targetType: 'annual_conference_edition',
        targetId: plan.edition.id,
        metadata: { edition_year: year, phase_ids: phaseIds },
      });
      return { phases };
    },

    async updatePhase(year: number, phaseId: string, input: AnnualConferencePhaseUpdateInput) {
      const plan = await workspace(year);
      if (!canManageAnnualConferencePhases(actor, plan.edition) || !actor.email) {
        throw new AnnualConferenceServiceError('forbidden', 'Only this edition’s planning owner can manage phases.');
      }
      const existing = plan.phases.find((phase) => phase.id === phaseId);
      if (!existing) throw new AnnualConferenceServiceError('not_found', 'Annual conference phase was not found.');
      const proposed = {
        starts_on: input.starts_on ?? existing.starts_on,
        ends_on: input.ends_on ?? existing.ends_on,
      };
      const dateError = validateAnnualConferencePhaseDates(proposed, plan.phases, existing.id);
      if (dateError) throw new AnnualConferenceServiceError('invalid_input', dateError);
      if (plan.tasks.some((task) => task.phase_id === existing.id && task.target_date && task.target_date > proposed.ends_on)) {
        throw new AnnualConferenceServiceError(
          'invalid_input',
          'Phase end date cannot be earlier than an assigned task target date.',
        );
      }
      const phase = await repository.updatePhase(plan.edition.id, existing.id, input, actor.email);
      if (!phase) throw new AnnualConferenceServiceError('not_found', 'Annual conference phase was not found.');
      await dependencies.audit({
        action: 'annual_conference.phase.update',
        targetType: 'annual_conference_phase',
        targetId: phase.id,
        metadata: { edition_year: year, changed_fields: Object.keys(input) },
      });
      return phase;
    },

    async deletePhase(year: number, phaseId: string) {
      const plan = await workspace(year);
      if (!canManageAnnualConferencePhases(actor, plan.edition)) {
        throw new AnnualConferenceServiceError('forbidden', 'Only this edition’s planning owner can manage phases.');
      }
      const phase = plan.phases.find((item) => item.id === phaseId);
      if (!phase) throw new AnnualConferenceServiceError('not_found', 'Annual conference phase was not found.');
      const deleted = await repository.deletePhase(plan.edition.id, phase.id);
      if (!deleted) throw new AnnualConferenceServiceError('not_found', 'Annual conference phase was not found.');
      await dependencies.audit({
        action: 'annual_conference.phase.delete',
        targetType: 'annual_conference_phase',
        targetId: phase.id,
        metadata: { edition_year: year, name: phase.name },
      });
      return {
        deleted: true as const,
        tasks_unassigned: plan.tasks.filter((task) => task.phase_id === phase.id).length,
      };
    },

    async createTask(year: number, input: AnnualConferenceTaskCreateInput) {
      const plan = await workspace(year);
      if (!canCreateAnnualConferenceTasks(actor, plan.edition) || !actor.email) {
        throw new AnnualConferenceServiceError(
          'forbidden',
          'Only this edition’s planning owner can add annual conference tasks.',
        );
      }
      const scheduleError = validateAnnualConferenceTaskSchedule(input, plan.phases);
      if (scheduleError) throw new AnnualConferenceServiceError('invalid_input', scheduleError);
      const emails = await verifiedOrganizerEmails(
        'Unable to verify active organizers before assigning task ownership. Please try again.',
      );
      const ownership = validateAnnualConferenceTaskOwnership(input, emails);
      if (!ownership.ok) throw new AnnualConferenceServiceError('invalid_input', ownership.error);
      const task = await repository.createTask(plan.edition, ownership.value, actor.email);
      await dependencies.audit({
        action: 'annual_conference.task.create',
        targetType: 'annual_conference_task',
        targetId: task.id,
        metadata: {
          edition_year: year,
          title: task.title,
          workstream: task.workstream,
          accountable_owner: task.accountable_owner,
        },
      });
      return presentAnnualConferenceTask(task, actor);
    },

    async updateTask(year: number, taskId: string, input: AnnualConferenceTaskUpdateInput) {
      const plan = await workspace(year);
      const existing = plan.tasks.find((task) => task.id === taskId);
      if (!existing) throw new AnnualConferenceServiceError('not_found', 'Annual conference task was not found.');
      if (!canUpdateAnnualConferenceTask(actor, plan.edition, existing, input)) {
        const message = actor.role === 'volunteer'
          ? 'Volunteers can only update the status of tasks assigned to them.'
          : 'Only the planning owner or a task owner/collaborator can edit this task.';
        throw new AnnualConferenceServiceError('forbidden', message);
      }

      if (actor.role === 'volunteer') {
        const task = await repository.updateTask(
          plan.edition.id,
          taskId,
          { status: input.status },
          actorEmail('conference-volunteer'),
        );
        if (!task) throw new AnnualConferenceServiceError('not_found', 'Annual conference task was not found.');
        await dependencies.audit({
          action: 'annual_conference.task.status_update',
          targetType: 'annual_conference_task',
          targetId: task.id,
          metadata: { edition_year: year, status: task.status },
        });
        return presentAnnualConferenceTask(task, actor);
      }

      let activeOrganizerEmails: string[] = [];
      if (annualConferenceOwnershipNeedsActiveOrganizerLookup(input, existing)) {
        activeOrganizerEmails = await verifiedOrganizerEmails(
          'Unable to verify active organizers before assigning task ownership. Please try again.',
        );
      }
      const ownership = validateAnnualConferenceTaskOwnership(input, activeOrganizerEmails, existing);
      if (!ownership.ok) throw new AnnualConferenceServiceError('invalid_input', ownership.error);
      const proposedSchedule = {
        phase_id: 'phase_id' in input ? input.phase_id : existing.phase_id,
        target_date: 'target_date' in input ? input.target_date : existing.target_date,
      };
      const scheduleError = validateAnnualConferenceTaskSchedule(proposedSchedule, plan.phases);
      if (scheduleError) throw new AnnualConferenceServiceError('invalid_input', scheduleError);
      const task = await repository.updateTask(
        plan.edition.id,
        taskId,
        ownership.value,
        actorEmail('local-organizer'),
      );
      if (!task) throw new AnnualConferenceServiceError('not_found', 'Annual conference task was not found.');
      await dependencies.audit({
        action: 'annual_conference.task.update',
        targetType: 'annual_conference_task',
        targetId: task.id,
        metadata: { edition_year: year, title: task.title, changed_fields: Object.keys(ownership.value) },
      });
      return presentAnnualConferenceTask(task, actor);
    },
  };
}

export type AnnualConferenceService = ReturnType<typeof createAnnualConferenceService>;
