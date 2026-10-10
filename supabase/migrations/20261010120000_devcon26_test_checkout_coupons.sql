-- Coupons belong only to the isolated test checkout. No live orders, seats,
-- finance entries, ticket delivery, or activation flags are changed here.
create table public.devcon26_test_coupon_codes (
  id uuid primary key default gen_random_uuid(),
  edition_year integer not null default 2026 check (edition_year = 2026),
  code text not null check (code ~ '^[A-Z0-9-]{3,48}$'),
  discount_type text not null check (discount_type in ('fixed_minor', 'percentage_bps')),
  discount_value integer not null check (discount_value > 0),
  eligible_tiers text[] not null check (
    cardinality(eligible_tiers) between 1 and 3
    and eligible_tiers <@ array['regular', 'team_3', 'team_5']::text[]
    and array_position(eligible_tiers, null) is null
  ),
  expires_at timestamptz not null,
  max_completed integer not null check (max_completed between 1 and 1000000),
  enabled boolean not null default true,
  created_by_email text not null,
  updated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_year, code),
  check (
    (discount_type = 'percentage_bps' and discount_value < 10000)
    or (discount_type = 'fixed_minor' and discount_value < case
      when 'regular' = any(eligible_tiers) then 19999
      when 'team_3' = any(eligible_tiers) then 54999
      else 84999 end)
  )
);

alter table public.devcon26_test_checkout_sessions
  add column purchaser_name text,
  add column purchaser_email text,
  add column base_amount_minor integer,
  add column discount_amount_minor integer not null default 0,
  add column coupon_id uuid references public.devcon26_test_coupon_codes(id),
  add column coupon_code text,
  add column resolution_reason text;

update public.devcon26_test_checkout_sessions set base_amount_minor = amount_minor;

alter table public.devcon26_test_checkout_sessions
  alter column base_amount_minor set not null,
  drop constraint devcon26_test_checkout_sessions_status_check,
  add constraint devcon26_test_checkout_sessions_status_check
    check (status in ('prepared', 'initialized', 'verified', 'rejected', 'refund_required')),
  add constraint devcon26_test_checkout_amounts_check check (
    base_amount_minor > 0 and discount_amount_minor >= 0
    and amount_minor = base_amount_minor - discount_amount_minor and amount_minor > 0
  ),
  add constraint devcon26_test_checkout_coupon_check check (
    (coupon_id is null and coupon_code is null and discount_amount_minor = 0)
    or (coupon_id is not null and coupon_code is not null and discount_amount_minor > 0)
  );

alter table public.devcon26_test_payment_events
  drop constraint devcon26_test_payment_events_status_check,
  add constraint devcon26_test_payment_events_status_check
    check (status in ('verified', 'rejected', 'refund_required'));

create table public.devcon26_test_coupon_claims (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.devcon26_test_coupon_codes(id),
  session_id uuid not null unique references public.devcon26_test_checkout_sessions(id),
  status text not null check (status in ('held', 'completed', 'released', 'exception')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  resolution_reason text,
  created_at timestamptz not null default now(),
  unique (coupon_id, session_id)
);

create index devcon26_test_coupon_claims_usage_idx on public.devcon26_test_coupon_claims(coupon_id, status, expires_at);
create index devcon26_test_checkout_coupon_idx on public.devcon26_test_checkout_sessions(coupon_id, created_at desc);

alter table public.devcon26_test_coupon_codes enable row level security;
alter table public.devcon26_test_coupon_claims enable row level security;
revoke all on public.devcon26_test_coupon_codes, public.devcon26_test_coupon_claims from public, anon, authenticated;
grant select on public.devcon26_test_coupon_codes, public.devcon26_test_coupon_claims to service_role;

create function public.freeze_devcon26_test_coupon_terms() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (to_jsonb(new) - array['enabled', 'updated_at', 'updated_by_email'])
    is distinct from (to_jsonb(old) - array['enabled', 'updated_at', 'updated_by_email']) then
    raise exception 'test_coupon_terms_immutable';
  end if;
  return new;
end;
$$;

create trigger devcon26_test_coupon_terms_immutable before update on public.devcon26_test_coupon_codes
  for each row execute function public.freeze_devcon26_test_coupon_terms();

create function public.freeze_devcon26_test_checkout_terms() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if row(new.checkout_request_key, new.tier_key, new.quantity, new.amount_minor, new.currency,
      new.payment_reference, new.purchaser_name, new.purchaser_email, new.base_amount_minor,
      new.discount_amount_minor, new.coupon_id, new.coupon_code)
    is distinct from row(old.checkout_request_key, old.tier_key, old.quantity, old.amount_minor, old.currency,
      old.payment_reference, old.purchaser_name, old.purchaser_email, old.base_amount_minor,
      old.discount_amount_minor, old.coupon_id, old.coupon_code) then
    raise exception 'test_checkout_terms_immutable';
  end if;
  return new;
end;
$$;

create trigger devcon26_test_checkout_terms_immutable before update on public.devcon26_test_checkout_sessions
  for each row execute function public.freeze_devcon26_test_checkout_terms();

create function public.create_devcon26_test_coupon(
  p_year integer, p_code text, p_discount_type text, p_discount_value integer,
  p_eligible_tiers text[], p_expires_at timestamptz, p_max_completed integer, p_actor_email text
) returns public.devcon26_test_coupon_codes
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  coupon public.devcon26_test_coupon_codes;
begin
  if p_expires_at <= now() or p_actor_email is null or length(btrim(p_actor_email)) = 0 then
    raise exception 'test_coupon_invalid';
  end if;
  insert into public.devcon26_test_coupon_codes (
    edition_year, code, discount_type, discount_value, eligible_tiers, expires_at, max_completed,
    created_by_email, updated_by_email
  ) values (
    p_year, upper(btrim(p_code)), p_discount_type, p_discount_value,
    array(select distinct unnest(p_eligible_tiers)), p_expires_at, p_max_completed,
    lower(btrim(p_actor_email)), lower(btrim(p_actor_email))
  ) returning * into coupon;
  return coupon;
end;
$$;

create function public.toggle_devcon26_test_coupon(p_id uuid, p_enabled boolean, p_actor_email text)
returns public.devcon26_test_coupon_codes
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  coupon public.devcon26_test_coupon_codes;
begin
  if p_actor_email is null or length(btrim(p_actor_email)) = 0 then raise exception 'test_coupon_invalid'; end if;
  update public.devcon26_test_coupon_codes set enabled = p_enabled,
    updated_by_email = lower(btrim(p_actor_email)), updated_at = now()
    where id = p_id returning * into coupon;
  if not found then raise exception 'test_coupon_not_found'; end if;
  return coupon;
end;
$$;

-- A quote deliberately neither locks a redemption nor writes a claim.
create function public.quote_devcon26_test_checkout(p_tier_key text, p_coupon_code text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  coupon public.devcon26_test_coupon_codes;
  normalized_code text := nullif(upper(btrim(p_coupon_code)), '');
  price integer;
  seats integer;
  discount integer := 0;
  used integer;
begin
  case p_tier_key
    when 'regular' then price := 19999; seats := 1;
    when 'team_3' then price := 54999; seats := 3;
    when 'team_5' then price := 84999; seats := 5;
    else raise exception 'test_checkout_invalid_tier';
  end case;
  if normalized_code is not null then
    select * into coupon from public.devcon26_test_coupon_codes where edition_year = 2026 and code = normalized_code;
    if not found then raise exception 'test_coupon_invalid'; end if;
    if not coupon.enabled then raise exception 'test_coupon_unavailable'; end if;
    if coupon.expires_at <= now() then raise exception 'test_coupon_expired'; end if;
    if not p_tier_key = any(coupon.eligible_tiers) then raise exception 'test_coupon_ineligible'; end if;
    select count(*) into used from public.devcon26_test_coupon_claims
      where coupon_id = coupon.id and (status = 'completed' or (status = 'held' and expires_at > now()));
    if used >= coupon.max_completed then raise exception 'test_coupon_unavailable'; end if;
    discount := case when coupon.discount_type = 'fixed_minor' then coupon.discount_value
      else (price::bigint * coupon.discount_value / 10000)::integer end;
    if discount <= 0 or discount >= price then raise exception 'test_coupon_invalid'; end if;
  end if;
  return jsonb_build_object('mode', 'test', 'tier_key', p_tier_key, 'quantity', seats, 'currency', 'GHS',
    'base_amount_minor', price, 'discount_amount_minor', discount, 'final_amount_minor', price - discount,
    'coupon_applied', normalized_code);
end;
$$;

drop function public.prepare_devcon26_test_checkout(uuid, text);
create function public.prepare_devcon26_test_checkout(
  p_request_key uuid, p_tier_key text, p_purchaser_name text, p_purchaser_email text, p_coupon_code text default null
) returns public.devcon26_test_checkout_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  session public.devcon26_test_checkout_sessions;
  coupon public.devcon26_test_coupon_codes;
  quote jsonb;
  normalized_code text := nullif(upper(btrim(p_coupon_code)), '');
  buyer_name text := btrim(p_purchaser_name);
  buyer_email text := lower(btrim(p_purchaser_email));
  session_id uuid := gen_random_uuid();
begin
  if buyer_name is null or length(buyer_name) not between 1 and 160 or buyer_name ~ '[[:cntrl:]]'
    or buyer_email is null or length(buyer_email) > 254 or buyer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or (normalized_code is not null and normalized_code !~ '^[A-Z0-9-]{3,48}$') then
    raise exception 'test_checkout_invalid_buyer';
  end if;
  -- Serialize a retry key first; every coupon operation then locks coupon -> session -> claim.
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text, 0));
  select * into session from public.devcon26_test_checkout_sessions where checkout_request_key = p_request_key;
  if found then
    if row(session.tier_key, session.purchaser_name, session.purchaser_email, session.coupon_code)
      is distinct from row(p_tier_key, buyer_name, buyer_email, normalized_code) then raise exception 'test_checkout_cart_conflict'; end if;
    if session.coupon_id is not null then
      select * into coupon from public.devcon26_test_coupon_codes where id = session.coupon_id for update;
    end if;
    select * into session from public.devcon26_test_checkout_sessions where id = session.id for update;
    if session.status in ('verified', 'rejected', 'refund_required') or session.expires_at <= now() then
      raise exception 'test_checkout_finished';
    end if;
    if session.authorization_url is not null then return session; end if;
    if session.initialization_lease_until > now() then raise exception 'test_checkout_in_progress'; end if;
  else
    if normalized_code is not null then
      select * into coupon from public.devcon26_test_coupon_codes
        where edition_year = 2026 and code = normalized_code for update;
      if not found then raise exception 'test_coupon_invalid'; end if;
      update public.devcon26_test_coupon_claims set status = 'released', resolution_reason = 'expired'
        where coupon_id = coupon.id and status = 'held' and expires_at <= now();
    end if;
    quote := public.quote_devcon26_test_checkout(p_tier_key, normalized_code);
    insert into public.devcon26_test_checkout_sessions (
      id, checkout_request_key, tier_key, quantity, amount_minor, payment_reference,
      purchaser_name, purchaser_email, base_amount_minor, discount_amount_minor, coupon_id, coupon_code, expires_at
    ) values (
      session_id, p_request_key, p_tier_key, (quote->>'quantity')::integer,
      (quote->>'final_amount_minor')::integer, 'devcon26-test-' || replace(session_id::text, '-', ''),
      buyer_name, buyer_email, (quote->>'base_amount_minor')::integer,
      (quote->>'discount_amount_minor')::integer, coupon.id, normalized_code, now() + interval '15 minutes'
    ) returning * into session;
    if coupon.id is not null then
      insert into public.devcon26_test_coupon_claims (coupon_id, session_id, status, expires_at)
        values (coupon.id, session.id, 'held', session.expires_at);
    end if;
  end if;
  update public.devcon26_test_checkout_sessions set initialization_lease = gen_random_uuid(),
    initialization_lease_until = now() + interval '45 seconds'
    where id = session.id returning * into session;
  return session;
end;
$$;

create or replace function public.confirm_devcon26_test_checkout(
  p_reference text, p_event_id text, p_amount_minor integer, p_currency text,
  p_domain text, p_provider_status text, p_payload_sha256 text
) returns public.devcon26_test_checkout_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  session public.devcon26_test_checkout_sessions;
  coupon public.devcon26_test_coupon_codes;
  claim public.devcon26_test_coupon_claims;
  event_row public.devcon26_test_payment_events;
  used integer;
  result_status text;
  reason text;
begin
  if p_domain is distinct from 'test' or p_provider_status not in ('success', 'failed')
    or p_provider_status is null or p_event_id is null or length(p_event_id) not between 1 and 200 then
    raise exception 'test_checkout_unverified';
  end if;
  select * into session from public.devcon26_test_checkout_sessions where payment_reference = p_reference;
  if not found then raise exception 'test_checkout_not_found'; end if;
  if session.coupon_id is not null then
    select * into coupon from public.devcon26_test_coupon_codes where id = session.coupon_id for update;
  end if;
  select * into session from public.devcon26_test_checkout_sessions where id = session.id for update;
  select * into event_row from public.devcon26_test_payment_events where provider_event_id = p_event_id;
  if found and event_row.session_id <> session.id then raise exception 'test_checkout_event_conflict'; end if;
  if session.status in ('verified', 'refund_required') then return session; end if;
  if event_row.status = 'rejected' and p_provider_status = 'failed' then return session; end if;
  select * into claim from public.devcon26_test_coupon_claims where session_id = session.id for update;

  if p_provider_status = 'failed' then
    result_status := 'rejected'; reason := 'provider_failed';
  elsif session.amount_minor is distinct from p_amount_minor or session.currency is distinct from p_currency then
    result_status := 'refund_required';
    reason := case when session.amount_minor is distinct from p_amount_minor then 'amount_mismatch' else 'currency_mismatch' end;
  else
    result_status := 'verified';
    if coupon.id is not null and not coalesce(claim.status = 'held' and claim.expires_at > now(), false) then
      update public.devcon26_test_coupon_claims set status = 'released', resolution_reason = 'expired'
        where coupon_id = coupon.id and status = 'held' and expires_at <= now();
      select count(*) into used from public.devcon26_test_coupon_claims where coupon_id = coupon.id
        and (status = 'completed' or (status = 'held' and expires_at > now()));
      if not coupon.enabled or coupon.expires_at <= now() or used >= coupon.max_completed then
        result_status := 'refund_required'; reason := 'coupon_allowance_unavailable';
      end if;
    end if;
  end if;

  insert into public.devcon26_test_payment_events (provider_event_id, session_id, payload_sha256, status)
    values (p_event_id, session.id, p_payload_sha256, result_status)
    on conflict (provider_event_id) do nothing;
  select * into event_row from public.devcon26_test_payment_events where provider_event_id = p_event_id for update;
  if event_row.session_id <> session.id then raise exception 'test_checkout_event_conflict'; end if;
  -- One latest accepted observation per provider transaction, not an attempt history.
  update public.devcon26_test_payment_events set status = result_status, payload_sha256 = p_payload_sha256
    where provider_event_id = p_event_id;
  if coupon.id is not null then
    insert into public.devcon26_test_coupon_claims (coupon_id, session_id, status, expires_at, completed_at, resolution_reason)
      values (coupon.id, session.id,
        case result_status when 'verified' then 'completed' when 'rejected' then 'released' else 'exception' end,
        session.expires_at, case when result_status = 'verified' then now() else null end, reason)
      on conflict (session_id) do update set status = excluded.status,
        completed_at = excluded.completed_at, resolution_reason = excluded.resolution_reason;
  end if;
  update public.devcon26_test_checkout_sessions set status = result_status, resolution_reason = reason,
    verified_at = case when result_status = 'verified' then now() else null end,
    initialization_lease = null, initialization_lease_until = null where id = session.id returning * into session;
  return session;
end;
$$;

create function public.list_devcon26_test_coupons(p_year integer, p_page integer default 1, p_page_size integer default 25,
  p_checkout_page integer default 1, p_checkout_page_size integer default 25)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  result jsonb;
begin
  if p_year is distinct from 2026 or p_page is null or p_page_size is null
    or p_checkout_page is null or p_checkout_page_size is null
    or p_page < 1 or p_page > 10000 or p_page_size not between 1 and 50
    or p_checkout_page < 1 or p_checkout_page > 10000 or p_checkout_page_size not between 1 and 50 then
    raise exception 'test_coupon_invalid';
  end if;
  select jsonb_build_object(
    'coupons', coalesce((select jsonb_agg(to_jsonb(c)) from (
      select code.id, code.code, code.discount_type, code.discount_value, code.eligible_tiers,
        code.expires_at, code.max_completed, code.enabled, code.created_at,
        (select count(*) from public.devcon26_test_coupon_claims where coupon_id = code.id and status = 'completed') as completed,
        (select count(*) from public.devcon26_test_coupon_claims where coupon_id = code.id and status = 'held' and expires_at > now()) as active_holds,
        (select count(*) from public.devcon26_test_coupon_claims where coupon_id = code.id and status = 'exception') as exceptions,
        greatest(0, code.max_completed - (select count(*) from public.devcon26_test_coupon_claims where coupon_id = code.id
          and (status = 'completed' or (status = 'held' and expires_at > now())))) as remaining
      from public.devcon26_test_coupon_codes code where edition_year = p_year
      order by created_at desc, id limit p_page_size offset (p_page - 1) * p_page_size
    ) c), '[]'::jsonb),
    'total', (select count(*) from public.devcon26_test_coupon_codes where edition_year = p_year),
    'page', p_page, 'page_size', p_page_size,
    'checkouts', coalesce((select jsonb_agg(to_jsonb(s)) from (
      select id, payment_reference, purchaser_name, purchaser_email, tier_key, quantity, coupon_code,
        base_amount_minor, discount_amount_minor, amount_minor, currency, status, resolution_reason,
        expires_at, verified_at, created_at
      from public.devcon26_test_checkout_sessions order by created_at desc, id
      limit p_checkout_page_size offset (p_checkout_page - 1) * p_checkout_page_size
    ) s), '[]'::jsonb),
    'checkout_total', (select count(*) from public.devcon26_test_checkout_sessions),
    'checkout_page', p_checkout_page, 'checkout_page_size', p_checkout_page_size
  ) into result;
  return result;
end;
$$;

revoke all on function public.freeze_devcon26_test_coupon_terms(), public.freeze_devcon26_test_checkout_terms() from public, anon, authenticated;
revoke all on function public.create_devcon26_test_coupon(integer, text, text, integer, text[], timestamptz, integer, text) from public, anon, authenticated;
revoke all on function public.toggle_devcon26_test_coupon(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.quote_devcon26_test_checkout(text, text) from public, anon, authenticated;
revoke all on function public.prepare_devcon26_test_checkout(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_devcon26_test_checkout(text, text, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.list_devcon26_test_coupons(integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.create_devcon26_test_coupon(integer, text, text, integer, text[], timestamptz, integer, text) to service_role;
grant execute on function public.toggle_devcon26_test_coupon(uuid, boolean, text) to service_role;
grant execute on function public.quote_devcon26_test_checkout(text, text) to service_role;
grant execute on function public.prepare_devcon26_test_checkout(uuid, text, text, text, text) to service_role;
grant execute on function public.confirm_devcon26_test_checkout(text, text, integer, text, text, text, text) to service_role;
grant execute on function public.list_devcon26_test_coupons(integer, integer, integer, integer, integer) to service_role;
