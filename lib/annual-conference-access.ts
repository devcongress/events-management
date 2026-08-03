import {
  summarizeAnnualConferenceWorkPlan,
  type AnnualConferenceEdition,
  type AnnualConferencePhase,
  type AnnualConferenceTask,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import type { AdminRole } from '@/types/supabase';

export interface AnnualConferenceActor {
  email: string | null;
  role: AdminRole;
}

export interface AnnualConferenceCapabilities {
  can_create_tasks: boolean;
  can_manage_phases: boolean;
  can_edit_all_tasks: boolean;
  can_edit_assigned_tasks: boolean;
  can_update_assigned_task_status: boolean;
  access_scope: 'all' | 'assigned';
  task_creator_email: string;
}

export interface AnnualConferenceWorkspace {
  edition: AnnualConferenceEdition;
  phases: AnnualConferencePhase[];
  tasks: AnnualConferenceTask[];
}

export type AnnualConferenceApiAdmission = 'member' | 'organizer' | 'owner';

export function annualConferenceRolesForAdmission(admission: AnnualConferenceApiAdmission): AdminRole[] {
  if (admission === 'member') return ['owner', 'organizer', 'volunteer'];
  if (admission === 'owner') return ['owner'];
  return ['owner', 'organizer'];
}

function normalizedIdentity(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function isAnnualConferenceTaskAssignedTo(
  task: Pick<AnnualConferenceTask, 'accountable_owner' | 'collaborators'>,
  email: string | null | undefined,
): boolean {
  const identity = normalizedIdentity(email);
  if (!identity) return false;

  return normalizedIdentity(task.accountable_owner) === identity
    || task.collaborators.some((collaborator) => normalizedIdentity(collaborator) === identity);
}

export function canEditAnnualConferenceTask(
  task: Pick<AnnualConferenceTask, 'accountable_owner' | 'collaborators'>,
  memberEmail: string | null | undefined,
  planningOwnerEmail: string | null | undefined,
): boolean {
  const memberIdentity = normalizedIdentity(memberEmail);
  if (!memberIdentity) return false;

  return memberIdentity === normalizedIdentity(planningOwnerEmail)
    || isAnnualConferenceTaskAssignedTo(task, memberEmail);
}

export function annualConferenceTasksForMember(
  tasks: AnnualConferenceTask[],
  role: AdminRole,
  email: string | null | undefined,
): AnnualConferenceTask[] {
  if (role !== 'volunteer') return tasks;

  return tasks
    .filter((task) => isAnnualConferenceTaskAssignedTo(task, email))
    .map((task) => ({
      ...task,
      internal_note: null,
    }));
}

export function volunteerCanUpdateAssignedTask(
  task: Pick<AnnualConferenceTask, 'accountable_owner' | 'collaborators'>,
  input: AnnualConferenceTaskUpdateInput,
  email: string | null | undefined,
): boolean {
  return isAnnualConferenceTaskAssignedTo(task, email)
    && Object.keys(input).length === 1
    && input.status !== undefined;
}

export function annualConferenceCapabilities(
  actor: AnnualConferenceActor,
  edition: Pick<AnnualConferenceEdition, 'task_creator_email'>,
): AnnualConferenceCapabilities {
  const volunteerAccess = actor.role === 'volunteer';
  const planningOwner = normalizedIdentity(actor.email) === normalizedIdentity(edition.task_creator_email);
  const canManagePlanning = !volunteerAccess && planningOwner;

  return {
    can_create_tasks: canManagePlanning,
    can_manage_phases: canManagePlanning,
    can_edit_all_tasks: canManagePlanning,
    can_edit_assigned_tasks: !volunteerAccess,
    can_update_assigned_task_status: volunteerAccess,
    access_scope: volunteerAccess ? 'assigned' : 'all',
    task_creator_email: edition.task_creator_email,
  };
}

export function presentAnnualConferenceTask(
  task: AnnualConferenceTask,
  actor: AnnualConferenceActor,
): AnnualConferenceTask {
  return actor.role === 'volunteer' ? { ...task, internal_note: null } : task;
}

export function presentAnnualConferenceWorkspace(
  workspace: AnnualConferenceWorkspace,
  actor: AnnualConferenceActor,
) {
  const tasks = annualConferenceTasksForMember(workspace.tasks, actor.role, actor.email);
  return {
    ...workspace,
    tasks,
    summary: summarizeAnnualConferenceWorkPlan(tasks),
    permissions: annualConferenceCapabilities(actor, workspace.edition),
  };
}

export function canCreateAnnualConferenceEdition(
  actor: AnnualConferenceActor,
  latestEdition: Pick<AnnualConferenceEdition, 'task_creator_email'>,
): boolean {
  return actor.role !== 'volunteer'
    && normalizedIdentity(actor.email) === normalizedIdentity(latestEdition.task_creator_email);
}

export function canManageAnnualConferencePhases(
  actor: AnnualConferenceActor,
  edition: Pick<AnnualConferenceEdition, 'task_creator_email'>,
): boolean {
  return annualConferenceCapabilities(actor, edition).can_manage_phases;
}

export function canCreateAnnualConferenceTasks(
  actor: AnnualConferenceActor,
  edition: Pick<AnnualConferenceEdition, 'task_creator_email'>,
): boolean {
  return annualConferenceCapabilities(actor, edition).can_create_tasks;
}

export function canUpdateAnnualConferenceTask(
  actor: AnnualConferenceActor,
  edition: Pick<AnnualConferenceEdition, 'task_creator_email'>,
  task: Pick<AnnualConferenceTask, 'accountable_owner' | 'collaborators'>,
  changes: AnnualConferenceTaskUpdateInput,
): boolean {
  if (actor.role === 'volunteer') {
    return volunteerCanUpdateAssignedTask(task, changes, actor.email);
  }
  return canEditAnnualConferenceTask(task, actor.email, edition.task_creator_email);
}
