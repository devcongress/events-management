-- Retire the readiness send protocol while retaining the original activation boundary.
create or replace function public.claim_devcon26_telegram_activation(p_claim uuid, p_version_id uuid, p_version_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
begin
  return 'needs_review';
end $$;

create or replace function public.begin_devcon26_telegram_activation(p_claim uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return false;
end $$;

create or replace function public.finish_devcon26_telegram_activation(p_claim uuid, p_result text, p_retry_seconds integer default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  return false;
end $$;

create function public.ensure_devcon26_telegram_activation(p_version_id uuid, p_version_at timestamptz) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare boundary timestamptz;
begin
  if p_version_id is null or p_version_at is null or p_version_at > now() then raise exception 'invalid_activation'; end if;
  insert into public.devcon26_telegram_activation (singleton, version_id, activation_at)
  values (true, p_version_id, p_version_at) on conflict (singleton) do nothing;
  select activation_at into boundary from public.devcon26_telegram_activation where singleton;
  return boundary;
end $$;

alter table public.devcon26_telegram_purchase_outbox add column sent_at timestamptz;

create or replace function public.claim_devcon26_telegram_purchases(p_claim uuid, p_start_at timestamptz)
returns setof public.devcon26_telegram_purchase_outbox language plpgsql security definer set search_path = public as $$
begin
  if p_claim is null then raise exception 'invalid_claim'; end if;
  select activation_at into p_start_at from public.devcon26_telegram_activation where singleton;
  if not found then return; end if;
  with candidates as materialized (
    select o.id from public.annual_conference_ticket_orders o join public.annual_conference_editions e on e.id = o.edition_id
    where e.year = 2026 and o.payment_mode = 'live' and o.amount_minor > 0 and o.status in ('pending_payment', 'expired')
      and o.paid_at is null and o.expires_at >= p_start_at and o.expires_at <= now()
      and exists (select 1 from public.annual_conference_ticket_payment_attempts a where a.order_id = o.id and a.provider = 'paystack')
      and not exists (select 1 from public.devcon26_telegram_purchase_outbox q where q.dedupe_key = 'checkout_incomplete:' || o.id)
    order by o.expires_at for update of o skip locked limit 100
  )
  insert into public.devcon26_telegram_purchase_outbox (dedupe_key, event_type, order_id, tier_key, quantity, subtotal_minor, total_minor, detail_code, occurred_at)
  select 'checkout_incomplete:' || o.id, 'checkout_incomplete', o.id, o.tier_key, o.quantity, o.amount_minor,
    coalesce(o.quoted_gross_amount_minor, o.amount_minor), 'expired', o.expires_at
  from public.annual_conference_ticket_orders o join candidates c on c.id = o.id
  where o.payment_mode = 'live' and o.amount_minor > 0 and o.status in ('pending_payment', 'expired')
    and o.paid_at is null and o.expires_at >= p_start_at and o.expires_at <= now()
  on conflict (dedupe_key) do nothing;
  update public.devcon26_telegram_purchase_outbox set state = 'needs_review'
  where state = 'claimed' and lease_until < now() and request_started_at is not null;
  update public.devcon26_telegram_purchase_outbox set state = 'suppressed'
  where (state = 'pending' or (state = 'claimed' and lease_until < now() and request_started_at is null))
    and occurred_at < p_start_at;
  return query
  with candidates as (
    select id from public.devcon26_telegram_purchase_outbox
    where occurred_at >= p_start_at and next_attempt_at <= now()
      and (state = 'pending' or (state = 'claimed' and lease_until < now() and request_started_at is null))
    order by case event_type when 'refund_needs_attention' then 0 when 'refund_required' then 1 when 'payment_succeeded' then 2 else 3 end, occurred_at
    for update skip locked limit 5
  )
  update public.devcon26_telegram_purchase_outbox o
  set state = 'claimed', claim_id = p_claim, lease_until = now() + interval '2 minutes'
  from candidates c where o.id = c.id returning o.*;
end $$;

create or replace function public.finish_devcon26_telegram_purchase(p_event uuid, p_claim uuid, p_result text, p_retry_seconds integer default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_result is null or p_result not in ('sent', 'retry', 'needs_review') then raise exception 'invalid_result'; end if;
  update public.devcon26_telegram_purchase_outbox
  set state = case when p_result = 'retry' and attempts < 5 and p_retry_seconds between 1 and 3600 then 'pending'
    when p_result = 'sent' then 'sent' else 'needs_review' end,
    next_attempt_at = case when p_result = 'retry' and p_retry_seconds between 1 and 3600 then now() + make_interval(secs => p_retry_seconds) else next_attempt_at end,
    request_started_at = case when p_result = 'retry' and attempts < 5 and p_retry_seconds between 1 and 3600 then null else request_started_at end,
    sent_at = case when p_result = 'sent' then clock_timestamp() else sent_at end,
    claim_id = null, lease_until = null
  where id = p_event and state = 'claimed' and claim_id = p_claim and request_started_at is not null;
  return found;
end $$;

create function public.get_devcon26_telegram_status()
returns table (pending_count bigint, needs_review_count bigint, confirmed_count bigint, last_sent_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare boundary timestamptz;
begin
  select activation_at into boundary from public.devcon26_telegram_activation where singleton;
  if not found then raise exception 'activation_unavailable'; end if;
  return query select
    count(*) filter (where state = 'pending' or (state = 'claimed' and not (request_started_at is not null and (lease_until is null or lease_until < now())))),
    count(*) filter (where state = 'needs_review' or (state = 'claimed' and request_started_at is not null and (lease_until is null or lease_until < now()))),
    count(*) filter (where state = 'sent'),
    max(sent_at) filter (where state = 'sent')
  from public.devcon26_telegram_purchase_outbox where occurred_at >= boundary;
end $$;

revoke all on function public.ensure_devcon26_telegram_activation(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_devcon26_telegram_status() from public, anon, authenticated;
grant execute on function public.ensure_devcon26_telegram_activation(uuid, timestamptz) to service_role;
grant execute on function public.get_devcon26_telegram_status() to service_role;
