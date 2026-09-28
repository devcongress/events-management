-- Structured evidence makes Owner diagnostics factual and keeps manual queue
-- retries limited to failures that Resend definitively did not accept.

begin;

alter table public.volunteer_follow_up_recipients
  add column delivery_stage text not null default 'queue'
    check (delivery_stage in ('queue', 'provider_request', 'provider_response', 'provider_event')),
  add column provider_http_status integer
    check (provider_http_status between 100 and 599),
  add column failure_certainty text
    check (failure_certainty in ('definite', 'ambiguous')),
  add column diagnostic_at timestamptz;

alter table public.volunteer_follow_up_outcome_deliveries
  add column delivery_stage text not null default 'queue'
    check (delivery_stage in ('queue', 'provider_request', 'provider_response', 'provider_event')),
  add column provider_http_status integer
    check (provider_http_status between 100 and 599),
  add column failure_certainty text
    check (failure_certainty in ('definite', 'ambiguous')),
  add column diagnostic_at timestamptz;

create function public.finalize_volunteer_follow_up_outcome_send(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_status text,
  p_provider_email_id text,
  p_last_error text,
  p_next_attempt_at timestamptz,
  p_delivery_stage text,
  p_provider_http_status integer,
  p_failure_certainty text,
  p_diagnostic_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated boolean;
begin
  if p_status not in ('accepted', 'failed', 'retrying', 'needs_attention') then
    raise exception using errcode = '22023', message = 'invalid_outcome_delivery_status';
  end if;
  if p_delivery_stage not in ('queue', 'provider_request', 'provider_response') then
    raise exception using errcode = '22023', message = 'invalid_outcome_delivery_stage';
  end if;
  if p_provider_http_status is not null
    and (p_provider_http_status < 100 or p_provider_http_status > 599) then
    raise exception using errcode = '22023', message = 'invalid_outcome_provider_http_status';
  end if;
  if p_failure_certainty is not null
    and p_failure_certainty not in ('definite', 'ambiguous') then
    raise exception using errcode = '22023', message = 'invalid_outcome_failure_certainty';
  end if;

  update public.volunteer_follow_up_outcome_deliveries
  set status = p_status,
    provider_email_id = coalesce(p_provider_email_id, provider_email_id),
    last_error = p_last_error,
    next_attempt_at = p_next_attempt_at,
    delivery_stage = p_delivery_stage,
    provider_http_status = p_provider_http_status,
    failure_certainty = p_failure_certainty,
    diagnostic_at = p_diagnostic_at,
    claimed_until = null,
    claim_token = null
  where id = p_delivery_id and status = 'sending' and claim_token = p_claim_token
  returning true into updated;

  return coalesce(updated, false);
end;
$$;

revoke all on function public.finalize_volunteer_follow_up_outcome_send(uuid, uuid, text, text, text, timestamptz, text, integer, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.finalize_volunteer_follow_up_outcome_send(uuid, uuid, text, text, text, timestamptz, text, integer, text, timestamptz)
to service_role;

-- This is intentionally a queue operation only. It does not acquire a sender
-- claim, change campaign controls, reset counters, rotate idempotency keys, or
-- invoke Resend. Campaign is locked before the target row to match drain order.
create function public.queue_volunteer_follow_up_failed_delivery_retry(
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

revoke all on function public.queue_volunteer_follow_up_failed_delivery_retry(uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.queue_volunteer_follow_up_failed_delivery_retry(uuid, text, uuid)
to service_role;

-- Never claim an invitation after a provider identity or webhook event exists.
drop function public.claim_volunteer_follow_up_recipient(uuid, integer, uuid);

create function public.claim_volunteer_follow_up_recipient(
  p_campaign_id uuid,
  p_safe_slots integer,
  p_lease_token uuid
)
returns setof public.volunteer_follow_up_recipients
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign public.volunteer_follow_up_campaigns%rowtype;
  due public.volunteer_follow_up_recipients%rowtype;
  claimed_today integer;
begin
  perform pg_advisory_xact_lock(hashtext('volunteer_follow_up:' || p_campaign_id::text));
  select * into campaign from public.volunteer_follow_up_campaigns
  where id = p_campaign_id for update;
  if not found or campaign.status <> 'running' or campaign.application_deadline_at is null
    or now() >= campaign.application_deadline_at + interval '14 days'
    or campaign.drain_lease_token is distinct from p_lease_token
    or p_lease_token is null or campaign.drain_lease_until is null
    or campaign.drain_lease_until <= now()
    or p_safe_slots < 1 then return; end if;

  update public.volunteer_follow_up_recipients
  set status = 'failed', claimed_until = null, next_attempt_at = null,
    failure_certainty = 'ambiguous', delivery_stage = 'provider_request',
    diagnostic_at = now(),
    last_error = 'Provider result unconfirmed after the idempotency window; inspect Resend before retrying.'
  where campaign_id = p_campaign_id and status = 'sending'
    and claimed_until <= now() and first_attempt_at <= now() - interval '23 hours';

  insert into public.volunteer_follow_up_daily_claims (campaign_id, send_day)
  values (p_campaign_id, (now() at time zone 'Africa/Accra')::date)
  on conflict do nothing;
  select claimed_count into claimed_today from public.volunteer_follow_up_daily_claims
  where campaign_id = p_campaign_id and send_day = (now() at time zone 'Africa/Accra')::date
  for update;
  if claimed_today >= 54 then return; end if;

  select * into due from public.volunteer_follow_up_recipients
  where campaign_id = p_campaign_id
    and provider_email_id is null and provider_event_at is null
    and (status = 'queued'
      or (status = 'sending' and claimed_until <= now()
        and attempt_count < 4 and first_attempt_at > now() - interval '23 hours')
      or (status = 'failed' and next_attempt_at <= now()
        and attempt_count < 4 and (first_attempt_at is null or first_attempt_at > now() - interval '23 hours')))
    and submitted_at is null
    and application_created_at <= campaign.application_deadline_at
  order by created_at, id limit 1 for update skip locked;
  if not found then return; end if;

  update public.volunteer_follow_up_recipients
  set status = 'sending', attempt_count = attempt_count + 1,
    first_attempt_at = coalesce(first_attempt_at, now()), last_attempt_at = now(),
    claimed_until = now() + interval '5 minutes', next_attempt_at = null,
    delivery_stage = 'provider_request', provider_http_status = null,
    failure_certainty = null, diagnostic_at = now(), last_error = null
  where volunteer_follow_up_recipients.id = due.id returning * into due;
  update public.volunteer_follow_up_daily_claims
  set claimed_count = claimed_count + 1
  where campaign_id = p_campaign_id and send_day = (now() at time zone 'Africa/Accra')::date;
  return next due;
end;
$$;

revoke all on function public.claim_volunteer_follow_up_recipient(uuid, integer, uuid)
from public, anon, authenticated;
grant execute on function public.claim_volunteer_follow_up_recipient(uuid, integer, uuid)
to service_role;

-- A reclaimed outcome may have reached Resend before the worker crashed. Clear
-- prior rejection evidence before every new provider attempt and mark expired
-- claims ambiguous, so manual retry never mistakes an unknown send for 422.
drop function public.claim_volunteer_follow_up_outcome(uuid, integer, uuid, uuid);

create function public.claim_volunteer_follow_up_outcome(
  p_campaign_id uuid,
  p_safe_slots integer,
  p_claim_token uuid,
  p_lease_token uuid
)
returns setof public.volunteer_follow_up_outcome_deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign public.volunteer_follow_up_campaigns%rowtype;
  due public.volunteer_follow_up_outcome_deliveries%rowtype;
  claimed_today integer;
begin
  perform pg_advisory_xact_lock(hashtext('volunteer_follow_up:' || p_campaign_id::text));
  select * into campaign from public.volunteer_follow_up_campaigns
  where id = p_campaign_id for update;
  if not found or campaign.outcome_paused or p_safe_slots < 1
    or campaign.drain_lease_token is distinct from p_lease_token
    or p_lease_token is null or campaign.drain_lease_until is null
    or campaign.drain_lease_until <= now() then return; end if;

  update public.volunteer_follow_up_outcome_deliveries
  set status = 'needs_attention', claimed_until = null, claim_token = null,
    next_attempt_at = null, delivery_stage = 'provider_request',
    provider_http_status = null, failure_certainty = 'ambiguous', diagnostic_at = now(),
    last_error = 'Provider result unconfirmed after the idempotency window; inspect Resend before any manual action.'
  where campaign_id = p_campaign_id and (
    (status = 'sending' and (claimed_until is null or claimed_until <= now()) and first_attempt_at <= now() - interval '23 hours')
    or (status = 'retrying' and first_attempt_at <= now() - interval '23 hours')
    or (status = 'failed' and next_attempt_at is not null and first_attempt_at <= now() - interval '23 hours')
  );

  insert into public.volunteer_follow_up_daily_claims (campaign_id, send_day)
  values (p_campaign_id, (now() at time zone 'Africa/Accra')::date)
  on conflict do nothing;
  select claimed_count into claimed_today from public.volunteer_follow_up_daily_claims
  where campaign_id = p_campaign_id and send_day = (now() at time zone 'Africa/Accra')::date
  for update;
  if claimed_today >= 54 then return; end if;

  select d.* into due from public.volunteer_follow_up_outcome_deliveries d
  join public.volunteer_follow_up_recipients r on r.id = d.recipient_id
  where d.campaign_id = p_campaign_id
    and d.provider_email_id is null and d.provider_event_at is null
    and (d.status = 'queued'
      or (d.status = 'sending' and (d.claimed_until is null or d.claimed_until <= now())
        and d.attempt_count < 4 and d.first_attempt_at > now() - interval '23 hours')
      or (d.status = 'retrying' and d.next_attempt_at <= now()
        and d.attempt_count < 4 and d.first_attempt_at > now() - interval '23 hours')
      or (d.status = 'failed' and d.provider_email_id is null and d.next_attempt_at <= now()
        and d.attempt_count < 4 and (d.first_attempt_at is null or d.first_attempt_at > now() - interval '23 hours')))
    and r.decision = d.decision and r.decision_version = d.decision_version
  order by d.created_at, d.id limit 1 for update of d, r skip locked;
  if not found then return; end if;

  update public.volunteer_follow_up_outcome_deliveries
  set status = 'sending', attempt_count = attempt_count + 1,
    first_attempt_at = coalesce(first_attempt_at, now()), last_attempt_at = now(),
    claimed_until = now() + interval '5 minutes', claim_token = p_claim_token,
    next_attempt_at = null, delivery_stage = 'provider_request',
    provider_http_status = null, failure_certainty = null, diagnostic_at = now(),
    last_error = null
  where public.volunteer_follow_up_outcome_deliveries.id = due.id returning * into due;
  update public.volunteer_follow_up_daily_claims
  set claimed_count = claimed_count + 1
  where campaign_id = p_campaign_id and send_day = (now() at time zone 'Africa/Accra')::date;
  return next due;
end;
$$;

revoke all on function public.claim_volunteer_follow_up_outcome(uuid, integer, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.claim_volunteer_follow_up_outcome(uuid, integer, uuid, uuid)
to service_role;

commit;
