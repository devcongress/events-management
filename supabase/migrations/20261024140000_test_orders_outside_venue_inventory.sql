-- Exclude Paystack test orders from venue inventory without cancelling tickets,
-- revoking QR/badge links, rewriting orders, or changing activation settings.
-- The private helper inserts the payment mode atomically. Only the validated
-- preview wrapper can request test mode; service_role cannot call the helper.
-- Keep the separate live-launch cleanup guard in place.
begin;

create or replace function public.annual_conference_reserved_seats(p_edition_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (
    (select count(*) from public.annual_conference_registrations where edition_id = p_edition_id and status = 'confirmed')
    + (select coalesce(sum(quantity), 0) from public.annual_conference_ticket_orders
       where edition_id = p_edition_id and payment_mode = 'live' and (status = 'paid' or (status = 'pending_payment' and expires_at > now())))
    + (select coalesce(sum(quantity), 0) from public.annual_conference_sponsor_ticket_allocations where edition_id = p_edition_id)
  )::integer;
$$;

create or replace function public.set_annual_conference_ticketing_capacity(
  p_edition_id uuid,
  p_public_capacity integer,
  p_actor_email text
)
returns public.annual_conference_ticketing_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.annual_conference_ticketing_settings;
  paid_seats integer;
  sponsor_seats integer;
  active_hold_seats integer;
begin
  if p_public_capacity < 1 then
    raise exception using message = 'ticketing_capacity_invalid';
  end if;

  insert into public.annual_conference_ticketing_settings (edition_id, updated_by_email)
  values (p_edition_id, p_actor_email)
  on conflict (edition_id) do nothing;

  select * into settings
  from public.annual_conference_ticketing_settings
  where edition_id = p_edition_id
  for update;

  select coalesce(sum(quantity), 0) into paid_seats
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id and payment_mode = 'live' and status = 'paid';

  select coalesce(sum(quantity), 0) into sponsor_seats
  from public.annual_conference_sponsor_ticket_allocations
  where edition_id = p_edition_id;

  select coalesce(sum(quantity), 0) into active_hold_seats
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id and payment_mode = 'live'
    and status = 'pending_payment'
    and expires_at > now();

  if p_public_capacity < paid_seats + sponsor_seats + active_hold_seats then
    raise exception using message = 'ticketing_capacity_below_reservations';
  end if;

  update public.annual_conference_ticketing_settings
  set public_capacity = p_public_capacity,
      updated_by_email = p_actor_email
  where edition_id = p_edition_id
  returning * into settings;

  return settings;
end;
$$;

create or replace function public.allocate_annual_conference_sponsor_tickets(
  p_edition_id uuid,
  p_sponsor_name text,
  p_contact_name text,
  p_contact_email text,
  p_quantity integer,
  p_actor_email text
)
returns public.annual_conference_sponsor_ticket_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.annual_conference_ticketing_settings;
  allocation public.annual_conference_sponsor_ticket_allocations;
  paid_seats integer;
  sponsor_seats integer;
  active_hold_seats integer;
begin
  insert into public.annual_conference_ticketing_settings (edition_id, updated_by_email)
  values (p_edition_id, p_actor_email)
  on conflict (edition_id) do nothing;

  select * into settings
  from public.annual_conference_ticketing_settings
  where edition_id = p_edition_id
  for update;

  select coalesce(sum(quantity), 0) into paid_seats
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id and payment_mode = 'live' and status = 'paid';

  select coalesce(sum(quantity), 0) into sponsor_seats
  from public.annual_conference_sponsor_ticket_allocations
  where edition_id = p_edition_id;

  select coalesce(sum(quantity), 0) into active_hold_seats
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id and payment_mode = 'live'
    and status = 'pending_payment'
    and expires_at > now();

  if p_quantity < 1 or paid_seats + sponsor_seats + active_hold_seats + p_quantity > settings.public_capacity then
    raise exception using message = 'ticketing_capacity_exhausted';
  end if;

  insert into public.annual_conference_sponsor_ticket_allocations (
    edition_id, sponsor_name, contact_name, contact_email, quantity, created_by_email
  ) values (
    p_edition_id, trim(p_sponsor_name), trim(p_contact_name), trim(p_contact_email), p_quantity, p_actor_email
  ) returning * into allocation;

  return allocation;
end;
$$;

create or replace function public.create_annual_conference_checkout_hold(
  p_edition_id uuid,
  p_purchaser_name text,
  p_purchaser_email text,
  p_tier_key text,
  p_checkout_request_key uuid
)
returns public.annual_conference_ticket_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.annual_conference_ticketing_settings;
  existing_order public.annual_conference_ticket_orders;
  checkout_order public.annual_conference_ticket_orders;
  order_quantity integer;
  order_amount_minor integer;
  paid_seats integer;
  sponsor_seats integer;
  active_hold_seats integer;
begin
  select * into settings
  from public.annual_conference_ticketing_settings
  where edition_id = p_edition_id
  for update;

  if settings.edition_id is null then raise exception using message = 'ticketing_not_configured'; end if;
  if p_checkout_request_key is null then raise exception using message = 'checkout_request_key_required'; end if;

  select * into existing_order
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id and payment_mode = 'live' and checkout_request_key = p_checkout_request_key;

  if existing_order.id is not null then
    if existing_order.purchaser_name <> trim(p_purchaser_name)
      or existing_order.purchaser_email <> lower(trim(p_purchaser_email))
      or existing_order.tier_key <> p_tier_key then raise exception using message = 'checkout_request_conflict'; end if;

    return existing_order;
  end if;

  if settings.sales_status <> 'open' then raise exception using message = 'ticket_sales_not_open'; end if;

  case p_tier_key
    when 'regular' then order_quantity := 1; order_amount_minor := settings.regular_price_minor;
    when 'team_3' then order_quantity := 3; order_amount_minor := settings.team_3_price_minor;
    when 'team_5' then order_quantity := 5; order_amount_minor := settings.team_5_price_minor;
    else raise exception using message = 'ticket_tier_invalid';
  end case;

  if length(trim(p_purchaser_name)) = 0 or length(trim(p_purchaser_email)) = 0 then raise exception using message = 'ticket_purchaser_invalid'; end if;

  update public.annual_conference_ticket_orders set status = 'expired'
  where edition_id = p_edition_id and status = 'pending_payment' and expires_at <= now();

  select coalesce(sum(quantity), 0) into paid_seats from public.annual_conference_ticket_orders where edition_id = p_edition_id and payment_mode = 'live' and status = 'paid';
  select coalesce(sum(quantity), 0) into sponsor_seats from public.annual_conference_sponsor_ticket_allocations where edition_id = p_edition_id;
  select coalesce(sum(quantity), 0) into active_hold_seats from public.annual_conference_ticket_orders where edition_id = p_edition_id and payment_mode = 'live' and status = 'pending_payment' and expires_at > now();

  if paid_seats + sponsor_seats + active_hold_seats + order_quantity > settings.public_capacity then raise exception using message = 'ticketing_capacity_exhausted'; end if;

  insert into public.annual_conference_ticket_orders (
    edition_id, purchaser_name, purchaser_email, tier_key, quantity, amount_minor, checkout_request_key, expires_at
  ) values (
    p_edition_id, trim(p_purchaser_name), lower(trim(p_purchaser_email)), p_tier_key, order_quantity, order_amount_minor, p_checkout_request_key, now() + interval '15 minutes'
  ) returning * into checkout_order;

  return checkout_order;
end;
$$;

create or replace function public.configure_annual_conference_registration(
  p_edition_id uuid, p_mode text, p_status public.annual_conference_ticket_sales_status, p_actor_email text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  if not found then raise exception 'conference_settings_not_found'; end if;
  if p_mode = 'paid' and exists (select 1 from public.annual_conference_registrations
    where edition_id = p_edition_id and status = 'waitlisted') then
    raise exception 'conference_resolve_waitlist_before_paid_mode';
  end if;
  if exists (select 1 from public.annual_conference_ticket_orders
    where edition_id = p_edition_id and payment_mode = 'live' and status = 'pending_payment' and expires_at > now()) then
    raise exception 'conference_wait_for_active_checkout_holds';
  end if;
  update public.annual_conference_ticketing_settings
    set public_mode = p_mode, sales_status = p_status, updated_by_email = lower(btrim(p_actor_email))
    where edition_id = p_edition_id;
end;
$$;

create or replace function public.confirm_annual_conference_standard_ticket_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_payment_reference text,
  p_amount_minor integer,
  p_currency text,
  p_payload_sha256 text,
  p_payment_facts jsonb default '{}'::jsonb
)
returns public.annual_conference_ticket_orders
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ticket_order public.annual_conference_ticket_orders;
  event_row public.annual_conference_ticket_payment_events;
  payment_attempt public.annual_conference_ticket_payment_attempts;
  settings public.annual_conference_ticketing_settings;
  paid_seats integer;
  sponsor_seats integer;
  active_hold_seats integer;
  inserted_event boolean := false;
  ticket_index integer;
  qr_token text;
  issued_ticket public.annual_conference_tickets;
  bundle_payload jsonb := '[]'::jsonb;
  confirmed_fee_mode text := coalesce(p_payment_facts ->> 'fee_mode', 'merchant_absorbs');
  confirmed_requested_amount_minor integer;
  confirmed_provider_fee_minor integer;
  confirmed_processing_fee_minor integer;
  refund_reason text;
begin
  if coalesce(length(trim(p_provider)), 0) = 0
    or coalesce(length(trim(p_provider_event_id)), 0) = 0
    or coalesce(length(trim(p_payment_reference)), 0) = 0
    or p_amount_minor < 0 then
    raise exception using message = 'ticket_payment_event_invalid';
  end if;

  if confirmed_fee_mode not in ('merchant_absorbs', 'paystack_pass_fees') then
    raise exception using message = 'ticket_payment_fee_mode_invalid';
  end if;

  if p_payment_facts ? 'requested_amount' then
    if (p_payment_facts ->> 'requested_amount') !~ '^[0-9]+$' then raise exception using message = 'ticket_payment_facts_invalid'; end if;
    confirmed_requested_amount_minor := (p_payment_facts ->> 'requested_amount')::integer;
  end if;

  if p_payment_facts ? 'fees' then
    if (p_payment_facts ->> 'fees') !~ '^[0-9]+$' then raise exception using message = 'ticket_payment_facts_invalid'; end if;
    confirmed_provider_fee_minor := (p_payment_facts ->> 'fees')::integer;
  end if;

  select * into ticket_order from public.annual_conference_ticket_orders where id = p_order_id for update;
  if ticket_order.id is null then raise exception using message = 'ticket_order_not_found'; end if;

  select * into payment_attempt from public.annual_conference_ticket_payment_attempts where order_id = ticket_order.id for update;
  if payment_attempt.id is null or payment_attempt.provider <> trim(p_provider) or payment_attempt.payment_reference <> trim(p_payment_reference) then
    raise exception using message = 'ticket_payment_reference_mismatch';
  end if;

  if confirmed_fee_mode = 'merchant_absorbs' then
    confirmed_processing_fee_minor := case when p_amount_minor = ticket_order.ticket_amount_minor then 0 else -1 end;
  elsif confirmed_requested_amount_minor is null or confirmed_requested_amount_minor <> ticket_order.ticket_amount_minor
    or confirmed_provider_fee_minor is null or p_amount_minor < confirmed_provider_fee_minor
    or p_amount_minor - confirmed_provider_fee_minor <> ticket_order.ticket_amount_minor then
    confirmed_processing_fee_minor := -1;
  else
    confirmed_processing_fee_minor := p_amount_minor - ticket_order.ticket_amount_minor;
  end if;

  insert into public.annual_conference_ticket_payment_events (
    provider, provider_event_id, order_id, event_type, payment_reference, payload_sha256, payload_facts
  ) values (
    trim(p_provider), trim(p_provider_event_id), ticket_order.id, trim(p_event_type), trim(p_payment_reference), trim(p_payload_sha256), coalesce(p_payment_facts, '{}'::jsonb)
  ) on conflict (provider, provider_event_id) do nothing returning * into event_row;
  inserted_event := event_row.id is not null;

  if ticket_order.status = 'paid' then
    if ticket_order.provider <> trim(p_provider) or ticket_order.payment_reference <> trim(p_payment_reference)
      or ticket_order.amount_paid_minor is distinct from p_amount_minor
      or ticket_order.processing_fee_minor <> confirmed_processing_fee_minor
      or ticket_order.payment_fee_mode <> confirmed_fee_mode
      or ticket_order.provider_requested_amount_minor is distinct from confirmed_requested_amount_minor
      or ticket_order.provider_fee_minor is distinct from confirmed_provider_fee_minor
      or ticket_order.currency <> upper(trim(p_currency)) then
      update public.annual_conference_ticket_payment_events set status = 'rejected', rejection_reason = 'ticket_payment_replay_mismatch', processed_at = now() where id = event_row.id;
      return ticket_order;
    end if;
    update public.annual_conference_ticket_payment_events set status = 'processed', processed_at = now() where id = event_row.id;
    return ticket_order;
  end if;

  if not inserted_event then return ticket_order; end if;
  if ticket_order.currency <> upper(trim(p_currency)) then
    update public.annual_conference_ticket_payment_events set status = 'rejected', rejection_reason = 'ticket_payment_amount_mismatch', processed_at = now() where id = event_row.id;
    return ticket_order;
  end if;

  if confirmed_processing_fee_minor < 0 then
    update public.annual_conference_ticket_payment_events set status = 'rejected', rejection_reason = 'ticket_payment_amount_mismatch', processed_at = now() where id = event_row.id;
    return ticket_order;
  end if;
  if ticket_order.status not in ('pending_payment', 'expired') then
    update public.annual_conference_ticket_payment_events set status = 'rejected', rejection_reason = 'ticket_checkout_not_payable', processed_at = now() where id = event_row.id;
    return ticket_order;
  end if;

  select * into settings from public.annual_conference_ticketing_settings where edition_id = ticket_order.edition_id for update;
  update public.annual_conference_ticket_orders set status = 'expired'
  where edition_id = ticket_order.edition_id and status = 'pending_payment' and expires_at <= now() and id <> ticket_order.id;
  select coalesce(sum(quantity), 0) into paid_seats from public.annual_conference_ticket_orders where edition_id = ticket_order.edition_id and payment_mode = 'live' and status = 'paid';
  select coalesce(sum(quantity), 0) into sponsor_seats from public.annual_conference_sponsor_ticket_allocations where edition_id = ticket_order.edition_id;
  select coalesce(sum(quantity), 0) into active_hold_seats from public.annual_conference_ticket_orders
  where edition_id = ticket_order.edition_id and payment_mode = 'live' and status = 'pending_payment' and expires_at > now() and id <> ticket_order.id;

  if ticket_order.status = 'expired' or ticket_order.expires_at is null or ticket_order.expires_at <= now()
    or settings.public_mode <> 'paid' or settings.sales_status <> 'open'
    or ticket_order.tier_key <> 'regular' or ticket_order.quantity <> 1
    or paid_seats + sponsor_seats + active_hold_seats + ticket_order.quantity
    + (select count(*) from public.annual_conference_registrations where edition_id = ticket_order.edition_id and status = 'confirmed') > settings.public_capacity then
    refund_reason := case
      when ticket_order.status = 'expired' or ticket_order.expires_at is null or ticket_order.expires_at <= now() then 'checkout_expired_after_payment'
      when settings.public_mode <> 'paid' then 'registration_mode_changed_after_payment'
      when settings.sales_status <> 'open' then 'sales_closed_after_payment'
      when ticket_order.tier_key <> 'regular' or ticket_order.quantity <> 1 then 'retired_tier_after_payment'
      else 'capacity_exhausted_after_payment'
    end;
    update public.annual_conference_ticket_orders
    set status = 'expired', provider = trim(p_provider), payment_reference = trim(p_payment_reference), paid_at = now(), expires_at = null,
        processing_fee_minor = confirmed_processing_fee_minor, amount_paid_minor = p_amount_minor,
        provider_fee_minor = confirmed_provider_fee_minor, provider_requested_amount_minor = confirmed_requested_amount_minor, payment_fee_mode = confirmed_fee_mode
    where id = ticket_order.id;
    update public.annual_conference_ticket_payment_attempts set status = 'refund_pending' where id = payment_attempt.id;
    insert into public.annual_conference_ticket_refunds (order_id, provider, payment_reference, amount_minor, currency, reason)
    values (ticket_order.id, trim(p_provider), trim(p_payment_reference), p_amount_minor, ticket_order.currency, refund_reason) on conflict (order_id) do nothing;
    update public.annual_conference_ticket_payment_events set status = 'processed', rejection_reason = 'ticket_refund_required:' || refund_reason, processed_at = now() where id = event_row.id;
    select * into ticket_order from public.annual_conference_ticket_orders where id = ticket_order.id;
    return ticket_order;
  end if;

  update public.annual_conference_ticket_orders
  set status = 'paid', provider = trim(p_provider), payment_reference = trim(p_payment_reference), paid_at = now(), expires_at = null,
      processing_fee_minor = confirmed_processing_fee_minor, amount_paid_minor = p_amount_minor,
      provider_fee_minor = confirmed_provider_fee_minor, provider_requested_amount_minor = confirmed_requested_amount_minor, payment_fee_mode = confirmed_fee_mode
  where id = ticket_order.id returning * into ticket_order;

  for ticket_index in 1..ticket_order.quantity loop
    qr_token := encode(gen_random_bytes(32), 'hex');
    insert into public.annual_conference_tickets (edition_id, order_id, status, is_bearer_ticket, qr_token_hash, issued_at, order_seat_number)
    values (ticket_order.edition_id, ticket_order.id, 'issued', true, encode(digest(qr_token, 'sha256'), 'hex'), now(), ticket_index)
    returning * into issued_ticket;
    bundle_payload := bundle_payload || jsonb_build_array(jsonb_build_object('ticket_id', issued_ticket.id, 'order_seat_number', issued_ticket.order_seat_number, 'qr_token', qr_token));
  end loop;

  insert into public.annual_conference_ticket_email_outbox (edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key)
  values (ticket_order.edition_id, ticket_order.id, 'ticket_bundle_delivery', ticket_order.purchaser_name, ticket_order.purchaser_email,
    jsonb_build_object('order_id', ticket_order.id, 'tickets', bundle_payload), concat('annual-conference-ticket-bundle-delivery:', ticket_order.id))
  on conflict (idempotency_key) do nothing;
  insert into public.annual_conference_ticket_email_outbox (edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key)
  values (ticket_order.edition_id, ticket_order.id, 'payment_receipt', ticket_order.purchaser_name, ticket_order.purchaser_email,
    jsonb_build_object('order_id', ticket_order.id, 'quantity', ticket_order.quantity, 'ticket_amount_minor', ticket_order.ticket_amount_minor,
      'processing_fee_minor', ticket_order.processing_fee_minor, 'amount_paid_minor', ticket_order.amount_paid_minor,
      'provider_fee_minor', ticket_order.provider_fee_minor, 'currency', ticket_order.currency), concat('annual-conference-ticket-receipt:', ticket_order.id))
  on conflict (idempotency_key) do nothing;
  update public.annual_conference_ticket_payment_events set status = 'processed', processed_at = now() where id = event_row.id;
  update public.annual_conference_ticket_payment_attempts set status = 'confirmed' where id = payment_attempt.id;
  return ticket_order;
end;
$$;

create or replace function public.confirm_annual_conference_flexible_ticket_payment(
  p_order_id uuid, p_provider text, p_provider_event_id text, p_event_type text, p_payment_reference text,
  p_amount_minor integer, p_currency text, p_payload_sha256 text, p_payment_facts jsonb
)
returns public.annual_conference_ticket_orders
language plpgsql security definer set search_path = public as $$
declare ticket_order public.annual_conference_ticket_orders; settings public.annual_conference_ticketing_settings;
  attempt public.annual_conference_ticket_payment_attempts; event_row public.annual_conference_ticket_payment_events;
  allocation public.annual_conference_flexible_ticket_allocations; issued_ticket public.annual_conference_tickets;
  management_capability text; qr_token text; paid_seats integer; held_seats integer; sponsor_seats integer;
  buyer_bundle jsonb := '[]'::jsonb; buyer_chunk jsonb; buyer_ticket_count integer;
  buyer_chunk_count integer; buyer_chunk_index integer;
  provider_requested_amount integer; provider_fee integer;
begin
  if coalesce(length(btrim(p_provider_event_id)), 0) = 0
    or coalesce(length(btrim(p_event_type)), 0) = 0
    or coalesce(length(btrim(p_payment_reference)), 0) = 0
    or coalesce(length(btrim(p_payload_sha256)), 0) = 0
    or coalesce(btrim(p_provider), '') <> 'paystack'
    or p_amount_minor is null or p_amount_minor < 0 then
    raise exception using message = 'ticket_payment_event_invalid';
  end if;

  select * into ticket_order from public.annual_conference_ticket_orders where id = p_order_id for update;
  if ticket_order.id is null or ticket_order.checkout_flow <> 'flexible' or ticket_order.tier_key <> 'regular_flexible'
    or ticket_order.provider <> 'paystack' or ticket_order.flexible_payment_fee_mode <> 'merchant_absorbs'
    or ticket_order.amount_minor <> ticket_order.quantity * 15000
    or (select count(*) from public.annual_conference_flexible_ticket_allocations where order_id = ticket_order.id) <> ticket_order.quantity then
    raise exception using message = 'flexible_ticket_payment_invalid';
  end if;

  if p_payment_facts ? 'requested_amount' then
    if (p_payment_facts ->> 'requested_amount') !~ '^[0-9]+$'
      or (p_payment_facts ->> 'requested_amount')::numeric > 2147483647 then
      raise exception using message = 'ticket_payment_facts_invalid';
    end if;
    provider_requested_amount := (p_payment_facts ->> 'requested_amount')::integer;
  end if;

  if p_payment_facts ? 'fees' then
    if (p_payment_facts ->> 'fees') !~ '^[0-9]+$'
      or (p_payment_facts ->> 'fees')::numeric > 2147483647 then
      raise exception using message = 'ticket_payment_facts_invalid';
    end if;
    provider_fee := (p_payment_facts ->> 'fees')::integer;
  end if;
  select * into attempt from public.annual_conference_ticket_payment_attempts where order_id = ticket_order.id for update;
  if attempt.id is null or attempt.provider <> 'paystack' or trim(p_provider) <> 'paystack'
    or attempt.payment_reference <> trim(p_payment_reference) then raise exception using message = 'ticket_payment_reference_mismatch'; end if;
  insert into public.annual_conference_ticket_payment_events(provider, provider_event_id, order_id, event_type, payment_reference, payload_sha256, payload_facts)
  values ('paystack', trim(p_provider_event_id), ticket_order.id, trim(p_event_type), trim(p_payment_reference), trim(p_payload_sha256), coalesce(p_payment_facts, '{}'::jsonb))
  on conflict (provider, provider_event_id) do nothing returning * into event_row;
  if event_row.id is not null and btrim(p_event_type) <> 'charge.success' then
    update public.annual_conference_ticket_payment_events
    set status = 'rejected', rejection_reason = 'ticket_payment_event_not_success', processed_at = now()
    where id = event_row.id;
    return ticket_order;
  end if;
  if ticket_order.status = 'paid' then
    if ticket_order.provider <> 'paystack'
      or ticket_order.payment_reference <> btrim(p_payment_reference)
      or ticket_order.amount_paid_minor is distinct from p_amount_minor
      or ticket_order.payment_fee_mode <> 'merchant_absorbs'
      or ticket_order.provider_requested_amount_minor is distinct from provider_requested_amount
      or ticket_order.provider_fee_minor is distinct from provider_fee
      or ticket_order.currency is distinct from upper(btrim(p_currency)) then
      update public.annual_conference_ticket_payment_events
      set status = 'rejected', rejection_reason = 'ticket_payment_replay_mismatch', processed_at = now()
      where id = event_row.id;
      return ticket_order;
    end if;

    update public.annual_conference_ticket_payment_events set status = 'processed', processed_at = now() where id = event_row.id;
    return ticket_order;
  end if;
  if event_row.id is null then return ticket_order; end if;
  if p_amount_minor <> ticket_order.amount_minor or coalesce(upper(trim(p_currency)), '') <> 'GHS'
    or coalesce(p_payment_facts ->> 'fee_mode', 'merchant_absorbs') <> 'merchant_absorbs'
    or (provider_requested_amount is not null and provider_requested_amount <> ticket_order.amount_minor) then
    update public.annual_conference_ticket_payment_events set status = 'rejected', rejection_reason = 'ticket_payment_amount_mismatch', processed_at = now() where id = event_row.id;
    return ticket_order;
  end if;
  select * into settings from public.annual_conference_ticketing_settings where edition_id = ticket_order.edition_id for update;
  update public.annual_conference_ticket_orders set status = 'expired'
    where edition_id = ticket_order.edition_id and status = 'pending_payment' and expires_at <= now() and id <> ticket_order.id;
  select coalesce(sum(quantity), 0) into paid_seats from public.annual_conference_ticket_orders where edition_id = ticket_order.edition_id and payment_mode = 'live' and status = 'paid';
  select coalesce(sum(quantity), 0) into held_seats from public.annual_conference_ticket_orders where edition_id = ticket_order.edition_id and payment_mode = 'live' and status = 'pending_payment' and expires_at > now() and id <> ticket_order.id;
  select coalesce(sum(quantity), 0) into sponsor_seats from public.annual_conference_sponsor_ticket_allocations where edition_id = ticket_order.edition_id;
  if ticket_order.status <> 'pending_payment' or ticket_order.expires_at <= now()
    or settings.sales_status <> 'open' or settings.public_mode <> 'paid'
    or (ticket_order.payment_mode = 'live' and paid_seats + held_seats + sponsor_seats + ticket_order.quantity +
      (select count(*) from public.annual_conference_registrations where edition_id = ticket_order.edition_id and status = 'confirmed') > settings.public_capacity) then
    update public.annual_conference_ticket_orders
    set status = 'expired', provider = 'paystack', payment_reference = trim(p_payment_reference), paid_at = now(), expires_at = null,
        amount_paid_minor = p_amount_minor, payment_fee_mode = 'merchant_absorbs', processing_fee_minor = 0,
        provider_requested_amount_minor = provider_requested_amount, provider_fee_minor = provider_fee
    where id = ticket_order.id;
    update public.annual_conference_ticket_payment_attempts set status = 'refund_pending' where id = attempt.id;
    insert into public.annual_conference_ticket_refunds(order_id, provider, payment_reference, amount_minor, currency, reason)
      values (ticket_order.id, 'paystack', trim(p_payment_reference), p_amount_minor, 'GHS', 'flexible_ticket_refund_required') on conflict (order_id) do nothing;
    update public.annual_conference_ticket_payment_events set status = 'processed', rejection_reason = 'ticket_refund_required', processed_at = now() where id = event_row.id;
    select * into ticket_order from public.annual_conference_ticket_orders where id = ticket_order.id; return ticket_order;
  end if;
  management_capability := encode(extensions.gen_random_bytes(32), 'hex');
  update public.annual_conference_ticket_orders
  set status = 'paid', provider = 'paystack', payment_reference = trim(p_payment_reference), paid_at = now(), expires_at = null,
      amount_paid_minor = p_amount_minor, payment_fee_mode = 'merchant_absorbs', processing_fee_minor = 0,
      provider_requested_amount_minor = provider_requested_amount, provider_fee_minor = provider_fee,
      flexible_order_management_capability_hash = encode(extensions.digest(management_capability, 'sha256'), 'hex')
  where id = ticket_order.id
  returning * into ticket_order;
  for allocation in select * from public.annual_conference_flexible_ticket_allocations where order_id = ticket_order.id order by seat_index loop
    if allocation.allocation_kind = 'self' then
      qr_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.annual_conference_tickets(edition_id, order_id, status, is_bearer_ticket, attendee_name, attendee_email, qr_token_hash, issued_at, order_seat_number)
      values (ticket_order.edition_id, ticket_order.id, 'issued', false, allocation.recipient_name, allocation.recipient_email, encode(extensions.digest(qr_token, 'sha256'), 'hex'), now(), allocation.seat_index) returning * into issued_ticket;
      insert into public.annual_conference_ticket_email_outbox(edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key)
      values (ticket_order.edition_id, ticket_order.id, 'flexible_admission_delivery', allocation.recipient_name, allocation.recipient_email, jsonb_build_object('ticket_id', issued_ticket.id, 'qr_token', qr_token), 'flexible-self-admission:' || issued_ticket.id);
      perform public.issue_annual_conference_social_card_delivery(ticket_order.edition_id, 'attendee', issued_ticket.id);
    elsif allocation.allocation_kind = 'buyer_managed' then
      qr_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.annual_conference_tickets(edition_id, order_id, status, is_bearer_ticket, qr_token_hash, issued_at, order_seat_number)
      values (ticket_order.edition_id, ticket_order.id, 'issued', true, encode(extensions.digest(qr_token, 'sha256'), 'hex'), now(), allocation.seat_index) returning * into issued_ticket;
      buyer_bundle := buyer_bundle || jsonb_build_array(jsonb_build_object(
        'ticket_id', issued_ticket.id,
        'order_seat_number', issued_ticket.order_seat_number,
        'qr_token', qr_token
      ));
    else
      insert into public.annual_conference_tickets(edition_id, order_id, status, is_bearer_ticket, order_seat_number)
      values (ticket_order.edition_id, ticket_order.id, 'pending', false, allocation.seat_index) returning * into issued_ticket;
      if allocation.allocation_kind = 'gift' then
        perform public.queue_annual_conference_flexible_gift_claim(allocation.id, ticket_order.edition_id, ticket_order.id, allocation.recipient_email);
      end if;
    end if;
  end loop;

  buyer_ticket_count := jsonb_array_length(buyer_bundle);
  if buyer_ticket_count > 0 then
    buyer_chunk_count := ceil(buyer_ticket_count::numeric / 20)::integer;

    for buyer_chunk_index in 0..buyer_chunk_count - 1 loop
      select jsonb_agg(value order by ordinality)
      into buyer_chunk
      from jsonb_array_elements(buyer_bundle) with ordinality
      where ordinality between buyer_chunk_index * 20 + 1 and least((buyer_chunk_index + 1) * 20, buyer_ticket_count);

      insert into public.annual_conference_ticket_email_outbox(
        edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
      ) values (
        ticket_order.edition_id,
        ticket_order.id,
        'flexible_buyer_bundle_delivery',
        ticket_order.purchaser_name,
        ticket_order.purchaser_email,
        jsonb_build_object(
          'chunk_index', buyer_chunk_index + 1,
          'chunk_count', buyer_chunk_count,
          'tickets', buyer_chunk
        ),
        concat('flexible-buyer-bundle:', ticket_order.id, ':', buyer_chunk_index + 1)
      );
    end loop;
  end if;
  insert into public.annual_conference_ticket_email_outbox(edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key)
  values (ticket_order.edition_id, ticket_order.id, 'flexible_order_management', ticket_order.purchaser_name, ticket_order.purchaser_email, jsonb_build_object('capability', management_capability), 'flexible-management:' || ticket_order.id);
  insert into public.annual_conference_ticket_email_outbox(
    edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
  ) values (
    ticket_order.edition_id,
    ticket_order.id,
    'payment_receipt',
    ticket_order.purchaser_name,
    ticket_order.purchaser_email,
    jsonb_build_object(
      'order_id', ticket_order.id,
      'quantity', ticket_order.quantity,
      'ticket_amount_minor', ticket_order.ticket_amount_minor,
      'processing_fee_minor', ticket_order.processing_fee_minor,
      'amount_paid_minor', ticket_order.amount_paid_minor,
      'provider_fee_minor', ticket_order.provider_fee_minor,
      'currency', ticket_order.currency
    ),
    'annual-conference-ticket-receipt:' || ticket_order.id
  ) on conflict (idempotency_key) do nothing;
  update public.annual_conference_ticket_payment_events set status = 'processed', processed_at = now() where id = event_row.id;
  update public.annual_conference_ticket_payment_attempts set status = 'confirmed' where id = attempt.id;
  return ticket_order;
end;
$$;

create or replace function public.create_conference_checkout_hold_for_mode(
  p_edition_id uuid,
  p_purchaser_name text,
  p_purchaser_email text,
  p_quantity integer,
  p_allocations jsonb,
  p_checkout_request_key uuid,
  p_payment_mode text,
  p_checkout_origin text
)
returns public.annual_conference_ticket_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.annual_conference_ticketing_settings;
  existing_order public.annual_conference_ticket_orders;
  checkout_order public.annual_conference_ticket_orders;
  allocation jsonb;
  canonical_allocations jsonb := '[]'::jsonb;
  seen_indices integer[] := '{}';
  purchaser_name text := nullif(btrim(p_purchaser_name), '');
  purchaser_email text := nullif(lower(btrim(p_purchaser_email)), '');
  recipient_name text;
  recipient_email text;
  allocation_seat_index integer;
  allocation_kind text;
  self_count integer := 0;
  order_amount_numeric numeric;
  reserved_seats numeric;
  confirmed_registrations numeric;
begin
  if p_payment_mode is null or p_payment_mode not in ('live', 'test')
    or (p_payment_mode = 'live' and p_checkout_origin is not null) then
    raise exception 'ticket_payment_mode_invalid';
  end if;

  if p_checkout_request_key is null then
    raise exception using message = 'flexible_ticket_checkout_request_key_required';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception using message = 'flexible_ticket_quantity_invalid';
  end if;

  if purchaser_name is null or char_length(purchaser_name) > 120
    or purchaser_email is null or char_length(purchaser_email) > 254
    or purchaser_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception using message = 'flexible_ticket_purchaser_invalid';
  end if;

  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) <> p_quantity then
    raise exception using message = 'flexible_ticket_allocations_invalid';
  end if;

  for allocation in select value from jsonb_array_elements(p_allocations)
  loop
    if jsonb_typeof(allocation) <> 'object'
      or exists (
        select 1
        from jsonb_object_keys(allocation) as key_name
        where key_name not in ('seat_index', 'kind', 'recipient_name', 'recipient_email')
      ) then
      raise exception using message = 'flexible_ticket_allocations_invalid';
    end if;

    if coalesce(allocation ->> 'seat_index', '') !~ '^[1-9][0-9]{0,9}$'
      or (allocation ->> 'seat_index')::numeric > 2147483647 then
      raise exception using message = 'flexible_ticket_allocations_invalid';
    end if;

    allocation_seat_index := (allocation ->> 'seat_index')::integer;
    allocation_kind := allocation ->> 'kind';
    recipient_name := nullif(btrim(allocation ->> 'recipient_name'), '');
    recipient_email := nullif(lower(btrim(allocation ->> 'recipient_email')), '');

    if allocation_seat_index > p_quantity
      or allocation_seat_index = any(seen_indices)
      or allocation_kind not in ('self', 'gift', 'buyer_managed', 'community_managed', 'community_shareable') then
      raise exception using message = 'flexible_ticket_allocations_invalid';
    end if;

    if allocation_kind = 'self' then
      if recipient_name is distinct from purchaser_name or recipient_email is distinct from purchaser_email then
        raise exception using message = 'flexible_ticket_self_identity_invalid';
      end if;
      self_count := self_count + 1;
    elsif allocation_kind = 'gift' then
      if recipient_name is not null or recipient_email is null
        or char_length(recipient_email) > 254
        or recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
        raise exception using message = 'flexible_ticket_gift_recipient_invalid';
      end if;
    elsif recipient_name is not null or recipient_email is not null then
      raise exception using message = 'flexible_ticket_recipient_not_allowed';
    end if;

    seen_indices := array_append(seen_indices, allocation_seat_index);
    canonical_allocations := canonical_allocations || jsonb_build_array(jsonb_build_object(
      'seat_index', allocation_seat_index,
      'kind', allocation_kind,
      'recipient_name', case when allocation_kind = 'self' then purchaser_name else null end,
      'recipient_email', case when allocation_kind in ('self', 'gift') then recipient_email else null end
    ));
  end loop;

  if self_count > 1 then
    raise exception using message = 'flexible_ticket_self_allocation_duplicate';
  end if;

  select jsonb_agg(value order by (value ->> 'seat_index')::integer)
  into canonical_allocations
  from jsonb_array_elements(canonical_allocations);

  select * into settings
  from public.annual_conference_ticketing_settings
  where edition_id = p_edition_id
  for update;

  if settings.edition_id is null then
    raise exception using message = 'ticketing_not_configured';
  end if;

  select * into existing_order
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id
    and flexible_cart_request_key = p_checkout_request_key;

  if existing_order.id is not null then
    if existing_order.purchaser_name <> purchaser_name
      or existing_order.purchaser_email <> purchaser_email
      or existing_order.quantity <> p_quantity
      or existing_order.flexible_cart_snapshot <> canonical_allocations
      or existing_order.provider <> 'paystack'
      or existing_order.payment_mode <> p_payment_mode
      or existing_order.checkout_origin is distinct from p_checkout_origin then
      raise exception using message = 'flexible_ticket_checkout_request_conflict';
    end if;

    return existing_order;
  end if;

  if settings.sales_status <> 'open' or settings.public_mode <> 'paid' then
    raise exception using message = 'ticket_sales_not_open';
  end if;

  if settings.regular_price_minor <> 15000 then
    raise exception using message = 'flexible_ticket_regular_price_not_configured';
  end if;

  if settings.flexible_checkout_max_amount_minor is null then
    raise exception using message = 'flexible_ticket_provider_ceiling_unconfigured';
  end if;

  order_amount_numeric := settings.regular_price_minor::numeric * p_quantity::numeric;
  if order_amount_numeric > 2147483647 then
    raise exception using message = 'flexible_ticket_amount_overflow';
  end if;

  if order_amount_numeric > settings.flexible_checkout_max_amount_minor::numeric then
    raise exception using message = 'flexible_ticket_provider_ceiling_exceeded';
  end if;

  update public.annual_conference_ticket_orders
  set status = 'expired'
  where edition_id = p_edition_id
    and status = 'pending_payment'
    and expires_at <= now();

  select coalesce(sum(quantity::numeric), 0)
  into reserved_seats
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id and payment_mode = 'live'
    and (status = 'paid' or (status = 'pending_payment' and expires_at > now()));

  select reserved_seats + coalesce(sum(quantity::numeric), 0)
  into reserved_seats
  from public.annual_conference_sponsor_ticket_allocations
  where edition_id = p_edition_id;

  select count(*)::numeric
  into confirmed_registrations
  from public.annual_conference_registrations
  where edition_id = p_edition_id
    and status = 'confirmed';

  if p_payment_mode = 'live'
    and reserved_seats + confirmed_registrations + p_quantity::numeric > settings.public_capacity::numeric then
    raise exception using message = 'ticketing_capacity_exhausted';
  end if;

  insert into public.annual_conference_ticket_orders (
    edition_id,
    purchaser_name,
    purchaser_email,
    tier_key,
    quantity,
    amount_minor,
    checkout_flow,
    flexible_cart_request_key,
    flexible_cart_snapshot,
    flexible_payment_fee_mode,
    provider,
    payment_mode,
    checkout_origin,
    expires_at
  ) values (
    p_edition_id,
    purchaser_name,
    purchaser_email,
    'regular_flexible',
    p_quantity,
    order_amount_numeric::integer,
    'flexible',
    p_checkout_request_key,
    canonical_allocations,
    'merchant_absorbs',
    'paystack',
    p_payment_mode,
    p_checkout_origin,
    now() + interval '15 minutes'
  ) returning * into checkout_order;

  for allocation in select value from jsonb_array_elements(canonical_allocations)
  loop
    insert into public.annual_conference_flexible_ticket_allocations (
      edition_id,
      order_id,
      seat_index,
      allocation_kind,
      recipient_name,
      recipient_email
    ) values (
      p_edition_id,
      checkout_order.id,
      (allocation ->> 'seat_index')::integer,
      allocation ->> 'kind',
      nullif(allocation ->> 'recipient_name', ''),
      nullif(allocation ->> 'recipient_email', '')
    );
  end loop;

  return checkout_order;
end;
$$;

create or replace function public.create_annual_conference_flexible_checkout_hold(
  p_edition_id uuid,
  p_purchaser_name text,
  p_purchaser_email text,
  p_quantity integer,
  p_allocations jsonb,
  p_checkout_request_key uuid
)
returns public.annual_conference_ticket_orders
language sql
security definer
set search_path = public
as $$
  select * from public.create_conference_checkout_hold_for_mode(
    p_edition_id, p_purchaser_name, p_purchaser_email, p_quantity,
    p_allocations, p_checkout_request_key, 'live', null
  );
$$;

create or replace function public.create_annual_conference_complete_test_hold(
  p_edition_id uuid, p_purchaser_name text, p_purchaser_email text,
  p_quantity integer, p_allocations jsonb, p_checkout_request_key uuid, p_origin text
)
returns public.annual_conference_ticket_orders
language plpgsql security definer set search_path = public as $$
declare settings jsonb; existing public.annual_conference_ticket_orders; result public.annual_conference_ticket_orders;
begin
  perform 1 from public.annual_conference_ticketing_settings
    where edition_id = p_edition_id and flexible_checkout_state = 'internal' for update;
  if not found then raise exception 'complete_test_checkout_not_available'; end if;
  settings := public.get_annual_conference_registration_testing(p_edition_id);
  if not coalesce((settings->>'enabled')::boolean, false)
    or not (settings->'tester_emails' ? lower(btrim(p_purchaser_email)))
    or p_origin is null or p_origin !~ '^https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$'
    or exists (select 1 from jsonb_array_elements(p_allocations) a
      where a->>'recipient_email' is not null
        and not (settings->'tester_emails' ? lower(btrim(a->>'recipient_email')))) then
    raise exception 'complete_test_checkout_not_available';
  end if;
  select * into existing from public.annual_conference_ticket_orders
    where edition_id = p_edition_id and flexible_cart_request_key = p_checkout_request_key;
  if existing.id is not null and (existing.payment_mode <> 'test' or existing.checkout_origin <> p_origin) then
    raise exception 'flexible_ticket_checkout_request_conflict';
  end if;
  select * into result from public.create_conference_checkout_hold_for_mode(
    p_edition_id, p_purchaser_name, p_purchaser_email, p_quantity, p_allocations, p_checkout_request_key, 'test', p_origin
  );
  return result;
end;
$$;

revoke all on function public.create_conference_checkout_hold_for_mode(uuid, text, text, integer, jsonb, uuid, text, text)
  from public, anon, authenticated, service_role;

commit;
