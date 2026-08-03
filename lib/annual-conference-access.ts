import type { AnnualConferenceTask, AnnualConferenceTaskUpdateInput } from '@/lib/annual-conference-work-plan';
import type { AdminRole } from '@/types/supabase';

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
