import type { Context } from 'hono';
import {
  AnnualConferenceTaskResourceLimitError,
  normalizeTaskResourceActorEmail,
  type AnnualConferenceTaskResource,
  type AnnualConferenceTaskResourceCreateInput,
  type AnnualConferenceTaskResourceUpdateInput,
} from '@/lib/annual-conference-task-resources';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

const RESOURCE_LIMIT_ERROR = 'annual_conference_task_resource_limit';

function resourceTable(c?: Context) {
  return getSupabaseAdminClient(c).from('annual_conference_task_resources');
}

export async function listSupabaseAnnualConferenceTaskResources(
  taskId: string,
  c?: Context,
): Promise<AnnualConferenceTaskResource[] | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const { data, error } = await resourceTable(c)
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

export async function createSupabaseAnnualConferenceTaskResource(
  taskId: string,
  input: AnnualConferenceTaskResourceCreateInput,
  actorEmail: string,
  c?: Context,
): Promise<AnnualConferenceTaskResource | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  const normalizedActor = normalizeTaskResourceActorEmail(actorEmail);
  const { data, error } = await resourceTable(c)
    .insert({
      task_id: taskId,
      url: input.url,
      label: input.label ?? null,
      created_by_email: normalizedActor,
      updated_by_email: normalizedActor,
    })
    .select('*')
    .single();
  if (error) {
    if (error.message.includes(RESOURCE_LIMIT_ERROR)) throw new AnnualConferenceTaskResourceLimitError();
    throw new Error(error.message);
  }
  return data;
}

export async function updateSupabaseAnnualConferenceTaskResource(
  taskId: string,
  resourceId: string,
  input: AnnualConferenceTaskResourceUpdateInput,
  actorEmail: string,
  creatorEmailConstraint?: string,
  c?: Context,
): Promise<AnnualConferenceTaskResource | null | undefined> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  let query = resourceTable(c)
    .update({ ...input, updated_by_email: normalizeTaskResourceActorEmail(actorEmail) })
    .eq('task_id', taskId)
    .eq('id', resourceId);
  if (creatorEmailConstraint) {
    query = query.eq('created_by_email', normalizeTaskResourceActorEmail(creatorEmailConstraint));
  }
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? undefined;
}

export async function deleteSupabaseAnnualConferenceTaskResource(
  taskId: string,
  resourceId: string,
  creatorEmailConstraint?: string,
  c?: Context,
): Promise<boolean | null> {
  if (!isSupabaseRuntimeEnabled(c)) return null;
  let query = resourceTable(c).delete().eq('task_id', taskId).eq('id', resourceId);
  if (creatorEmailConstraint) {
    query = query.eq('created_by_email', normalizeTaskResourceActorEmail(creatorEmailConstraint));
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}
