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
import { hasMockDataFile, readData, updateData, writeData } from '@/lib/mock-db';
import { deleteMockAnnualConferenceTaskResources } from '@/lib/mock-db/annual-conference-task-resources';
import { generateId, now } from '@/lib/utils';

const FILE = 'annual-conference-tasks';
const EDITIONS_FILE = 'annual-conference-editions';
const PHASES_FILE = 'annual-conference-phases';
const LEGACY_2026_ASSIGNMENT_EMAILS = new Map([
  ['angela', 'angelateyvi@gmail.com'],
  ['dede', 'blossomddb@gmail.com'],
  ['ernest', 'essienernest.kojoowusu@gmail.com'],
  ['philipa', 'abenabennett@gmail.com'],
]);

function canonical2026Assignment(value: string): string {
  return LEGACY_2026_ASSIGNMENT_EMAILS.get(value.trim().toLowerCase()) ?? value;
}

function seededTasks(tasks: AnnualConferenceTask[]): AnnualConferenceTask[] {
  return tasks.map((task) => {
    const is2026ConferenceTask = task.edition_id === ANNUAL_CONFERENCE_2026_EDITION.id;

    return {
      ...task,
      board_entered_at: task.board_entered_at ?? null,
      phase_id: task.phase_id ?? null,
      accountable_owner: task.accountable_owner && is2026ConferenceTask
        ? canonical2026Assignment(task.accountable_owner)
        : task.accountable_owner,
      collaborators: task.collaborators.map((collaborator) => (
        is2026ConferenceTask ? canonical2026Assignment(collaborator) : collaborator
      )),
      dependency_task_ids: [...(task.dependency_task_ids ?? [])],
    };
  });
}

async function ensureMockTaskStore(): Promise<AnnualConferenceTask[]> {
  const stored = await readData<AnnualConferenceTask>(FILE);

  if (stored.length > 0 || await hasMockDataFile(FILE)) return seededTasks(stored);

  const initial = seededTasks(ANNUAL_CONFERENCE_2026_SEED_TASKS);

  await writeData(FILE, initial);

  return initial;
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
    tasks: (await ensureMockTaskStore()).filter((task) => task.edition_id === edition.id),
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
      year: input.year,
      name: input.name,
      label: input.label,
      speaker_call_status: 'closed',
      speaker_logistics_deadline: null,
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

export async function updateMockAnnualConferenceSpeakerCallStatus(
  editionId: string,
  speakerCallStatus: 'open' | 'closed',
): Promise<AnnualConferenceEdition | undefined> {
  return updateData<AnnualConferenceEdition, AnnualConferenceEdition | undefined>(EDITIONS_FILE, (current) => {
    const editions = current.some((edition) => edition.id === ANNUAL_CONFERENCE_2026_EDITION.id)
      ? current
      : [ANNUAL_CONFERENCE_2026_EDITION, ...current];
    const index = editions.findIndex((edition) => edition.id === editionId);

    if (index < 0) return { data: editions, result: undefined };
    const next = [...editions];

    next[index] = { ...next[index], speaker_call_status: speakerCallStatus, updated_at: now() };

    return { data: next, result: next[index] };
  });
}

export async function updateMockAnnualConferenceSpeakerLogisticsDeadline(
  editionId: string,
  deadline: string | null,
): Promise<AnnualConferenceEdition | undefined> {
  return updateData<AnnualConferenceEdition, AnnualConferenceEdition | undefined>(EDITIONS_FILE, (current) => {
    const editions = current.some((edition) => edition.id === ANNUAL_CONFERENCE_2026_EDITION.id)
      ? current
      : [ANNUAL_CONFERENCE_2026_EDITION, ...current];
    const index = editions.findIndex((edition) => edition.id === editionId);

    if (index < 0) return { data: editions, result: undefined };
    const next = [...editions];

    next[index] = { ...next[index], speaker_logistics_deadline: deadline, updated_at: now() };

    return { data: next, result: next[index] };
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
  await ensureMockTaskStore();
  const deleted = await updateData<AnnualConferencePhase, boolean>(PHASES_FILE, (current) => {
    const phases = current.length > 0 ? current : ANNUAL_CONFERENCE_2026_PHASES;
    const next = phases.filter((phase) => phase.edition_id !== editionId || phase.id !== phaseId);

    return { data: next, result: next.length !== phases.length };
  });

  if (deleted) {
    await updateData<AnnualConferenceTask, null>(FILE, (current) => ({
      data: (() => {
        const timestamp = now();

        return seededTasks(current).map((task) => task.phase_id === phaseId
          ? { ...task, phase_id: null, board_entered_at: timestamp, updated_at: timestamp }
          : task);
      })(),
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
  await ensureMockTaskStore();

  return updateData<AnnualConferenceTask, AnnualConferenceTask>(FILE, (current) => {
    const tasks = seededTasks(current);
    const timestamp = now();
    const status = input.status ?? 'not_started';
    const task: AnnualConferenceTask = {
      id: generateId(),
      edition_id: edition.id,
      title: input.title,
      details: input.details ?? null,
      details_format: input.details_format ?? 'plain_text',
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
      board_entered_at: timestamp,
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
  await ensureMockTaskStore();

  return updateData<AnnualConferenceTask, AnnualConferenceTask | undefined>(FILE, (current) => {
    const tasks = seededTasks(current);
    const index = tasks.findIndex((task) => task.edition_id === editionId && task.id === taskId);

    if (index === -1) return { data: tasks, result: undefined };

    const timestamp = now();
    const statusChanged = 'status' in input && input.status !== tasks[index].status;
    const phaseChanged = 'phase_id' in input && input.phase_id !== tasks[index].phase_id;
    const task: AnnualConferenceTask = {
      ...tasks[index],
      ...input,
      ...('details' in input ? { details_format: input.details_format ?? 'plain_text' } : {}),
      collaborators: input.collaborators ? [...input.collaborators] : tasks[index].collaborators,
      dependency_task_ids: input.dependency_task_ids
        ? [...input.dependency_task_ids]
        : [...tasks[index].dependency_task_ids],
      board_entered_at: statusChanged || phaseChanged ? timestamp : tasks[index].board_entered_at ?? null,
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

export async function deleteMockAnnualConferenceTask(
  editionId: string,
  taskId: string,
): Promise<boolean> {
  await ensureMockTaskStore();
  const deleted = await updateData<AnnualConferenceTask, boolean>(FILE, (current) => {
    const tasks = seededTasks(current);
    const exists = tasks.some((task) => task.edition_id === editionId && task.id === taskId);

    if (!exists) return { data: tasks, result: false };

    return {
      data: tasks
        .filter((task) => task.edition_id !== editionId || task.id !== taskId)
        .map((task) => ({
          ...task,
          dependency_task_ids: task.dependency_task_ids.filter((dependencyId) => dependencyId !== taskId),
        })),
      result: true,
    };
  });

  if (deleted) await deleteMockAnnualConferenceTaskResources(taskId);

  return deleted;
}

export async function moveMockAnnualConferencePhaseTasks(
  editionId: string,
  sourcePhaseId: string,
  destinationPhaseId: string,
  taskIds: string[],
  actorEmail: string,
): Promise<number> {
  await ensureMockTaskStore();
  const ids = new Set(taskIds);

  return updateData<AnnualConferenceTask, number>(FILE, (current) => {
    const tasks = seededTasks(current);
    const timestamp = now();
    let moved = 0;
    const data = tasks.map((task) => {
      if (
        task.edition_id !== editionId
        || task.phase_id !== sourcePhaseId
        || task.status === 'done'
        || !ids.has(task.id)
      ) return task;

      moved += 1;

      return {
        ...task,
        phase_id: destinationPhaseId,
        board_entered_at: timestamp,
        updated_by_email: actorEmail,
        updated_at: timestamp,
      };
    });

    return { data, result: moved };
  });
}
