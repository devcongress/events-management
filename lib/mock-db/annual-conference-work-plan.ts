import {
  ANNUAL_CONFERENCE_2026_EDITION,
  ANNUAL_CONFERENCE_2026_PHASES,
  ANNUAL_CONFERENCE_2026_SEED_TASKS,
  type AnnualConferenceEdition,
  type AnnualConferenceEditionCreateInput,
  type AnnualConferencePhase,
  type AnnualConferencePhaseCreateInput,
  type AnnualConferencePhaseUpdateInput,
  type AnnualConferenceTask,
  type AnnualConferenceTaskCreateInput,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import { readData, updateData } from '@/lib/mock-db';
import { generateId, now } from '@/lib/utils';

const FILE = 'annual-conference-tasks';
const EDITIONS_FILE = 'annual-conference-editions';
const PHASES_FILE = 'annual-conference-phases';

function seededTasks(tasks: AnnualConferenceTask[]): AnnualConferenceTask[] {
  const source = tasks.length > 0 ? tasks : ANNUAL_CONFERENCE_2026_SEED_TASKS;
  return source.map((task) => ({
    ...task,
    phase_id: task.phase_id ?? null,
    collaborators: [...task.collaborators],
    dependency_task_ids: [...(task.dependency_task_ids ?? [])],
  }));
}

export async function getMockAnnualConferenceWorkPlan(
  year: number,
): Promise<{ edition: AnnualConferenceEdition; phases: AnnualConferencePhase[]; tasks: AnnualConferenceTask[] } | undefined> {
  const editions = await listMockAnnualConferenceEditions();
  const edition = editions.find((item) => item.year === year);
  if (!edition) return undefined;
  const storedPhases = await readData<AnnualConferencePhase>(PHASES_FILE);
  const phases = storedPhases.length > 0 ? storedPhases : ANNUAL_CONFERENCE_2026_PHASES;

  return {
    edition: { ...edition },
    phases: phases.filter((phase) => phase.edition_id === edition.id).map((phase) => ({ ...phase })),
    tasks: seededTasks(await readData<AnnualConferenceTask>(FILE)).filter((task) => task.edition_id === edition.id),
  };
}

export async function listMockAnnualConferenceEditions(): Promise<AnnualConferenceEdition[]> {
  const stored = await readData<AnnualConferenceEdition>(EDITIONS_FILE);
  const editions = stored.some((edition) => edition.id === ANNUAL_CONFERENCE_2026_EDITION.id)
    ? stored
    : [ANNUAL_CONFERENCE_2026_EDITION, ...stored];
  return editions.map((edition) => ({ ...edition })).sort((a, b) => b.year - a.year);
}

export async function createMockAnnualConferenceEdition(
  input: AnnualConferenceEditionCreateInput,
  taskCreatorEmail: string,
): Promise<AnnualConferenceEdition> {
  return updateData<AnnualConferenceEdition, AnnualConferenceEdition>(EDITIONS_FILE, (current) => {
    const timestamp = now();
    const edition: AnnualConferenceEdition = {
      id: generateId(),
      conference_event_id: generateId(),
      year: input.year,
      name: input.name,
      label: input.label,
      provisional_date: input.provisional_date,
      date_status: 'provisional',
      venue_note: null,
      keynote_note: null,
      task_creator_email: taskCreatorEmail,
      created_at: timestamp,
      updated_at: timestamp,
    };
    return { data: [...current, edition], result: edition };
  });
}

export async function createMockAnnualConferencePhase(
  editionId: string,
  input: AnnualConferencePhaseCreateInput,
  actorEmail: string,
): Promise<AnnualConferencePhase> {
  return updateData<AnnualConferencePhase, AnnualConferencePhase>(PHASES_FILE, (current) => {
    const phases = current.length > 0 ? current : ANNUAL_CONFERENCE_2026_PHASES;
    const timestamp = now();
    const editionPhases = phases.filter((phase) => phase.edition_id === editionId);
    const phase: AnnualConferencePhase = {
      id: generateId(),
      edition_id: editionId,
      name: input.name,
      starts_on: input.starts_on,
      ends_on: input.ends_on,
      sort_order: Math.max(0, ...editionPhases.map((item) => item.sort_order)) + 1,
      created_by_email: actorEmail,
      updated_by_email: actorEmail,
      created_at: timestamp,
      updated_at: timestamp,
    };
    return { data: [...phases, phase], result: phase };
  });
}

export async function updateMockAnnualConferencePhase(
  editionId: string,
  phaseId: string,
  input: AnnualConferencePhaseUpdateInput,
  actorEmail: string,
): Promise<AnnualConferencePhase | undefined> {
  return updateData<AnnualConferencePhase, AnnualConferencePhase | undefined>(PHASES_FILE, (current) => {
    const phases = current.length > 0 ? current : ANNUAL_CONFERENCE_2026_PHASES;
    const index = phases.findIndex((phase) => phase.edition_id === editionId && phase.id === phaseId);
    if (index === -1) return { data: phases, result: undefined };
    const updated = { ...phases[index], ...input, updated_by_email: actorEmail, updated_at: now() };
    phases[index] = updated;
    return { data: phases, result: updated };
  });
}

export async function deleteMockAnnualConferencePhase(
  editionId: string,
  phaseId: string,
): Promise<boolean> {
  const deleted = await updateData<AnnualConferencePhase, boolean>(PHASES_FILE, (current) => {
    const phases = current.length > 0 ? current : ANNUAL_CONFERENCE_2026_PHASES;
    const next = phases.filter((phase) => phase.edition_id !== editionId || phase.id !== phaseId);
    return { data: next, result: next.length !== phases.length };
  });
  if (deleted) {
    await updateData<AnnualConferenceTask, null>(FILE, (current) => ({
      data: seededTasks(current).map((task) => task.phase_id === phaseId ? { ...task, phase_id: null } : task),
      result: null,
    }));
  }
  return deleted;
}

export async function reorderMockAnnualConferencePhases(
  editionId: string,
  phaseIds: string[],
  actorEmail: string,
): Promise<AnnualConferencePhase[]> {
  return updateData<AnnualConferencePhase, AnnualConferencePhase[]>(PHASES_FILE, (current) => {
    const phases = current.length > 0 ? current : ANNUAL_CONFERENCE_2026_PHASES;
    const timestamp = now();
    const order = new Map(phaseIds.map((id, index) => [id, index + 1]));
    const next = phases.map((phase) => phase.edition_id === editionId && order.has(phase.id)
      ? { ...phase, sort_order: order.get(phase.id)!, updated_by_email: actorEmail, updated_at: timestamp }
      : phase);
    return {
      data: next,
      result: next.filter((phase) => phase.edition_id === editionId)
        .sort((left, right) => left.sort_order - right.sort_order),
    };
  });
}

export async function createMockAnnualConferenceTask(
  edition: AnnualConferenceEdition,
  input: AnnualConferenceTaskCreateInput,
  actorEmail: string,
): Promise<AnnualConferenceTask> {
  return updateData<AnnualConferenceTask, AnnualConferenceTask>(FILE, (current) => {
    const tasks = seededTasks(current);
    const timestamp = now();
    const status = input.status ?? 'not_started';
    const task: AnnualConferenceTask = {
      id: generateId(),
      edition_id: edition.id,
      title: input.title,
      details: input.details ?? null,
      internal_note: null,
      phase_id: input.phase_id ?? null,
      workstream: input.workstream,
      accountable_owner: input.accountable_owner,
      collaborators: input.collaborators ?? [],
      priority: input.priority ?? null,
      target_date: input.target_date ?? null,
      status,
      dependency_task_ids: [...(input.dependency_task_ids ?? [])],
      dependency_note: null,
      source: 'manual',
      source_row: null,
      sort_order: Math.max(0, ...tasks.map((item) => item.sort_order)) + 1,
      created_by_email: actorEmail,
      updated_by_email: actorEmail,
      completed_at: status === 'done' ? timestamp : null,
      created_at: timestamp,
      updated_at: timestamp,
    };

    return {
      data: [...tasks, task],
      result: task,
    };
  });
}

export async function updateMockAnnualConferenceTask(
  editionId: string,
  taskId: string,
  input: AnnualConferenceTaskUpdateInput,
  actorEmail: string,
): Promise<AnnualConferenceTask | undefined> {
  return updateData<AnnualConferenceTask, AnnualConferenceTask | undefined>(FILE, (current) => {
    const tasks = seededTasks(current);
    const index = tasks.findIndex((task) => task.edition_id === editionId && task.id === taskId);
    if (index === -1) return { data: tasks, result: undefined };

    const timestamp = now();
    const task: AnnualConferenceTask = {
      ...tasks[index],
      ...input,
      collaborators: input.collaborators ? [...input.collaborators] : tasks[index].collaborators,
      dependency_task_ids: input.dependency_task_ids
        ? [...input.dependency_task_ids]
        : [...tasks[index].dependency_task_ids],
      updated_by_email: actorEmail,
      updated_at: timestamp,
      completed_at: 'status' in input
        ? input.status === 'done' ? timestamp : null
        : tasks[index].completed_at,
    };
    tasks[index] = task;

    return {
      data: tasks,
      result: task,
    };
  });
}
