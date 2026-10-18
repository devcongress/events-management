-- Per-recipient control for future outcome deliveries. Existing batches are unchanged.
begin;

alter table public.volunteer_follow_up_outcome_deliveries
  add column individually_controlled boolean not null default false,
  add column held_at timestamptz,
  add column held_by text;

create or replace function public.confirm_volunteer_follow_up_outcome_preview(
  p_preview_id uuid,
  p_actor text
)
returns table (queued_count integer, delivery_ids uuid[])
language plpgsql security definer set search_path = '' as $$
declare
  preview public.volunteer_follow_up_outcome_previews%rowtype;
  item jsonb; recipient public.volunteer_follow_up_recipients%rowtype;
  new_delivery_ids uuid[] := array[]::uuid[]; new_id uuid; batch_id uuid;
  position integer := 0; batch_number integer := 0;
begin
  select * into preview from public.volunteer_follow_up_outcome_previews where id = p_preview_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'preview_not_found'; end if;
  if p_actor is distinct from preview.created_by then raise exception using errcode = '42501', message = 'preview_actor_mismatch'; end if;
  if preview.confirmed_at is not null then
    return query select coalesce(array_length(preview.delivery_ids, 1), 0), coalesce(preview.delivery_ids, array[]::uuid[]); return;
  end if;
  if preview.expires_at <= now() then raise exception using errcode = '55000', message = 'preview_expired'; end if;
  if jsonb_typeof(preview.payloads) <> 'object' or (select count(*) from jsonb_object_keys(preview.payloads)) <> preview.eligible_count then
    raise exception using errcode = '22023', message = 'preview_payload_count_mismatch';
  end if;
  if (select count(*) from public.volunteer_follow_up_recipients r where r.campaign_id = preview.campaign_id and r.submitted_at is not null and r.decision = preview.decision and not exists (select 1 from public.volunteer_follow_up_outcome_deliveries d where d.recipient_id = r.id and d.decision_version = r.decision_version and d.status <> 'cancelled')) <> preview.eligible_count then
    raise exception using errcode = '40001', message = 'preview_stale';
  end if;
  for item in select value from jsonb_array_elements(preview.recipients) loop
    position := position + 1;
    select * into recipient from public.volunteer_follow_up_recipients where id = (item->>'recipient_id')::uuid and campaign_id = preview.campaign_id for update;
    if not found or recipient.submitted_at is null or recipient.decision <> preview.decision or recipient.decision_version <> (item->>'decision_version')::integer then raise exception using errcode = '40001', message = 'preview_stale'; end if;
    if exists (select 1 from public.volunteer_follow_up_outcome_deliveries d where d.recipient_id = recipient.id and d.decision_version = recipient.decision_version and d.status <> 'cancelled') then raise exception using errcode = '40001', message = 'preview_conflict'; end if;
    if jsonb_typeof(preview.payloads->(item->>'recipient_id')) <> 'object' then raise exception using errcode = '22023', message = 'preview_payload_missing'; end if;
    -- Future sends have one immutable provider request per recipient.
      batch_number := batch_number + 1;
      insert into public.volunteer_follow_up_outcome_batches (campaign_id, preview_id, idempotency_key, recipient_count)
      values (preview.campaign_id, preview.id, 'volunteer-outcome-batch/' || preview.id::text || '/' || batch_number::text, 1) returning id into batch_id;
    insert into public.volunteer_follow_up_outcome_deliveries (campaign_id, recipient_id, decision, decision_version, recipient_name, recipient_email, payload, template_version, idempotency_key, created_by, batch_id, batch_idempotency_key, batch_position, individually_controlled)
    values (preview.campaign_id, recipient.id, preview.decision, recipient.decision_version, recipient.applicant_name, recipient.applicant_email, preview.payloads->(item->>'recipient_id'), preview.template_version, 'volunteer-outcome/' || recipient.id::text || '/' || recipient.decision_version::text, p_actor, batch_id, 'volunteer-outcome-batch/' || preview.id::text || '/' || batch_number::text, 1, true) returning id into new_id;
    new_delivery_ids := array_append(new_delivery_ids, new_id);
  end loop;
  update public.volunteer_follow_up_outcome_previews set confirmed_at = now(), delivery_ids = new_delivery_ids where id = preview.id;
  return query select coalesce(array_length(new_delivery_ids, 1), 0), new_delivery_ids;
end; $$;

create or replace function public.claim_volunteer_follow_up_outcome(p_campaign_id uuid, p_safe_slots integer, p_claim_token uuid, p_lease_token uuid)
returns setof public.volunteer_follow_up_outcome_deliveries
language plpgsql security definer set search_path = '' as $$
declare
  chosen public.volunteer_follow_up_outcome_batches%rowtype;
  claimed_today integer;
  claimed_rows integer;
begin
  perform pg_advisory_xact_lock(hashtext('volunteer_follow_up:' || p_campaign_id::text));
  if not exists (select 1 from public.volunteer_follow_up_campaigns c where c.id = p_campaign_id and not c.outcome_paused and c.drain_lease_token = p_lease_token and c.drain_lease_until > now()) or p_safe_slots < 1 then return; end if;
  update public.volunteer_follow_up_outcome_batches b
  set status = 'needs_attention', claimed_until = null, claim_token = null, next_attempt_at = null
  where b.campaign_id = p_campaign_id and b.status in ('sending', 'retrying', 'failed')
    and not exists (select 1 from public.volunteer_follow_up_outcome_deliveries held where held.batch_id = b.id and held.held_at is not null)
    and b.first_attempt_at <= now() - interval '23 hours';
  update public.volunteer_follow_up_outcome_deliveries d
  set status = 'needs_attention', claimed_until = null, claim_token = null, next_attempt_at = null,
    delivery_stage = 'provider_request', provider_http_status = null,
    failure_certainty = 'ambiguous', diagnostic_at = now(),
    last_error = 'Provider result unconfirmed after the idempotency window; inspect Resend before any manual action.'
  from public.volunteer_follow_up_outcome_batches b
  where d.batch_id = b.id and b.campaign_id = p_campaign_id and b.status = 'needs_attention'
    and d.status in ('sending', 'retrying', 'failed');
  insert into public.volunteer_follow_up_daily_claims (campaign_id, send_day) values (p_campaign_id, (now() at time zone 'Africa/Accra')::date) on conflict do nothing;
  select dc.claimed_count into claimed_today from public.volunteer_follow_up_daily_claims dc where dc.campaign_id = p_campaign_id and dc.send_day = (now() at time zone 'Africa/Accra')::date for update;
  select b.* into chosen from public.volunteer_follow_up_outcome_batches b
  where b.campaign_id = p_campaign_id and b.recipient_count <= p_safe_slots
    and not exists (select 1 from public.volunteer_follow_up_outcome_deliveries held where held.batch_id = b.id and held.held_at is not null) and (
    (b.status = 'queued' and b.recipient_count <= 54 - claimed_today)
    or (b.status = 'sending' and b.attempt_count < 4 and b.first_attempt_at > now() - interval '23 hours' and (b.claimed_until is null or b.claimed_until <= now()))
    or (b.status in ('retrying', 'failed') and b.attempt_count < 4 and b.first_attempt_at > now() - interval '23 hours' and exists (
      select 1 from public.volunteer_follow_up_outcome_deliveries d
      where d.batch_id = b.id and d.next_attempt_at <= now()
    ))
  ) order by b.created_at, b.id limit 1 for update skip locked;
  if not found then return; end if;
  update public.volunteer_follow_up_outcome_batches set status = 'sending', attempt_count = attempt_count + 1, first_attempt_at = coalesce(first_attempt_at, now()), last_attempt_at = now(), next_attempt_at = null, claimed_until = now() + interval '5 minutes', claim_token = p_claim_token where id = chosen.id;
  update public.volunteer_follow_up_outcome_deliveries set status = 'sending', attempt_count = attempt_count + 1, first_attempt_at = coalesce(first_attempt_at, now()), last_attempt_at = now(), claimed_until = now() + interval '5 minutes', claim_token = p_claim_token, next_attempt_at = null, delivery_stage = 'provider_request', provider_http_status = null, failure_certainty = null, diagnostic_at = now(), last_error = null where batch_id = chosen.id and held_at is null and status in ('queued', 'sending', 'retrying', 'failed');
  get diagnostics claimed_rows = row_count;
  if claimed_rows <> chosen.recipient_count then raise exception using errcode = '40001', message = 'batch_mapping_changed'; end if;
  if chosen.attempt_count = 0 then
    update public.volunteer_follow_up_daily_claims dc set claimed_count = dc.claimed_count + chosen.recipient_count where dc.campaign_id = p_campaign_id and dc.send_day = (now() at time zone 'Africa/Accra')::date;
  end if;
  return query select d.* from public.volunteer_follow_up_outcome_deliveries d where d.batch_id = chosen.id order by d.batch_position, d.id;
end; $$;

create or replace function public.validate_volunteer_follow_up_outcome_send(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.volunteer_follow_up_outcome_deliveries d
    join public.volunteer_follow_up_recipients r on r.id = d.recipient_id
    join public.volunteer_follow_up_campaigns c on c.id = d.campaign_id
    where d.id = p_delivery_id and d.status = 'sending' and d.held_at is null
      and d.claim_token = p_claim_token and d.claimed_until > now()
      and c.drain_lease_token = p_lease_token and c.drain_lease_until > now()
      and not c.outcome_paused
      and r.decision = d.decision and r.decision_version = d.decision_version
  );
$$;

create function public.control_volunteer_outcome_delivery(
  p_campaign_id uuid, p_delivery_id uuid, p_action text, p_actor text
)
returns table (changed boolean, block_reason text)
language plpgsql security definer set search_path = '' as $$
declare
  delivery public.volunteer_follow_up_outcome_deliveries%rowtype;
  batch public.volunteer_follow_up_outcome_batches%rowtype;
begin
  if p_action not in ('hold', 'resume') or p_action is null or nullif(btrim(p_actor), '') is null then
    raise exception using errcode = '22023', message = 'invalid_outcome_control';
  end if;

  -- Serialize with the scheduled claim and manual retry paths. Lock batch before
  -- delivery, matching finalization, so a hold cannot race a provider claim.
  perform pg_advisory_xact_lock(hashtext('volunteer_follow_up:' || p_campaign_id::text));
  select b.* into batch from public.volunteer_follow_up_outcome_batches b
  join public.volunteer_follow_up_outcome_deliveries d on d.batch_id = b.id
  where d.id = p_delivery_id and d.campaign_id = p_campaign_id for update of b;
  if not found then return query select false, 'delivery_unavailable'; return; end if;

  select * into delivery from public.volunteer_follow_up_outcome_deliveries
  where id = p_delivery_id and campaign_id = p_campaign_id for update;
  if not delivery.individually_controlled or batch.recipient_count <> 1
    or (select count(*) from public.volunteer_follow_up_outcome_deliveries where batch_id = batch.id) <> 1 then
    return query select false, 'legacy_batch'; return;
  end if;
  if p_action = 'hold' and delivery.held_at is not null then
    return query select true, null::text; return;
  end if;
  if p_action = 'resume' and delivery.held_at is null then
    return query select false, 'not_held'; return;
  end if;
  if delivery.status = 'sending' or batch.status = 'sending'
    or delivery.claim_token is not null or batch.claim_token is not null
    or delivery.claimed_until > now() or batch.claimed_until > now() then
    return query select false, 'send_in_flight'; return;
  end if;
  if delivery.provider_email_id is not null or delivery.provider_event_at is not null
    or delivery.status not in ('queued', 'retrying', 'failed')
    or batch.status not in ('queued', 'retrying', 'failed') then
    return query select false, 'not_controllable'; return;
  end if;
  if not exists (select 1 from public.volunteer_follow_up_recipients r
    where r.id = delivery.recipient_id and r.decision = delivery.decision
      and r.decision_version = delivery.decision_version) then
    return query select false, 'decision_changed'; return;
  end if;

  if p_action = 'hold' and delivery.status = 'failed' and delivery.next_attempt_at is null then
    return query select false, 'already_stopped'; return;
  end if;

  if p_action = 'hold' then
    update public.volunteer_follow_up_outcome_deliveries
    set held_at = now(), held_by = p_actor where id = delivery.id;
  else
    if delivery.attempt_count >= 4 or batch.attempt_count >= 4 then
      return query select false, 'attempt_limit_reached'; return;
    end if;
    if (delivery.attempt_count > 0 or batch.attempt_count > 0) and (
      delivery.first_attempt_at is null or batch.first_attempt_at is null
      or delivery.first_attempt_at <= now() - interval '23 hours'
      or batch.first_attempt_at <= now() - interval '23 hours'
    ) then
      return query select false, 'idempotency_window_expired'; return;
    end if;
    if delivery.status = 'failed' and delivery.failure_certainty is distinct from 'definite' then
      return query select false, 'uncertain_failure'; return;
    end if;
    update public.volunteer_follow_up_outcome_deliveries
    set held_at = null, held_by = null
    where id = delivery.id;
  end if;

  return query select true, null::text;
end; $$;

revoke all on function public.control_volunteer_outcome_delivery(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.control_volunteer_outcome_delivery(uuid, uuid, text, text) to service_role;

create or replace function public.queue_volunteer_follow_up_failed_delivery_retry(
  p_campaign_id uuid,
  p_kind text,
  p_delivery_id uuid
)
returns table (delivery_id uuid, queued boolean, block_reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign public.volunteer_follow_up_campaigns%rowtype;
  invitation public.volunteer_follow_up_recipients%rowtype;
  outcome public.volunteer_follow_up_outcome_deliveries%rowtype;
begin
  if p_kind not in ('invitation', 'outcome') then
    raise exception using errcode = '22023', message = 'invalid_delivery_kind';
  end if;

  perform pg_advisory_xact_lock(hashtext('volunteer_follow_up:' || p_campaign_id::text));
  select * into campaign from public.volunteer_follow_up_campaigns
  where id = p_campaign_id for update;

  if not found then
    return query select p_delivery_id, false, 'campaign_unavailable';
    return;
  end if;

  if p_kind = 'invitation' then
    select * into invitation from public.volunteer_follow_up_recipients
    where id = p_delivery_id and campaign_id = p_campaign_id for update;

    if not found then
      return query select p_delivery_id, false, 'delivery_unavailable';
      return;
    elsif campaign.status not in ('running', 'paused') then
      return query select p_delivery_id, false, 'invitation_campaign_not_active';
      return;
    elsif campaign.application_deadline_at is null
      or now() >= campaign.application_deadline_at + interval '14 days' then
      return query select p_delivery_id, false, 'response_window_closed';
      return;
    elsif invitation.submitted_at is not null
      or invitation.application_created_at > campaign.application_deadline_at then
      return query select p_delivery_id, false, 'application_ineligible';
      return;
    elsif invitation.provider_email_id is not null or invitation.provider_event_at is not null then
      return query select p_delivery_id, false, 'provider_acceptance_or_event';
      return;
    elsif invitation.status <> 'failed' or invitation.failure_certainty is distinct from 'definite' then
      return query select p_delivery_id, false, 'not_definite_failure';
      return;
    elsif invitation.claimed_until > now() then
      return query select p_delivery_id, false, 'live_claim';
      return;
    elsif invitation.next_attempt_at is not null then
      return query select p_delivery_id, false, 'retry_already_scheduled';
      return;
    elsif invitation.attempt_count >= 4 then
      return query select p_delivery_id, false, 'attempt_limit_reached';
      return;
    elsif invitation.first_attempt_at is null then
      return query select p_delivery_id, false, 'historical_or_missing_attempt';
      return;
    elsif invitation.first_attempt_at <= now() - interval '23 hours' then
      return query select p_delivery_id, false, 'idempotency_window_expired';
      return;
    end if;

    update public.volunteer_follow_up_recipients
    set next_attempt_at = now()
    where id = invitation.id;

    return query select invitation.id, true, null::text;
    return;
  end if;

  select * into outcome from public.volunteer_follow_up_outcome_deliveries
  where id = p_delivery_id and campaign_id = p_campaign_id for update;

  if not found then
    return query select p_delivery_id, false, 'delivery_unavailable';
    return;
  elsif outcome.held_at is not null then
    return query select p_delivery_id, false, 'delivery_held';
    return;
  elsif outcome.provider_email_id is not null or outcome.provider_event_at is not null then
    return query select p_delivery_id, false, 'provider_acceptance_or_event';
    return;
  elsif outcome.status <> 'failed' or outcome.failure_certainty is distinct from 'definite' then
    return query select p_delivery_id, false, 'not_definite_failure';
    return;
  elsif outcome.claimed_until > now() then
    return query select p_delivery_id, false, 'live_claim';
    return;
  elsif outcome.next_attempt_at is not null then
    return query select p_delivery_id, false, 'retry_already_scheduled';
    return;
  elsif outcome.attempt_count >= 4 then
    return query select p_delivery_id, false, 'attempt_limit_reached';
    return;
  elsif outcome.first_attempt_at is null then
    return query select p_delivery_id, false, 'historical_or_missing_attempt';
    return;
  elsif outcome.first_attempt_at <= now() - interval '23 hours' then
    return query select p_delivery_id, false, 'idempotency_window_expired';
    return;
  elsif not exists (
    select 1 from public.volunteer_follow_up_recipients r
    where r.id = outcome.recipient_id
      and r.decision = outcome.decision
      and r.decision_version = outcome.decision_version
  ) then
    return query select p_delivery_id, false, 'outcome_decision_changed';
    return;
  elsif jsonb_typeof(outcome.payload) is distinct from 'object'
    or coalesce(outcome.payload->>'from', '') = ''
    or coalesce(outcome.payload->>'subject', '') = ''
    or coalesce(outcome.payload->>'html', '') = ''
    or coalesce(outcome.payload->>'text', '') = ''
    or jsonb_typeof(outcome.payload->'to') is distinct from 'array'
    or coalesce(
      case when jsonb_typeof(outcome.payload->'to') = 'array'
        then jsonb_array_length(outcome.payload->'to') end,
      0
    ) <> 1 then
    return query select p_delivery_id, false, 'frozen_payload_invalid';
    return;
  end if;

  update public.volunteer_follow_up_outcome_deliveries
  set next_attempt_at = now()
  where id = outcome.id;

  return query select outcome.id, true, null::text;
end;
$$;


commit;
