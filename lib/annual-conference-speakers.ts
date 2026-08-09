import crypto from 'crypto';
import { readData, updateData } from '@/lib/mock-db';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { generateId, now } from '@/lib/utils';
import type { ArchiveItemKind, SpeakerSubmissionStatus } from '@/types';
import type { Database } from '@/types/supabase';

const SUBMISSIONS_FILE = 'annual-conference-speaker-submissions';
const LINKS_FILE = 'annual-conference-speaker-intake-links';
const SESSIONS_FILE = 'annual-conference-sessions';
const TOKEN_BYTES = 32;

export interface AnnualConferenceSpeakerSubmission {
  id: string;
  edition_id: string;
  kind: ArchiveItemKind;
  speaker_name: string;
  speaker_email: string;
  github_username: string | null;
  title: string;
  topic: string;
  abstract: string | null;
  bio: string | null;
  status: SpeakerSubmissionStatus;
  internal_note: string | null;
  selected_intake_link_id: string | null;
  selected_session_id: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceSpeakerIntakeLink {
  id: string;
  edition_id: string;
  speaker_submission_id: string | null;
  kind: ArchiveItemKind;
  speaker_name: string | null;
  speaker_email: string | null;
  talk_title: string | null;
  email_status: 'pending' | 'accepted' | 'failed' | null;
  email_provider_id: string | null;
  email_idempotency_key: string | null;
  email_sent_at: string | null;
  email_last_attempt_at: string | null;
  email_last_error: string | null;
  token_hash: string;
  expires_at: string;
  claim_id: string | null;
  claimed_at: string | null;
  used_at: string | null;
  used_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceSession {
  id: string;
  edition_id: string;
  speaker_submission_id: string | null;
  kind: ArchiveItemKind;
  speaker_name: string;
  speaker_email: string;
  github_username: string | null;
  title: string;
  topic: string;
  abstract: string | null;
  bio: string | null;
  slides_url: string | null;
  status: 'confirmed' | 'archived';
  created_at: string;
  updated_at: string;
}

type SubmissionRow = Database['public']['Tables']['annual_conference_speaker_submissions']['Row'];
type LinkRow = Database['public']['Tables']['annual_conference_speaker_intake_links']['Row'];
type SessionRow = Database['public']['Tables']['annual_conference_sessions']['Row'];

function kind(value: string): ArchiveItemKind {
  return value === 'product_demo' ? 'product_demo' : 'talk';
}

function status(value: string): SpeakerSubmissionStatus {
  return value === 'selected' || value === 'not_selected' || value === 'withdrawn' ? value : 'submitted';
}

function submissionFromRow(row: SubmissionRow): AnnualConferenceSpeakerSubmission {
  return { ...row, kind: kind(row.kind), status: status(row.status) };
}

function linkFromRow(row: LinkRow): AnnualConferenceSpeakerIntakeLink {
  return { ...row, kind: kind(row.kind) };
}

function sessionFromRow(row: SessionRow): AnnualConferenceSession {
  return { ...row, kind: kind(row.kind), status: row.status === 'archived' ? 'archived' : 'confirmed' };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function getAnnualConferenceSpeakerSubmissions(editionId: string): Promise<AnnualConferenceSpeakerSubmission[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_submissions')
      .select('*').eq('edition_id', editionId).order('created_at', { ascending: false });
    if (error) throw new Error('Unable to load conference speaker proposals.');
    return (data ?? []).map(submissionFromRow);
  }
  return (await readData<AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE))
    .filter((submission) => submission.edition_id === editionId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getAnnualConferenceSpeakerSubmission(id: string): Promise<AnnualConferenceSpeakerSubmission | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_submissions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('Unable to load conference speaker proposal.');
    return data ? submissionFromRow(data) : undefined;
  }
  return (await readData<AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE)).find((submission) => submission.id === id);
}

export async function createAnnualConferenceSpeakerSubmission(input: Omit<AnnualConferenceSpeakerSubmission, 'id' | 'status' | 'internal_note' | 'selected_intake_link_id' | 'selected_session_id' | 'decided_at' | 'created_at' | 'updated_at'>): Promise<AnnualConferenceSpeakerSubmission> {
  const createdAt = now();
  const submission: AnnualConferenceSpeakerSubmission = {
    ...input, id: generateId(), kind: kind(input.kind), status: 'submitted', internal_note: null,
    selected_intake_link_id: null, selected_session_id: null, decided_at: null, created_at: createdAt, updated_at: createdAt,
  };
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_submissions').insert(submission).select('*').single();
    if (error?.code === '23505') throw new Error('This conference proposal has already been submitted.');
    if (error || !data) throw new Error('Unable to save conference proposal.');
    return submissionFromRow(data);
  }
  return updateData<AnnualConferenceSpeakerSubmission, AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE, (items) => {
    const duplicate = items.some((item) => item.edition_id === submission.edition_id && item.kind === submission.kind
      && item.speaker_email.toLowerCase() === submission.speaker_email.toLowerCase()
      && item.title.trim().toLowerCase() === submission.title.trim().toLowerCase() && item.status !== 'withdrawn');
    if (duplicate) throw new Error('This conference proposal has already been submitted.');
    return { data: [...items, submission], result: submission };
  });
}

export async function updateAnnualConferenceSpeakerSubmission(id: string, updates: Partial<Pick<AnnualConferenceSpeakerSubmission, 'status' | 'internal_note' | 'selected_intake_link_id' | 'selected_session_id'>>): Promise<AnnualConferenceSpeakerSubmission> {
  const decidedAt = updates.status === 'selected' || updates.status === 'not_selected' ? now() : undefined;
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_submissions')
      .update({ ...updates, decided_at: decidedAt, updated_at: now() }).eq('id', id).select('*').single();
    if (error || !data) throw new Error('Unable to update conference proposal.');
    return submissionFromRow(data);
  }
  return updateData<AnnualConferenceSpeakerSubmission, AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE, (items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Conference proposal not found.');
    const updated = { ...items[index], ...updates, decided_at: decidedAt ?? items[index].decided_at, updated_at: now() };
    const next = [...items]; next[index] = updated;
    return { data: next, result: updated };
  });
}

export async function createAnnualConferenceSpeakerIntakeLink(input: Pick<AnnualConferenceSpeakerIntakeLink, 'edition_id' | 'speaker_submission_id' | 'kind' | 'speaker_name' | 'speaker_email' | 'talk_title' | 'expires_at'>): Promise<{ link: AnnualConferenceSpeakerIntakeLink; token: string }> {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const createdAt = now();
  const link: AnnualConferenceSpeakerIntakeLink = {
    ...input, id: generateId(), kind: kind(input.kind), token_hash: hashToken(token), claim_id: null, claimed_at: null,
    email_status: null, email_provider_id: null, email_idempotency_key: null, email_sent_at: null,
    email_last_attempt_at: null, email_last_error: null, used_at: null, used_session_id: null, created_at: createdAt, updated_at: createdAt,
  };
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_intake_links').insert(link).select('*').single();
    if (error || !data) throw new Error('Unable to create conference presenter link.');
    return { link: linkFromRow(data), token };
  }
  await updateData<AnnualConferenceSpeakerIntakeLink, null>(LINKS_FILE, (items) => ({ data: [...items, link], result: null }));
  return { link, token };
}

export async function getAnnualConferenceSpeakerIntakeLink(editionId: string, token: string): Promise<AnnualConferenceSpeakerIntakeLink | undefined> {
  const tokenHash = hashToken(token);
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_intake_links')
      .select('*').eq('edition_id', editionId).eq('token_hash', tokenHash).maybeSingle();
    if (error) throw new Error('Unable to load conference presenter link.');
    return data ? linkFromRow(data) : undefined;
  }
  return (await readData<AnnualConferenceSpeakerIntakeLink>(LINKS_FILE)).find((link) => link.edition_id === editionId && link.token_hash === tokenHash);
}

export async function claimAnnualConferenceSpeakerIntakeLink(editionId: string, token: string): Promise<{ link: AnnualConferenceSpeakerIntakeLink; claimId: string }> {
  const link = await getAnnualConferenceSpeakerIntakeLink(editionId, token);
  if (!link || link.used_at || new Date(link.expires_at).getTime() <= Date.now()) throw new Error('This presenter link is no longer available.');
  const claimId = generateId();
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_intake_links')
      .update({ claim_id: claimId, claimed_at: now() }).eq('id', link.id).is('claim_id', null).is('used_at', null).gt('expires_at', now()).select('*').maybeSingle();
    if (error || !data) throw new Error('This presenter link is already being submitted.');
    return { link: linkFromRow(data), claimId };
  }
  const claimed = await updateData<AnnualConferenceSpeakerIntakeLink, AnnualConferenceSpeakerIntakeLink | undefined>(LINKS_FILE, (items) => {
    const index = items.findIndex((item) => item.id === link.id && !item.claim_id && !item.used_at);
    if (index < 0) return { data: items, result: undefined };
    const next = [...items]; next[index] = { ...next[index], claim_id: claimId, claimed_at: now(), updated_at: now() };
    return { data: next, result: next[index] };
  });
  if (!claimed) throw new Error('This presenter link is already being submitted.');
  return { link: claimed, claimId };
}

export async function releaseAnnualConferenceSpeakerIntakeClaim(editionId: string, token: string, claimId: string | null): Promise<void> {
  if (!claimId) return;
  const link = await getAnnualConferenceSpeakerIntakeLink(editionId, token);
  if (!link || link.claim_id !== claimId) return;
  if (isSupabaseRuntimeEnabled()) {
    await getSupabaseAdminClient().from('annual_conference_speaker_intake_links').update({ claim_id: null, claimed_at: null }).eq('id', link.id).eq('claim_id', claimId);
    return;
  }
  await updateData<AnnualConferenceSpeakerIntakeLink, null>(LINKS_FILE, (items) => ({ data: items.map((item) => item.id === link.id && item.claim_id === claimId ? { ...item, claim_id: null, claimed_at: null, updated_at: now() } : item), result: null }));
}

export async function createAnnualConferenceSession(input: Omit<AnnualConferenceSession, 'id' | 'status' | 'created_at' | 'updated_at'>): Promise<AnnualConferenceSession> {
  const createdAt = now();
  const session: AnnualConferenceSession = { ...input, id: generateId(), kind: kind(input.kind), status: 'confirmed', created_at: createdAt, updated_at: createdAt };
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_sessions').insert(session).select('*').single();
    if (error || !data) throw new Error('Unable to create conference session.');
    return sessionFromRow(data);
  }
  await updateData<AnnualConferenceSession, null>(SESSIONS_FILE, (items) => ({ data: [...items, session], result: null }));
  return session;
}

export async function consumeAnnualConferenceSpeakerIntakeLink(editionId: string, token: string, sessionId: string, claimId: string): Promise<void> {
  const link = await getAnnualConferenceSpeakerIntakeLink(editionId, token);
  if (!link || link.claim_id !== claimId || link.used_at) throw new Error('This presenter link is no longer available.');
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_intake_links')
      .update({ used_at: now(), used_session_id: sessionId, claim_id: null, claimed_at: null })
      .eq('id', link.id).eq('claim_id', claimId).is('used_at', null).select('id').maybeSingle();
    if (error || !data) throw new Error('This presenter link is no longer available.');
    return;
  }
  await updateData<AnnualConferenceSpeakerIntakeLink, null>(LINKS_FILE, (items) => ({ data: items.map((item) => item.id === link.id && item.claim_id === claimId ? { ...item, used_at: now(), used_session_id: sessionId, claim_id: null, claimed_at: null, updated_at: now() } : item), result: null }));
}
