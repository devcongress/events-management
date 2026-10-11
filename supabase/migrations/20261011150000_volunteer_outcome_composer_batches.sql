-- Owner-composed volunteer outcomes and atomic, replay-safe provider batches.

begin;

create table public.volunteer_follow_up_outcome_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.volunteer_follow_up_campaigns(id) on delete cascade,
  preview_id uuid references public.volunteer_follow_up_outcome_previews(id) on delete restrict,
  idempotency_key text not null unique,
  recipient_count integer not null check (recipient_count between 1 and 100),
  status text not null default 'queued' check (status in ('queued', 'sending', 'accepted', 'retrying', 'failed', 'needs_attention')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 4),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  claimed_until timestamptz,
  claim_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.volunteer_follow_up_outcome_deliveries
  add column batch_id uuid references public.volunteer_follow_up_outcome_batches(id) on delete restrict,
  add column batch_idempotency_key text,
  add column batch_position integer;

-- Preserve deliveries queued before this migration as deterministic one-item
-- batches, including their original idempotency keys.
do $$
declare legacy public.volunteer_follow_up_outcome_deliveries%rowtype; legacy_batch_id uuid;
begin
  for legacy in select * from public.volunteer_follow_up_outcome_deliveries where batch_id is null loop
    insert into public.volunteer_follow_up_outcome_batches (
      campaign_id, idempotency_key, recipient_count, status, attempt_count,
      first_attempt_at, last_attempt_at, claimed_until, claim_token
    ) values (
      legacy.campaign_id, legacy.idempotency_key, 1,
      case when legacy.status in ('queued', 'sending', 'retrying', 'accepted', 'failed', 'needs_attention') then legacy.status else 'needs_attention' end,
      legacy.attempt_count, legacy.first_attempt_at, legacy.last_attempt_at,
      legacy.claimed_until, legacy.claim_token
    ) returning id into legacy_batch_id;
    update public.volunteer_follow_up_outcome_deliveries
    set batch_id = legacy_batch_id, batch_idempotency_key = legacy.idempotency_key,
      batch_position = 1
    where id = legacy.id;
  end loop;
end $$;

create index volunteer_outcome_batch_due_idx
  on public.volunteer_follow_up_outcome_batches (campaign_id, created_at, id)
  where status in ('queued', 'retrying', 'sending');
create index volunteer_outcome_delivery_batch_idx
  on public.volunteer_follow_up_outcome_deliveries (batch_id, batch_position)
  where batch_id is not null;

create unique index volunteer_outcome_delivery_batch_position_key
  on public.volunteer_follow_up_outcome_deliveries (batch_id, batch_position)
  where batch_id is not null;

create trigger set_volunteer_follow_up_outcome_batch_updated_at
before update on public.volunteer_follow_up_outcome_batches
for each row execute function public.set_updated_at();

alter table public.volunteer_follow_up_outcome_batches enable row level security;
revoke all on public.volunteer_follow_up_outcome_batches from public, anon, authenticated;
grant select, insert, update on public.volunteer_follow_up_outcome_batches to service_role;

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
    if (position - 1) % 50 = 0 then
      batch_number := batch_number + 1;
      insert into public.volunteer_follow_up_outcome_batches (campaign_id, preview_id, idempotency_key, recipient_count)
      values (preview.campaign_id, preview.id, 'volunteer-outcome-batch/' || preview.id::text || '/' || batch_number::text, least(50, preview.eligible_count - position + 1)) returning id into batch_id;
    end if;
    insert into public.volunteer_follow_up_outcome_deliveries (campaign_id, recipient_id, decision, decision_version, recipient_name, recipient_email, payload, template_version, idempotency_key, created_by, batch_id, batch_idempotency_key, batch_position)
    values (preview.campaign_id, recipient.id, preview.decision, recipient.decision_version, recipient.applicant_name, recipient.applicant_email, preview.payloads->(item->>'recipient_id'), preview.template_version, 'volunteer-outcome/' || recipient.id::text || '/' || recipient.decision_version::text, p_actor, batch_id, 'volunteer-outcome-batch/' || preview.id::text || '/' || batch_number::text, ((position - 1) % 50) + 1) returning id into new_id;
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
  where b.campaign_id = p_campaign_id and b.recipient_count <= p_safe_slots and (
    (b.status = 'queued' and b.recipient_count <= 54 - claimed_today)
    or (b.status = 'sending' and b.attempt_count < 4 and b.first_attempt_at > now() - interval '23 hours' and (b.claimed_until is null or b.claimed_until <= now()))
    or (b.status in ('retrying', 'failed') and b.attempt_count < 4 and b.first_attempt_at > now() - interval '23 hours' and exists (
      select 1 from public.volunteer_follow_up_outcome_deliveries d
      where d.batch_id = b.id and d.next_attempt_at <= now()
    ))
  ) order by b.created_at, b.id limit 1 for update skip locked;
  if not found then return; end if;
  update public.volunteer_follow_up_outcome_batches set status = 'sending', attempt_count = attempt_count + 1, first_attempt_at = coalesce(first_attempt_at, now()), last_attempt_at = now(), next_attempt_at = null, claimed_until = now() + interval '5 minutes', claim_token = p_claim_token where id = chosen.id;
  update public.volunteer_follow_up_outcome_deliveries set status = 'sending', attempt_count = attempt_count + 1, first_attempt_at = coalesce(first_attempt_at, now()), last_attempt_at = now(), claimed_until = now() + interval '5 minutes', claim_token = p_claim_token, next_attempt_at = null, delivery_stage = 'provider_request', provider_http_status = null, failure_certainty = null, diagnostic_at = now(), last_error = null where batch_id = chosen.id and status in ('queued', 'sending', 'retrying', 'failed');
  get diagnostics claimed_rows = row_count;
  if claimed_rows <> chosen.recipient_count then raise exception using errcode = '40001', message = 'batch_mapping_changed'; end if;
  if chosen.attempt_count = 0 then
    update public.volunteer_follow_up_daily_claims dc set claimed_count = dc.claimed_count + chosen.recipient_count where dc.campaign_id = p_campaign_id and dc.send_day = (now() at time zone 'Africa/Accra')::date;
  end if;
  return query select d.* from public.volunteer_follow_up_outcome_deliveries d where d.batch_id = chosen.id order by d.batch_position, d.id;
end; $$;

create function public.finalize_volunteer_follow_up_outcome_batch(
  p_batch_id uuid, p_claim_token uuid, p_status text, p_provider_email_ids text[],
  p_last_error text, p_next_attempt_at timestamptz, p_delivery_stage text,
  p_provider_http_status integer, p_failure_certainty text, p_diagnostic_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare batch public.volunteer_follow_up_outcome_batches%rowtype; delivery_count integer;
begin
  if p_status not in ('accepted', 'failed', 'retrying', 'needs_attention')
    or p_delivery_stage not in ('queue', 'provider_request', 'provider_response') then
    raise exception using errcode = '22023', message = 'invalid_outcome_delivery_finalization';
  end if;
  select * into batch from public.volunteer_follow_up_outcome_batches where id = p_batch_id and status = 'sending' and claim_token = p_claim_token for update;
  if not found then return false; end if;
  select count(*) into delivery_count from public.volunteer_follow_up_outcome_deliveries where batch_id = batch.id and status = 'sending' and claim_token = p_claim_token;
  if delivery_count <> batch.recipient_count then raise exception using errcode = '40001', message = 'batch_mapping_changed'; end if;
  if p_status = 'accepted' and (coalesce(array_length(p_provider_email_ids, 1), 0) <> batch.recipient_count or exists (select 1 from unnest(p_provider_email_ids) provider_id where provider_id is null or btrim(provider_id) = '') or (select count(distinct provider_id) from unnest(p_provider_email_ids) provider_id) <> batch.recipient_count) then
    raise exception using errcode = '22023', message = 'provider_email_id_mapping_invalid';
  end if;
  if p_status = 'accepted' then
    update public.volunteer_follow_up_outcome_deliveries d set status = p_status,
      provider_email_id = mapping.provider_email_id, last_error = null, next_attempt_at = null,
      delivery_stage = p_delivery_stage, provider_http_status = p_provider_http_status,
      failure_certainty = p_failure_certainty, diagnostic_at = p_diagnostic_at,
      claimed_until = null, claim_token = null
    from unnest(p_provider_email_ids) with ordinality mapping(provider_email_id, batch_position)
    where d.batch_id = batch.id and d.batch_position = mapping.batch_position and d.status = 'sending' and d.claim_token = p_claim_token;
  else
    update public.volunteer_follow_up_outcome_deliveries set status = p_status,
      last_error = p_last_error, next_attempt_at = p_next_attempt_at, delivery_stage = p_delivery_stage,
      provider_http_status = p_provider_http_status, failure_certainty = p_failure_certainty,
      diagnostic_at = p_diagnostic_at, claimed_until = null, claim_token = null
    where batch_id = batch.id and status = 'sending' and claim_token = p_claim_token;
  end if;
  update public.volunteer_follow_up_outcome_batches set status = p_status, next_attempt_at = p_next_attempt_at,
    claimed_until = null, claim_token = null where id = batch.id;
  return true;
end; $$;

revoke all on function public.finalize_volunteer_follow_up_outcome_batch(uuid, uuid, text, text[], text, timestamptz, text, integer, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_volunteer_follow_up_outcome_batch(uuid, uuid, text, text[], text, timestamptz, text, integer, text, timestamptz) to service_role;

commit;
