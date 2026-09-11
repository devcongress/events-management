import crypto from 'crypto';
import { readData, updateData } from '@/lib/mock-db';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import { generateId, now } from '@/lib/utils';
import type { SpeakerSubmissionStatus } from '@/types';
import type { Database } from '@/types/supabase';
import type { AnnualConferenceSessionType, AnnualConferenceTopicTrack } from '@/lib/annual-conference-cfp';

const SUBMISSIONS_FILE = 'annual-conference-speaker-submissions';
const LINKS_FILE = 'annual-conference-speaker-intake-links';
const SESSIONS_FILE = 'annual-conference-sessions';
const PROFILES_FILE = 'annual-conference-speaker-profiles';
const EMAIL_WEBHOOK_EVENTS_FILE = 'annual-conference-email-webhook-events';
const TOKEN_BYTES = 32;

export type AnnualConferenceEmailKind = 'acceptance' | 'rejection';
export type AnnualConferenceEmailStatus = 'pending' | 'accepted' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'suppressed' | 'complained';

export interface AnnualConferenceSpeakerSubmission {
  id: string;
  edition_id: string;
  speaker_name: string;
  speaker_email: string;
  speaker_profile_id: string | null;
  proposal_schema_version: 1 | 2;
  title: string;
  topic: AnnualConferenceTopicTrack;
  session_type: AnnualConferenceSessionType;
  learning_outcomes: string[];
  abstract: string | null;
  bio: string | null;
  status: SpeakerSubmissionStatus;
  internal_note: string | null;
  selected_intake_link_id: string | null;
  selected_session_id: string | null;
  decision_email_kind: AnnualConferenceEmailKind | null;
  decision_email_status: AnnualConferenceEmailStatus | null;
  decision_email_recipient: string | null;
  decision_email_provider_id: string | null;
  decision_email_idempotency_key: string | null;
  decision_email_sent_at: string | null;
  decision_email_delivered_at: string | null;
  decision_email_last_attempt_at: string | null;
  decision_email_last_event_at: string | null;
  decision_email_last_error: string | null;
  decision_email_attempt_count: number;
  decision_email_retryable: boolean;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceSpeakerIntakeLink {
  id: string;
  edition_id: string;
  speaker_submission_id: string | null;
  speaker_name: string | null;
  speaker_email: string | null;
  talk_title: string | null;
  email_status: AnnualConferenceEmailStatus | null;
  email_recipient: string | null;
  email_provider_id: string | null;
  email_idempotency_key: string | null;
  email_sent_at: string | null;
  email_delivered_at: string | null;
  email_last_attempt_at: string | null;
  email_last_event_at: string | null;
  email_last_error: string | null;
  email_attempt_count: number;
  email_retryable: boolean;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  workspace_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceEmailWebhookEvent {
  webhook_event_id: string;
  provider_email_id: string;
  event_type: `email.${'delivered' | 'delivery_delayed' | 'bounced' | 'failed' | 'suppressed' | 'complained'}`;
  provider_created_at: string;
  processed_at: string;
}

export interface AnnualConferenceSession {
  id: string;
  edition_id: string;
  speaker_submission_id: string | null;
  speaker_name: string;
  speaker_email: string;
  title: string;
  topic: AnnualConferenceTopicTrack;
  session_type: AnnualConferenceSessionType;
  learning_outcomes: string[];
  abstract: string | null;
  bio: string | null;
  slides_url: string | null;
  availability_confirmed: boolean | null;
  technical_requirements: string | null;
  workshop_prerequisites: string | null;
  required_software_equipment: string | null;
  participants_need_laptops: boolean | null;
  preferred_workshop_capacity: number | null;
  logistics_updated_at: string | null;
  status: 'confirmed' | 'archived';
  created_at: string;
  updated_at: string;
}

type SubmissionRow = Database['public']['Tables']['annual_conference_speaker_submissions']['Row'];
type LinkRow = Database['public']['Tables']['annual_conference_speaker_intake_links']['Row'];
type SessionRow = Database['public']['Tables']['annual_conference_sessions']['Row'];

function status(value: string): SpeakerSubmissionStatus {
  return value === 'selected' || value === 'not_selected' || value === 'withdrawn' ? value : 'submitted';
}

function submissionFromRow(row: SubmissionRow): AnnualConferenceSpeakerSubmission {
  return {
    ...row,
    status: status(row.status),
    topic: row.topic as AnnualConferenceTopicTrack,
    session_type: row.session_type as AnnualConferenceSessionType,
    learning_outcomes: Array.isArray(row.learning_outcomes) ? row.learning_outcomes.filter((item): item is string => typeof item === 'string') : [],
  };
}

function submissionFromMock(value: AnnualConferenceSpeakerSubmission): AnnualConferenceSpeakerSubmission {
  return {
    ...value,
    speaker_profile_id: value.speaker_profile_id ?? null,
    proposal_schema_version: value.proposal_schema_version ?? 1,
    session_type: value.session_type ?? '40-minute long talk',
    learning_outcomes: value.learning_outcomes ?? [],
    decision_email_kind: value.decision_email_kind ?? null,
    decision_email_status: value.decision_email_status ?? null,
    decision_email_recipient: value.decision_email_recipient ?? null,
    decision_email_provider_id: value.decision_email_provider_id ?? null,
    decision_email_idempotency_key: value.decision_email_idempotency_key ?? null,
    decision_email_sent_at: value.decision_email_sent_at ?? null,
    decision_email_delivered_at: value.decision_email_delivered_at ?? null,
    decision_email_last_attempt_at: value.decision_email_last_attempt_at ?? null,
    decision_email_last_event_at: value.decision_email_last_event_at ?? null,
    decision_email_last_error: value.decision_email_last_error ?? null,
    decision_email_attempt_count: value.decision_email_attempt_count ?? 0,
    decision_email_retryable: value.decision_email_retryable ?? true,
  };
}

function linkFromRow(row: LinkRow): AnnualConferenceSpeakerIntakeLink {
  return row;
}

function linkFromMock(value: AnnualConferenceSpeakerIntakeLink): AnnualConferenceSpeakerIntakeLink {
  return {
    ...value,
    revoked_at: value.revoked_at ?? null,
    workspace_session_id: value.workspace_session_id ?? null,
    email_recipient: value.email_recipient ?? value.speaker_email ?? null,
    email_delivered_at: value.email_delivered_at ?? null,
    email_last_event_at: value.email_last_event_at ?? null,
    email_attempt_count: value.email_attempt_count ?? (value.email_last_attempt_at ? 1 : 0),
    email_retryable: value.email_retryable ?? true,
  };
}

function sessionFromRow(row: SessionRow): AnnualConferenceSession {
  return {
    ...row,
    status: row.status === 'archived' ? 'archived' : 'confirmed',
    topic: row.topic as AnnualConferenceTopicTrack,
    session_type: row.session_type as AnnualConferenceSessionType,
    learning_outcomes: Array.isArray(row.learning_outcomes) ? row.learning_outcomes.filter((item): item is string => typeof item === 'string') : [],
  };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function annualConferenceSpeakerWorkspaceToken(linkId: string, tokenSecret: string): string {
  return crypto.createHmac('sha256', tokenSecret).update(`annual-conference-speaker:${linkId}`).digest('base64url');
}

export function annualConferenceSpeakerWorkspaceTokenMatches(link: AnnualConferenceSpeakerIntakeLink, tokenSecret: string): boolean {
  return hashToken(annualConferenceSpeakerWorkspaceToken(link.id, tokenSecret)) === link.token_hash;
}

export async function getAnnualConferenceSpeakerSubmissions(editionId: string): Promise<AnnualConferenceSpeakerSubmission[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_submissions')
      .select('*').eq('edition_id', editionId).order('created_at', { ascending: false });

    if (error) throw new Error('Unable to load conference speaker proposals.');

    return (data ?? []).map(submissionFromRow);
  }

  return (await readData<AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE))
    .map(submissionFromMock)
    .filter((submission) => submission.edition_id === editionId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getAnnualConferenceSpeakerSubmission(id: string): Promise<AnnualConferenceSpeakerSubmission | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_submissions').select('*').eq('id', id).maybeSingle();

    if (error) throw new Error('Unable to load conference speaker proposal.');

    return data ? submissionFromRow(data) : undefined;
  }
  const submission = (await readData<AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE)).find((item) => item.id === id);

  return submission ? submissionFromMock(submission) : undefined;
}

export async function createAnnualConferenceSpeakerSubmission(input: Omit<AnnualConferenceSpeakerSubmission,
  'id' | 'speaker_profile_id' | 'proposal_schema_version' | 'status' | 'internal_note'
  | 'selected_intake_link_id' | 'selected_session_id' | 'decision_email_kind'
  | 'decision_email_status' | 'decision_email_recipient' | 'decision_email_provider_id'
  | 'decision_email_idempotency_key' | 'decision_email_sent_at' | 'decision_email_delivered_at'
  | 'decision_email_last_attempt_at' | 'decision_email_last_event_at' | 'decision_email_last_error'
  | 'decision_email_attempt_count' | 'decision_email_retryable' | 'decided_at' | 'created_at' | 'updated_at'
>): Promise<AnnualConferenceSpeakerSubmission> {
  const createdAt = now();
  let profileId: string | null = null;

  if (isSupabaseRuntimeEnabled()) {
    const { data: profile, error: profileError } = await getSupabaseAdminClient()
      .from('annual_conference_speaker_profiles')
      .upsert({ email: input.speaker_email, name: input.speaker_name, bio: input.bio ?? '' }, { onConflict: 'email_normalized' })
      .select('id')
      .single();

    if (profileError || !profile) throw new Error('Unable to save the speaker profile.');
    profileId = profile.id;
  } else {
    profileId = await updateData<{ id: string; email: string; name: string; bio: string; created_at: string; updated_at: string }, string>(PROFILES_FILE, (profiles) => {
      const index = profiles.findIndex((profile) => profile.email.trim().toLowerCase() === input.speaker_email.trim().toLowerCase());

      if (index >= 0) {
        const next = [...profiles];

        next[index] = { ...next[index], email: input.speaker_email, name: input.speaker_name, bio: input.bio ?? '', updated_at: createdAt };

        return { data: next, result: next[index].id };
      }
      const profile = { id: generateId(), email: input.speaker_email, name: input.speaker_name, bio: input.bio ?? '', created_at: createdAt, updated_at: createdAt };

      return { data: [...profiles, profile], result: profile.id };
    });
  }
  const submission: AnnualConferenceSpeakerSubmission = {
    ...input, id: generateId(), speaker_profile_id: profileId, proposal_schema_version: 2, status: 'submitted', internal_note: null,
    selected_intake_link_id: null, selected_session_id: null,
    decision_email_kind: null, decision_email_status: null, decision_email_recipient: null,
    decision_email_provider_id: null, decision_email_idempotency_key: null,
    decision_email_sent_at: null, decision_email_delivered_at: null,
    decision_email_last_attempt_at: null, decision_email_last_event_at: null,
    decision_email_last_error: null, decision_email_attempt_count: 0, decision_email_retryable: true,
    decided_at: null, created_at: createdAt, updated_at: createdAt,
  };

  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_submissions').insert(submission).select('*').single();

    if (error?.code === '23505') throw new Error('This conference proposal has already been submitted.');
    if (error || !data) throw new Error('Unable to save conference proposal.');

    return submissionFromRow(data);
  }

  return updateData<AnnualConferenceSpeakerSubmission, AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE, (items) => {
    const duplicate = items.some((item) => item.edition_id === submission.edition_id
      && item.speaker_email.toLowerCase() === submission.speaker_email.toLowerCase()
      && item.title.trim().toLowerCase() === submission.title.trim().toLowerCase() && item.status !== 'withdrawn');

    if (duplicate) throw new Error('This conference proposal has already been submitted.');

    return { data: [...items, submission], result: submission };
  });
}

type AnnualConferenceSpeakerSubmissionUpdate = Partial<Pick<AnnualConferenceSpeakerSubmission,
  'status' | 'internal_note' | 'selected_intake_link_id' | 'selected_session_id'
  | 'decision_email_kind' | 'decision_email_status' | 'decision_email_recipient'
  | 'decision_email_provider_id' | 'decision_email_idempotency_key' | 'decision_email_sent_at'
  | 'decision_email_delivered_at' | 'decision_email_last_attempt_at' | 'decision_email_last_event_at'
  | 'decision_email_last_error' | 'decision_email_attempt_count' | 'decision_email_retryable'
>>;

export async function updateAnnualConferenceSpeakerSubmission(id: string, updates: AnnualConferenceSpeakerSubmissionUpdate): Promise<AnnualConferenceSpeakerSubmission> {
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
    const next = [...items];

 next[index] = updated;

    return { data: next, result: updated };
  });
}

export async function claimAnnualConferenceDecisionEmailAttempt(input: {
  submissionId: string;
  expectedIdempotencyKey: string;
  expectedAttemptCount: number;
  allowNonRetryable?: boolean;
}): Promise<AnnualConferenceSpeakerSubmission | null> {
  const attemptedAt = now();

  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().rpc('claim_annual_conference_speaker_email_attempt', {
      p_submission_id: input.submissionId,
      p_expected_idempotency_key: input.expectedIdempotencyKey,
      p_expected_attempt_count: input.expectedAttemptCount,
      p_attempted_at: attemptedAt,
      p_allow_non_retryable: input.allowNonRetryable ?? false,
    });

    if (error) throw new Error('Unable to claim conference speaker email delivery.');
    if (data !== true) return null;

    return (await getAnnualConferenceSpeakerSubmission(input.submissionId)) ?? null;
  }

  const claimed = await updateData<AnnualConferenceSpeakerSubmission, AnnualConferenceSpeakerSubmission | null>(SUBMISSIONS_FILE, (items) => {
    const index = items.findIndex((item) => item.id === input.submissionId);

    if (index < 0) return { data: items, result: null };
    const current = submissionFromMock(items[index]);

    if (
      current.decision_email_idempotency_key !== input.expectedIdempotencyKey
      || current.decision_email_attempt_count !== input.expectedAttemptCount
      || !['pending', 'failed'].includes(current.decision_email_status ?? '')
      || (!current.decision_email_retryable && !input.allowNonRetryable)
    ) return { data: items, result: null };
    const updated: AnnualConferenceSpeakerSubmission = {
      ...current,
      decision_email_status: 'pending',
      decision_email_last_attempt_at: attemptedAt,
      decision_email_attempt_count: current.decision_email_attempt_count + 1,
      decision_email_last_error: null,
      updated_at: attemptedAt,
    };
    const next = [...items];

 next[index] = updated;

    return { data: next, result: updated };
  });

  if (claimed?.selected_intake_link_id) {
    const link = await getAnnualConferenceSpeakerIntakeLinkById(claimed.selected_intake_link_id);

    if (link?.email_idempotency_key === input.expectedIdempotencyKey) {
      await updateAnnualConferenceSpeakerIntakeLink(link.id, {
        email_status: 'pending',
        email_last_attempt_at: attemptedAt,
        email_attempt_count: link.email_attempt_count + 1,
        email_last_error: null,
      });
    }
  }

  return claimed;
}

export async function replaceAnnualConferenceDecisionEmailRecipient(input: {
  submission: AnnualConferenceSpeakerSubmission;
  recipient: string;
  idempotencyKey: string;
}): Promise<AnnualConferenceSpeakerSubmission> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().rpc('replace_annual_conference_speaker_email_recipient', {
      p_submission_id: input.submission.id,
      p_expected_idempotency_key: input.submission.decision_email_idempotency_key,
      p_expected_attempt_count: input.submission.decision_email_attempt_count,
      p_email_recipient: input.recipient,
      p_email_idempotency_key: input.idempotencyKey,
    });

    if (error) throw new Error(error.message.includes('being sent') ? error.message : 'Unable to correct the conference speaker email recipient.');
    if (data !== true) throw new Error('The email delivery changed while the address was being corrected. Refresh and try again.');
    const updated = await getAnnualConferenceSpeakerSubmission(input.submission.id);

    if (!updated) throw new Error('The email recipient was corrected, but the proposal could not be reloaded.');

    return updated;
  }

  return updateData<AnnualConferenceSpeakerSubmission, AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE, (items) => {
    const index = items.findIndex((item) => item.id === input.submission.id);

    if (index < 0) throw new Error('Conference proposal not found.');
    const current = submissionFromMock(items[index]);

    if (
      current.decision_email_idempotency_key !== input.submission.decision_email_idempotency_key
      || current.decision_email_attempt_count !== input.submission.decision_email_attempt_count
    ) throw new Error('The email delivery changed while the address was being corrected. Refresh and try again.');
    if (current.decision_email_status === 'pending' && current.decision_email_last_attempt_at
      && new Date(current.decision_email_last_attempt_at).getTime() > Date.now() - 5 * 60_000) {
      throw new Error('The conference speaker email is still being sent.');
    }
    const updated: AnnualConferenceSpeakerSubmission = {
      ...current,
      decision_email_status: 'pending', decision_email_recipient: input.recipient,
      decision_email_provider_id: null, decision_email_idempotency_key: input.idempotencyKey,
      decision_email_sent_at: null, decision_email_delivered_at: null, decision_email_last_event_at: null,
      decision_email_last_error: null, decision_email_last_attempt_at: null,
      decision_email_attempt_count: 0, decision_email_retryable: true, updated_at: now(),
    };
    const next = [...items];

 next[index] = updated;

    return { data: next, result: updated };
  });
}

export async function rejectAnnualConferenceSpeakerSubmission(id: string, internalNote: string | null): Promise<AnnualConferenceSpeakerSubmission> {
  const updatedAt = now();
  const idempotencyKey = `conference-speaker-rejected-${id}`;

  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().rpc('reject_annual_conference_speaker_proposal', {
      p_submission_id: id,
      p_email_idempotency_key: idempotencyKey,
      p_internal_note: internalNote ?? '',
    });

    if (error) throw new Error(error.message.includes('already been decided') ? error.message : 'Unable to reject conference proposal.');
    const submission = await getAnnualConferenceSpeakerSubmission(id);

    if (!submission) throw new Error('The proposal was rejected, but its email delivery needs attention.');

    return submission;
  }

  return updateData<AnnualConferenceSpeakerSubmission, AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE, (items) => {
    const index = items.findIndex((item) => item.id === id && item.status === 'submitted');

    if (index < 0) throw new Error('This conference proposal has already been decided.');
    const updated: AnnualConferenceSpeakerSubmission = {
      ...submissionFromMock(items[index]),
      status: 'not_selected',
      internal_note: internalNote,
      decision_email_kind: 'rejection',
      decision_email_status: 'pending',
      decision_email_recipient: items[index].speaker_email,
      decision_email_provider_id: null,
      decision_email_idempotency_key: idempotencyKey,
      decision_email_sent_at: null,
      decision_email_delivered_at: null,
      decision_email_last_attempt_at: null,
      decision_email_last_event_at: null,
      decision_email_last_error: null,
      decision_email_attempt_count: 0,
      decision_email_retryable: true,
      decided_at: updatedAt,
      updated_at: updatedAt,
    };
    const next = [...items];

    next[index] = updated;

    return { data: next, result: updated };
  });
}

export async function acceptAnnualConferenceSpeakerSubmission(input: {
  submission: AnnualConferenceSpeakerSubmission;
  deadline: string;
  internalNote: string | null;
  tokenSecret: string;
}): Promise<{ submission: AnnualConferenceSpeakerSubmission; session: AnnualConferenceSession; link: AnnualConferenceSpeakerIntakeLink; token: string }> {
  if (input.submission.proposal_schema_version !== 2) throw new Error('This legacy proposal is incomplete and cannot be accepted.');
  if (isSupabaseRuntimeEnabled()) {
    const sessionId = generateId();
    const linkId = generateId();
    const token = annualConferenceSpeakerWorkspaceToken(linkId, input.tokenSecret);
    const { error } = await getSupabaseAdminClient().rpc('accept_annual_conference_speaker_proposal', {
      p_submission_id: input.submission.id,
      p_session_id: sessionId,
      p_link_id: linkId,
      p_token_hash: hashToken(token),
      p_deadline: input.deadline,
      p_email_idempotency_key: `conference-speaker-accepted-${linkId}`,
      p_internal_note: input.internalNote ?? '',
    });

    if (error) throw new Error(error.message.includes('already been decided') ? error.message : 'Unable to accept conference proposal.');
    const [submission, session, link] = await Promise.all([
      getAnnualConferenceSpeakerSubmission(input.submission.id),
      getAnnualConferenceSession(sessionId),
      getAnnualConferenceSpeakerIntakeLinkById(linkId),
    ]);

    if (!submission || !session || !link) throw new Error('The proposal was accepted, but its workspace delivery needs attention.');

    return { submission, session, link, token };
  }

  let session: AnnualConferenceSession | undefined;
  let link: AnnualConferenceSpeakerIntakeLink | undefined;
  let createdLinkId: string | null = null;

  try {
    session = await createAnnualConferenceSession({
      edition_id: input.submission.edition_id,
      speaker_submission_id: input.submission.id,
      speaker_name: input.submission.speaker_name,
      speaker_email: input.submission.speaker_email,
      title: input.submission.title,
      topic: input.submission.topic,
      session_type: input.submission.session_type,
      learning_outcomes: input.submission.learning_outcomes,
      abstract: input.submission.abstract,
      bio: input.submission.bio,
      slides_url: null,
    });
    const created = await createAnnualConferenceSpeakerIntakeLink({
      edition_id: input.submission.edition_id,
      speaker_submission_id: input.submission.id,
      speaker_name: input.submission.speaker_name,
      speaker_email: input.submission.speaker_email,
      talk_title: input.submission.title,
      expires_at: input.deadline,
      workspace_session_id: session.id,
      tokenSecret: input.tokenSecret,
    });

    createdLinkId = created.link.id;
    link = await updateAnnualConferenceSpeakerIntakeLink(created.link.id, {
      email_status: 'pending',
      email_recipient: input.submission.speaker_email,
      email_idempotency_key: `conference-speaker-accepted-${created.link.id}`,
    });
    const submission = await updateAnnualConferenceSpeakerSubmission(input.submission.id, {
      status: 'selected',
      internal_note: input.internalNote,
      selected_intake_link_id: link.id,
      selected_session_id: session.id,
      decision_email_kind: 'acceptance',
      decision_email_status: 'pending',
      decision_email_recipient: input.submission.speaker_email,
      decision_email_provider_id: null,
      decision_email_idempotency_key: `conference-speaker-accepted-${created.link.id}`,
      decision_email_sent_at: null,
      decision_email_delivered_at: null,
      decision_email_last_attempt_at: null,
      decision_email_last_event_at: null,
      decision_email_last_error: null,
      decision_email_attempt_count: 0,
      decision_email_retryable: true,
    });

    return { submission, session, link, token: created.token };
  } catch (error) {
    if (createdLinkId) await deleteAnnualConferenceSpeakerIntakeLink(createdLinkId).catch(() => undefined);
    if (session) await deleteAnnualConferenceSession(session.id).catch(() => undefined);

    throw error;
  }
}

export async function createAnnualConferenceSpeakerIntakeLink(input: Pick<AnnualConferenceSpeakerIntakeLink, 'edition_id' | 'speaker_submission_id' | 'speaker_name' | 'speaker_email' | 'talk_title' | 'expires_at'> & { workspace_session_id?: string | null; tokenSecret?: string }): Promise<{ link: AnnualConferenceSpeakerIntakeLink; token: string }> {
  const id = generateId();
  const token = input.tokenSecret
    ? annualConferenceSpeakerWorkspaceToken(id, input.tokenSecret)
    : crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const createdAt = now();
  const { tokenSecret: _tokenSecret, ...linkInput } = input;
  const link: AnnualConferenceSpeakerIntakeLink = {
    ...linkInput, workspace_session_id: input.workspace_session_id ?? null, id, token_hash: hashToken(token), revoked_at: null,
    email_status: null, email_recipient: input.speaker_email ?? null, email_provider_id: null, email_idempotency_key: null,
    email_sent_at: null, email_delivered_at: null, email_last_attempt_at: null, email_last_event_at: null,
    email_last_error: null, email_attempt_count: 0, email_retryable: true, created_at: createdAt, updated_at: createdAt,
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
  const link = (await readData<AnnualConferenceSpeakerIntakeLink>(LINKS_FILE)).find((item) => item.edition_id === editionId && item.token_hash === tokenHash);

  return link ? linkFromMock(link) : undefined;
}

export async function getAnnualConferenceSpeakerIntakeLinkById(id: string): Promise<AnnualConferenceSpeakerIntakeLink | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_intake_links').select('*').eq('id', id).maybeSingle();

    if (error) throw new Error('Unable to load conference presenter link.');

    return data ? linkFromRow(data) : undefined;
  }
  const link = (await readData<AnnualConferenceSpeakerIntakeLink>(LINKS_FILE)).find((item) => item.id === id);

  return link ? linkFromMock(link) : undefined;
}

export async function createAnnualConferenceSession(
  input: Omit<AnnualConferenceSession, 'id' | 'status' | 'created_at' | 'updated_at' | 'availability_confirmed' | 'technical_requirements' | 'workshop_prerequisites' | 'required_software_equipment' | 'participants_need_laptops' | 'preferred_workshop_capacity' | 'logistics_updated_at'>
    & Partial<Pick<AnnualConferenceSession, 'availability_confirmed' | 'technical_requirements' | 'workshop_prerequisites' | 'required_software_equipment' | 'participants_need_laptops' | 'preferred_workshop_capacity' | 'logistics_updated_at'>>,
): Promise<AnnualConferenceSession> {
  const createdAt = now();
  const session: AnnualConferenceSession = {
    ...input,
    id: generateId(),
    availability_confirmed: input.availability_confirmed ?? null,
    technical_requirements: input.technical_requirements ?? null,
    workshop_prerequisites: input.workshop_prerequisites ?? null,
    required_software_equipment: input.required_software_equipment ?? null,
    participants_need_laptops: input.participants_need_laptops ?? null,
    preferred_workshop_capacity: input.preferred_workshop_capacity ?? null,
    logistics_updated_at: input.logistics_updated_at ?? null,
    status: 'confirmed',
    created_at: createdAt,
    updated_at: createdAt,
  };

  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_sessions').insert(session).select('*').single();

    if (error || !data) throw new Error('Unable to create conference session.');

    return sessionFromRow(data);
  }
  await updateData<AnnualConferenceSession, null>(SESSIONS_FILE, (items) => ({ data: [...items, session], result: null }));

  return session;
}

export async function getAnnualConferenceSession(id: string): Promise<AnnualConferenceSession | undefined> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_sessions').select('*').eq('id', id).maybeSingle();

    if (error) throw new Error('Unable to load conference session.');

    return data ? sessionFromRow(data) : undefined;
  }

  return (await readData<AnnualConferenceSession>(SESSIONS_FILE)).find((session) => session.id === id);
}

export async function updateAnnualConferenceSessionLogistics(
  id: string,
  updates: Pick<AnnualConferenceSession, 'slides_url' | 'availability_confirmed' | 'technical_requirements' | 'workshop_prerequisites' | 'required_software_equipment' | 'participants_need_laptops' | 'preferred_workshop_capacity'>,
): Promise<AnnualConferenceSession> {
  const payload = { ...updates, logistics_updated_at: now(), updated_at: now() };

  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_sessions').update(payload).eq('id', id).select('*').single();

    if (error || !data) throw new Error('Unable to save conference logistics.');

    return sessionFromRow(data);
  }

  return updateData<AnnualConferenceSession, AnnualConferenceSession>(SESSIONS_FILE, (items) => {
    const index = items.findIndex((item) => item.id === id);

    if (index < 0) throw new Error('Conference session not found.');
    const next = [...items];

    next[index] = { ...next[index], ...payload };

    return { data: next, result: next[index] };
  });
}

export async function updateAnnualConferenceSpeakerIntakeLink(
  id: string,
  updates: Partial<Pick<AnnualConferenceSpeakerIntakeLink,
    'email_status' | 'email_recipient' | 'email_provider_id' | 'email_idempotency_key'
    | 'email_sent_at' | 'email_delivered_at' | 'email_last_attempt_at' | 'email_last_event_at'
    | 'email_last_error' | 'email_attempt_count' | 'email_retryable' | 'expires_at' | 'revoked_at'
  >>,
): Promise<AnnualConferenceSpeakerIntakeLink> {
  const payload = { ...updates, updated_at: now() };

  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_intake_links').update(payload).eq('id', id).select('*').single();

    if (error || !data) throw new Error('Unable to update conference presenter link.');

    return linkFromRow(data);
  }

  return updateData<AnnualConferenceSpeakerIntakeLink, AnnualConferenceSpeakerIntakeLink>(LINKS_FILE, (items) => {
    const index = items.findIndex((item) => item.id === id);

    if (index < 0) throw new Error('Conference presenter link not found.');
    const next = [...items];

    next[index] = { ...next[index], ...payload };

    return { data: next, result: next[index] };
  });
}

export async function rotateAnnualConferenceSpeakerWorkspace(input: {
  submission: AnnualConferenceSpeakerSubmission;
  deadline: string;
  tokenSecret: string;
  emailRecipient?: string;
  allowAccepted?: boolean;
}): Promise<{ submission: AnnualConferenceSpeakerSubmission; link: AnnualConferenceSpeakerIntakeLink; token: string }> {
  if (input.submission.status !== 'selected' || !input.submission.selected_session_id) {
    throw new Error('Accepted conference proposal not found.');
  }
  if (isSupabaseRuntimeEnabled()) {
    const linkId = generateId();
    const token = annualConferenceSpeakerWorkspaceToken(linkId, input.tokenSecret);
    const { error } = await getSupabaseAdminClient().rpc('rotate_annual_conference_speaker_workspace', {
      p_submission_id: input.submission.id,
      p_expected_link_id: input.submission.selected_intake_link_id,
      p_link_id: linkId,
      p_token_hash: hashToken(token),
      p_deadline: input.deadline,
      p_email_idempotency_key: `conference-speaker-accepted-${linkId}`,
      p_email_recipient: input.emailRecipient ?? input.submission.decision_email_recipient ?? input.submission.speaker_email,
      p_allow_accepted: input.allowAccepted ?? false,
    });

    if (error) throw new Error(error.message.includes('not found') ? error.message : 'Unable to rotate the conference speaker workspace.');
    const [submission, link] = await Promise.all([
      getAnnualConferenceSpeakerSubmission(input.submission.id),
      getAnnualConferenceSpeakerIntakeLinkById(linkId),
    ]);

    if (!submission || !link) throw new Error('The workspace was rotated, but its delivery needs attention.');

    return { submission, link, token };
  }

  const previousLinkId = input.submission.selected_intake_link_id;
  const previousLink = previousLinkId ? await getAnnualConferenceSpeakerIntakeLinkById(previousLinkId) : undefined;

  if (previousLink?.email_status && ['accepted', 'delivered'].includes(previousLink.email_status) && !input.allowAccepted) {
    throw new Error('The conference speaker workspace email was already accepted by the provider.');
  }
  if (previousLink?.email_status === 'pending' && previousLink.email_last_attempt_at
    && new Date(previousLink.email_last_attempt_at).getTime() > Date.now() - 5 * 60 * 1000) {
    throw new Error('The conference speaker workspace email is still being sent.');
  }
  const revokedByThisAttempt = Boolean(previousLink && !previousLink.revoked_at);
  let createdLinkId: string | null = null;

  try {
    if (previousLinkId && revokedByThisAttempt) await closeAnnualConferenceSpeakerIntakeLink(previousLinkId);
    const created = await createAnnualConferenceSpeakerIntakeLink({
      edition_id: input.submission.edition_id,
      speaker_submission_id: input.submission.id,
      speaker_name: input.submission.speaker_name,
      speaker_email: input.submission.speaker_email,
      talk_title: input.submission.title,
      expires_at: input.deadline,
      workspace_session_id: input.submission.selected_session_id,
      tokenSecret: input.tokenSecret,
    });

    createdLinkId = created.link.id;
    const link = await updateAnnualConferenceSpeakerIntakeLink(created.link.id, {
      email_status: 'pending',
      email_recipient: input.emailRecipient ?? input.submission.decision_email_recipient ?? input.submission.speaker_email,
      email_idempotency_key: `conference-speaker-accepted-${created.link.id}`,
    });
    const submission = await updateAnnualConferenceSpeakerSubmission(input.submission.id, {
      selected_intake_link_id: created.link.id,
      decision_email_status: 'pending',
      decision_email_recipient: link.email_recipient,
      decision_email_provider_id: null,
      decision_email_idempotency_key: link.email_idempotency_key,
      decision_email_sent_at: null,
      decision_email_delivered_at: null,
      decision_email_last_attempt_at: null,
      decision_email_last_event_at: null,
      decision_email_last_error: null,
      decision_email_attempt_count: 0,
      decision_email_retryable: true,
    });

    return { submission, link, token: created.token };
  } catch (error) {
    if (createdLinkId) await deleteAnnualConferenceSpeakerIntakeLink(createdLinkId).catch(() => undefined);
    if (previousLinkId && revokedByThisAttempt) await updateAnnualConferenceSpeakerIntakeLink(previousLinkId, { revoked_at: null }).catch(() => undefined);

    throw error;
  }
}

export async function updateAnnualConferenceSpeakerIntakeDeadlines(editionId: string, expiresAt: string): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().from('annual_conference_speaker_intake_links')
      .update({ expires_at: expiresAt, updated_at: now() }).eq('edition_id', editionId).is('revoked_at', null);

    if (error) throw new Error('Unable to update conference presenter deadlines.');

    return;
  }
  await updateData<AnnualConferenceSpeakerIntakeLink, null>(LINKS_FILE, (items) => ({
    data: items.map((item) => item.edition_id === editionId && !item.revoked_at ? { ...item, expires_at: expiresAt, updated_at: now() } : item),
    result: null,
  }));
}

export async function getPendingAnnualConferenceDecisionEmails(
  statuses: AnnualConferenceEmailStatus[] = ['pending', 'failed'],
  limit = 20,
): Promise<AnnualConferenceSpeakerSubmission[]> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().from('annual_conference_speaker_submissions')
      .select('*')
      .in('decision_email_status', statuses)
      .eq('decision_email_retryable', true)
      .lt('decision_email_attempt_count', 5)
      .order('decision_email_last_attempt_at', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (error) throw new Error('Unable to load pending conference speaker emails.');

    return (data ?? []).map(submissionFromRow);
  }

  return (await readData<AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE))
    .map(submissionFromMock)
    .filter((submission) => Boolean(
      submission.decision_email_status
      && statuses.includes(submission.decision_email_status)
      && submission.decision_email_retryable
      && submission.decision_email_attempt_count < 5,
    ))
    .sort((a, b) => (a.decision_email_last_attempt_at ?? '').localeCompare(b.decision_email_last_attempt_at ?? ''))
    .slice(0, limit);
}

export async function insertAnnualConferenceEmailWebhookEvent(
  event: Omit<AnnualConferenceEmailWebhookEvent, 'processed_at'>,
): Promise<boolean> {
  if (isSupabaseRuntimeEnabled()) {
    const client = getSupabaseAdminClient();
    const existing = await client.from('annual_conference_email_webhook_events')
      .select('webhook_event_id').eq('webhook_event_id', event.webhook_event_id).maybeSingle();

    if (existing.error) throw new Error('Unable to check conference email webhook history.');
    if (existing.data) return false;
    const { error } = await client.from('annual_conference_email_webhook_events').insert(event);

    if (error?.code === '23505') return false;
    if (error) throw new Error('Unable to store conference email webhook event.');

    return true;
  }

  return updateData<AnnualConferenceEmailWebhookEvent, boolean>(EMAIL_WEBHOOK_EVENTS_FILE, (events) => {
    if (events.some((item) => item.webhook_event_id === event.webhook_event_id)) return { data: events, result: false };

    return { data: [...events, { ...event, processed_at: now() }], result: true };
  });
}

export async function applyAnnualConferenceDecisionEmailProviderEvent(input: {
  providerEmailId: string;
  status: AnnualConferenceEmailStatus;
  eventAt: string;
  deliveredAt?: string | null;
  lastError?: string | null;
  retryable: boolean;
}): Promise<boolean> {
  if (isSupabaseRuntimeEnabled()) {
    const { data, error } = await getSupabaseAdminClient().rpc('apply_annual_conference_speaker_email_event', {
      p_provider_email_id: input.providerEmailId,
      p_status: input.status,
      p_event_at: input.eventAt,
      p_delivered_at: input.deliveredAt ?? null,
      p_last_error: input.lastError ?? null,
      p_retryable: input.retryable,
    });

    if (error) throw new Error('Unable to apply the conference email delivery event.');

    return data === true;
  }
  const submission = (await readData<AnnualConferenceSpeakerSubmission>(SUBMISSIONS_FILE))
    .map(submissionFromMock)
    .find((item) => item.decision_email_provider_id === input.providerEmailId);

  if (!submission) return false;
  if (submission.decision_email_last_event_at
    && new Date(submission.decision_email_last_event_at).getTime() >= new Date(input.eventAt).getTime()) return true;

  const updates: AnnualConferenceSpeakerSubmissionUpdate = {
    decision_email_status: input.status,
    decision_email_last_event_at: input.eventAt,
    decision_email_delivered_at: input.deliveredAt ?? submission.decision_email_delivered_at,
    decision_email_last_error: input.lastError ?? null,
    decision_email_retryable: input.retryable,
  };

  await updateAnnualConferenceSpeakerSubmission(submission.id, updates);
  if (submission.selected_intake_link_id) {
    await updateAnnualConferenceSpeakerIntakeLink(submission.selected_intake_link_id, {
      email_status: input.status,
      email_last_event_at: input.eventAt,
      email_delivered_at: input.deliveredAt ?? null,
      email_last_error: input.lastError ?? null,
      email_retryable: input.retryable,
    });
  }

  return true;
}

export async function closeAnnualConferenceSpeakerIntakeLink(id: string): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().from('annual_conference_speaker_intake_links')
      .update({ revoked_at: now(), updated_at: now() }).eq('id', id).is('revoked_at', null);

    if (error) throw new Error('Unable to close the previous conference presenter link.');

    return;
  }
  await updateData<AnnualConferenceSpeakerIntakeLink, null>(LINKS_FILE, (items) => ({
    data: items.map((item) => item.id === id && !item.revoked_at ? { ...item, revoked_at: now(), updated_at: now() } : item),
    result: null,
  }));
}

export async function deleteAnnualConferenceSpeakerIntakeLink(id: string): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().from('annual_conference_speaker_intake_links').delete().eq('id', id);

    if (error) throw new Error('Unable to remove conference presenter link.');

    return;
  }
  await updateData<AnnualConferenceSpeakerIntakeLink, null>(LINKS_FILE, (items) => ({ data: items.filter((item) => item.id !== id), result: null }));
}

export async function deleteAnnualConferenceSession(id: string): Promise<void> {
  if (isSupabaseRuntimeEnabled()) {
    const { error } = await getSupabaseAdminClient().from('annual_conference_sessions').delete().eq('id', id);

    if (error) throw new Error('Unable to remove conference session.');

    return;
  }
  await updateData<AnnualConferenceSession, null>(SESSIONS_FILE, (items) => ({ data: items.filter((item) => item.id !== id), result: null }));
}
