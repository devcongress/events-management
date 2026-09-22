import type { AnnualConferencePhase, AnnualConferenceTask } from '@/lib/annual-conference-work-plan';

export const ANNUAL_CONFERENCE_CARRY_OVER_STATUSES = ['not_started', 'in_progress', 'blocked'] as const;

export function dueAnnualConferencePhaseRollovers(
  phases: AnnualConferencePhase[],
  tasks: AnnualConferenceTask[],
  today: string,
) {
  const ordered = [...phases].sort((left, right) => (
    left.sort_order - right.sort_order || left.starts_on.localeCompare(right.starts_on) || left.id.localeCompare(right.id)
  ));

  return ordered.flatMap((source, index) => {
    const destination = ordered[index + 1];

    if (!destination || today < destination.starts_on) return [];

    const carryOverTasks = tasks.filter((task) => (
      task.phase_id === source.id
      && task.status !== 'done'
    ));

    if (!carryOverTasks.length) return [];

    return [{ source, destination, tasks: carryOverTasks }];
  });
}
