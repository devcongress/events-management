import {
  ANNUAL_CONFERENCE_WORKSTREAMS,
  calculateAnnualConferenceHealth,
  filterAnnualConferenceTasksByPhase,
  summarizeAnnualConferenceWorkPlan,
  type AnnualConferenceHealthSnapshot,
  type AnnualConferencePhase,
  type AnnualConferenceTask,
  type AnnualConferenceTaskStatus,
  type AnnualConferenceWorkPlanSummary,
  type AnnualConferenceWorkstream,
} from '@/lib/annual-conference-work-plan';

export interface AnnualConferenceWorkstreamProjection {
  workstream: AnnualConferenceWorkstream;
  total: number;
  done: number;
  blocked: number;
  unassigned: number;
  completion_percent: number;
}

export interface AnnualConferenceScopeProjection {
  tasks: AnnualConferenceTask[];
  summary: AnnualConferenceWorkPlanSummary;
  health: AnnualConferenceHealthSnapshot;
  status_counts: Record<AnnualConferenceTaskStatus, number>;
  owners: string[];
  workstreams: AnnualConferenceWorkstreamProjection[];
  planning_gaps: AnnualConferenceTask[];
  unclassified_count: number;
  undated_count: number;
  selected_phase: AnnualConferencePhase | null;
  current_phase: AnnualConferencePhase | null;
  next_phase: AnnualConferencePhase | null;
}

export interface AnnualConferenceReadModel {
  phases: AnnualConferencePhase[];
  project(input: { phaseScope: string; today: string }): AnnualConferenceScopeProjection;
}

export function createAnnualConferenceReadModel(input: {
  phases: AnnualConferencePhase[];
  tasks: AnnualConferenceTask[];
}): AnnualConferenceReadModel {
  const phases = [...input.phases].sort(
    (left, right) => left.sort_order - right.sort_order || left.starts_on.localeCompare(right.starts_on),
  );

  return {
    phases,
    project({ phaseScope, today }) {
      const tasks = filterAnnualConferenceTasksByPhase(input.tasks, phaseScope);
      const statusCounts: Record<AnnualConferenceTaskStatus, number> = {
        not_started: 0,
        in_progress: 0,
        blocked: 0,
        done: 0,
      };
      const owners = new Set<string>();
      const planningGaps: AnnualConferenceTask[] = [];
      const workstreamCounts = Object.fromEntries(
        ANNUAL_CONFERENCE_WORKSTREAMS.map((workstream) => [workstream, {
          total: 0,
          done: 0,
          blocked: 0,
          unassigned: 0,
        }]),
      ) as Record<AnnualConferenceWorkstream, {
        total: number;
        done: number;
        blocked: number;
        unassigned: number;
      }>;
      let unclassifiedCount = 0;
      let undatedCount = 0;

      for (const task of tasks) {
        statusCounts[task.status] += 1;
        if (task.accountable_owner) owners.add(task.accountable_owner);
        if (!task.phase_id) unclassifiedCount += 1;
        if (!task.target_date) undatedCount += 1;
        if (!task.phase_id || !task.target_date) planningGaps.push(task);
        const workstream = workstreamCounts[task.workstream];
        workstream.total += 1;
        if (task.status === 'done') workstream.done += 1;
        if (task.status === 'blocked') workstream.blocked += 1;
        if (!task.accountable_owner) workstream.unassigned += 1;
      }

      const workstreams = ANNUAL_CONFERENCE_WORKSTREAMS.map((workstream) => {
        const counts = workstreamCounts[workstream];
        return {
          workstream,
          total: counts.total,
          done: counts.done,
          blocked: counts.blocked,
          unassigned: counts.unassigned,
          completion_percent: counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100),
        };
      }).filter((workstream) => workstream.total > 0);

      return {
        tasks,
        summary: summarizeAnnualConferenceWorkPlan(tasks),
        health: calculateAnnualConferenceHealth(tasks, phases, today),
        status_counts: statusCounts,
        owners: [...owners].sort((left, right) => left.localeCompare(right)),
        workstreams,
        planning_gaps: planningGaps,
        unclassified_count: unclassifiedCount,
        undated_count: undatedCount,
        selected_phase: phases.find((phase) => phase.id === phaseScope) ?? null,
        current_phase: phases.find((phase) => today >= phase.starts_on && today <= phase.ends_on) ?? null,
        next_phase: phases.find((phase) => phase.starts_on > today) ?? null,
      };
    },
  };
}
