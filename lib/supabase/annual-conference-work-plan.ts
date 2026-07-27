import type { Context } from 'hono';
import type {
  AnnualConferenceEdition,
  AnnualConferenceTask,
  AnnualConferenceTaskCreateInput,
  AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

type EditionRow = Database['public']['Tables']['annual_conference_editions']['Row'];
type TaskRow = Database['public']['Tables']['annual_conference_tasks']['Row'];
type TaskInsert = Database['public']['Tables']['annual_conference_tasks']['Insert'];
type TaskUpdate = Database['public']['Tables']['annual_conference_tasks']['Update'];

export interface AnnualConferenceWorkPlanStoreResult {
  edition: AnnualConferenceEdition;
  tasks: AnnualConferenceTask[];
}

function toEdition(row: EditionRow): AnnualConferenceEdition {
  return row;
}

function toTask(row: TaskRow): AnnualConferenceTask {
  return row;
}

export async function getSupabaseAnnualConferenceWorkPlan(
  year: number,
  c?: Context,
): Promise<AnnualConferenceWorkPlanStoreResult | null | undefined> {
  if (!isSupabaseServerConfigured(c)) return null;

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

  return {
    edition: toEdition(editionResult.data),
    tasks: taskResult.data.map(toTask),
  };
}

export async function createSupabaseAnnualConferenceTask(
  edition: AnnualConferenceEdition,
  input: AnnualConferenceTaskCreateInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferenceTask | null> {
  if (!isSupabaseServerConfigured(c)) return null;

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
  if (!isSupabaseServerConfigured(c)) return null;

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
