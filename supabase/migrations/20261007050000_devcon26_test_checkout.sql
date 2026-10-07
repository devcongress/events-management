-- Sandbox records are deliberately unrelated to live conference orders and seats.
create table public.devcon26_test_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  checkout_request_key uuid not null unique,
  tier_key text not null check (tier_key in ('regular', 'team_3', 'team_5')),
  quantity integer not null check (quantity in (1, 3, 5)),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'GHS' check (currency = 'GHS'),
  payment_reference text not null unique,
  status text not null default 'prepared' check (status in ('prepared', 'initialized', 'verified', 'rejected')),
  authorization_url text,
  initialization_lease uuid,
  initialization_lease_until timestamptz,
  expires_at timestamptz not null default now() + interval '1 day',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.devcon26_test_payment_events (
  provider_event_id text primary key,
  session_id uuid not null references public.devcon26_test_checkout_sessions(id),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('verified', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.devcon26_test_checkout_sessions enable row level security;
alter table public.devcon26_test_payment_events enable row level security;
revoke all on public.devcon26_test_checkout_sessions, public.devcon26_test_payment_events from public, anon, authenticated;
grant select, insert, update on public.devcon26_test_checkout_sessions to service_role;
grant select, insert on public.devcon26_test_payment_events to service_role;

create or replace function public.prepare_devcon26_test_checkout(p_request_key uuid, p_tier_key text)
returns public.devcon26_test_checkout_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session public.devcon26_test_checkout_sessions;
  session_id uuid := gen_random_uuid();
  price integer;
  seats integer;
begin
  -- Fixed sandbox catalog only; organizer price changes do not affect this test.
  case p_tier_key
    when 'regular' then price := 19999; seats := 1;
    when 'team_3' then price := 54999; seats := 3;
    when 'team_5' then price := 84999; seats := 5;
    else raise exception 'test_checkout_invalid_tier';
  end case;

  insert into public.devcon26_test_checkout_sessions (
    id, checkout_request_key, tier_key, quantity, amount_minor, payment_reference
  ) values (
    session_id, p_request_key, p_tier_key, seats, price,
    'devcon26-test-' || replace(session_id::text, '-', '')
  ) on conflict (checkout_request_key) do nothing;

  select * into session from public.devcon26_test_checkout_sessions
    where checkout_request_key = p_request_key for update;

  if session.tier_key <> p_tier_key then raise exception 'test_checkout_cart_conflict'; end if;
  if session.status in ('verified', 'rejected') or session.expires_at <= now() then
    raise exception 'test_checkout_finished';
  end if;
  if session.authorization_url is not null then return session; end if;
  if session.initialization_lease_until > now() then raise exception 'test_checkout_in_progress'; end if;

  update public.devcon26_test_checkout_sessions
    set initialization_lease = gen_random_uuid(), initialization_lease_until = now() + interval '45 seconds'
    where id = session.id returning * into session;

  return session;
end;
$$;

create or replace function public.confirm_devcon26_test_checkout(
  p_reference text, p_event_id text, p_amount_minor integer, p_currency text,
  p_domain text, p_provider_status text, p_payload_sha256 text
)
returns public.devcon26_test_checkout_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session public.devcon26_test_checkout_sessions;
  event_session_id uuid;
  result_status text;
begin
  if p_domain is distinct from 'test' or p_provider_status is distinct from 'success' then
    raise exception 'test_checkout_unverified';
  end if;

  select * into session from public.devcon26_test_checkout_sessions
    where payment_reference = p_reference for update;

  if not found then raise exception 'test_checkout_not_found'; end if;
  if session.status = 'verified' then return session; end if;
  if session.status = 'rejected' then raise exception 'test_checkout_rejected'; end if;

  result_status := case when session.amount_minor = p_amount_minor and session.currency = p_currency
    then 'verified' else 'rejected' end;

  insert into public.devcon26_test_payment_events (provider_event_id, session_id, payload_sha256, status)
    values (p_event_id, session.id, p_payload_sha256, result_status)
    on conflict (provider_event_id) do nothing;

  select session_id into event_session_id from public.devcon26_test_payment_events
    where provider_event_id = p_event_id;

  if event_session_id <> session.id then raise exception 'test_checkout_event_conflict'; end if;

  update public.devcon26_test_checkout_sessions
    set status = result_status,
      verified_at = case when result_status = 'verified' then now() else null end,
      initialization_lease = null, initialization_lease_until = null
    where id = session.id returning * into session;

  return session;
end;
$$;

revoke all on function public.prepare_devcon26_test_checkout(uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_devcon26_test_checkout(text, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.prepare_devcon26_test_checkout(uuid, text) to service_role;
grant execute on function public.confirm_devcon26_test_checkout(text, text, integer, text, text, text, text) to service_role;
