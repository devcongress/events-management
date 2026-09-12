import type { Context } from 'hono';
import type { ProjectNightRecurrenceRow } from '@/types/supabase';
import { getSupabaseAdminClient } from './server';

export type ProjectNightRecurrence = ProjectNightRecurrenceRow;

export async function getProjectNightRecurrence(c: Context): Promise<ProjectNightRecurrence | null> {
  const client = getSupabaseAdminClient(c);
  const { data, error } = await client.from('project_night_recurrence').select('*').eq('id', true).maybeSingle();

  if (error) throw new Error('Unable to load Project Night recurrence. Apply the recurrence migration first.');

  return data;
}

export async function configureProjectNight(eventId: string, action: 'enable' | 'pause' | 'skip', c: Context) {
  const client = getSupabaseAdminClient(c);
  const { data, error } = await client.rpc('configure_project_night', { p_event_id: eventId, p_action: action });

  if (error) throw new Error('Unable to update recurrence. The template must be a Thursday Project Night in Africa/Accra.');

  return data;
}

export async function advanceProjectNight(c: Context): Promise<string | null> {
  const client = getSupabaseAdminClient(c);
  const { data, error } = await client.rpc('advance_project_night');

  if (error) throw new Error('Unable to advance Project Night recurrence.');

  return data;
}
