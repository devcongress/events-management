-- An edition-owned invitation queue and final volunteer follow-up answers.
-- The existing evergreen volunteer application document remains the intake source.

begin;

create table public.volunteer_follow_up_campaigns (
  id uuid primary key default gen_random_uuid(),
  edition_year integer not null unique check (edition_year = 2026),
  application_deadline_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'closed')),
  launched_at timestamptz,
  launched_by text,
  last_drain_at timestamptz,
  last_drain_reason text,
  drain_lease_token uuid,
  drain_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_follow_up_launch_requires_deadline check (
    status = 'draft' or application_deadline_at is not null
  )
);

create table public.volunteer_follow_up_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.volunteer_follow_up_campaigns(id) on delete cascade,
  application_id text not null,
  application_created_at timestamptz not null,
  applicant_name text not null,
  applicant_email text not null,
  status text not null default 'queued' check (status in (
    'queued', 'sending', 'accepted', 'delivered', 'delayed', 'failed',
    'bounced', 'suppressed', 'complained'
  )),
  idempotency_key text not null unique,
  provider_email_id text unique,
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  claimed_until timestamptz,
  last_error text,
  provider_event_at timestamptz,
  submitted_at timestamptz,
  motivation text,
  can_attend_accra boolean,
  review_status text not null default 'unreviewed' check (review_status in (
    'unreviewed', 'reviewed', 'needs_follow_up'
  )),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, application_id),
  unique (campaign_id, applicant_email),
  constraint volunteer_follow_up_answer_complete check (
    (submitted_at is null and motivation is null and can_attend_accra is null)
    or (submitted_at is not null and motivation is not null and can_attend_accra is not null)
  )
);

create table public.volunteer_follow_up_daily_claims (
  campaign_id uuid not null references public.volunteer_follow_up_campaigns(id) on delete cascade,
  send_day date not null,
  claimed_count integer not null default 0 check (claimed_count between 0 and 54),
  primary key (campaign_id, send_day)
);

create table public.volunteer_follow_up_webhook_events (
  webhook_event_id text primary key,
  provider_email_id text not null,
  event_type text not null,
  provider_created_at timestamptz not null,
  processed_at timestamptz not null default now()
);

create index volunteer_follow_up_recipients_pending_idx
  on public.volunteer_follow_up_recipients (campaign_id, created_at, id)
  where status in ('queued', 'failed');

create index volunteer_follow_up_webhook_provider_idx
  on public.volunteer_follow_up_webhook_events (provider_email_id, provider_created_at);

create trigger set_volunteer_follow_up_campaign_updated_at
before update on public.volunteer_follow_up_campaigns
for each row execute function public.set_updated_at();

create trigger set_volunteer_follow_up_recipient_updated_at
before update on public.volunteer_follow_up_recipients
for each row execute function public.set_updated_at();

alter table public.volunteer_follow_up_campaigns enable row level security;
alter table public.volunteer_follow_up_recipients enable row level security;
alter table public.volunteer_follow_up_daily_claims enable row level security;
alter table public.volunteer_follow_up_webhook_events enable row level security;

revoke all on public.volunteer_follow_up_campaigns from public, anon, authenticated;
revoke all on public.volunteer_follow_up_recipients from public, anon, authenticated;
revoke all on public.volunteer_follow_up_daily_claims from public, anon, authenticated;
revoke all on public.volunteer_follow_up_webhook_events from public, anon, authenticated;

grant select, insert, update on public.volunteer_follow_up_campaigns to service_role;
grant select, insert, update on public.volunteer_follow_up_recipients to service_role;
grant select, insert, update on public.volunteer_follow_up_daily_claims to service_role;
grant select, insert on public.volunteer_follow_up_webhook_events to service_role;

insert into public.volunteer_follow_up_campaigns (edition_year, application_deadline_at)
values (2026, '2026-09-30 23:59:59.999+00')
on conflict (edition_year) do nothing;

create function public.acquire_volunteer_follow_up_drain_lease(
  p_campaign_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acquired boolean;
begin
  update public.volunteer_follow_up_campaigns
  set drain_lease_token = p_lease_token,
    drain_lease_until = now() + interval '2 minutes'
  where id = p_campaign_id
    and (drain_lease_until is null or drain_lease_until <= now())
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create function public.renew_volunteer_follow_up_drain_lease(
  p_campaign_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  renewed boolean;
begin
  update public.volunteer_follow_up_campaigns
  set drain_lease_until = now() + interval '2 minutes'
  where id = p_campaign_id
    and drain_lease_token = p_lease_token
    and drain_lease_until > now()
  returning true into renewed;

  return coalesce(renewed, false);
end;
$$;

create function public.release_volunteer_follow_up_drain_lease(
  p_campaign_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  released boolean;
begin
  update public.volunteer_follow_up_campaigns
  set drain_lease_token = null,
    drain_lease_until = null
  where id = p_campaign_id
    and drain_lease_token = p_lease_token
  returning true into released;

  return coalesce(released, false);
end;
$$;

revoke all on function public.acquire_volunteer_follow_up_drain_lease(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.renew_volunteer_follow_up_drain_lease(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.release_volunteer_follow_up_drain_lease(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.acquire_volunteer_follow_up_drain_lease(uuid, uuid)
to service_role;
grant execute on function public.renew_volunteer_follow_up_drain_lease(uuid, uuid)
to service_role;
grant execute on function public.release_volunteer_follow_up_drain_lease(uuid, uuid)
to service_role;

create function public.claim_volunteer_follow_up_recipient(
  p_campaign_id uuid,
  p_safe_slots integer
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
    or p_safe_slots < 1 then
    return;
  end if;

  update public.volunteer_follow_up_recipients
  set status = 'failed', claimed_until = null, next_attempt_at = null,
    last_error = 'Provider result unconfirmed after the idempotency window; inspect Resend before retrying.'
  where campaign_id = p_campaign_id
    and status = 'sending'
    and claimed_until <= now()
    and first_attempt_at <= now() - interval '23 hours';

  insert into public.volunteer_follow_up_daily_claims (campaign_id, send_day)
  values (p_campaign_id, (now() at time zone 'Africa/Accra')::date)
  on conflict do nothing;

  select claimed_count into claimed_today
  from public.volunteer_follow_up_daily_claims
  where campaign_id = p_campaign_id
    and send_day = (now() at time zone 'Africa/Accra')::date
  for update;

  if claimed_today >= 54 then
    return;
  end if;

  select * into due from public.volunteer_follow_up_recipients
  where campaign_id = p_campaign_id
    and (
      status = 'queued'
      or (status = 'sending' and claimed_until <= now()
        and attempt_count < 4
        and first_attempt_at > now() - interval '23 hours')
      or (status = 'failed' and next_attempt_at <= now()
        and attempt_count < 4
        and (first_attempt_at is null or first_attempt_at > now() - interval '23 hours'))
    )
    and submitted_at is null
    and application_created_at <= campaign.application_deadline_at
  order by created_at, id
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.volunteer_follow_up_recipients
  set status = 'sending', attempt_count = attempt_count + 1,
    first_attempt_at = coalesce(first_attempt_at, now()),
    last_attempt_at = now(), claimed_until = now() + interval '5 minutes',
    next_attempt_at = null, last_error = null
  where id = due.id
  returning * into due;

  update public.volunteer_follow_up_daily_claims
  set claimed_count = claimed_count + 1
  where campaign_id = p_campaign_id
    and send_day = (now() at time zone 'Africa/Accra')::date;

  return next due;
end;
$$;

revoke all on function public.claim_volunteer_follow_up_recipient(uuid, integer)
from public, anon, authenticated;
grant execute on function public.claim_volunteer_follow_up_recipient(uuid, integer)
to service_role;

commit;
