-- Explicit volunteer selection and separately audited outcome email delivery.

begin;

alter table public.volunteer_follow_up_campaigns
  add column outcome_paused boolean not null default false;

alter table public.volunteer_follow_up_recipients
  add column decision text not null default 'pending'
    check (decision in ('pending', 'accepted', 'not_selected')),
  add column decision_version integer not null default 0 check (decision_version >= 0),
  add column decision_at timestamptz,
  add column decision_by text;

create table public.volunteer_follow_up_outcome_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.volunteer_follow_up_campaigns(id) on delete cascade,
  recipient_id uuid not null references public.volunteer_follow_up_recipients(id) on delete cascade,
  decision text not null check (decision in ('accepted', 'not_selected')),
  decision_version integer not null check (decision_version > 0),
  recipient_name text not null,
  recipient_email text not null,
  payload jsonb not null,
  template_version text not null,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in (
    'queued', 'sending', 'retrying', 'accepted', 'delivered', 'delayed', 'failed',
    'bounced', 'suppressed', 'complained', 'needs_attention', 'cancelled'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 4),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  claimed_until timestamptz,
  claim_token uuid,
  provider_email_id text unique,
  provider_event_at timestamptz,
  last_error text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipient_id, decision_version)
);

create table public.volunteer_follow_up_outcome_previews (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.volunteer_follow_up_campaigns(id) on delete cascade,
  decision text not null check (decision in ('accepted', 'not_selected')),
  recipients jsonb not null,
  payloads jsonb not null default '{}'::jsonb,
  template_version text not null default 'volunteer-outcome-v1',
  eligible_count integer not null check (eligible_count >= 0),
  excluded_count integer not null check (excluded_count >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  confirmed_at timestamptz,
  delivery_ids uuid[]
);

create index volunteer_follow_up_outcome_pending_idx
  on public.volunteer_follow_up_outcome_deliveries (campaign_id, created_at, id)
  where status in ('queued', 'failed', 'sending');

create index volunteer_follow_up_outcome_webhook_idx
  on public.volunteer_follow_up_outcome_deliveries (provider_email_id)
  where provider_email_id is not null;

create trigger set_volunteer_follow_up_outcome_updated_at
before update on public.volunteer_follow_up_outcome_deliveries
for each row execute function public.set_updated_at();

alter table public.volunteer_follow_up_outcome_deliveries enable row level security;
alter table public.volunteer_follow_up_outcome_previews enable row level security;
revoke all on public.volunteer_follow_up_outcome_deliveries from public, anon, authenticated;
revoke all on public.volunteer_follow_up_outcome_previews from public, anon, authenticated;
grant select, insert, update on public.volunteer_follow_up_outcome_deliveries to service_role;
grant select, insert, update on public.volunteer_follow_up_outcome_previews to service_role;

create function public.save_volunteer_follow_up_decision(
  p_recipient_id uuid,
  p_expected_version integer,
  p_decision text,
  p_review_status text,
  p_review_note text,
  p_actor text
)
returns setof public.volunteer_follow_up_recipients
language plpgsql
security definer
set search_path = ''
as $$
declare
  campaign_id uuid;
  current_recipient public.volunteer_follow_up_recipients%rowtype;
begin
  select r.campaign_id into campaign_id
  from public.volunteer_follow_up_recipients r where r.id = p_recipient_id;
  if not found then raise exception using errcode = 'P0002', message = 'submitted_response_not_found'; end if;

  perform pg_advisory_xact_lock(hashtext('volunteer_follow_up:' || campaign_id::text));
  select * into current_recipient
  from public.volunteer_follow_up_recipients
  where id = p_recipient_id
  for update;

  if not found or current_recipient.submitted_at is null then
    raise exception using errcode = 'P0002', message = 'submitted_response_not_found';
  end if;
  if p_expected_version <> current_recipient.decision_version then
    raise exception using errcode = '40001', message = 'decision_version_conflict';
  end if;
  if p_decision not in ('pending', 'accepted', 'not_selected')
    or p_review_status not in ('unreviewed', 'reviewed', 'needs_follow_up') then
    raise exception using errcode = '22023', message = 'invalid_decision_or_review';
  end if;
  if p_decision is distinct from current_recipient.decision and exists (
    select 1 from public.volunteer_follow_up_outcome_deliveries d
    where d.recipient_id = p_recipient_id
      and (d.attempt_count > 0 or d.provider_email_id is not null or d.status in ('sending', 'retrying', 'accepted', 'delivered', 'delayed', 'bounced', 'suppressed', 'complained', 'needs_attention'))
  ) then
    raise exception using errcode = '55000', message = 'outcome_delivery_already_started';
  end if;

  if p_decision is distinct from current_recipient.decision then
    update public.volunteer_follow_up_outcome_deliveries
    set status = 'cancelled', claimed_until = null, claim_token = null,
      next_attempt_at = null
    where recipient_id = p_recipient_id and status in ('queued', 'failed');
  end if;

  update public.volunteer_follow_up_recipients
  set review_status = p_review_status,
    review_note = nullif(p_review_note, ''),
    reviewed_at = now(), reviewed_by = p_actor,
    decision = p_decision,
    decision_version = decision_version + case when p_decision is distinct from current_recipient.decision then 1 else 0 end,
    decision_at = case when p_decision is distinct from current_recipient.decision then now() else decision_at end,
    decision_by = case when p_decision is distinct from current_recipient.decision then p_actor else decision_by end
  where id = p_recipient_id
  returning * into current_recipient;

  return next current_recipient;
end;
$$;

revoke all on function public.save_volunteer_follow_up_decision(uuid, integer, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.save_volunteer_follow_up_decision(uuid, integer, text, text, text, text)
to service_role;

create function public.create_volunteer_follow_up_outcome_preview(
  p_campaign_id uuid,
  p_decision text,
  p_actor text
)
returns table (preview_id uuid, eligible_count integer, excluded_count integer, recipients jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  included integer;
  excluded integer;
  new_id uuid;
begin
  if p_decision not in ('accepted', 'not_selected') then
    raise exception using errcode = '22023', message = 'invalid_outcome_decision';
  end if;

  perform 1 from public.volunteer_follow_up_campaigns where id = p_campaign_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'campaign_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'recipient_id', r.id,
    'decision_version', r.decision_version,
    'name', r.applicant_name,
    'email', r.applicant_email
  ) order by r.created_at, r.id), '[]'::jsonb)
  into snapshot
  from public.volunteer_follow_up_recipients r
  where r.campaign_id = p_campaign_id
    and r.submitted_at is not null
    and r.decision = p_decision
    and not exists (
      select 1 from public.volunteer_follow_up_outcome_deliveries d
      where d.recipient_id = r.id
        and d.decision_version = r.decision_version
        and d.status <> 'cancelled'
    );

  included := jsonb_array_length(snapshot);
  select count(*)::integer into excluded
  from public.volunteer_follow_up_recipients r
  where r.campaign_id = p_campaign_id and r.submitted_at is not null
    and r.decision = p_decision and not exists (
      select 1 from jsonb_array_elements(snapshot) s
      where s->>'recipient_id' = r.id::text
    );

  insert into public.volunteer_follow_up_outcome_previews (
    campaign_id, decision, recipients, eligible_count, excluded_count, created_by
  ) values (p_campaign_id, p_decision, snapshot, included, excluded, p_actor)
  returning id into new_id;

  return query select new_id, included, excluded, snapshot;
end;
$$;

revoke all on function public.create_volunteer_follow_up_outcome_preview(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.create_volunteer_follow_up_outcome_preview(uuid, text, text)
to service_role;

create function public.save_volunteer_follow_up_outcome_preview_payloads(
  p_preview_id uuid,
  p_actor text,
  p_payloads jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview public.volunteer_follow_up_outcome_previews%rowtype;
begin
  select * into preview from public.volunteer_follow_up_outcome_previews
  where id = p_preview_id and created_by = p_actor for update;
  if not found or preview.expires_at <= now() or preview.confirmed_at is not null then
    raise exception using errcode = '55000', message = 'preview_unavailable';
  end if;
  if jsonb_typeof(p_payloads) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_payloads)) <> preview.eligible_count then
    raise exception using errcode = '22023', message = 'preview_payload_count_mismatch';
  end if;
  update public.volunteer_follow_up_outcome_previews
  set payloads = p_payloads where id = preview.id;
  return true;
end;
$$;

revoke all on function public.save_volunteer_follow_up_outcome_preview_payloads(uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function public.save_volunteer_follow_up_outcome_preview_payloads(uuid, text, jsonb)
to service_role;

drop function if exists public.confirm_volunteer_follow_up_outcome_preview(uuid, text, jsonb);

create function public.confirm_volunteer_follow_up_outcome_preview(
  p_preview_id uuid,
  p_actor text
)
returns table (queued_count integer, delivery_ids uuid[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview public.volunteer_follow_up_outcome_previews%rowtype;
  item jsonb;
  recipient public.volunteer_follow_up_recipients%rowtype;
  new_delivery_ids uuid[] := array[]::uuid[];
  new_id uuid;
begin
  select * into preview from public.volunteer_follow_up_outcome_previews
  where id = p_preview_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'preview_not_found'; end if;
  if p_actor is distinct from preview.created_by then
    raise exception using errcode = '42501', message = 'preview_actor_mismatch';
  end if;
  if preview.confirmed_at is not null then
    return query select coalesce(array_length(preview.delivery_ids, 1), 0), coalesce(preview.delivery_ids, array[]::uuid[]);
    return;
  end if;
  if preview.expires_at <= now() then
    raise exception using errcode = '55000', message = 'preview_expired';
  end if;
  if jsonb_typeof(preview.payloads) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'preview_payloads_must_be_object';
  end if;
  if (select count(*) from jsonb_object_keys(preview.payloads)) <> preview.eligible_count then
    raise exception using errcode = '22023', message = 'preview_payload_count_mismatch';
  end if;
  if (
    select count(*) from public.volunteer_follow_up_recipients r
    where r.campaign_id = preview.campaign_id and r.submitted_at is not null
      and r.decision = preview.decision and not exists (
        select 1 from public.volunteer_follow_up_outcome_deliveries d
        where d.recipient_id = r.id and d.decision_version = r.decision_version
          and d.status <> 'cancelled'
      )
  ) <> preview.eligible_count then
    raise exception using errcode = '40001', message = 'preview_stale';
  end if;

  for item in select value from jsonb_array_elements(preview.recipients)
  loop
    select * into recipient from public.volunteer_follow_up_recipients
    where id = (item->>'recipient_id')::uuid and campaign_id = preview.campaign_id
    for update;
    if not found or recipient.submitted_at is null
      or recipient.decision <> preview.decision
      or recipient.decision_version <> (item->>'decision_version')::integer then
      raise exception using errcode = '40001', message = 'preview_stale';
    end if;
    if exists (
      select 1 from public.volunteer_follow_up_outcome_deliveries d
      where d.recipient_id = recipient.id and d.decision_version = recipient.decision_version
        and d.status <> 'cancelled'
    ) then
      raise exception using errcode = '40001', message = 'preview_conflict';
    end if;
    if jsonb_typeof(preview.payloads->(item->>'recipient_id')) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'preview_payload_missing';
    end if;
    insert into public.volunteer_follow_up_outcome_deliveries (
      campaign_id, recipient_id, decision, decision_version,
      recipient_name, recipient_email, payload, template_version,
      idempotency_key, created_by
    ) values (
      preview.campaign_id, recipient.id, preview.decision, recipient.decision_version,
      recipient.applicant_name, recipient.applicant_email,
      preview.payloads->(item->>'recipient_id'), preview.template_version,
      'volunteer-outcome/' || recipient.id::text || '/' || recipient.decision_version::text,
      p_actor
    ) returning id into new_id;
    new_delivery_ids := array_append(new_delivery_ids, new_id);
  end loop;

  update public.volunteer_follow_up_outcome_previews
  set confirmed_at = now(), delivery_ids = new_delivery_ids
  where id = preview.id;
  return query select coalesce(array_length(new_delivery_ids, 1), 0), new_delivery_ids;
end;
$$;

revoke all on function public.confirm_volunteer_follow_up_outcome_preview(uuid, text)
from public, anon, authenticated;
grant execute on function public.confirm_volunteer_follow_up_outcome_preview(uuid, text)
to service_role;

create function public.read_volunteer_follow_up_outcome_preview(
  p_preview_id uuid,
  p_actor text
)
returns table (
  campaign_id uuid,
  decision text,
  recipients jsonb,
  eligible_count integer,
  excluded_count integer,
  expires_at timestamptz,
  confirmed_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.campaign_id, p.decision, p.recipients, p.eligible_count,
    p.excluded_count, p.expires_at, p.confirmed_at
  from public.volunteer_follow_up_outcome_previews p
  where p.id = p_preview_id and p.created_by = p_actor;
$$;

revoke all on function public.read_volunteer_follow_up_outcome_preview(uuid, text)
from public, anon, authenticated;
grant execute on function public.read_volunteer_follow_up_outcome_preview(uuid, text)
to service_role;

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
    next_attempt_at = null,
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
    first_attempt_at = coalesce(first_attempt_at, now()),
    last_attempt_at = now(), claimed_until = now() + interval '5 minutes',
    claim_token = p_claim_token, next_attempt_at = null, last_error = null
  where volunteer_follow_up_outcome_deliveries.id = due.id returning * into due;
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

drop function public.claim_volunteer_follow_up_recipient(uuid, integer);

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
    claimed_until = now() + interval '5 minutes', next_attempt_at = null, last_error = null
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

create function public.validate_volunteer_follow_up_outcome_send(
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
    where d.id = p_delivery_id and d.status = 'sending'
      and d.claim_token = p_claim_token and d.claimed_until > now()
      and c.drain_lease_token = p_lease_token and c.drain_lease_until > now()
      and not c.outcome_paused
      and r.decision = d.decision and r.decision_version = d.decision_version
  );
$$;

create function public.finalize_volunteer_follow_up_outcome_send(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_status text,
  p_provider_email_id text,
  p_last_error text,
  p_next_attempt_at timestamptz
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
  update public.volunteer_follow_up_outcome_deliveries
  set status = p_status,
    provider_email_id = coalesce(p_provider_email_id, provider_email_id),
    last_error = p_last_error,
    next_attempt_at = p_next_attempt_at,
    claimed_until = null, claim_token = null
  where id = p_delivery_id and status = 'sending' and claim_token = p_claim_token
  returning true into updated;
  return coalesce(updated, false);
end;
$$;

revoke all on function public.validate_volunteer_follow_up_outcome_send(uuid, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.finalize_volunteer_follow_up_outcome_send(uuid, uuid, text, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.validate_volunteer_follow_up_outcome_send(uuid, uuid, uuid)
to service_role;
grant execute on function public.finalize_volunteer_follow_up_outcome_send(uuid, uuid, text, text, text, timestamptz)
to service_role;

commit;
