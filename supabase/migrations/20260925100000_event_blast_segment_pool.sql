-- Reuse a fixed set of provider segments for event blasts. A slot remains
-- owned until the broadcast is terminal and its audience has been cleared.

alter type public.event_blast_status add value if not exists 'waiting';

create table public.event_blast_segment_slots (
  slot_number smallint primary key check (slot_number between 1 and 3),
  provider_segment_id text unique,
  status text not null default 'idle'
    check (status in ('idle', 'reserved', 'clearing', 'blocked')),
  -- Keep active owners protected from deletion until the slot is safely released.
  active_event_id uuid references public.community_events(id),
  active_blast_id uuid references public.event_blasts(id),
  terminal_confirmed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  check ((status = 'idle') = (active_blast_id is null)),
  check ((status = 'idle') = (active_event_id is null)),
  check (status <> 'idle' or terminal_confirmed_at is null)
);

insert into public.event_blast_segment_slots (slot_number)
values (1), (2), (3)
on conflict (slot_number) do nothing;

alter table public.event_blast_segment_slots enable row level security;
revoke all on public.event_blast_segment_slots from anon, authenticated;
grant select, insert, update, delete on public.event_blast_segment_slots to service_role;

create or replace function public.claim_event_blast_segment_slot(p_blast_id uuid, p_event_id uuid)
returns setof public.event_blast_segment_slots
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.event_blast_segment_slots;
begin
  -- Serialize claims so duplicate queue deliveries for one blast cannot reserve
  -- two different slots before either sees the other's ownership row.
  perform pg_advisory_xact_lock(9172201, 1);

  select * into claimed
  from public.event_blast_segment_slots
  where active_blast_id = p_blast_id and active_event_id = p_event_id
  limit 1
  for update;

  if found then
    return next claimed;
    return;
  end if;

  select * into claimed
  from public.event_blast_segment_slots
  where status = 'idle'
  order by slot_number
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.event_blast_segment_slots
  set status = 'reserved', active_blast_id = p_blast_id, active_event_id = p_event_id,
      terminal_confirmed_at = null, last_error = null, updated_at = now()
  where slot_number = claimed.slot_number
  returning * into claimed;

  return next claimed;
end;
$$;

create or replace function public.set_event_blast_segment_slot_provider_id(
  p_blast_id uuid,
  p_slot_number smallint,
  p_provider_segment_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_blast_segment_slots
  set provider_segment_id = p_provider_segment_id, updated_at = now()
  where slot_number = p_slot_number and active_blast_id = p_blast_id
    and status in ('reserved', 'clearing');

  return found;
end;
$$;

create or replace function public.mark_event_blast_segment_terminal(
  p_blast_id uuid,
  p_slot_number smallint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_blast_segment_slots
  set status = 'clearing', terminal_confirmed_at = now(), updated_at = now()
  where slot_number = p_slot_number and active_blast_id = p_blast_id
    and status in ('reserved', 'clearing');

  return found;
end;
$$;

create or replace function public.release_event_blast_segment_slot(
  p_blast_id uuid,
  p_slot_number smallint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_blast_segment_slots
  set status = 'idle', active_blast_id = null,
      active_event_id = null,
      terminal_confirmed_at = null, last_error = null, updated_at = now()
  where slot_number = p_slot_number and active_blast_id = p_blast_id
    and status = 'clearing' and terminal_confirmed_at is not null;

  return found;
end;
$$;

create or replace function public.record_event_blast_segment_slot_error(
  p_blast_id uuid,
  p_slot_number smallint,
  p_last_error text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_blast_segment_slots
  set last_error = left(p_last_error, 500), updated_at = now()
  where slot_number = p_slot_number and active_blast_id = p_blast_id
    and status = 'clearing' and terminal_confirmed_at is not null;

  return found;
end;
$$;

create or replace function public.list_event_blast_segment_slots()
returns setof public.event_blast_segment_slots
language sql
security definer
set search_path = public
stable
as $$
  select * from public.event_blast_segment_slots order by slot_number;
$$;

revoke all on function public.claim_event_blast_segment_slot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_event_blast_segment_slot_provider_id(uuid, smallint, text) from public, anon, authenticated;
revoke all on function public.mark_event_blast_segment_terminal(uuid, smallint) from public, anon, authenticated;
revoke all on function public.release_event_blast_segment_slot(uuid, smallint) from public, anon, authenticated;
revoke all on function public.record_event_blast_segment_slot_error(uuid, smallint, text) from public, anon, authenticated;
revoke all on function public.list_event_blast_segment_slots() from public, anon, authenticated;
grant execute on function public.claim_event_blast_segment_slot(uuid, uuid) to service_role;
grant execute on function public.set_event_blast_segment_slot_provider_id(uuid, smallint, text) to service_role;
grant execute on function public.mark_event_blast_segment_terminal(uuid, smallint) to service_role;
grant execute on function public.release_event_blast_segment_slot(uuid, smallint) to service_role;
grant execute on function public.record_event_blast_segment_slot_error(uuid, smallint, text) to service_role;
grant execute on function public.list_event_blast_segment_slots() to service_role;

comment on table public.event_blast_segment_slots is
  'Three reusable Resend segments. A slot is released only after a terminal provider status and confirmed-empty membership.';
