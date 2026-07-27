import {
  ANNUAL_CONFERENCE_2026_EDITION,
  ANNUAL_CONFERENCE_2026_SEED_TASKS,
  type AnnualConferenceEdition,
  type AnnualConferenceTask,
  type AnnualConferenceTaskCreateInput,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import { readData, updateData } from '@/lib/mock-db';
import { generateId, now } from '@/lib/utils';

const FILE = 'annual-conference-tasks';

function seededTasks(tasks: AnnualConferenceTask[]): AnnualConferenceTask[] {
  const source = tasks.length > 0 ? tasks : ANNUAL_CONFERENCE_2026_SEED_TASKS;
  return source.map((task) => ({
    ...task,
    collaborators: [...task.collaborators],
  }));
}

export async function getMockAnnualConferenceWorkPlan(
  year: number,
): Promise<{ edition: AnnualConferenceEdition; tasks: AnnualConferenceTask[] } | undefined> {
  if (year !== ANNUAL_CONFERENCE_2026_EDITION.year) return undefined;

  return {
    edition: { ...ANNUAL_CONFERENCE_2026_EDITION },
    tasks: seededTasks(await readData<AnnualConferenceTask>(FILE)),
  };
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
      internal_note: input.internal_note ?? null,
      workstream: input.workstream,
      accountable_owner: input.accountable_owner,
      collaborators: input.collaborators ?? [],
      priority: input.priority ?? null,
      target_date: input.target_date ?? null,
      status,
      dependency_note: input.dependency_note ?? null,
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
