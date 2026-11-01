-- Speaker outcome drafts and immutable payloads for an initiated delivery.
create table public.annual_conference_speaker_outcome_messages (
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  kind text not null check (kind in ('acceptance', 'rejection')),
  subject text not null,
  message text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (edition_id, kind)
);
alter table public.annual_conference_speaker_outcome_messages enable row level security;
revoke all on public.annual_conference_speaker_outcome_messages from public, anon, authenticated;
grant select, insert, update on public.annual_conference_speaker_outcome_messages to service_role;

alter table public.annual_conference_speaker_submissions
  add column decision_email_payload jsonb,
  add column decision_email_payload_started_at timestamptz,
  add column decision_email_queued_at timestamptz;

create function public.save_annual_conference_speaker_outcome_message(
  p_edition_id uuid, p_kind text, p_subject text, p_message text, p_expected_version integer
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_expected_version = 0 then
    insert into public.annual_conference_speaker_outcome_messages (edition_id, kind, subject, message)
    values (p_edition_id, p_kind, p_subject, p_message) on conflict do nothing;
  else
    update public.annual_conference_speaker_outcome_messages
      set subject = p_subject, message = p_message, version = version + 1, updated_at = now()
      where edition_id = p_edition_id and kind = p_kind and version = p_expected_version;
  end if;
  return found;
end;
$$;
revoke all on function public.save_annual_conference_speaker_outcome_message(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.save_annual_conference_speaker_outcome_message(uuid, text, text, text, integer) to service_role;

-- The payload is frozen under the same row lock as the first attempt claim.
create function public.claim_annual_conference_speaker_email_payload(
  p_submission_id uuid, p_expected_idempotency_key text, p_expected_attempt_count integer,
  p_attempted_at timestamptz, p_allow_non_retryable boolean, p_payload jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare proposal public.annual_conference_speaker_submissions%rowtype;
begin
  select * into proposal from public.annual_conference_speaker_submissions where id = p_submission_id for update;
  if not found or proposal.decision_email_idempotency_key is distinct from p_expected_idempotency_key
    or proposal.decision_email_attempt_count <> p_expected_attempt_count
    or (proposal.decision_email_status is null or proposal.decision_email_status not in ('pending', 'failed'))
    or (not proposal.decision_email_retryable and not p_allow_non_retryable)
    or proposal.decision_email_payload is distinct from p_payload
    or (p_expected_attempt_count = 0 and proposal.decision_email_queued_at is null)
  then return false; end if;
  if p_expected_attempt_count = 0 and proposal.status = 'selected' then
    perform 1 from public.annual_conference_editions edition
      join public.annual_conference_speaker_intake_links link on link.id = proposal.selected_intake_link_id
      where edition.id = proposal.edition_id and edition.speaker_logistics_deadline > now()
        and edition.speaker_logistics_deadline = (p_payload->>'deadline')::timestamptz
        and link.id = (p_payload->>'linkId')::uuid and link.expires_at = (p_payload->>'linkExpiresAt')::timestamptz
        and link.edition_id = proposal.edition_id and link.speaker_submission_id = proposal.id
        and link.workspace_session_id = proposal.selected_session_id and link.revoked_at is null and link.expires_at > now()
      for share of edition, link;
    if not found then return false; end if;
  end if;
  update public.annual_conference_speaker_submissions
    set decision_email_status = 'pending', decision_email_last_attempt_at = p_attempted_at,
      decision_email_attempt_count = decision_email_attempt_count + 1, decision_email_last_error = null,
      decision_email_payload = p_payload,
      decision_email_payload_started_at = case when p_expected_attempt_count = 0 then p_attempted_at else decision_email_payload_started_at end,
      updated_at = now()
    where id = proposal.id;
  update public.annual_conference_speaker_intake_links
    set email_status = 'pending', email_last_attempt_at = p_attempted_at,
      email_attempt_count = email_attempt_count + 1, email_last_error = null, updated_at = now()
    where id = proposal.selected_intake_link_id and email_idempotency_key is not distinct from p_expected_idempotency_key;
  return true;
end;
$$;
revoke all on function public.claim_annual_conference_speaker_email_payload(uuid, text, integer, timestamptz, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.claim_annual_conference_speaker_email_payload(uuid, text, integer, timestamptz, boolean, jsonb) to service_role;

create function public.stop_annual_conference_speaker_email_retry(
  p_submission_id uuid, p_expected_idempotency_key text, p_expected_attempt_count integer, p_error text,
  p_expected_payload jsonb, p_expected_queued_at timestamptz
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.annual_conference_speaker_submissions
    set decision_email_status = 'failed', decision_email_retryable = false, decision_email_last_error = p_error,
      decision_email_queued_at = case when p_expected_attempt_count = 0 then null else decision_email_queued_at end,
      decision_email_payload = case when p_expected_attempt_count = 0 then null else decision_email_payload end, updated_at = now()
    where id = p_submission_id and decision_email_idempotency_key = p_expected_idempotency_key
      and decision_email_attempt_count = p_expected_attempt_count and decision_email_status in ('pending', 'failed')
      and decision_email_payload is not distinct from p_expected_payload
      and decision_email_queued_at is not distinct from p_expected_queued_at;
  return found;
end;
$$;
revoke all on function public.stop_annual_conference_speaker_email_retry(uuid, text, integer, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.stop_annual_conference_speaker_email_retry(uuid, text, integer, text, jsonb, timestamptz) to service_role;

create table public.annual_conference_speaker_outcome_previews (
  id uuid primary key,
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  actor_id text not null,
  recipients jsonb not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.annual_conference_speaker_outcome_previews enable row level security;
revoke all on public.annual_conference_speaker_outcome_previews from public, anon, authenticated;
grant select, insert, update, delete on public.annual_conference_speaker_outcome_previews to service_role;

create function public.queue_annual_conference_speaker_outcome_preview(p_preview_id uuid, p_edition_id uuid, p_actor_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare preview public.annual_conference_speaker_outcome_previews%rowtype; item jsonb; proposal public.annual_conference_speaker_submissions%rowtype; count_queued integer := 0;
begin
  select * into preview from public.annual_conference_speaker_outcome_previews where id = p_preview_id for update;
  if not found or preview.edition_id <> p_edition_id or preview.actor_id <> p_actor_id or preview.used_at is not null or preview.expires_at <= now() then
    raise exception 'speaker_preview_unavailable';
  end if;
  if jsonb_typeof(preview.recipients) <> 'array' or jsonb_array_length(preview.recipients) not between 1 and 100
    or (select count(distinct value->>'id') from jsonb_array_elements(preview.recipients)) <> jsonb_array_length(preview.recipients) then
    raise exception 'speaker_preview_changed';
  end if;
  perform 1 from public.annual_conference_editions where id = p_edition_id for share;
  if not found then raise exception 'speaker_preview_changed'; end if;
  for item in select value from jsonb_array_elements(preview.recipients) order by value->>'id' loop
    select * into proposal from public.annual_conference_speaker_submissions where id = (item->>'id')::uuid for update;
    if not found or proposal.edition_id <> p_edition_id or (proposal.decision_email_status is null or proposal.decision_email_status not in ('pending', 'failed'))
      or proposal.decision_email_attempt_count <> 0 or proposal.decision_email_queued_at is not null
      or proposal.decision_email_idempotency_key is distinct from item->>'key'
      or coalesce(proposal.decision_email_recipient, proposal.speaker_email) is distinct from item->>'recipient'
      or (proposal.status = 'selected' and proposal.decision_email_kind is distinct from 'acceptance')
      or (proposal.status = 'not_selected' and proposal.decision_email_kind is distinct from 'rejection')
      or proposal.status not in ('selected', 'not_selected') then
      raise exception 'speaker_preview_changed';
    end if;
    if proposal.status = 'selected' then
      perform 1 from public.annual_conference_editions edition
        join public.annual_conference_speaker_intake_links link on link.id = proposal.selected_intake_link_id
        where edition.id = p_edition_id and edition.speaker_logistics_deadline > now()
          and edition.speaker_logistics_deadline = (item->>'deadline')::timestamptz
          and link.id = (item->>'link_id')::uuid and link.expires_at = (item->>'link_expires_at')::timestamptz
          and link.edition_id = p_edition_id and link.speaker_submission_id = proposal.id
          and link.workspace_session_id = proposal.selected_session_id and link.revoked_at is null and link.expires_at > now()
        for share of link;
      if not found then raise exception 'speaker_preview_changed'; end if;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(preview.recipients) loop
    update public.annual_conference_speaker_submissions set decision_email_payload = jsonb_build_object(
      'subject', item->>'subject', 'html', item->>'html', 'text', item->>'text', 'recipient', item->>'recipient',
      'from', item->>'from', 'replyTo', item->>'replyTo', 'deadline', item->>'deadline',
      'linkId', item->>'link_id', 'linkExpiresAt', item->>'link_expires_at'
    ), decision_email_queued_at = now(), decision_email_status = 'pending', decision_email_retryable = true, decision_email_last_error = null, updated_at = now() where id = (item->>'id')::uuid;
    count_queued := count_queued + 1;
  end loop;
  delete from public.annual_conference_speaker_outcome_previews where id = preview.id;
  return count_queued;
end;
$$;
revoke all on function public.queue_annual_conference_speaker_outcome_preview(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.queue_annual_conference_speaker_outcome_preview(uuid, uuid, text) to service_role;

create function public.reset_annual_conference_speaker_email_payload() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.decision_email_idempotency_key is distinct from old.decision_email_idempotency_key then
    new.decision_email_payload := null;
    new.decision_email_payload_started_at := null;
    new.decision_email_queued_at := null;
  end if;
  return new;
end;
$$;
create trigger reset_annual_conference_speaker_email_payload before update on public.annual_conference_speaker_submissions
  for each row execute function public.reset_annual_conference_speaker_email_payload();
revoke all on function public.reset_annual_conference_speaker_email_payload() from public, anon, authenticated;
