-- A paid group order is a bundle of independently usable bearer tickets. The
-- buyer distributes them; staff never need attendee assignments to admit each
-- seat separately.
alter table public.annual_conference_tickets
  add column is_bearer_ticket boolean not null default false;

alter table public.annual_conference_tickets
  drop constraint annual_conference_tickets_identity;

alter table public.annual_conference_tickets
  add constraint annual_conference_tickets_identity check (
    status = 'pending'
    or is_bearer_ticket
    or (coalesce(trim(attendee_name), '') <> '' and coalesce(trim(attendee_email), '') <> '')
  );

alter table public.annual_conference_ticket_email_outbox
  drop constraint annual_conference_ticket_email_outbox_kind;

alter table public.annual_conference_ticket_email_outbox
  add constraint annual_conference_ticket_email_outbox_kind
  check (kind in ('payment_receipt', 'ticket_delivery', 'ticket_bundle_delivery'));

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
begin
  if coalesce(length(trim(p_provider)), 0) = 0
    or coalesce(length(trim(p_provider_event_id)), 0) = 0
    or coalesce(length(trim(p_payment_reference)), 0) = 0 then
    raise exception using message = 'ticket_payment_event_invalid';
  end if;

  select * into ticket_order
  from public.annual_conference_ticket_orders
  where id = p_order_id
  for update;

  if ticket_order.id is null then raise exception using message = 'ticket_order_not_found'; end if;

  select * into payment_attempt
  from public.annual_conference_ticket_payment_attempts
  where order_id = ticket_order.id
  for update;

  if payment_attempt.id is null or payment_attempt.provider <> trim(p_provider) or payment_attempt.payment_reference <> trim(p_payment_reference) then
    raise exception using message = 'ticket_payment_reference_mismatch';
  end if;

  insert into public.annual_conference_ticket_payment_events (
    provider, provider_event_id, order_id, event_type, payment_reference, payload_sha256, payload_facts
  ) values (
    trim(p_provider), trim(p_provider_event_id), ticket_order.id, trim(p_event_type), trim(p_payment_reference), trim(p_payload_sha256), coalesce(p_payment_facts, '{}'::jsonb)
  ) on conflict (provider, provider_event_id) do nothing
  returning * into event_row;

  inserted_event := event_row.id is not null;

  if ticket_order.status = 'paid' then
    if ticket_order.provider <> trim(p_provider) or ticket_order.payment_reference <> trim(p_payment_reference)
      or ticket_order.amount_minor <> p_amount_minor or ticket_order.currency <> upper(trim(p_currency)) then
      update public.annual_conference_ticket_payment_events
      set status = 'rejected', rejection_reason = 'ticket_payment_replay_mismatch', processed_at = now()
      where id = event_row.id;
      return ticket_order;
    end if;

    update public.annual_conference_ticket_payment_events
    set status = 'processed', processed_at = now()
    where id = event_row.id;
    return ticket_order;
  end if;

  if not inserted_event then return ticket_order; end if;

  if ticket_order.amount_minor <> p_amount_minor or ticket_order.currency <> upper(trim(p_currency)) then
    update public.annual_conference_ticket_payment_events
    set status = 'rejected', rejection_reason = 'ticket_payment_amount_mismatch', processed_at = now()
    where id = event_row.id;
    return ticket_order;
  end if;

  if ticket_order.status <> 'pending_payment' then
    update public.annual_conference_ticket_payment_events
    set status = 'rejected', rejection_reason = 'ticket_checkout_not_payable', processed_at = now()
    where id = event_row.id;
    return ticket_order;
  end if;

  select * into settings
  from public.annual_conference_ticketing_settings
  where edition_id = ticket_order.edition_id
  for update;

  update public.annual_conference_ticket_orders
  set status = 'expired'
  where edition_id = ticket_order.edition_id and status = 'pending_payment' and expires_at <= now() and id <> ticket_order.id;

  select coalesce(sum(quantity), 0) into paid_seats
  from public.annual_conference_ticket_orders where edition_id = ticket_order.edition_id and status = 'paid';
  select coalesce(sum(quantity), 0) into sponsor_seats
  from public.annual_conference_sponsor_ticket_allocations where edition_id = ticket_order.edition_id;
  select coalesce(sum(quantity), 0) into active_hold_seats
  from public.annual_conference_ticket_orders
  where edition_id = ticket_order.edition_id and status = 'pending_payment' and expires_at > now() and id <> ticket_order.id;

  if paid_seats + sponsor_seats + active_hold_seats + ticket_order.quantity > settings.public_capacity then
    update public.annual_conference_ticket_orders
    set status = 'expired', provider = trim(p_provider), payment_reference = trim(p_payment_reference), paid_at = now(), expires_at = null
    where id = ticket_order.id;
    update public.annual_conference_ticket_payment_attempts set status = 'refund_pending' where id = payment_attempt.id;
    insert into public.annual_conference_ticket_refunds (
      order_id, provider, payment_reference, amount_minor, currency, reason
    ) values (
      ticket_order.id, trim(p_provider), trim(p_payment_reference), ticket_order.amount_minor, ticket_order.currency, 'capacity_exhausted_after_payment'
    ) on conflict (order_id) do nothing;
    update public.annual_conference_ticket_payment_events set status = 'processed', rejection_reason = 'ticket_refund_required_capacity_exhausted', processed_at = now() where id = event_row.id;
    select * into ticket_order from public.annual_conference_ticket_orders where id = ticket_order.id;
    return ticket_order;
  end if;

  update public.annual_conference_ticket_orders
  set status = 'paid', provider = trim(p_provider), payment_reference = trim(p_payment_reference), paid_at = now(), expires_at = null
  where id = ticket_order.id
  returning * into ticket_order;

  for ticket_index in 1..ticket_order.quantity loop
    qr_token := encode(gen_random_bytes(32), 'hex');

    insert into public.annual_conference_tickets (
      edition_id, order_id, status, is_bearer_ticket, qr_token_hash, issued_at, order_seat_number
    ) values (
      ticket_order.edition_id, ticket_order.id, 'issued', true,
      encode(digest(qr_token, 'sha256'), 'hex'), now(), ticket_index
    ) returning * into issued_ticket;

    bundle_payload := bundle_payload || jsonb_build_array(jsonb_build_object(
      'ticket_id', issued_ticket.id,
      'order_seat_number', issued_ticket.order_seat_number,
      'qr_token', qr_token
    ));
  end loop;

  insert into public.annual_conference_ticket_email_outbox (
    edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
  ) values (
    ticket_order.edition_id, ticket_order.id, 'ticket_bundle_delivery', ticket_order.purchaser_name, ticket_order.purchaser_email,
    jsonb_build_object('order_id', ticket_order.id, 'tickets', bundle_payload),
    concat('annual-conference-ticket-bundle-delivery:', ticket_order.id)
  ) on conflict (idempotency_key) do nothing;

  insert into public.annual_conference_ticket_email_outbox (
    edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
  ) values (
    ticket_order.edition_id, ticket_order.id, 'payment_receipt', ticket_order.purchaser_name, ticket_order.purchaser_email,
    jsonb_build_object('order_id', ticket_order.id, 'quantity', ticket_order.quantity, 'amount_minor', ticket_order.amount_minor, 'currency', ticket_order.currency),
    concat('annual-conference-ticket-receipt:', ticket_order.id)
  ) on conflict (idempotency_key) do nothing;

  update public.annual_conference_ticket_payment_events set status = 'processed', processed_at = now() where id = event_row.id;
  update public.annual_conference_ticket_payment_attempts set status = 'confirmed' where id = payment_attempt.id;

  return ticket_order;
end;
$$;

create or replace function public.finalize_annual_conference_ticket_email_outbox(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_status public.annual_conference_ticket_email_status,
  p_provider_email_id text default null,
  p_last_error text default null,
  p_next_attempt_at timestamptz default null
)
returns public.annual_conference_ticket_email_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery public.annual_conference_ticket_email_outbox;
begin
  if p_status not in ('accepted', 'failed') then raise exception using message = 'ticket_email_status_invalid'; end if;
  if p_status = 'accepted' and nullif(btrim(p_provider_email_id), '') is null then raise exception using message = 'ticket_email_provider_id_required'; end if;

  update public.annual_conference_ticket_email_outbox
  set status = p_status,
      provider_email_id = coalesce(nullif(btrim(p_provider_email_id), ''), provider_email_id),
      payload = case when p_status = 'accepted' and kind in ('ticket_delivery', 'ticket_bundle_delivery') then payload - 'qr_token' - 'tickets' else payload end,
      last_error = case when p_status = 'failed' then left(coalesce(p_last_error, 'Email provider did not accept the message.'), 500) else null end,
      next_attempt_at = case when p_status = 'failed' and attempt_count < 5 and provider_email_id is null and accepted_at is null then coalesce(p_next_attempt_at, now() + make_interval(mins => least(60, 5 * (2 ^ greatest(attempt_count - 1, 0))))) else next_attempt_at end,
      accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
      claim_token = null, claimed_until = null
  where id = p_outbox_id and status = 'sending' and claim_token = p_claim_token
  returning * into delivery;

  if delivery.id is null then raise exception using message = 'ticket_email_claim_lost'; end if;
  return delivery;
end;
$$;

create or replace function public.record_annual_conference_ticket_email_delivery(
  p_provider_email_id text,
  p_delivered boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.annual_conference_ticket_email_outbox
  set status = case when p_delivered then 'delivered'::public.annual_conference_ticket_email_status else 'failed'::public.annual_conference_ticket_email_status end,
      payload = case when kind in ('ticket_delivery', 'ticket_bundle_delivery') then payload - 'qr_token' - 'tickets' else payload end,
      delivered_at = case when p_delivered then now() else delivered_at end,
      last_error = case when p_delivered then null else 'Email delivery failed after provider acceptance.' end,
      next_attempt_at = case when p_delivered then next_attempt_at else now() + interval '30 minutes' end
  where provider_email_id = p_provider_email_id and status = 'accepted';

  return found;
end;
$$;

create or replace function public.check_in_annual_conference_bearer_ticket(
  p_edition_id uuid,
  p_qr_token text,
  p_checked_in_by_email text
)
returns table (outcome text, ticket_id uuid, order_id uuid, order_seat_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.annual_conference_tickets;
begin
  -- The scanner receives one neutral outcome for malformed, stale, cancelled,
  -- or unknown capabilities; it must not become a ticket-enumeration oracle.
  if p_edition_id is null
    or coalesce(trim(p_checked_in_by_email), '') = ''
    or coalesce(p_qr_token, '') !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  select * into ticket
  from public.annual_conference_tickets
  where edition_id = p_edition_id
    and is_bearer_ticket
    and qr_token_hash = encode(digest(p_qr_token, 'sha256'), 'hex')
  for update;

  if ticket.id is null or ticket.status not in ('issued', 'checked_in') then
    return query select 'invalid'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if ticket.status = 'checked_in' then
    return query select 'already_checked_in'::text, ticket.id, ticket.order_id, ticket.order_seat_number;
    return;
  end if;

  update public.annual_conference_tickets
  set status = 'checked_in', checked_in_at = now(), checked_in_by_email = lower(trim(p_checked_in_by_email))
  where id = ticket.id;

  return query select 'checked_in'::text, ticket.id, ticket.order_id, ticket.order_seat_number;
end;
$$;

revoke all on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) to service_role;
revoke all on function public.finalize_annual_conference_ticket_email_outbox(uuid, uuid, public.annual_conference_ticket_email_status, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_annual_conference_ticket_email_outbox(uuid, uuid, public.annual_conference_ticket_email_status, text, text, timestamptz) to service_role;
revoke all on function public.record_annual_conference_ticket_email_delivery(text, boolean) from public, anon, authenticated;
grant execute on function public.record_annual_conference_ticket_email_delivery(text, boolean) to service_role;
revoke all on function public.check_in_annual_conference_bearer_ticket(uuid, text, text) from public, anon, authenticated;
grant execute on function public.check_in_annual_conference_bearer_ticket(uuid, text, text) to service_role;

comment on column public.annual_conference_tickets.is_bearer_ticket is 'True when a buyer receives a transferable, independently scanable ticket seat without named-attendee collection.';
comment on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) is 'Atomically records a verified payment, issues one bearer QR capability per paid seat, queues one buyer ticket-bundle delivery, and preserves idempotent receipt/refund handling.';
comment on function public.check_in_annual_conference_bearer_ticket(uuid, text, text) is 'Atomically consumes one valid bearer QR ticket and returns a neutral invalid outcome for unknown or stale capabilities.';
