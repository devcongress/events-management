-- Preserve the published ticket price separately from the amount a customer
-- pays when Paystack's optional pass-fees feature is enabled.
alter table public.annual_conference_ticket_orders
  add column ticket_amount_minor integer,
  add column processing_fee_minor integer not null default 0,
  add column amount_paid_minor integer,
  add column provider_fee_minor integer,
  add column provider_requested_amount_minor integer,
  add column payment_fee_mode text;

create function public.set_annual_conference_ticket_order_ticket_amount()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ticket_amount_minor is null then new.ticket_amount_minor := new.amount_minor; end if;
  return new;
end;
$$;

create trigger set_annual_conference_ticket_order_ticket_amount
before insert on public.annual_conference_ticket_orders
for each row execute function public.set_annual_conference_ticket_order_ticket_amount();

update public.annual_conference_ticket_orders
set ticket_amount_minor = amount_minor,
    amount_paid_minor = case when paid_at is not null then amount_minor else null end,
    payment_fee_mode = case when paid_at is not null then 'merchant_absorbs' else null end;

alter table public.annual_conference_ticket_orders
  alter column ticket_amount_minor set not null,
  add constraint annual_conference_ticket_orders_ticket_amount_matches_legacy check (ticket_amount_minor = amount_minor),
  add constraint annual_conference_ticket_orders_processing_fee check (processing_fee_minor >= 0),
  add constraint annual_conference_ticket_orders_amount_paid check (amount_paid_minor is null or amount_paid_minor = ticket_amount_minor + processing_fee_minor),
  add constraint annual_conference_ticket_orders_provider_fee check (provider_fee_minor is null or provider_fee_minor >= 0),
  add constraint annual_conference_ticket_orders_provider_requested_amount check (provider_requested_amount_minor is null or provider_requested_amount_minor > 0),
  add constraint annual_conference_ticket_orders_payment_fee_mode check (payment_fee_mode is null or payment_fee_mode in ('merchant_absorbs', 'paystack_pass_fees')),
  add constraint annual_conference_ticket_orders_payment_breakdown check (
    (amount_paid_minor is null and processing_fee_minor = 0 and payment_fee_mode is null)
    or (amount_paid_minor is not null and payment_fee_mode is not null)
  );

create or replace function public.confirm_annual_conference_ticket_payment(
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
set search_path = public
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
  if ticket_order.status <> 'pending_payment' then
    update public.annual_conference_ticket_payment_events set status = 'rejected', rejection_reason = 'ticket_checkout_not_payable', processed_at = now() where id = event_row.id;
    return ticket_order;
  end if;

  select * into settings from public.annual_conference_ticketing_settings where edition_id = ticket_order.edition_id for update;
  update public.annual_conference_ticket_orders set status = 'expired'
  where edition_id = ticket_order.edition_id and status = 'pending_payment' and expires_at <= now() and id <> ticket_order.id;
  select coalesce(sum(quantity), 0) into paid_seats from public.annual_conference_ticket_orders where edition_id = ticket_order.edition_id and status = 'paid';
  select coalesce(sum(quantity), 0) into sponsor_seats from public.annual_conference_sponsor_ticket_allocations where edition_id = ticket_order.edition_id;
  select coalesce(sum(quantity), 0) into active_hold_seats from public.annual_conference_ticket_orders
  where edition_id = ticket_order.edition_id and status = 'pending_payment' and expires_at > now() and id <> ticket_order.id;

  if paid_seats + sponsor_seats + active_hold_seats + ticket_order.quantity > settings.public_capacity then
    update public.annual_conference_ticket_orders
    set status = 'expired', provider = trim(p_provider), payment_reference = trim(p_payment_reference), paid_at = now(), expires_at = null,
        processing_fee_minor = confirmed_processing_fee_minor, amount_paid_minor = p_amount_minor,
        provider_fee_minor = confirmed_provider_fee_minor, provider_requested_amount_minor = confirmed_requested_amount_minor, payment_fee_mode = confirmed_fee_mode
    where id = ticket_order.id;
    update public.annual_conference_ticket_payment_attempts set status = 'refund_pending' where id = payment_attempt.id;
    insert into public.annual_conference_ticket_refunds (order_id, provider, payment_reference, amount_minor, currency, reason)
    values (ticket_order.id, trim(p_provider), trim(p_payment_reference), p_amount_minor, ticket_order.currency, 'capacity_exhausted_after_payment') on conflict (order_id) do nothing;
    update public.annual_conference_ticket_payment_events set status = 'processed', rejection_reason = 'ticket_refund_required_capacity_exhausted', processed_at = now() where id = event_row.id;
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

revoke all on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) to service_role;

comment on column public.annual_conference_ticket_orders.ticket_amount_minor is 'Immutable ticket subtotal before any buyer-paid payment-processing charge.';
comment on column public.annual_conference_ticket_orders.processing_fee_minor is 'Buyer-paid processing charge, derived only from a verified provider gross amount.';
comment on column public.annual_conference_ticket_orders.amount_paid_minor is 'Verified gross amount charged to the buyer; null until payment is confirmed.';
