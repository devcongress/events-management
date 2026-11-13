create table public.devcon26_telegram_purchase_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  event_type text not null check (event_type in ('payment_succeeded', 'checkout_incomplete', 'refund_required', 'refund_completed', 'refund_needs_attention')),
  order_id uuid not null references public.annual_conference_ticket_orders(id),
  tier_key text not null,
  quantity integer not null,
  subtotal_minor integer not null,
  total_minor integer not null,
  paid_ticket_count integer,
  detail_code text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  state text not null default 'pending' check (state in ('pending', 'claimed', 'sent', 'needs_review', 'suppressed')),
  claim_id uuid,
  lease_until timestamptz,
  request_started_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  constraint devcon26_telegram_paid_ticket_count_valid check (
    (event_type = 'payment_succeeded' and paid_ticket_count is not null and paid_ticket_count >= 0)
    or (event_type <> 'payment_succeeded' and paid_ticket_count is null)
  )
);

alter table public.devcon26_telegram_purchase_outbox enable row level security;
revoke all on public.devcon26_telegram_purchase_outbox from public, anon, authenticated;

create index devcon26_telegram_purchase_due_idx on public.devcon26_telegram_purchase_outbox (next_attempt_at, created_at)
where state in ('pending', 'claimed');

create index devcon26_telegram_expired_checkout_idx on public.annual_conference_ticket_orders (expires_at, edition_id)
where payment_mode = 'live' and status in ('pending_payment', 'expired') and paid_at is null and expires_at is not null and amount_minor > 0;

create function public.enqueue_devcon26_telegram_purchase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'paid' and new.status = 'paid' and new.payment_mode = 'live'
    and new.provider = 'paystack' and new.amount_minor > 0
    and exists (select 1 from public.annual_conference_editions where id = new.edition_id and year = 2026) then
    insert into public.devcon26_telegram_purchase_outbox (dedupe_key, event_type, order_id, tier_key, quantity, subtotal_minor, total_minor, paid_ticket_count, detail_code, occurred_at)
    values ('payment_succeeded:' || new.id, 'payment_succeeded', new.id, new.tier_key, new.quantity, new.amount_minor,
      case when new.quoted_processing_fee_policy = 'buyer_pays_processing' then new.quoted_gross_amount_minor
        else coalesce(new.amount_paid_minor, new.amount_minor) end,
      greatest(0, (select coalesce(sum(o.quantity), 0) from public.annual_conference_ticket_orders o
        where o.edition_id = new.edition_id and o.status = 'paid' and o.payment_mode = 'live' and o.provider = 'paystack' and o.amount_minor > 0)
        - (select count(*) from public.annual_conference_flexible_ticket_refunds r
          join public.annual_conference_ticket_orders o on o.id = r.order_id
          where o.edition_id = new.edition_id and o.status = 'paid' and o.payment_mode = 'live' and o.provider = 'paystack' and o.amount_minor > 0
            and r.status = 'refunded'))::integer, 'paid', clock_timestamp())
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
exception when others then
  raise warning 'Telegram purchase notification enqueue failed';
  return new;
end $$;

create trigger enqueue_devcon26_telegram_purchase after update of status on public.annual_conference_ticket_orders
for each row execute function public.enqueue_devcon26_telegram_purchase();

create function public.enqueue_devcon26_telegram_observation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.paystack_status in ('failed', 'abandoned', 'reversed') and new.paystack_status is distinct from old.paystack_status then
    insert into public.devcon26_telegram_purchase_outbox (dedupe_key, event_type, order_id, tier_key, quantity, subtotal_minor, total_minor, detail_code, occurred_at)
    select 'checkout_incomplete:' || o.id, 'checkout_incomplete', o.id, o.tier_key, o.quantity, o.amount_minor,
      coalesce(o.quoted_gross_amount_minor, o.amount_minor),
      case new.paystack_reason
        when 'Customer cancelled payment' then 'customer_cancelled'
        when 'Insufficient Funds' then 'insufficient_funds' when 'Insufficient funds' then 'insufficient_funds'
        when 'Declined' then 'declined' when 'Transaction declined' then 'declined' when 'Bank declined the payment' then 'declined'
        when 'Card expired' then 'expired_card' when 'Bank unavailable' then 'bank_unavailable'
        when 'Payment timed out' then 'timed_out' when 'Card security code verification failed' then 'card_verification_failed'
        else case new.paystack_status when 'abandoned' then 'checkout_abandoned' when 'reversed' then 'payment_reversed' else 'payment_failed' end
      end, coalesce(new.paystack_checked_at, clock_timestamp())
    from public.annual_conference_ticket_orders o join public.annual_conference_editions e on e.id = o.edition_id
    where o.id = new.order_id and o.payment_mode = 'live' and o.amount_minor > 0 and e.year = 2026
      and o.status in ('pending_payment', 'expired') and o.paid_at is null
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
exception when others then
  raise warning 'Telegram lifecycle notification enqueue failed';
  return new;
end $$;

create trigger enqueue_devcon26_telegram_observation after update of paystack_status on public.annual_conference_ticket_payment_attempts
for each row execute function public.enqueue_devcon26_telegram_observation();

create function public.enqueue_devcon26_telegram_refund() returns trigger
language plpgsql security definer set search_path = public as $$
declare event text; detail text; key_prefix text; refund_amount integer;
begin
  if tg_table_name = 'annual_conference_flexible_ticket_refunds' then
    if new.status <> 'refunded' or (tg_op = 'UPDATE' and old.status = new.status) then return new; end if;
    event := 'refund_completed'; detail := 'seat_refund'; key_prefix := 'seat_refund:' || new.id;
    refund_amount := new.amount_minor;
  else
    if tg_op = 'UPDATE' and old.status = new.status then return new; end if;
    event := case when new.status = 'required' then 'refund_required' when new.status = 'refunded' then 'refund_completed'
      when new.status in ('failed', 'needs_attention') then 'refund_needs_attention' else null end;
    if event is null then return new; end if;
    detail := case when new.status = 'failed' then 'failed' when new.status = 'needs_attention' then 'needs_attention'
      when new.status = 'required' then 'required' else 'refunded' end;
    key_prefix := event || ':' || new.id;
    refund_amount := new.amount_minor;
  end if;
  insert into public.devcon26_telegram_purchase_outbox (dedupe_key, event_type, order_id, tier_key, quantity, subtotal_minor, total_minor, detail_code, occurred_at)
  select key_prefix, event, o.id, o.tier_key, case when detail = 'seat_refund' then 1 else o.quantity end, o.amount_minor,
    case when event = 'refund_required' and o.quoted_processing_fee_policy = 'buyer_pays_processing' then o.quoted_gross_amount_minor else refund_amount end,
    detail, clock_timestamp()
  from public.annual_conference_ticket_orders o join public.annual_conference_editions e on e.id = o.edition_id
  where o.id = new.order_id and o.payment_mode = 'live' and o.amount_minor > 0 and e.year = 2026
  on conflict (dedupe_key) do nothing;
  return new;
exception when others then
  raise warning 'Telegram lifecycle notification enqueue failed';
  return new;
end $$;

create trigger enqueue_devcon26_telegram_refund after insert or update of status on public.annual_conference_ticket_refunds
for each row execute function public.enqueue_devcon26_telegram_refund();
create trigger enqueue_devcon26_telegram_seat_refund after insert or update of status on public.annual_conference_flexible_ticket_refunds
for each row execute function public.enqueue_devcon26_telegram_refund();

create function public.claim_devcon26_telegram_purchases(p_claim uuid, p_start_at timestamptz)
returns setof public.devcon26_telegram_purchase_outbox language plpgsql security definer set search_path = public as $$
begin
  if p_claim is null or p_start_at is null then raise exception 'invalid_claim'; end if;
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

create function public.begin_devcon26_telegram_purchase(p_event uuid, p_claim uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.devcon26_telegram_purchase_outbox set request_started_at = clock_timestamp(), attempts = attempts + 1
  where id = p_event and state = 'claimed' and claim_id = p_claim and lease_until > now() and request_started_at is null;
  return found;
end $$;

create function public.finish_devcon26_telegram_purchase(p_event uuid, p_claim uuid, p_result text, p_retry_seconds integer default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_result is null or p_result not in ('sent', 'retry', 'needs_review') then raise exception 'invalid_result'; end if;
  update public.devcon26_telegram_purchase_outbox
  set state = case when p_result = 'retry' and attempts < 5 and p_retry_seconds between 1 and 3600 then 'pending'
    when p_result = 'sent' then 'sent' else 'needs_review' end,
    next_attempt_at = case when p_result = 'retry' and p_retry_seconds between 1 and 3600 then now() + make_interval(secs => p_retry_seconds) else next_attempt_at end,
    request_started_at = case when p_result = 'retry' and attempts < 5 and p_retry_seconds between 1 and 3600 then null else request_started_at end,
    claim_id = null, lease_until = null
  where id = p_event and state = 'claimed' and claim_id = p_claim and request_started_at is not null;
  return found;
end $$;

revoke all on function public.enqueue_devcon26_telegram_purchase() from public, anon, authenticated;
revoke all on function public.enqueue_devcon26_telegram_observation() from public, anon, authenticated;
revoke all on function public.enqueue_devcon26_telegram_refund() from public, anon, authenticated;
revoke all on function public.claim_devcon26_telegram_purchases(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.begin_devcon26_telegram_purchase(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_devcon26_telegram_purchase(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_devcon26_telegram_purchases(uuid, timestamptz) to service_role;
grant execute on function public.begin_devcon26_telegram_purchase(uuid, uuid) to service_role;
grant execute on function public.finish_devcon26_telegram_purchase(uuid, uuid, text, integer) to service_role;
