do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_registration_campaign_status') then
    create type public.event_registration_campaign_status as enum ('draft', 'open', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'event_registration_status') then
    create type public.event_registration_status as enum ('confirmed', 'waitlisted', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'registration_email_delivery_status') then
    create type public.registration_email_delivery_status as enum ('pending', 'accepted', 'failed');
  end if;
end $$;

create table if not exists public.event_registration_campaigns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.community_events(id) on delete cascade,
  status public.event_registration_campaign_status not null default 'draft',
  capacity integer not null default 100,
  opens_at timestamptz,
  closes_at timestamptz,
  waitlist_enabled boolean not null default true,
  auto_confirm boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_registration_campaigns_capacity_positive check (capacity > 0),
  constraint event_registration_campaigns_window_order check (
    opens_at is null or closes_at is null or closes_at >= opens_at
  )
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.event_registration_campaigns(id) on delete cascade,
  name text not null,
  email text not null,
  normalized_email text not null,
  status public.event_registration_status not null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_registrations_name_not_blank check (length(trim(name)) > 0),
  constraint event_registrations_email_not_blank check (length(trim(email)) > 0),
  constraint event_registrations_normalized_email_not_blank check (length(trim(normalized_email)) > 0),
  constraint event_registrations_campaign_email_unique unique (campaign_id, normalized_email)
);

create table if not exists public.event_registration_checkins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.event_registrations(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.registration_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.event_registrations(id) on delete cascade,
  kind text not null default 'confirmation',
  status public.registration_email_delivery_status not null default 'pending',
  attempts integer not null default 0,
  provider_id text,
  idempotency_key text not null,
  last_error text,
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_email_deliveries_kind_check check (kind in ('confirmation')),
  constraint registration_email_deliveries_attempts_nonnegative check (attempts >= 0),
  constraint registration_email_deliveries_registration_kind_unique unique (registration_id, kind)
);

create index if not exists event_registrations_campaign_status_created_idx
  on public.event_registrations (campaign_id, status, created_at);

create index if not exists event_registrations_campaign_name_idx
  on public.event_registrations (campaign_id, lower(name));

create index if not exists registration_email_deliveries_status_created_idx
  on public.registration_email_deliveries (status, created_at);

create or replace function public.register_for_event(
  p_event_id uuid,
  p_name text,
  p_email text
)
returns public.event_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.event_registration_campaigns;
  registration public.event_registrations;
  normalized_email_value text := lower(trim(p_email));
  confirmed_count integer;
  next_status public.event_registration_status;
begin
  select *
  into campaign
  from public.event_registration_campaigns
  where event_id = p_event_id
  for update;

  if campaign.id is null then
    raise exception using message = 'registration_unavailable';
  end if;

  if campaign.status <> 'open'
    or (campaign.opens_at is not null and campaign.opens_at > now())
    or (campaign.closes_at is not null and campaign.closes_at < now()) then
    raise exception using message = 'registration_closed';
  end if;

  select *
  into registration
  from public.event_registrations as existing_registration
  where existing_registration.campaign_id = campaign.id
    and existing_registration.normalized_email = normalized_email_value;

  if registration.id is not null and registration.status <> 'cancelled' then
    raise exception using message = 'registration_duplicate';
  end if;

  select count(*)
  into confirmed_count
  from public.event_registrations as confirmed_registration
  where confirmed_registration.campaign_id = campaign.id
    and confirmed_registration.status = 'confirmed';

  if campaign.auto_confirm and confirmed_count < campaign.capacity then
    next_status := 'confirmed';
  elsif campaign.waitlist_enabled then
    next_status := 'waitlisted';
  else
    raise exception using message = 'registration_full';
  end if;

  if registration.id is null then
    insert into public.event_registrations (
      campaign_id,
      name,
      email,
      normalized_email,
      status,
      confirmed_at
    ) values (
      campaign.id,
      trim(p_name),
      trim(p_email),
      normalized_email_value,
      next_status,
      case when next_status = 'confirmed' then now() else null end
    )
    returning * into registration;
  else
    update public.event_registrations
    set
      name = trim(p_name),
      email = trim(p_email),
      status = next_status,
      confirmed_at = case when next_status = 'confirmed' then now() else null end,
      cancelled_at = null
    where id = registration.id
    returning * into registration;

    delete from public.event_registration_checkins
    where registration_id = registration.id;
  end if;

  insert into public.registration_email_deliveries (
    registration_id,
    kind,
    status,
    attempts,
    idempotency_key,
    provider_id,
    last_error,
    last_attempt_at,
    accepted_at
  ) values (
    registration.id,
    'confirmation',
    'pending',
    0,
    'registration-confirmation-' || registration.id::text,
    null,
    null,
    null,
    null
  )
  on conflict (registration_id, kind) do update set
    status = 'pending',
    attempts = 0,
    provider_id = null,
    last_error = null,
    last_attempt_at = null,
    accepted_at = null;

  return registration;
end;
$$;

drop trigger if exists set_event_registration_campaigns_updated_at on public.event_registration_campaigns;
create trigger set_event_registration_campaigns_updated_at
before update on public.event_registration_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists set_event_registrations_updated_at on public.event_registrations;
create trigger set_event_registrations_updated_at
before update on public.event_registrations
for each row execute function public.set_updated_at();

drop trigger if exists set_registration_email_deliveries_updated_at on public.registration_email_deliveries;
create trigger set_registration_email_deliveries_updated_at
before update on public.registration_email_deliveries
for each row execute function public.set_updated_at();

alter table public.event_registration_campaigns enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_registration_checkins enable row level security;
alter table public.registration_email_deliveries enable row level security;

grant usage on type public.event_registration_campaign_status to service_role;
grant usage on type public.event_registration_status to service_role;
grant usage on type public.registration_email_delivery_status to service_role;
grant select, insert, update, delete on public.event_registration_campaigns to service_role;
grant select, insert, update, delete on public.event_registrations to service_role;
grant select, insert, update, delete on public.event_registration_checkins to service_role;
grant select, insert, update, delete on public.registration_email_deliveries to service_role;
revoke all on function public.register_for_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid, text, text) to service_role;

comment on table public.event_registration_campaigns is
  'Private registration settings created alongside each native event.';
comment on table public.event_registrations is
  'Private attendee identities. Public access is only through validated server endpoints.';
comment on table public.event_registration_checkins is
  'Organizer check-ins performed by attendee name or email; no public confirmation code is required.';
comment on table public.registration_email_deliveries is
  'Durable confirmation email queue. Registration succeeds even when the provider quota delays delivery.';
