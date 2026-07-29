import { readData, updateData } from './index';
import type { ArchiveItemKind, SpeakerSubmission, SpeakerSubmissionStatus } from '@/types';
import type { Database } from '@/types/supabase';
import { generateId, now } from '@/lib/utils';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';

const FILE = 'speaker-submissions';
type SpeakerSubmissionRow = Database['public']['Tables']['speaker_submissions']['Row'];

function normalizeArchiveItemKind(value: SpeakerSubmission['kind']): ArchiveItemKind {
  return value === 'product_demo' ? 'product_demo' : 'talk';
}

function normalizeSpeakerSubmission(submission: SpeakerSubmission): SpeakerSubmission {
  return {
    ...submission,
    kind: normalizeArchiveItemKind(submission.kind),
  };
}

function fromSupabaseRow(row: SpeakerSubmissionRow): SpeakerSubmission {
  return normalizeSpeakerSubmission({
    ...row,
    kind: row.kind === 'product_demo' ? 'product_demo' : 'talk',
    status: (
      row.status === 'selected'
      || row.status === 'not_selected'
      || row.status === 'withdrawn'
    ) ? row.status : 'submitted',
  });
}

export async function getSpeakerSubmissionsByEvent(eventId: string): Promise<SpeakerSubmission[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('speaker_submissions')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error) throw new Error('Unable to load presentation proposals');
    return (data ?? []).map(fromSupabaseRow);
  }

  const submissions = await readData<SpeakerSubmission>(FILE);
  return submissions
    .map(normalizeSpeakerSubmission)
    .filter((submission) => submission.event_id === eventId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getSpeakerSubmissionById(id: string): Promise<SpeakerSubmission | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient()
      .from('speaker_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error('Unable to load presentation proposal');
    return data ? fromSupabaseRow(data) : undefined;
  }

  const submissions = await readData<SpeakerSubmission>(FILE);
  const submission = submissions.find((item) => item.id === id);
  return submission ? normalizeSpeakerSubmission(submission) : undefined;
}

export async function createSpeakerSubmission(
  data: Omit<
    SpeakerSubmission,
    | 'id'
    | 'status'
    | 'internal_note'
    | 'selected_intake_link_id'
    | 'selected_talk_id'
    | 'decided_at'
    | 'created_at'
    | 'updated_at'
  >,
): Promise<SpeakerSubmission> {
  const createdAt = now();
  const submission: SpeakerSubmission = {
    ...data,
    id: generateId(),
    kind: normalizeArchiveItemKind(data.kind),
    status: 'submitted',
    internal_note: null,
    selected_intake_link_id: null,
    selected_talk_id: null,
    decided_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  if (isSupabaseRuntimeEnabled()) {
    const { data: stored, error } = await getSupabaseAdminClient()
      .from('speaker_submissions')
      .insert({
        id: submission.id,
        event_id: submission.event_id,
        kind: normalizeArchiveItemKind(submission.kind),
        speaker_name: submission.speaker_name,
        speaker_email: submission.speaker_email,
        github_username: submission.github_username,
        title: submission.title,
        topic: submission.topic,
        abstract: submission.abstract,
        bio: submission.bio,
        status: submission.status,
        internal_note: submission.internal_note,
        selected_intake_link_id: submission.selected_intake_link_id,
        selected_talk_id: submission.selected_talk_id,
        decided_at: submission.decided_at,
        created_at: submission.created_at,
        updated_at: submission.updated_at,
      })
      .select('*')
      .single();

    if (error?.code === '23505') {
      throw new Error('This archive proposal has already been submitted for this event');
    }
    if (error || !stored) throw new Error('Unable to create presentation proposal');
    return fromSupabaseRow(stored);
  }

  await updateData<SpeakerSubmission, SpeakerSubmission>(FILE, (submissions) => {
    const normalizedSubmissions = submissions.map(normalizeSpeakerSubmission);
    const duplicate = normalizedSubmissions.find((item) => (
      item.event_id === submission.event_id
      && normalizeArchiveItemKind(item.kind) === normalizeArchiveItemKind(submission.kind)
      && item.speaker_email.toLowerCase() === submission.speaker_email.toLowerCase()
      && item.title.trim().toLowerCase() === submission.title.trim().toLowerCase()
      && item.status !== 'withdrawn'
    ));

    if (duplicate) {
      throw new Error('This archive proposal has already been submitted for this event');
    }

    return {
      data: [...normalizedSubmissions, submission],
      result: submission,
    };
  });

  return submission;
}

export async function updateSpeakerSubmission(
  id: string,
  updates: Partial<Omit<SpeakerSubmission, 'id' | 'created_at'>>,
): Promise<SpeakerSubmission> {
  if (isSupabaseRuntimeEnabled()) {
    const existing = await getSpeakerSubmissionById(id);
    if (!existing) throw new Error(`Speaker submission ${id} not found`);

    const statusChanged = updates.status && updates.status !== existing.status;
    const changes: Database['public']['Tables']['speaker_submissions']['Update'] = {
      ...updates,
      kind: updates.kind ? normalizeArchiveItemKind(updates.kind) : undefined,
      decided_at: statusChanged && isDecisionStatus(updates.status)
        ? now()
        : updates.decided_at ?? existing.decided_at,
      updated_at: now(),
    };
    const { data, error } = await getSupabaseAdminClient()
      .from('speaker_submissions')
      .update(changes)
      .eq('id', id)
      .select('*')
      .single();

    if (error?.code === '23505') {
      throw new Error('This archive proposal has already been submitted for this event');
    }
    if (error || !data) throw new Error('Unable to update presentation proposal');
    return fromSupabaseRow(data);
  }

  return updateData<SpeakerSubmission, SpeakerSubmission>(FILE, (submissions) => {
    const normalizedSubmissions = submissions.map(normalizeSpeakerSubmission);
    const index = normalizedSubmissions.findIndex((submission) => submission.id === id);

    if (index === -1) {
      throw new Error(`Speaker submission ${id} not found`);
    }

    const statusChanged = updates.status && updates.status !== normalizedSubmissions[index].status;
    const next: SpeakerSubmission = {
      ...normalizedSubmissions[index],
      ...updates,
      kind: normalizeArchiveItemKind(updates.kind ?? normalizedSubmissions[index].kind),
      decided_at: statusChanged && isDecisionStatus(updates.status) ? now() : updates.decided_at ?? normalizedSubmissions[index].decided_at,
      updated_at: now(),
    };

    const nextSubmissions = [...normalizedSubmissions];
    nextSubmissions[index] = next;

    return {
      data: nextSubmissions,
      result: next,
    };
  });
}

function isDecisionStatus(status: SpeakerSubmissionStatus | undefined): boolean {
  return status === 'selected' || status === 'not_selected';
}
