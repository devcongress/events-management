-- Admission retries preserve their original frozen request within the provider's 24h window.
-- Old terminal rows may have scrubbed capabilities: never revive them automatically.
alter table public.annual_conference_ticket_email_outbox add column failure_kind text
  check (failure_kind in ('throttled', 'rejected', 'ambiguous', 'review_required'));

create or replace function public.claim_annual_conference_ticket_email_outbox(p_claim_token uuid, p_limit integer default 20)
returns setof public.annual_conference_ticket_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_claim_token is null or p_limit not between 1 and 100 then raise exception 'ticket_email_claim_invalid'; end if;
  -- Serialize the policy snapshot with settings changes before leasing mail.
  perform 1 from public.annual_conference_ticketing_settings order by edition_id for update;
  -- Never retry beyond the provider idempotency window. Keep a visible terminal
  -- failure for an operator to reconcile; do not mint another admission silently.
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', failure_kind = 'review_required', next_attempt_at = 'infinity', claim_token = null,
      claimed_until = null, last_error = 'Delivery requires operator reconciliation.'
    where public.managed_conference_email_dispatch_allowed('admission', id)
      and status in ('queued', 'failed', 'sending') and provider_email_id is null
      and next_attempt_at <> 'infinity'::timestamptz
      and (claimed_until is null or claimed_until <= now())
      and first_attempt_at <= now() - interval '23 hours';
  return query with due as (
    select id from public.annual_conference_ticket_email_outbox
    where public.managed_conference_email_dispatch_allowed('admission', id)
      and public.annual_conference_email_allowed('admission', id, recipient_email) and provider_email_id is null and accepted_at is null
      and (first_attempt_at is null or first_attempt_at > now() - interval '23 hours')
      and ((status in ('queued', 'failed') and next_attempt_at <= now())
        or (status = 'sending' and claimed_until <= now()))
    order by next_attempt_at, created_at limit p_limit for update skip locked
  ) update public.annual_conference_ticket_email_outbox o
    set status = 'sending', attempt_count = o.attempt_count + 1, claim_token = p_claim_token,
      claimed_until = now() + interval '10 minutes', first_attempt_at = coalesce(o.first_attempt_at, now()), last_error = null
    from due where o.id = due.id returning o.*;
end;
$$;


create or replace function public.claim_complete_test_only_admission_emails(p_claim_token uuid, p_limit integer, p_origin text)
returns setof public.annual_conference_ticket_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_origin is null or p_origin !~ '^https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$' then
    raise exception 'complete_test_origin_invalid';
  end if;
  perform set_config('app.complete_test_email_dispatch', 'enabled', true);
  if p_claim_token is null or p_limit not between 1 and 100 then raise exception 'ticket_email_claim_invalid'; end if;
  -- Serialize the policy snapshot with settings changes before leasing mail.
  perform 1 from public.annual_conference_ticketing_settings order by edition_id for update;
  -- Never retry beyond the provider idempotency window. Keep a visible terminal
  -- failure for an operator to reconcile; do not mint another admission silently.
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', failure_kind = 'review_required', next_attempt_at = 'infinity', claim_token = null,
      claimed_until = null, last_error = 'Delivery requires operator reconciliation.'
    where public.complete_test_email_context('admission', id) @> jsonb_build_object('is_test', true, 'allowed', true, 'origin', p_origin)
      and status in ('queued', 'failed', 'sending') and provider_email_id is null
      and next_attempt_at <> 'infinity'::timestamptz
      and (claimed_until is null or claimed_until <= now())
      and first_attempt_at <= now() - interval '23 hours';
  return query with due as (
    select id from public.annual_conference_ticket_email_outbox
    where public.complete_test_email_context('admission', id) @> jsonb_build_object('is_test', true, 'allowed', true, 'origin', p_origin)
      and public.annual_conference_email_allowed('admission', id, recipient_email) and provider_email_id is null and accepted_at is null
      and (first_attempt_at is null or first_attempt_at > now() - interval '23 hours')
      and ((status in ('queued', 'failed') and next_attempt_at <= now())
        or (status = 'sending' and claimed_until <= now()))
    order by next_attempt_at, created_at limit p_limit for update skip locked
  ) update public.annual_conference_ticket_email_outbox o
    set status = 'sending', attempt_count = o.attempt_count + 1, claim_token = p_claim_token,
      claimed_until = now() + interval '10 minutes', first_attempt_at = coalesce(o.first_attempt_at, now()), last_error = null
    from due where o.id = due.id returning o.*;
end;
$$;


create or replace function public.freeze_annual_conference_admission_email(p_id uuid, p_claim uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare frozen jsonb;
begin
  update public.annual_conference_ticket_email_outbox
    set provider_payload = coalesce(provider_payload, p_payload)
    where id = p_id and claim_token = p_claim and status = 'sending' and claimed_until > now()
      and first_attempt_at > now() - interval '23 hours'
    returning provider_payload into frozen;
  return frozen;
end;
$$;

create or replace function public.scrub_annual_conference_admission_payload()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status in ('accepted', 'delivered') or (new.next_attempt_at = 'infinity'::timestamptz and new.failure_kind is distinct from 'review_required') then
    new.provider_payload := null;
    new.payload := new.payload - 'qr_token' - 'tickets';
  end if;
  return new;
end;
$$;

-- Terminal cancellation/promotion records must never be revived by manual retry.
create or replace function public.retry_annual_conference_ticket_email_outbox(
  p_edition_id uuid,
  p_outbox_id uuid
)
returns public.annual_conference_ticket_email_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery public.annual_conference_ticket_email_outbox;
begin
  select * into delivery
  from public.annual_conference_ticket_email_outbox
  where id = p_outbox_id and edition_id = p_edition_id
  for update;

  if delivery.id is null then raise exception using message = 'ticket_email_not_found'; end if;
  if delivery.status <> 'failed' then raise exception using message = 'ticket_email_retry_not_failed'; end if;
  if not isfinite(delivery.next_attempt_at) then
    raise exception using message = 'ticket_email_retry_terminal';
  end if;
  if delivery.first_attempt_at <= now() - interval '23 hours' then raise exception 'ticket_email_retry_limit_reached'; end if;
  if delivery.provider_email_id is not null or delivery.accepted_at is not null then
    raise exception using message = 'ticket_email_retry_provider_ambiguous';
  end if;
  if delivery.claim_token is not null or delivery.claimed_until > now() then
    raise exception using message = 'ticket_email_retry_claimed';
  end if;

  update public.annual_conference_ticket_email_outbox
  set status = 'queued', next_attempt_at = now(), claim_token = null, claimed_until = null
  where id = delivery.id
  returning * into delivery;

  return delivery;
end;
$$;

revoke all on function public.retry_annual_conference_ticket_email_outbox(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retry_annual_conference_ticket_email_outbox(uuid, uuid) to service_role;

create table public.admission_dispatch_control (
  singleton boolean primary key default true check (singleton),
  claim_token uuid,
  claimed_until timestamptz not null default '-infinity',
  next_send_at timestamptz not null default '-infinity'
);
insert into public.admission_dispatch_control(singleton) values(true);
alter table public.admission_dispatch_control enable row level security;
revoke all on public.admission_dispatch_control from public, anon, authenticated;
grant all on public.admission_dispatch_control to service_role;

create function public.lease_admission_dispatch(p_token uuid, p_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_seconds not in (30, 60) then raise exception 'dispatch_lease_invalid'; end if;
  update public.admission_dispatch_control set claim_token = p_token, claimed_until = now() + make_interval(secs => p_seconds)
    where singleton and claimed_until <= now() and next_send_at <= now();
  return found;
end;
$$;

create function public.admission_send_slot(p_token uuid, p_cooldown_seconds integer default 0)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_cooldown_seconds not between 0 and 86400 then raise exception 'dispatch_cooldown_invalid'; end if;
  if p_cooldown_seconds > 0 then
    update public.admission_dispatch_control set next_send_at = greatest(next_send_at, now() + make_interval(secs => p_cooldown_seconds))
      where singleton and claim_token = p_token;
    return false;
  end if;
  update public.admission_dispatch_control set next_send_at = now() + interval '500 milliseconds'
    where singleton and claim_token = p_token and claimed_until > now() + interval '17 seconds' and next_send_at <= now();
  return found;
end;
$$;

create function public.release_admission_dispatch(p_token uuid)
returns void language sql security definer set search_path = public as $$
  update public.admission_dispatch_control set claimed_until = now(), claim_token = null where singleton and claim_token = p_token;
$$;

create function public.defer_admission_delivery(p_id uuid, p_claim uuid, p_kind text, p_seconds integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('throttled', 'rejected', 'ambiguous') or p_seconds not between 1 and 86400 then raise exception 'delivery_failure_invalid'; end if;
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', failure_kind = p_kind, last_error = 'Admission email awaiting safe retry.',
      next_attempt_at = now() + make_interval(secs => p_seconds), claim_token = null, claimed_until = null
    where id = p_id and claim_token = p_claim and status = 'sending' and claimed_until > now()
      and provider_email_id is null and accepted_at is null;
  if not found then raise exception 'delivery_lease_lost'; end if;
end;
$$;
revoke all on function public.lease_admission_dispatch(uuid,integer), public.admission_send_slot(uuid,integer),
  public.release_admission_dispatch(uuid), public.defer_admission_delivery(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.lease_admission_dispatch(uuid,integer), public.admission_send_slot(uuid,integer),
  public.release_admission_dispatch(uuid), public.defer_admission_delivery(uuid,uuid,text,integer) to service_role;

alter table public.annual_conference_ticket_payment_attempts
  add column reconciliation_next_at timestamptz not null default now(),
  add column reconciliation_claim uuid,
  add column reconciliation_until timestamptz,
  add column reconciliation_error text,
  add column initialization_failure text check (initialization_failure in ('rejected', 'uncertain'));
create index managed_payment_reconciliation_due on public.annual_conference_ticket_payment_attempts(reconciliation_next_at);

create function public.claim_managed_payment_reconciliation(p_claim uuid)
returns table(order_id uuid, payment_reference text)
language plpgsql security definer set search_path = public as $$
begin
  if p_claim is null then raise exception 'payment_reconciliation_claim_invalid'; end if;
  return query with due as (
    select a.id from public.annual_conference_ticket_payment_attempts a
    join public.annual_conference_ticket_orders o on o.id = a.order_id
    where o.checkout_settings_version is not null and o.status in ('pending_payment', 'expired')
      and o.amount_paid_minor is null and o.created_at > now() - interval '48 hours'
      and a.reconciliation_next_at <= now() and (a.reconciliation_until is null or a.reconciliation_until <= now())
    order by a.reconciliation_next_at, a.id limit 8 for update of a skip locked
  ) update public.annual_conference_ticket_payment_attempts a
      set reconciliation_claim = p_claim, reconciliation_until = now() + interval '3 minutes'
    from due where a.id = due.id returning a.order_id, a.payment_reference;
end;
$$;

create function public.finish_managed_payment_reconciliation(p_order uuid, p_claim uuid, p_resolved boolean, p_error boolean)
returns void language sql security definer set search_path = public as $$
  update public.annual_conference_ticket_payment_attempts
    set reconciliation_next_at = case when p_resolved then 'infinity'::timestamptz else now() + interval '1 minute' end,
      reconciliation_error = case when p_error then 'Payment verification needs another attempt.' else null end,
      reconciliation_claim = null, reconciliation_until = null
    where order_id = p_order and reconciliation_claim = p_claim and reconciliation_until > now();
$$;
revoke all on function public.claim_managed_payment_reconciliation(uuid), public.finish_managed_payment_reconciliation(uuid,uuid,boolean,boolean) from public, anon, authenticated;
grant execute on function public.claim_managed_payment_reconciliation(uuid), public.finish_managed_payment_reconciliation(uuid,uuid,boolean,boolean) to service_role;

create or replace function public.guard_managed_conference_checkout_initialization()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ticket_order public.annual_conference_ticket_orders;
begin
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id
    and exists (select 1 from public.annual_conference_ticket_orders
      where id = old.order_id and checkout_settings_version is not null) then
    raise exception 'checkout_initialization_immutable';
  end if;

  select * into ticket_order from public.annual_conference_ticket_orders where id = new.order_id;
  if ticket_order.checkout_settings_version is not null then
    if new.provider <> 'paystack' or new.payment_reference is distinct from
      'devcon26-managed-' || ticket_order.payment_mode || '-' || replace(ticket_order.id::text, '-', '') then
      raise exception 'ticket_payment_reference_mismatch';
    end if;
    if tg_op = 'UPDATE' and (
      (old.authorization_url is not null and new.authorization_url is distinct from old.authorization_url)
      or (old.initialization_claim is not null and new.initialization_claim is distinct from old.initialization_claim and coalesce(current_setting('app.initialization_rejected_reset', true), '') <> 'allowed')
      or new.order_id is distinct from old.order_id
    ) then
      raise exception 'checkout_initialization_immutable';
    end if;
  end if;

  return new;
end;
$$;


create function public.record_managed_initialization_failure(p_order uuid, p_claim uuid, p_rejected boolean)
returns void language plpgsql security definer set search_path = public as $$
declare prior text := coalesce(current_setting('app.initialization_rejected_reset', true), '');
begin
  perform set_config('app.initialization_rejected_reset', 'allowed', true);
  update public.annual_conference_ticket_payment_attempts
    set initialization_failure = case when p_rejected then 'rejected' else 'uncertain' end,
      initialization_claim = case when p_rejected then null else initialization_claim end,
      initialization_claimed_until = case when p_rejected then null else initialization_claimed_until end
    where order_id = p_order and initialization_claim = p_claim and authorization_url is null;
  perform set_config('app.initialization_rejected_reset', prior, true);
end;
$$;
revoke all on function public.record_managed_initialization_failure(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.record_managed_initialization_failure(uuid,uuid,boolean) to service_role;
