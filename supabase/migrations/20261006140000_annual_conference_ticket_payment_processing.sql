-- Payment confirmation is deliberately database-owned: a webhook retry can never
-- issue a second set of tickets or a second email receipt.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'annual_conference_ticket_payment_event_status') then
    create type public.annual_conference_ticket_payment_event_status as enum ('received', 'processed', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'annual_conference_ticket_email_status') then
    create type public.annual_conference_ticket_email_status as enum ('queued', 'sending', 'accepted', 'delivered', 'failed');
  end if;
end $$;

create table public.annual_conference_ticket_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  order_id uuid references public.annual_conference_ticket_orders(id) on delete restrict,
  event_type text not null,
  payment_reference text not null,
  payload_sha256 text not null,
  payload_facts jsonb not null default '{}'::jsonb,
  status public.annual_conference_ticket_payment_event_status not null default 'received',
  rejection_reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint annual_conference_ticket_payment_events_provider_event_unique unique (provider, provider_event_id)
);

create table public.annual_conference_ticket_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.annual_conference_ticket_orders(id) on delete restrict,
  provider text not null,
  payment_reference text not null unique,
  status text not null default 'prepared',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_ticket_payment_attempts_status check (status in ('prepared', 'initialized', 'confirmed', 'refund_pending'))
);

create table public.annual_conference_ticket_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.annual_conference_ticket_orders(id) on delete restrict,
  provider text not null,
  payment_reference text not null,
  amount_minor integer not null,
  currency text not null,
  status text not null default 'required',
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_ticket_refunds_status check (status in ('required', 'processing', 'refunded', 'failed', 'needs_attention')),
  constraint annual_conference_ticket_refunds_amount check (amount_minor >= 0),
  constraint annual_conference_ticket_refunds_currency check (currency = 'GHS')
);

create table public.annual_conference_ticket_email_outbox (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete restrict,
  order_id uuid not null references public.annual_conference_ticket_orders(id) on delete restrict,
  kind text not null,
  recipient_name text not null,
  recipient_email text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status public.annual_conference_ticket_email_status not null default 'queued',
  attempt_count integer not null default 0,
  provider_email_id text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_ticket_email_outbox_kind check (kind in ('payment_receipt', 'ticket_delivery')),
  constraint annual_conference_ticket_email_outbox_recipient check (length(trim(recipient_name)) > 0 and length(trim(recipient_email)) > 0),
  constraint annual_conference_ticket_email_outbox_attempt_count check (attempt_count >= 0)
);

create index annual_conference_ticket_payment_events_order_idx
  on public.annual_conference_ticket_payment_events (order_id, received_at desc);

create index annual_conference_ticket_payment_attempts_reference_idx
  on public.annual_conference_ticket_payment_attempts (payment_reference);

create index annual_conference_ticket_email_outbox_pending_idx
  on public.annual_conference_ticket_email_outbox (next_attempt_at, created_at)
  where status in ('queued', 'failed');

create trigger set_annual_conference_ticket_email_outbox_updated_at
  before update on public.annual_conference_ticket_email_outbox
  for each row execute function public.set_updated_at();

create trigger set_annual_conference_ticket_payment_attempts_updated_at
  before update on public.annual_conference_ticket_payment_attempts
  for each row execute function public.set_updated_at();

create trigger set_annual_conference_ticket_refunds_updated_at
  before update on public.annual_conference_ticket_refunds
  for each row execute function public.set_updated_at();

alter table public.annual_conference_ticket_payment_events enable row level security;
alter table public.annual_conference_ticket_payment_attempts enable row level security;
alter table public.annual_conference_ticket_refunds enable row level security;
alter table public.annual_conference_ticket_email_outbox enable row level security;

grant usage on type public.annual_conference_ticket_payment_event_status to service_role;
grant usage on type public.annual_conference_ticket_email_status to service_role;
grant select, insert, update on public.annual_conference_ticket_payment_events to service_role;
grant select, insert, update on public.annual_conference_ticket_payment_attempts to service_role;
grant select, insert, update on public.annual_conference_ticket_refunds to service_role;
grant select, insert, update on public.annual_conference_ticket_email_outbox to service_role;

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

  if not inserted_event then
    return ticket_order;
  end if;

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
  set status = 'paid',
      provider = trim(p_provider),
      payment_reference = trim(p_payment_reference),
      paid_at = now(),
      expires_at = null
  where id = ticket_order.id
  returning * into ticket_order;

  for ticket_index in 1..ticket_order.quantity loop
    qr_token := case when ticket_order.quantity = 1 then encode(gen_random_bytes(32), 'hex') else null end;

    insert into public.annual_conference_tickets (
      edition_id, order_id, status, attendee_name, attendee_email, qr_token_hash, issued_at, order_seat_number
    ) values (
      ticket_order.edition_id,
      ticket_order.id,
      case when ticket_order.quantity = 1 then 'issued'::public.annual_conference_ticket_status else 'pending'::public.annual_conference_ticket_status end,
      case when ticket_order.quantity = 1 then ticket_order.purchaser_name else null end,
      case when ticket_order.quantity = 1 then ticket_order.purchaser_email else null end,
      case when qr_token is not null then encode(digest(qr_token, 'sha256'), 'hex') else null end,
      case when ticket_order.quantity = 1 then now() else null end,
      ticket_index
    ) returning * into issued_ticket;

    if qr_token is not null then
      insert into public.annual_conference_ticket_email_outbox (
        edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
      ) values (
        ticket_order.edition_id,
        ticket_order.id,
        'ticket_delivery',
        ticket_order.purchaser_name,
        ticket_order.purchaser_email,
        jsonb_build_object('ticket_id', issued_ticket.id, 'order_seat_number', issued_ticket.order_seat_number, 'qr_token', qr_token),
        concat('annual-conference-ticket-delivery:', issued_ticket.id)
      ) on conflict (idempotency_key) do nothing;
    end if;
  end loop;

  insert into public.annual_conference_ticket_email_outbox (
    edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
  ) values (
    ticket_order.edition_id,
    ticket_order.id,
    'payment_receipt',
    ticket_order.purchaser_name,
    ticket_order.purchaser_email,
    jsonb_build_object('order_id', ticket_order.id, 'quantity', ticket_order.quantity, 'amount_minor', ticket_order.amount_minor, 'currency', ticket_order.currency),
    concat('annual-conference-ticket-receipt:', ticket_order.id)
  ) on conflict (idempotency_key) do nothing;

  update public.annual_conference_ticket_payment_events
  set status = 'processed', processed_at = now()
  where id = event_row.id;

  update public.annual_conference_ticket_payment_attempts set status = 'confirmed' where id = payment_attempt.id;

  return ticket_order;
end;
$$;

create or replace function public.prepare_annual_conference_ticket_payment_attempt(
  p_order_id uuid,
  p_provider text,
  p_payment_reference text
)
returns public.annual_conference_ticket_payment_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_order public.annual_conference_ticket_orders;
  payment_attempt public.annual_conference_ticket_payment_attempts;
begin
  select * into ticket_order from public.annual_conference_ticket_orders where id = p_order_id for update;
  if ticket_order.id is null or ticket_order.status <> 'pending_payment' or ticket_order.expires_at is null or ticket_order.expires_at <= now() then
    raise exception using message = 'ticket_checkout_not_payable';
  end if;

  insert into public.annual_conference_ticket_payment_attempts (order_id, provider, payment_reference)
  values (ticket_order.id, trim(p_provider), trim(p_payment_reference))
  on conflict (order_id) do update set provider = excluded.provider, payment_reference = excluded.payment_reference
  returning * into payment_attempt;

  return payment_attempt;
end;
$$;

alter table public.annual_conference_tickets add column order_seat_number integer;
alter table public.annual_conference_tickets add constraint annual_conference_tickets_order_seat_number_unique unique (order_id, order_seat_number);
alter table public.annual_conference_tickets add constraint annual_conference_tickets_order_seat_number_check check ((order_id is null and order_seat_number is null) or (order_id is not null and order_seat_number > 0));

revoke all on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) to service_role;
revoke all on function public.prepare_annual_conference_ticket_payment_attempt(uuid, text, text) from public, anon, authenticated;
grant execute on function public.prepare_annual_conference_ticket_payment_attempt(uuid, text, text) to service_role;

comment on table public.annual_conference_ticket_payment_events is 'Idempotent provider webhook ledger. Only payload hash and bounded payment facts are retained.';
comment on table public.annual_conference_ticket_payment_attempts is 'Server-bound hosted-checkout references. Webhooks must match an attempt, not provider metadata.';
comment on table public.annual_conference_ticket_refunds is 'Durable refund-required ledger for verified payments that cannot be fulfilled without exceeding capacity.';
comment on table public.annual_conference_ticket_email_outbox is 'Durable transactional ticket email outbox for future Resend delivery and webhook tracking.';
comment on function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) is 'Atomically records a verified payment, issues order tickets, queues one retry-safe receipt, or creates a durable refund-required record for an oversold late confirmation.';
