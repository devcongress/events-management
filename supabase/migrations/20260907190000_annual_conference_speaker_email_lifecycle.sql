-- Give every Annual Conference proposal one durable decision-email lifecycle.
-- Public proposal receipts intentionally remain email-free.

begin;

alter table public.annual_conference_speaker_submissions
  add column if not exists decision_email_kind text,
  add column if not exists decision_email_status text,
  add column if not exists decision_email_recipient text,
  add column if not exists decision_email_provider_id text,
  add column if not exists decision_email_idempotency_key text,
  add column if not exists decision_email_sent_at timestamptz,
  add column if not exists decision_email_delivered_at timestamptz,
  add column if not exists decision_email_last_attempt_at timestamptz,
  add column if not exists decision_email_last_event_at timestamptz,
  add column if not exists decision_email_last_error text,
  add column if not exists decision_email_attempt_count integer not null default 0,
  add column if not exists decision_email_retryable boolean not null default true;

update public.annual_conference_speaker_submissions as submission
set decision_email_kind = 'acceptance',
    decision_email_status = link.email_status,
    decision_email_recipient = coalesce(link.speaker_email, submission.speaker_email),
    decision_email_provider_id = link.email_provider_id,
    decision_email_idempotency_key = link.email_idempotency_key,
    decision_email_sent_at = link.email_sent_at,
    decision_email_last_attempt_at = link.email_last_attempt_at,
    decision_email_last_error = link.email_last_error,
    decision_email_attempt_count = case when link.email_last_attempt_at is null then 0 else 1 end
from public.annual_conference_speaker_intake_links as link
where submission.status = 'selected'
  and submission.selected_intake_link_id = link.id
  and submission.decision_email_status is null;

alter table public.annual_conference_speaker_intake_links
  drop constraint if exists annual_conference_speaker_intake_links_email_status_check;

alter table public.annual_conference_speaker_intake_links
  drop constraint if exists annual_conference_speaker_intake_links_email_attempt_count_check;

alter table public.annual_conference_speaker_intake_links
  add column if not exists email_recipient text,
  add column if not exists email_delivered_at timestamptz,
  add column if not exists email_last_event_at timestamptz,
  add column if not exists email_attempt_count integer not null default 0,
  add column if not exists email_retryable boolean not null default true;

update public.annual_conference_speaker_intake_links
set email_recipient = coalesce(email_recipient, speaker_email),
    email_attempt_count = case
      when email_attempt_count = 0 and email_last_attempt_at is not null then 1
      else email_attempt_count
    end;

alter table public.annual_conference_speaker_intake_links
  add constraint annual_conference_speaker_intake_links_email_status_check check (
    email_status is null or email_status in (
      'pending', 'accepted', 'delivered', 'delayed', 'failed',
      'bounced', 'suppressed', 'complained'
    )
  ),
  add constraint annual_conference_speaker_intake_links_email_attempt_count_check check (
    email_attempt_count between 0 and 100
  );

alter table public.annual_conference_speaker_submissions
  drop constraint if exists annual_conference_speaker_submissions_decision_email_kind_check,
  drop constraint if exists annual_conference_speaker_submissions_decision_email_status_check,
  drop constraint if exists annual_conference_speaker_submissions_decision_email_attempt_count_check;

alter table public.annual_conference_speaker_submissions
  add constraint annual_conference_speaker_submissions_decision_email_kind_check check (
    decision_email_kind is null or decision_email_kind in ('acceptance', 'rejection')
  ),
  add constraint annual_conference_speaker_submissions_decision_email_status_check check (
    decision_email_status is null or decision_email_status in (
      'pending', 'accepted', 'delivered', 'delayed', 'failed',
      'bounced', 'suppressed', 'complained'
    )
  ),
  add constraint annual_conference_speaker_submissions_decision_email_attempt_count_check check (
    decision_email_attempt_count between 0 and 100
  );

create unique index if not exists annual_conference_speaker_submissions_decision_email_idempotency_uidx
  on public.annual_conference_speaker_submissions (decision_email_idempotency_key)
  where decision_email_idempotency_key is not null;

create index if not exists annual_conference_speaker_submissions_decision_email_retry_idx
  on public.annual_conference_speaker_submissions (decision_email_last_attempt_at, decided_at)
  where decision_email_status in ('pending', 'failed') and decision_email_retryable;

create index if not exists annual_conference_speaker_submissions_decision_email_provider_idx
  on public.annual_conference_speaker_submissions (decision_email_provider_id)
  where decision_email_provider_id is not null;

create table if not exists public.annual_conference_email_webhook_events (
  webhook_event_id text primary key,
  provider_email_id text not null,
  event_type text not null check (event_type in (
    'email.delivered', 'email.delivery_delayed', 'email.bounced',
    'email.failed', 'email.suppressed', 'email.complained'
  )),
  provider_created_at timestamptz not null,
  processed_at timestamptz not null default now()
);

create index if not exists annual_conference_email_webhook_events_provider_idx
  on public.annual_conference_email_webhook_events (provider_email_id, provider_created_at desc);

alter table public.annual_conference_email_webhook_events enable row level security;
revoke all on table public.annual_conference_email_webhook_events from public, anon, authenticated;
grant select, insert on table public.annual_conference_email_webhook_events to service_role;

create or replace function public.accept_annual_conference_speaker_proposal(
  p_submission_id uuid,
  p_session_id uuid,
  p_link_id uuid,
  p_token_hash text,
  p_deadline timestamptz,
  p_email_idempotency_key text,
  p_internal_note text
)
returns table (session_id uuid, link_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.annual_conference_speaker_submissions%rowtype;
begin
  select * into proposal
  from public.annual_conference_speaker_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Conference proposal not found.' using errcode = 'P0001';
  end if;
  if proposal.status <> 'submitted' then
    raise exception 'This conference proposal has already been decided.' using errcode = 'P0001';
  end if;
  if proposal.proposal_schema_version <> 2 then
    raise exception 'This legacy proposal is incomplete and cannot be accepted.' using errcode = 'P0001';
  end if;

  insert into public.annual_conference_sessions (
    id, edition_id, speaker_submission_id, speaker_name, speaker_email, title,
    topic, session_type, learning_outcomes, abstract, bio, slides_url, status
  ) values (
    p_session_id, proposal.edition_id, proposal.id, proposal.speaker_name,
    proposal.speaker_email, proposal.title, proposal.topic,
    proposal.session_type, proposal.learning_outcomes, proposal.abstract,
    proposal.bio, null, 'confirmed'
  );

  insert into public.annual_conference_speaker_intake_links (
    id, edition_id, speaker_submission_id, speaker_name, speaker_email,
    talk_title, token_hash, email_status, email_recipient,
    email_idempotency_key, expires_at, workspace_session_id
  ) values (
    p_link_id, proposal.edition_id, proposal.id, proposal.speaker_name,
    proposal.speaker_email, proposal.title, p_token_hash, 'pending',
    proposal.speaker_email, p_email_idempotency_key, p_deadline, p_session_id
  );

  update public.annual_conference_speaker_submissions
  set status = 'selected',
      internal_note = nullif(btrim(p_internal_note), ''),
      selected_intake_link_id = p_link_id,
      selected_session_id = p_session_id,
      decision_email_kind = 'acceptance',
      decision_email_status = 'pending',
      decision_email_recipient = proposal.speaker_email,
      decision_email_provider_id = null,
      decision_email_idempotency_key = p_email_idempotency_key,
      decision_email_sent_at = null,
      decision_email_delivered_at = null,
      decision_email_last_attempt_at = null,
      decision_email_last_event_at = null,
      decision_email_last_error = null,
      decision_email_attempt_count = 0,
      decision_email_retryable = true,
      decided_at = now(),
      updated_at = now()
  where id = proposal.id;

  return query select p_session_id, p_link_id;
end;
$$;

create or replace function public.reject_annual_conference_speaker_proposal(
  p_submission_id uuid,
  p_email_idempotency_key text,
  p_internal_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.annual_conference_speaker_submissions%rowtype;
begin
  select * into proposal
  from public.annual_conference_speaker_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Conference proposal not found.' using errcode = 'P0001';
  end if;
  if proposal.status <> 'submitted' then
    raise exception 'This conference proposal has already been decided.' using errcode = 'P0001';
  end if;

  update public.annual_conference_speaker_submissions
  set status = 'not_selected',
      internal_note = nullif(btrim(p_internal_note), ''),
      decision_email_kind = 'rejection',
      decision_email_status = 'pending',
      decision_email_recipient = proposal.speaker_email,
      decision_email_provider_id = null,
      decision_email_idempotency_key = p_email_idempotency_key,
      decision_email_sent_at = null,
      decision_email_delivered_at = null,
      decision_email_last_attempt_at = null,
      decision_email_last_event_at = null,
      decision_email_last_error = null,
      decision_email_attempt_count = 0,
      decision_email_retryable = true,
      decided_at = now(),
      updated_at = now()
  where id = proposal.id;

  return proposal.id;
end;
$$;

drop function if exists public.rotate_annual_conference_speaker_workspace(uuid, uuid, uuid, text, timestamptz, text);

create or replace function public.rotate_annual_conference_speaker_workspace(
  p_submission_id uuid,
  p_expected_link_id uuid,
  p_link_id uuid,
  p_token_hash text,
  p_deadline timestamptz,
  p_email_idempotency_key text,
  p_email_recipient text,
  p_allow_accepted boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.annual_conference_speaker_submissions%rowtype;
  current_link public.annual_conference_speaker_intake_links%rowtype;
begin
  select * into proposal
  from public.annual_conference_speaker_submissions
  where id = p_submission_id
  for update;

  if not found or proposal.status <> 'selected' or proposal.selected_session_id is null then
    raise exception 'Accepted conference proposal not found.' using errcode = 'P0001';
  end if;
  if proposal.selected_intake_link_id is distinct from p_expected_link_id then
    raise exception 'The conference speaker workspace has already been rotated.' using errcode = 'P0001';
  end if;

  if p_expected_link_id is not null then
    select * into current_link
    from public.annual_conference_speaker_intake_links
    where id = p_expected_link_id
    for update;
    if found and current_link.email_status in ('accepted', 'delivered') and not p_allow_accepted then
      raise exception 'The conference speaker workspace email was already accepted by the provider.' using errcode = 'P0001';
    end if;
    if found and current_link.email_status = 'pending'
      and current_link.email_last_attempt_at > now() - interval '5 minutes' then
      raise exception 'The conference speaker workspace email is still being sent.' using errcode = 'P0001';
    end if;
  end if;

  update public.annual_conference_speaker_intake_links
  set revoked_at = now(), updated_at = now()
  where id = proposal.selected_intake_link_id and revoked_at is null;

  insert into public.annual_conference_speaker_intake_links (
    id, edition_id, speaker_submission_id, speaker_name, speaker_email,
    talk_title, token_hash, email_status, email_recipient,
    email_idempotency_key, expires_at, workspace_session_id
  ) values (
    p_link_id, proposal.edition_id, proposal.id, proposal.speaker_name,
    proposal.speaker_email, proposal.title, p_token_hash, 'pending',
    p_email_recipient, p_email_idempotency_key, p_deadline, proposal.selected_session_id
  );

  update public.annual_conference_speaker_submissions
  set selected_intake_link_id = p_link_id,
      decision_email_status = 'pending',
      decision_email_recipient = p_email_recipient,
      decision_email_provider_id = null,
      decision_email_idempotency_key = p_email_idempotency_key,
      decision_email_sent_at = null,
      decision_email_delivered_at = null,
      decision_email_last_attempt_at = null,
      decision_email_last_event_at = null,
      decision_email_last_error = null,
      decision_email_attempt_count = 0,
      decision_email_retryable = true,
      updated_at = now()
  where id = proposal.id;

  return p_link_id;
end;
$$;

create or replace function public.claim_annual_conference_speaker_email_attempt(
  p_submission_id uuid,
  p_expected_idempotency_key text,
  p_expected_attempt_count integer,
  p_attempted_at timestamptz,
  p_allow_non_retryable boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.annual_conference_speaker_submissions%rowtype;
begin
  select * into proposal
  from public.annual_conference_speaker_submissions
  where id = p_submission_id
  for update;

  if not found
    or proposal.decision_email_idempotency_key is distinct from p_expected_idempotency_key
    or proposal.decision_email_attempt_count <> p_expected_attempt_count
    or proposal.decision_email_status not in ('pending', 'failed')
    or (not proposal.decision_email_retryable and not p_allow_non_retryable)
  then return false; end if;

  update public.annual_conference_speaker_submissions
  set decision_email_status = 'pending',
      decision_email_last_attempt_at = p_attempted_at,
      decision_email_attempt_count = decision_email_attempt_count + 1,
      decision_email_last_error = null,
      updated_at = now()
  where id = proposal.id;

  update public.annual_conference_speaker_intake_links
  set email_status = 'pending',
      email_last_attempt_at = p_attempted_at,
      email_attempt_count = email_attempt_count + 1,
      email_last_error = null,
      updated_at = now()
  where id = proposal.selected_intake_link_id
    and email_idempotency_key is not distinct from p_expected_idempotency_key;

  return true;
end;
$$;

create or replace function public.replace_annual_conference_speaker_email_recipient(
  p_submission_id uuid,
  p_expected_idempotency_key text,
  p_expected_attempt_count integer,
  p_email_recipient text,
  p_email_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.annual_conference_speaker_submissions%rowtype;
begin
  select * into proposal
  from public.annual_conference_speaker_submissions
  where id = p_submission_id
  for update;

  if not found
    or proposal.decision_email_idempotency_key is distinct from p_expected_idempotency_key
    or proposal.decision_email_attempt_count <> p_expected_attempt_count
  then return false; end if;
  if proposal.decision_email_status = 'pending'
    and proposal.decision_email_last_attempt_at > now() - interval '5 minutes' then
    raise exception 'The conference speaker email is still being sent.' using errcode = 'P0001';
  end if;

  update public.annual_conference_speaker_submissions
  set decision_email_status = 'pending',
      decision_email_recipient = p_email_recipient,
      decision_email_provider_id = null,
      decision_email_idempotency_key = p_email_idempotency_key,
      decision_email_sent_at = null,
      decision_email_delivered_at = null,
      decision_email_last_attempt_at = null,
      decision_email_last_event_at = null,
      decision_email_last_error = null,
      decision_email_attempt_count = 0,
      decision_email_retryable = true,
      updated_at = now()
  where id = proposal.id;

  return true;
end;
$$;

create or replace function public.apply_annual_conference_speaker_email_event(
  p_provider_email_id text,
  p_status text,
  p_event_at timestamptz,
  p_delivered_at timestamptz,
  p_last_error text,
  p_retryable boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.annual_conference_speaker_submissions%rowtype;
begin
  select * into proposal
  from public.annual_conference_speaker_submissions
  where decision_email_provider_id = p_provider_email_id
  for update;

  if not found then return false; end if;
  if proposal.decision_email_last_event_at is not null
    and proposal.decision_email_last_event_at >= p_event_at then return true; end if;

  update public.annual_conference_speaker_submissions
  set decision_email_status = p_status,
      decision_email_last_event_at = p_event_at,
      decision_email_delivered_at = coalesce(p_delivered_at, decision_email_delivered_at),
      decision_email_last_error = p_last_error,
      decision_email_retryable = p_retryable,
      updated_at = now()
  where id = proposal.id;

  update public.annual_conference_speaker_intake_links
  set email_status = p_status,
      email_last_event_at = p_event_at,
      email_delivered_at = coalesce(p_delivered_at, email_delivered_at),
      email_last_error = p_last_error,
      email_retryable = p_retryable,
      updated_at = now()
  where id = proposal.selected_intake_link_id;

  return true;
end;
$$;

revoke all on function public.accept_annual_conference_speaker_proposal(uuid, uuid, uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.accept_annual_conference_speaker_proposal(uuid, uuid, uuid, text, timestamptz, text, text) to service_role;
revoke all on function public.reject_annual_conference_speaker_proposal(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reject_annual_conference_speaker_proposal(uuid, text, text) to service_role;
revoke all on function public.rotate_annual_conference_speaker_workspace(uuid, uuid, uuid, text, timestamptz, text, text, boolean) from public, anon, authenticated;
grant execute on function public.rotate_annual_conference_speaker_workspace(uuid, uuid, uuid, text, timestamptz, text, text, boolean) to service_role;
revoke all on function public.claim_annual_conference_speaker_email_attempt(uuid, text, integer, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.claim_annual_conference_speaker_email_attempt(uuid, text, integer, timestamptz, boolean) to service_role;
revoke all on function public.replace_annual_conference_speaker_email_recipient(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.replace_annual_conference_speaker_email_recipient(uuid, text, integer, text, text) to service_role;
revoke all on function public.apply_annual_conference_speaker_email_event(text, text, timestamptz, timestamptz, text, boolean) from public, anon, authenticated;
grant execute on function public.apply_annual_conference_speaker_email_event(text, text, timestamptz, timestamptz, text, boolean) to service_role;

commit;
