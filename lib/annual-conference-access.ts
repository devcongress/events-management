import {
  summarizeAnnualConferenceWorkPlan,
  type AnnualConferenceEdition,
  type AnnualConferencePhase,
  type AnnualConferenceTask,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import type { AdminRole } from '@/types/supabase';
import {
  effectiveAnnualConferenceCapabilities,
  hasAnnualConferenceCapability,
  type AnnualConferenceCapability,
} from '@/lib/annual-conference-capabilities';

export interface AnnualConferenceActor {
  email: string | null;
  role: AdminRole;
  granted_capabilities?: AnnualConferenceCapability[];
}

export interface AnnualConferenceCapabilities {
  can_create_tasks: boolean;
  can_manage_phases: boolean;
  can_edit_all_tasks: boolean;
  can_edit_assigned_tasks: boolean;
  can_update_assigned_task_status: boolean;
  access_scope: 'all' | 'assigned';
  task_creator_email: string;
  capabilities: AnnualConferenceCapability[];
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
  actor: AnnualConferenceActor,
  capabilities: readonly AnnualConferenceCapability[],
): AnnualConferenceTask[] {
  const canViewAll = actor.role !== 'volunteer'
    || hasAnnualConferenceCapability(capabilities, 'work_plan.view_all')
    || hasAnnualConferenceCapability(capabilities, 'work_plan.manage')
    || hasAnnualConferenceCapability(capabilities, 'timeline.view')
    || hasAnnualConferenceCapability(capabilities, 'phases.manage');
  const canViewInternalNotes = actor.role !== 'volunteer'
    || hasAnnualConferenceCapability(capabilities, 'work_plan.manage');

  return tasks
    .filter((task) => canViewAll || isAnnualConferenceTaskAssignedTo(task, actor.email))
    .map((task) => canViewInternalNotes ? task : { ...task, internal_note: null });
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
  const planningOwner = normalizedIdentity(actor.email) === normalizedIdentity(edition.task_creator_email);
  const capabilities = effectiveAnnualConferenceCapabilities({
    role: actor.role,
    grants: actor.granted_capabilities,
    isPlanningOwner: actor.role !== 'volunteer' && planningOwner,
  });
  const canManageTasks = hasAnnualConferenceCapability(capabilities, 'work_plan.manage');
  const canViewAll = hasAnnualConferenceCapability(capabilities, 'work_plan.view_all')
    || canManageTasks
    || hasAnnualConferenceCapability(capabilities, 'timeline.view')
    || hasAnnualConferenceCapability(capabilities, 'phases.manage');

  return {
    can_create_tasks: canManageTasks,
    can_manage_phases: hasAnnualConferenceCapability(capabilities, 'phases.manage'),
    can_edit_all_tasks: canManageTasks,
    can_edit_assigned_tasks: actor.role !== 'volunteer',
    can_update_assigned_task_status: actor.role === 'volunteer' && !canManageTasks,
    access_scope: canViewAll ? 'all' : 'assigned',
    task_creator_email: edition.task_creator_email,
    capabilities,
  };
}

export function presentAnnualConferenceTask(
  task: AnnualConferenceTask,
  actor: AnnualConferenceActor,
): AnnualConferenceTask {
  const capabilities = effectiveAnnualConferenceCapabilities({ role: actor.role, grants: actor.granted_capabilities });
  return actor.role === 'volunteer' && !hasAnnualConferenceCapability(capabilities, 'work_plan.manage')
    ? { ...task, internal_note: null }
    : task;
}

export function presentAnnualConferenceWorkspace(
  workspace: AnnualConferenceWorkspace,
  actor: AnnualConferenceActor,
) {
  const permissions = annualConferenceCapabilities(actor, workspace.edition);
  const tasks = annualConferenceTasksForMember(workspace.tasks, actor, permissions.capabilities);
  return {
    ...workspace,
    tasks,
    summary: summarizeAnnualConferenceWorkPlan(tasks),
    permissions,
  };
}

export function canCreateAnnualConferenceEdition(
  actor: AnnualConferenceActor,
  latestEdition: Pick<AnnualConferenceEdition, 'task_creator_email'>,
): boolean {
  return (actor.role === 'owner' && Boolean(normalizedIdentity(actor.email)))
    || (actor.role === 'organizer'
      && normalizedIdentity(actor.email) === normalizedIdentity(latestEdition.task_creator_email));
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
  const capabilities = annualConferenceCapabilities(actor, edition);
  if (capabilities.can_edit_all_tasks) return Boolean(normalizedIdentity(actor.email));
  if (actor.role === 'volunteer') {
    return volunteerCanUpdateAssignedTask(task, changes, actor.email);
  }
  return canEditAnnualConferenceTask(task, actor.email, edition.task_creator_email);
}
