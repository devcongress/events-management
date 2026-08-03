import type { Context } from 'hono';
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
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

type EditionRow = Database['public']['Tables']['annual_conference_editions']['Row'];
type EditionInsert = Database['public']['Tables']['annual_conference_editions']['Insert'];
type PhaseRow = Database['public']['Tables']['annual_conference_phases']['Row'];
type PhaseInsert = Database['public']['Tables']['annual_conference_phases']['Insert'];
type TaskRow = Database['public']['Tables']['annual_conference_tasks']['Row'];
type TaskInsert = Database['public']['Tables']['annual_conference_tasks']['Insert'];
type TaskUpdate = Database['public']['Tables']['annual_conference_tasks']['Update'];

export interface AnnualConferenceWorkPlanStoreResult {
  edition: AnnualConferenceEdition;
  phases: AnnualConferencePhase[];
  tasks: AnnualConferenceTask[];
}

function toEdition(row: EditionRow): AnnualConferenceEdition {
  return row;
}

function toTask(row: TaskRow): AnnualConferenceTask {
  return row;
}

function toPhase(row: PhaseRow): AnnualConferencePhase {
  return row;
}

export async function listSupabaseAnnualConferenceEditions(
  c?: Context,
): Promise<AnnualConferenceEdition[] | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_editions')
    .select('*')
    .order('year', { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return result.data.map(toEdition);
}

export async function createSupabaseAnnualConferenceEdition(
  input: AnnualConferenceEditionCreateInput,
  taskCreatorEmail: string,
  c?: Context,
): Promise<AnnualConferenceEdition | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const insert: EditionInsert = {
    year: input.year,
    name: input.name,
    label: input.label,
    provisional_date: input.provisional_date,
    date_status: 'provisional',
    task_creator_email: taskCreatorEmail,
  };
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_editions')
    .insert(insert)
    .select('*')
    .single();
  if (result.error) throw new Error(result.error.message);
  return toEdition(result.data);
}

export async function getSupabaseAnnualConferenceWorkPlan(
  year: number,
  c?: Context,
): Promise<AnnualConferenceWorkPlanStoreResult | null | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const client = getSupabaseAdminClient(c);
  const editionResult = await client
    .from('annual_conference_editions')
    .select('*')
    .eq('year', year)
    .maybeSingle();

  if (editionResult.error) throw new Error(editionResult.error.message);
  if (!editionResult.data) return undefined;

  const taskResult = await client
    .from('annual_conference_tasks')
    .select('*')
    .eq('edition_id', editionResult.data.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (taskResult.error) throw new Error(taskResult.error.message);

  const phaseResult = await client
    .from('annual_conference_phases')
    .select('*')
    .eq('edition_id', editionResult.data.id)
    .order('sort_order', { ascending: true })
    .order('starts_on', { ascending: true });
  if (phaseResult.error) throw new Error(phaseResult.error.message);

  return {
    edition: toEdition(editionResult.data),
    phases: phaseResult.data.map(toPhase),
    tasks: taskResult.data.map(toTask),
  };
}

export async function createSupabaseAnnualConferencePhase(
  editionId: string,
  input: AnnualConferencePhaseCreateInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferencePhase | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const client = getSupabaseAdminClient(c);
  const latest = await client
    .from('annual_conference_phases')
    .select('sort_order')
    .eq('edition_id', editionId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error(latest.error.message);
  const insert: PhaseInsert = {
    edition_id: editionId,
    name: input.name,
    starts_on: input.starts_on,
    ends_on: input.ends_on,
    sort_order: (latest.data?.sort_order ?? 0) + 1,
    created_by_email: actorEmail,
    updated_by_email: actorEmail,
  };
  const result = await client.from('annual_conference_phases').insert(insert).select('*').single();
  if (result.error) throw new Error(result.error.message);
  return toPhase(result.data);
}

export async function updateSupabaseAnnualConferencePhase(
  editionId: string,
  phaseId: string,
  input: AnnualConferencePhaseUpdateInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferencePhase | null | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_phases')
    .update({ ...input, updated_by_email: actorEmail })
    .eq('edition_id', editionId)
    .eq('id', phaseId)
    .select('*')
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? toPhase(result.data) : undefined;
}

export async function deleteSupabaseAnnualConferencePhase(
  editionId: string,
  phaseId: string,
  c?: Context,
): Promise<boolean | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_phases')
    .delete()
    .eq('edition_id', editionId)
    .eq('id', phaseId)
    .select('id')
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}

export async function reorderSupabaseAnnualConferencePhases(
  phases: AnnualConferencePhase[],
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferencePhase[] | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const rows: PhaseInsert[] = phases.map((phase, index) => ({
    id: phase.id,
    edition_id: phase.edition_id,
    name: phase.name,
    starts_on: phase.starts_on,
    ends_on: phase.ends_on,
    sort_order: index + 1,
    created_by_email: phase.created_by_email,
    updated_by_email: actorEmail,
    created_at: phase.created_at,
  }));
  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_phases')
    .upsert(rows, { onConflict: 'id' })
    .select('*');
  if (result.error) throw new Error(result.error.message);
  return result.data.map(toPhase).sort((left, right) => left.sort_order - right.sort_order);
}

export async function createSupabaseAnnualConferenceTask(
  edition: AnnualConferenceEdition,
  input: AnnualConferenceTaskCreateInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferenceTask | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const client = getSupabaseAdminClient(c);
  const latestOrderResult = await client
    .from('annual_conference_tasks')
    .select('sort_order')
    .eq('edition_id', edition.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestOrderResult.error) throw new Error(latestOrderResult.error.message);

  const status = input.status ?? 'not_started';
  const insert: TaskInsert = {
    edition_id: edition.id,
    title: input.title,
    details: input.details ?? null,
    internal_note: input.internal_note ?? null,
    phase_id: input.phase_id ?? null,
    workstream: input.workstream,
    accountable_owner: input.accountable_owner,
    collaborators: input.collaborators ?? [],
    priority: input.priority ?? null,
    target_date: input.target_date ?? null,
    status,
    dependency_note: input.dependency_note ?? null,
    source: 'manual',
    source_row: null,
    sort_order: (latestOrderResult.data?.sort_order ?? 0) + 1,
    created_by_email: actorEmail,
    updated_by_email: actorEmail,
    completed_at: status === 'done' ? new Date().toISOString() : null,
  };

  const result = await client
    .from('annual_conference_tasks')
    .insert(insert)
    .select('*')
    .single();

  if (result.error) throw new Error(result.error.message);
  return toTask(result.data);
}

export async function updateSupabaseAnnualConferenceTask(
  editionId: string,
  taskId: string,
  input: AnnualConferenceTaskUpdateInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferenceTask | null | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return null;

  const update: TaskUpdate = {
    ...input,
    updated_by_email: actorEmail,
  };

  if ('status' in input) {
    update.completed_at = input.status === 'done' ? new Date().toISOString() : null;
  }

  const result = await getSupabaseAdminClient(c)
    .from('annual_conference_tasks')
    .update(update)
    .eq('edition_id', editionId)
    .eq('id', taskId)
    .select('*')
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  return result.data ? toTask(result.data) : undefined;
}
