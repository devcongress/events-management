-- Activate the immutable flexible-cart snapshot.  All public-facing secrets
-- remain hash-only in durable authority tables; delivery rows are private and
-- scrub their short-lived capability payload after provider acceptance.

alter table public.annual_conference_ticketing_settings
  add column flexible_checkout_state text not null default 'foundation',
  add constraint annual_conference_ticketing_settings_flexible_checkout_state
    check (flexible_checkout_state in ('foundation', 'internal', 'public'));

create or replace function public.block_unactivated_flexible_ticket_payment_attempt()
returns trigger language plpgsql security definer set search_path = public as $$
declare lifecycle_state text;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;

  select settings.flexible_checkout_state into lifecycle_state
  from public.annual_conference_ticket_orders ticket_order
  join public.annual_conference_ticketing_settings settings on settings.edition_id = ticket_order.edition_id
  where ticket_order.id = new.order_id and ticket_order.checkout_flow = 'flexible';
  if lifecycle_state is not null and lifecycle_state not in ('internal', 'public') then
    raise exception using message = 'flexible_ticket_checkout_not_activated';
  end if;
  return new;
end;
$$;

alter table public.annual_conference_ticket_orders
  add column flexible_order_management_capability_hash text;

alter table public.annual_conference_tickets
  drop constraint annual_conference_tickets_identity,
  add constraint annual_conference_tickets_identity check (
    status in ('pending', 'cancelled')
    or is_bearer_ticket
    or (coalesce(trim(attendee_name), '') <> '' and coalesce(trim(attendee_email), '') <> '')
  );

create unique index annual_conference_ticket_orders_flexible_management_hash_idx
  on public.annual_conference_ticket_orders (flexible_order_management_capability_hash)
  where flexible_order_management_capability_hash is not null;

create table public.annual_conference_flexible_ticket_claims (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.annual_conference_flexible_ticket_allocations(id) on delete restrict,
  purpose text not null check (purpose in ('admission', 'badge', 'gift')),
  capability_hash text not null unique,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (allocation_id, purpose)
);

create table public.annual_conference_flexible_ticket_audit (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references public.annual_conference_flexible_ticket_allocations(id) on delete restrict,
  actor_email text not null,
  action text not null,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  unique (allocation_id, idempotency_key)
);

create table public.annual_conference_flexible_ticket_refunds (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null unique references public.annual_conference_flexible_ticket_allocations(id) on delete restrict,
  order_id uuid not null references public.annual_conference_ticket_orders(id) on delete restrict,
  amount_minor integer not null default 15000 check (amount_minor = 15000),
  status text not null default 'requested' check (status in ('requested', 'refunded', 'rejected')),
  attempt_number integer not null default 1 check (attempt_number > 0),
  ticket_status_before_request public.annual_conference_ticket_status not null,
  provider_refund_id text,
  provider text,
  provider_refund_reference text,
  provider_refunded_amount_minor integer,
  provider_payload_sha256 text,
  rejection_reason text,
  requested_at timestamptz not null default now(),
  finalized_at timestamptz,
  finalized_by_email text,
  constraint annual_conference_flexible_ticket_refunds_provider_evidence check (
    (status <> 'refunded' and provider is null and provider_refund_reference is null
      and provider_refunded_amount_minor is null and provider_payload_sha256 is null)
    or (status = 'refunded' and provider is not distinct from 'paystack'
      and nullif(btrim(provider_refund_id), '') is not null
      and nullif(btrim(provider_refund_reference), '') is not null
      and provider_refunded_amount_minor is not distinct from amount_minor
      and provider_payload_sha256 is not null
      and provider_payload_sha256 ~ '^[0-9a-f]{64}$')
  ),
  constraint annual_conference_flexible_ticket_refunds_provider_id check (
    provider_refund_id is null
    or (char_length(btrim(provider_refund_id)) between 1 and 160
      and provider_refund_id = btrim(provider_refund_id))
  ),
  constraint annual_conference_flexible_ticket_refunds_rejected_provider_id check (
    status <> 'rejected' or provider_refund_id is null
  )
);

create unique index annual_conference_flexible_ticket_refunds_provider_reference_idx
  on public.annual_conference_flexible_ticket_refunds (provider, provider_refund_reference)
  where provider_refund_reference is not null;

create table public.annual_conference_flexible_ticket_refund_provider_ids (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.annual_conference_flexible_ticket_refunds(id) on delete restrict,
  provider text not null check (provider = 'paystack'),
  provider_refund_id text not null,
  attempt_number integer not null check (attempt_number > 0),
  resolution_status text not null default 'bound' check (
    resolution_status in ('bound', 'failed', 'refunded')
  ),
  provider_payload_sha256 text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint annual_conference_flexible_ticket_refund_provider_ids_value check (
    char_length(btrim(provider_refund_id)) between 1 and 160
    and provider_refund_id = btrim(provider_refund_id)
  ),
  constraint annual_conference_flex_refund_provider_ids_resolution check (
    (resolution_status = 'bound'
      and provider_payload_sha256 is null
      and resolved_at is null)
    or (resolution_status in ('failed', 'refunded')
      and provider_payload_sha256 is not null
      and provider_payload_sha256 ~ '^[0-9a-f]{64}$'
      and resolved_at is not null)
  ),
  unique (provider, provider_refund_id),
  unique (refund_id, attempt_number)
);

alter table public.annual_conference_flexible_ticket_claims enable row level security;
alter table public.annual_conference_flexible_ticket_audit enable row level security;
alter table public.annual_conference_flexible_ticket_refunds enable row level security;
alter table public.annual_conference_flexible_ticket_refund_provider_ids enable row level security;
revoke all on public.annual_conference_flexible_ticket_claims, public.annual_conference_flexible_ticket_audit, public.annual_conference_flexible_ticket_refunds, public.annual_conference_flexible_ticket_refund_provider_ids from public, anon, authenticated;
grant select, insert, update on public.annual_conference_flexible_ticket_claims, public.annual_conference_flexible_ticket_audit, public.annual_conference_flexible_ticket_refunds to service_role;
grant select on public.annual_conference_flexible_ticket_refund_provider_ids to service_role;

create or replace function public.prevent_annual_conference_refund_provider_id_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id
    or new.refund_id is distinct from old.refund_id
    or new.provider is distinct from old.provider
    or new.provider_refund_id is distinct from old.provider_refund_id
    or new.attempt_number is distinct from old.attempt_number
    or new.created_at is distinct from old.created_at
    or old.resolution_status <> 'bound'
    or new.resolution_status not in ('failed', 'refunded')
    or coalesce(new.provider_payload_sha256, '') !~ '^[0-9a-f]{64}$'
    or new.resolved_at is null then
    raise exception 'annual_conference_refund_provider_id_immutable';
  end if;

  return new;
end;
$$;

create trigger prevent_annual_conference_refund_provider_id_mutation
before update on public.annual_conference_flexible_ticket_refund_provider_ids
for each row execute function public.prevent_annual_conference_refund_provider_id_mutation();

alter table public.annual_conference_ticket_email_outbox
  drop constraint annual_conference_ticket_email_outbox_kind,
  add constraint annual_conference_ticket_email_outbox_kind check (
    kind in ('payment_receipt', 'ticket_delivery', 'ticket_bundle_delivery', 'waitlist_notice',
      'flexible_order_management', 'flexible_gift_claim', 'flexible_admission_delivery',
      'flexible_buyer_bundle_delivery')
  );

create or replace function public.prevent_annual_conference_flexible_checked_in_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'checked_in' and (
    new.status is distinct from old.status or new.qr_token_hash is distinct from old.qr_token_hash
    or new.attendee_name is distinct from old.attendee_name or new.attendee_email is distinct from old.attendee_email
    or new.is_bearer_ticket is distinct from old.is_bearer_ticket
    or new.edition_id is distinct from old.edition_id or new.order_id is distinct from old.order_id
    or new.sponsor_allocation_id is distinct from old.sponsor_allocation_id
    or new.registration_id is distinct from old.registration_id
    or new.order_seat_number is distinct from old.order_seat_number
  ) then
    raise exception using message = 'checked_in_ticket_terminal';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_annual_conference_flexible_checked_in_mutation on public.annual_conference_tickets;
create trigger prevent_annual_conference_flexible_checked_in_mutation
before update on public.annual_conference_tickets
for each row execute function public.prevent_annual_conference_flexible_checked_in_mutation();

create or replace function public.scrub_annual_conference_flexible_delivery_capability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('flexible_order_management', 'flexible_gift_claim', 'flexible_admission_delivery',
      'flexible_buyer_bundle_delivery')
    and (new.status in ('accepted', 'delivered') or new.next_attempt_at = 'infinity') then
    new.payload := new.payload - 'capability' - 'qr_token' - 'tickets';
  end if;
  return new;
end;
$$;

create or replace function public.provision_annual_conference_social_card_collection()
returns trigger language plpgsql security definer set search_path = public as $$
declare collection_capability text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if new.status <> 'paid' or old.status = 'paid' or new.checkout_flow = 'flexible' then return new; end if;
  insert into public.annual_conference_social_card_collections(order_id, edition_id, capability_hash)
  values (new.id, new.edition_id, encode(extensions.digest(collection_capability, 'sha256'), 'hex')) on conflict (order_id) do nothing;
  insert into public.annual_conference_social_card_email_outbox(edition_id, social_card_id, collection_order_id, recipient_name, recipient_email, capability, idempotency_key)
  values (new.edition_id, null, new.id, new.purchaser_name, new.purchaser_email, collection_capability, 'annual-conference-social-card-collection:' || new.id)
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

create or replace function public.provision_annual_conference_ticket_social_card()
returns trigger language plpgsql security definer set search_path = public as $$
declare ticket_order public.annual_conference_ticket_orders; unused_capability text := encode(extensions.gen_random_bytes(32), 'hex');
  public_slug text := replace(replace(trim(trailing '=' from encode(extensions.gen_random_bytes(24), 'base64')), '+', '-'), '/', '_');
begin
  select * into ticket_order from public.annual_conference_ticket_orders where id = new.order_id and status = 'paid';
  if ticket_order.id is null or ticket_order.checkout_flow = 'flexible' or new.status not in ('issued', 'checked_in') then return new; end if;
  insert into public.annual_conference_social_cards(edition_id, subject_type, ticket_id, display_name, management_token_hash, public_slug)
  values(new.edition_id, 'attendee', new.id, concat('Ticket ', coalesce(new.order_seat_number, 1)), encode(extensions.digest(unused_capability, 'sha256'), 'hex'), public_slug)
  on conflict(ticket_id) do nothing;
  return new;
end;
$$;

drop trigger if exists scrub_annual_conference_flexible_delivery_capability on public.annual_conference_ticket_email_outbox;
create trigger scrub_annual_conference_flexible_delivery_capability
before update on public.annual_conference_ticket_email_outbox
for each row execute function public.scrub_annual_conference_flexible_delivery_capability();

create or replace function public.prepare_annual_conference_ticket_payment_attempt(
  p_order_id uuid, p_provider text, p_payment_reference text
)
returns public.annual_conference_ticket_payment_attempts
language plpgsql security definer set search_path = public as $$
declare ticket_order public.annual_conference_ticket_orders; settings public.annual_conference_ticketing_settings;
  attempt public.annual_conference_ticket_payment_attempts;
begin
  select * into ticket_order from public.annual_conference_ticket_orders where id = p_order_id for update;
  if ticket_order.id is null or ticket_order.status <> 'pending_payment'
    or ticket_order.expires_at is null or ticket_order.expires_at <= now() then
    raise exception using message = 'ticket_checkout_not_payable';
  end if;
  if ticket_order.checkout_flow = 'flexible' then
    select * into settings from public.annual_conference_ticketing_settings where edition_id = ticket_order.edition_id for update;
    if settings.flexible_checkout_state not in ('internal', 'public') then
      raise exception using message = 'flexible_ticket_checkout_not_activated';
    end if;
    if ticket_order.provider <> 'paystack' or trim(p_provider) <> 'paystack'
      or ticket_order.flexible_payment_fee_mode <> 'merchant_absorbs' then
      raise exception using message = 'flexible_ticket_payment_invalid';
    end if;
  end if;
  insert into public.annual_conference_ticket_payment_attempts(order_id, provider, payment_reference)
  values (ticket_order.id, trim(p_provider), trim(p_payment_reference))
  on conflict (order_id) do update set provider = excluded.provider, payment_reference = excluded.payment_reference
  returning * into attempt;
  return attempt;
end;
$$;

create or replace function public.queue_annual_conference_flexible_gift_claim(
  p_allocation_id uuid, p_edition_id uuid, p_order_id uuid, p_recipient_email text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare capability text := encode(extensions.gen_random_bytes(32), 'hex'); delivery public.annual_conference_ticket_email_outbox;
begin
  update public.annual_conference_ticket_email_outbox
  set status = 'failed', next_attempt_at = 'infinity',
      last_error = 'Superseded by a newer gift claim link.',
      claim_token = null, claimed_until = null
  where order_id = p_order_id
    and kind = 'flexible_gift_claim'
    and payload ->> 'allocation_id' = p_allocation_id::text
    and status in ('queued', 'failed');

  insert into public.annual_conference_flexible_ticket_claims(allocation_id, purpose, capability_hash, used_at, revoked_at)
  values (p_allocation_id, 'gift', encode(extensions.digest(capability, 'sha256'), 'hex'), null, null)
  on conflict (allocation_id, purpose) do update set capability_hash = excluded.capability_hash, used_at = null, revoked_at = null;
  insert into public.annual_conference_ticket_email_outbox(edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key)
  values (p_edition_id, p_order_id, 'flexible_gift_claim', 'Guest', p_recipient_email,
    jsonb_build_object('allocation_id', p_allocation_id, 'capability', capability),
    'flexible-gift-claim:' || p_allocation_id || ':' || encode(extensions.digest(capability, 'sha256'), 'hex'))
  returning * into delivery;
  return delivery.id;
end;
$$;

-- Preserve the previous public contract verbatim for standard checkout.  The
-- renamed implementation is intentionally only an internal branch target.
alter function public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb)
  rename to confirm_annual_conference_standard_ticket_payment;
alter function public.confirm_annual_conference_standard_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb)
  set search_path = public, extensions;

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
  select coalesce(sum(quantity), 0) into paid_seats from public.annual_conference_ticket_orders where edition_id = ticket_order.edition_id and status = 'paid';
  select coalesce(sum(quantity), 0) into held_seats from public.annual_conference_ticket_orders where edition_id = ticket_order.edition_id and status = 'pending_payment' and expires_at > now() and id <> ticket_order.id;
  select coalesce(sum(quantity), 0) into sponsor_seats from public.annual_conference_sponsor_ticket_allocations where edition_id = ticket_order.edition_id;
  if ticket_order.status <> 'pending_payment' or ticket_order.expires_at <= now()
    or settings.sales_status <> 'open' or settings.public_mode <> 'paid'
    or paid_seats + held_seats + sponsor_seats + ticket_order.quantity +
      (select count(*) from public.annual_conference_registrations where edition_id = ticket_order.edition_id and status = 'confirmed') > settings.public_capacity then
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

create or replace function public.confirm_annual_conference_ticket_payment(
  p_order_id uuid, p_provider text, p_provider_event_id text, p_event_type text, p_payment_reference text,
  p_amount_minor integer, p_currency text, p_payload_sha256 text, p_payment_facts jsonb default '{}'::jsonb
)
returns public.annual_conference_ticket_orders language plpgsql security definer set search_path = public as $$
declare ticket_order public.annual_conference_ticket_orders;
begin
  select * into ticket_order from public.annual_conference_ticket_orders where id = p_order_id;
  if ticket_order.checkout_flow = 'flexible' then
    return public.confirm_annual_conference_flexible_ticket_payment(p_order_id, p_provider, p_provider_event_id, p_event_type, p_payment_reference, p_amount_minor, p_currency, p_payload_sha256, p_payment_facts);
  end if;
  return public.confirm_annual_conference_standard_ticket_payment(p_order_id, p_provider, p_provider_event_id, p_event_type, p_payment_reference, p_amount_minor, p_currency, p_payload_sha256, p_payment_facts);
end;
$$;

create or replace function public.get_annual_conference_flexible_order_management(p_capability text)
returns table(order_id uuid, order_status public.annual_conference_ticket_order_status, allocation_id uuid, seat_index integer, allocation_kind text, fulfillment_status text, ticket_id uuid, ticket_status public.annual_conference_ticket_status, claim_status text, can_rotate_claim boolean, can_request_refund boolean)
language sql security definer set search_path = public as $$
  select o.id, o.status, a.id, a.seat_index, a.allocation_kind,
    case
      when t.status = 'pending' then 'pending_identity'
      when t.status = 'cancelled' then 'cancelled'
      else 'issued'
    end,
    t.id, t.status,
    case when c.used_at is not null then 'used' when c.revoked_at is not null then 'revoked' when c.id is not null then 'available' else 'not_applicable' end,
    (
      (a.allocation_kind = 'community_shareable' and t.status = 'pending')
      or (a.allocation_kind = 'buyer_managed' and t.status = 'issued'
        and t.attendee_name is null and t.attendee_email is null)
    ) and c.used_at is null,
    false
  from public.annual_conference_ticket_orders o
  join public.annual_conference_flexible_ticket_allocations a on a.order_id = o.id
  join public.annual_conference_tickets t on t.order_id = o.id and t.order_seat_number = a.seat_index
  left join public.annual_conference_flexible_ticket_claims c on c.allocation_id = a.id and c.purpose in ('admission', 'badge', 'gift')
  where o.checkout_flow = 'flexible' and o.flexible_order_management_capability_hash = encode(extensions.digest(p_capability, 'sha256'), 'hex')
  order by a.seat_index;
$$;

create or replace function public.claim_annual_conference_flexible_ticket(
  p_capability text, p_name text, p_email text default null
)
returns table(outcome text, ticket_id uuid, order_seat_number integer, delivery_queued boolean)
language plpgsql security definer set search_path = public as $$
declare claim_row public.annual_conference_flexible_ticket_claims; allocation public.annual_conference_flexible_ticket_allocations;
  ticket public.annual_conference_tickets; normalized_name text := nullif(btrim(p_name), ''); normalized_email text := nullif(lower(btrim(p_email)), ''); qr_token text;
begin
  if coalesce(p_capability, '') !~ '^[0-9a-f]{64}$' or normalized_name is null or char_length(normalized_name) > 120
    or (normalized_email is not null and (char_length(normalized_email) > 254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')) then
    return query select 'invalid'::text, null::uuid, null::integer, false; return;
  end if;
  select c.* into claim_row from public.annual_conference_flexible_ticket_claims c
    where c.capability_hash = encode(extensions.digest(p_capability, 'sha256'), 'hex') and c.purpose in ('admission', 'gift') for update;
  if claim_row.id is null or claim_row.used_at is not null or claim_row.revoked_at is not null then
    return query select 'invalid'::text, null::uuid, null::integer, false; return;
  end if;
  select * into allocation from public.annual_conference_flexible_ticket_allocations where id = claim_row.allocation_id;
  if allocation.allocation_kind = 'gift' and normalized_email is not null and normalized_email <> allocation.recipient_email then
    return query select 'invalid'::text, null::uuid, null::integer, false; return;
  end if;
  if allocation.allocation_kind = 'gift' then normalized_email := allocation.recipient_email; end if;
  if allocation.allocation_kind = 'community_shareable' and (normalized_email is null or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    return query select 'invalid'::text, null::uuid, null::integer, false; return;
  end if;
  select t.* into ticket from public.annual_conference_tickets t join public.annual_conference_ticket_orders o on o.id = t.order_id
    where t.order_id = allocation.order_id and t.order_seat_number = allocation.seat_index and o.status = 'paid' for update of t;
  if ticket.id is null or ticket.status <> 'pending' then return query select 'invalid'::text, null::uuid, null::integer, false; return; end if;
  qr_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.annual_conference_tickets set status = 'issued', attendee_name = normalized_name, attendee_email = normalized_email,
    qr_token_hash = encode(extensions.digest(qr_token, 'sha256'), 'hex'), issued_at = now() where id = ticket.id returning * into ticket;
  update public.annual_conference_flexible_ticket_claims set used_at = now() where id = claim_row.id;
  insert into public.annual_conference_ticket_email_outbox(edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key)
  values (ticket.edition_id, ticket.order_id, 'flexible_admission_delivery', normalized_name, normalized_email,
    jsonb_build_object('ticket_id', ticket.id, 'qr_token', qr_token), 'flexible-claim-admission:' || ticket.id)
  on conflict (idempotency_key) do nothing;
  perform public.issue_annual_conference_social_card_delivery(ticket.edition_id, 'attendee', ticket.id);
  return query select 'claimed'::text, ticket.id, ticket.order_seat_number, true;
end;
$$;

create or replace function public.claim_annual_conference_flexible_badge(
  p_capability text, p_name text, p_email text
)
returns table(outcome text, ticket_id uuid, order_seat_number integer, social_card_id uuid, delivery_queued boolean)
language plpgsql security definer set search_path = public as $$
declare claim_row public.annual_conference_flexible_ticket_claims; allocation public.annual_conference_flexible_ticket_allocations;
  ticket public.annual_conference_tickets; card_result record; normalized_name text := nullif(btrim(p_name), ''); normalized_email text := nullif(lower(btrim(p_email)), '');
begin
  if coalesce(p_capability, '') !~ '^[0-9a-f]{64}$' or normalized_name is null or char_length(normalized_name) > 120 or char_length(normalized_email) > 254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return query select 'invalid'::text, null::uuid, null::integer, null::uuid, false; return;
  end if;
  select c.* into claim_row from public.annual_conference_flexible_ticket_claims c where c.capability_hash = encode(extensions.digest(p_capability, 'sha256'), 'hex') and c.purpose = 'badge' for update;
  if claim_row.id is null or claim_row.used_at is not null or claim_row.revoked_at is not null then return query select 'invalid'::text, null::uuid, null::integer, null::uuid, false; return; end if;
  select * into allocation from public.annual_conference_flexible_ticket_allocations where id = claim_row.allocation_id and allocation_kind = 'buyer_managed';
  select t.* into ticket from public.annual_conference_tickets t join public.annual_conference_ticket_orders o on o.id = t.order_id
    where t.order_id = allocation.order_id and t.order_seat_number = allocation.seat_index and o.status = 'paid' for update of t;
  if ticket.id is null or ticket.status <> 'issued' or not ticket.is_bearer_ticket then return query select 'invalid'::text, null::uuid, null::integer, null::uuid, false; return; end if;
  update public.annual_conference_tickets set attendee_name = normalized_name, attendee_email = normalized_email where id = ticket.id returning * into ticket;
  update public.annual_conference_flexible_ticket_claims set used_at = now() where id = claim_row.id;
  select * into card_result from public.issue_annual_conference_social_card_delivery(ticket.edition_id, 'attendee', ticket.id);
  return query select 'claimed'::text, ticket.id, ticket.order_seat_number, card_result.social_card_id, true;
end;
$$;

create or replace function public.rotate_annual_conference_flexible_ticket_claim(
  p_order_management_capability text, p_allocation_id uuid, p_purpose text
)
returns table(outcome text, claim_capability text)
language plpgsql security definer set search_path = public as $$
declare allocation public.annual_conference_flexible_ticket_allocations; ticket public.annual_conference_tickets;
  claim_row public.annual_conference_flexible_ticket_claims; capability text;
begin
  if coalesce(p_order_management_capability, '') !~ '^[0-9a-f]{64}$'
    or p_purpose not in ('admission', 'badge') then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select a.* into allocation from public.annual_conference_flexible_ticket_allocations a join public.annual_conference_ticket_orders o on o.id = a.order_id
    where a.id = p_allocation_id and o.status = 'paid'
      and o.flexible_order_management_capability_hash = encode(extensions.digest(p_order_management_capability, 'sha256'), 'hex') for update;
  if allocation.id is null or (allocation.allocation_kind = 'community_shareable' and p_purpose <> 'admission')
    or (allocation.allocation_kind = 'buyer_managed' and p_purpose <> 'badge')
    or allocation.allocation_kind not in ('community_shareable', 'buyer_managed') then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select * into ticket from public.annual_conference_tickets
  where order_id = allocation.order_id and order_seat_number = allocation.seat_index
  for update;
  select * into claim_row from public.annual_conference_flexible_ticket_claims
  where allocation_id = allocation.id and purpose = p_purpose
  for update;

  if claim_row.used_at is not null
    or (allocation.allocation_kind = 'community_shareable' and ticket.status <> 'pending')
    or (allocation.allocation_kind = 'buyer_managed' and (
      ticket.status <> 'issued' or ticket.attendee_name is not null or ticket.attendee_email is not null
    )) then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  capability := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.annual_conference_flexible_ticket_claims(allocation_id, purpose, capability_hash, used_at, revoked_at)
  values (allocation.id, p_purpose, encode(extensions.digest(capability, 'sha256'), 'hex'), null, null)
  on conflict (allocation_id, purpose) do update set capability_hash = excluded.capability_hash, used_at = null, revoked_at = null;
  return query select 'rotated'::text, capability;
end;
$$;

create or replace function public.reissue_annual_conference_gift_claim(p_order_management_capability text, p_allocation_id uuid)
returns table(outcome text, delivery_id uuid)
language plpgsql security definer set search_path = public as $$
declare allocation public.annual_conference_flexible_ticket_allocations; ticket public.annual_conference_tickets; capability text; delivery public.annual_conference_ticket_email_outbox;
begin
  select a.* into allocation from public.annual_conference_flexible_ticket_allocations a join public.annual_conference_ticket_orders o on o.id = a.order_id
    where a.id = p_allocation_id and a.allocation_kind = 'gift' and o.status = 'paid'
      and o.flexible_order_management_capability_hash = encode(extensions.digest(p_order_management_capability, 'sha256'), 'hex') for update;
  if allocation.id is null then return query select 'invalid'::text, null::uuid; return; end if;
  select * into ticket from public.annual_conference_tickets
  where order_id = allocation.order_id and order_seat_number = allocation.seat_index
  for update;
  if ticket.status <> 'pending' then return query select 'invalid'::text, null::uuid; return; end if;

  return query select 'queued'::text, public.queue_annual_conference_flexible_gift_claim(
    allocation.id, ticket.edition_id, ticket.order_id, allocation.recipient_email
  );
end;
$$;

create or replace function public.list_annual_conference_community_managed_ticket_pool(p_edition_id uuid, p_offset integer default 0)
returns table(allocation_id uuid, order_id uuid, seat_index integer, ticket_id uuid, ticket_status public.annual_conference_ticket_status)
language sql security definer set search_path = public as $$
  select a.id, a.order_id, a.seat_index, t.id, t.status from public.annual_conference_flexible_ticket_allocations a
  join public.annual_conference_tickets t on t.order_id = a.order_id and t.order_seat_number = a.seat_index
  where a.edition_id = p_edition_id and a.allocation_kind = 'community_managed' and t.status = 'pending'
  order by a.seat_index, a.id offset greatest(p_offset, 0) limit 100;
$$;

create or replace function public.assign_annual_conference_community_managed_ticket(
  p_edition_id uuid, p_allocation_id uuid, p_name text, p_email text, p_actor_email text, p_idempotency_key uuid
)
returns table(outcome text, ticket_id uuid, order_seat_number integer, delivery_queued boolean)
language plpgsql security definer set search_path = public as $$
declare allocation public.annual_conference_flexible_ticket_allocations; ticket public.annual_conference_tickets; qr_token text;
begin
  if nullif(btrim(p_name), '') is null or char_length(btrim(p_name)) > 120 or nullif(lower(btrim(p_email)), '') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or char_length(btrim(p_email)) > 254 or nullif(btrim(p_actor_email), '') is null or p_idempotency_key is null then
    return query select 'invalid'::text, null::uuid, null::integer, false; return;
  end if;
  select * into allocation from public.annual_conference_flexible_ticket_allocations
  where id = p_allocation_id and edition_id = p_edition_id
    and allocation_kind = 'community_managed'
  for update;
  select t.* into ticket from public.annual_conference_tickets t join public.annual_conference_ticket_orders o on o.id = t.order_id
    where t.order_id = allocation.order_id and t.edition_id = p_edition_id
      and t.order_seat_number = allocation.seat_index
      and o.edition_id = p_edition_id and o.status = 'paid'
    for update of t;
  if exists (
    select 1
    from public.annual_conference_flexible_ticket_audit audit
    where audit.allocation_id = allocation.id
      and audit.idempotency_key = p_idempotency_key
      and audit.actor_email = lower(btrim(p_actor_email))
  ) and ticket.id is not null
    and ticket.attendee_name = btrim(p_name)
    and ticket.attendee_email = lower(btrim(p_email)) then
    return query select 'assigned'::text, ticket.id, ticket.order_seat_number, true; return;
  end if;
  if ticket.id is null or ticket.status <> 'pending' then return query select 'invalid'::text, null::uuid, null::integer, false; return; end if;
  qr_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.annual_conference_tickets set status = 'issued', attendee_name = btrim(p_name), attendee_email = lower(btrim(p_email)), qr_token_hash = encode(extensions.digest(qr_token, 'sha256'), 'hex'), issued_at = now() where id = ticket.id returning * into ticket;
  insert into public.annual_conference_flexible_ticket_audit(allocation_id, actor_email, action, idempotency_key) values(allocation.id, lower(btrim(p_actor_email)), 'assigned', p_idempotency_key) on conflict do nothing;
  insert into public.annual_conference_ticket_email_outbox(edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key) values(ticket.edition_id, ticket.order_id, 'flexible_admission_delivery', ticket.attendee_name, ticket.attendee_email, jsonb_build_object('ticket_id', ticket.id, 'qr_token', qr_token), 'flexible-community-assignment:' || p_idempotency_key) on conflict do nothing;
  perform public.issue_annual_conference_social_card_delivery(ticket.edition_id, 'attendee', ticket.id);
  return query select 'assigned'::text, ticket.id, ticket.order_seat_number, true;
end;
$$;

create or replace function public.request_annual_conference_flexible_ticket_refund(
  p_edition_id uuid, p_allocation_id uuid
)
returns table(outcome text, refund_id uuid, amount_minor integer)
language plpgsql security definer set search_path = public as $$
declare allocation public.annual_conference_flexible_ticket_allocations; ticket public.annual_conference_tickets;
  refund_row public.annual_conference_flexible_ticket_refunds; delivery record; remaining_tickets jsonb;
begin
  select a.* into allocation
  from public.annual_conference_flexible_ticket_allocations a
  join public.annual_conference_ticket_orders o on o.id = a.order_id
  where a.id = p_allocation_id
    and a.edition_id = p_edition_id
    and o.edition_id = p_edition_id
    and o.checkout_flow = 'flexible'
    and o.status = 'paid'
  for update of a, o;
  if allocation.id is null then return query select 'invalid'::text, null::uuid, null::integer; return; end if;
  select * into refund_row from public.annual_conference_flexible_ticket_refunds
  where allocation_id = allocation.id for update;
  select * into ticket from public.annual_conference_tickets
  where order_id = allocation.order_id and order_seat_number = allocation.seat_index
  for update;

  if refund_row.status in ('requested', 'refunded') then
    return query select refund_row.status, refund_row.id, refund_row.amount_minor;
    return;
  end if;

  if ticket.id is null or ticket.status not in ('pending', 'issued') then
    return query select 'invalid'::text, null::uuid, null::integer;
    return;
  end if;

  if refund_row.id is null then
    insert into public.annual_conference_flexible_ticket_refunds(
      allocation_id, order_id, ticket_status_before_request
    ) values (
      allocation.id, allocation.order_id, ticket.status
    ) returning * into refund_row;
  else
    update public.annual_conference_flexible_ticket_refunds
    set status = 'requested', attempt_number = attempt_number + 1,
        ticket_status_before_request = ticket.status,
        rejection_reason = null, finalized_at = null, finalized_by_email = null,
        provider_refund_id = null, provider = null, provider_refund_reference = null,
        provider_refunded_amount_minor = null, provider_payload_sha256 = null
    where id = refund_row.id
    returning * into refund_row;
  end if;

  -- Admission is suspended in the same transaction that creates the refund
  -- request. A provider failure must restore it with a newly generated QR.
  update public.annual_conference_tickets
  set status = 'cancelled', qr_token_hash = null
  where id = ticket.id;

  update public.annual_conference_ticket_email_outbox
  set status = 'failed', next_attempt_at = 'infinity',
      last_error = 'Delivery suspended while a ticket refund is pending.',
      claim_token = null, claimed_until = null
  where status in ('queued', 'failed', 'sending')
    and (
      payload ->> 'ticket_id' = ticket.id::text
      or payload ->> 'allocation_id' = allocation.id::text
    );

  for delivery in
    select outbox.*
    from public.annual_conference_ticket_email_outbox outbox
    where outbox.kind = 'flexible_buyer_bundle_delivery'
      and outbox.status in ('queued', 'failed', 'sending')
      and outbox.payload ? 'tickets'
      and exists (
        select 1 from jsonb_array_elements(outbox.payload -> 'tickets') bundle_ticket
        where bundle_ticket ->> 'ticket_id' = ticket.id::text
      )
    for update
  loop
    select coalesce(jsonb_agg(bundle_ticket.value order by bundle_ticket.ordinality), '[]'::jsonb)
    into remaining_tickets
    from jsonb_array_elements(delivery.payload -> 'tickets') with ordinality as bundle_ticket(value, ordinality)
    where bundle_ticket.value ->> 'ticket_id' <> ticket.id::text;

    if delivery.first_attempt_at is null and delivery.provider_payload is null
      and delivery.claim_token is null and delivery.status in ('queued', 'failed')
      and jsonb_array_length(remaining_tickets) > 0 then
      update public.annual_conference_ticket_email_outbox
      set payload = jsonb_set(payload, '{tickets}', remaining_tickets)
      where id = delivery.id;
    else
      update public.annual_conference_ticket_email_outbox
      set status = 'failed', next_attempt_at = 'infinity',
          last_error = 'Bundle superseded while a ticket refund is pending.',
          claim_token = null, claimed_until = null
      where id = delivery.id;

      if jsonb_array_length(remaining_tickets) > 0 then
        insert into public.annual_conference_ticket_email_outbox(
          edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
        ) values (
          delivery.edition_id, delivery.order_id, delivery.kind,
          delivery.recipient_name, delivery.recipient_email,
          jsonb_set(delivery.payload, '{tickets}', remaining_tickets),
          concat('flexible-buyer-bundle-refund-replacement:', delivery.id, ':', refund_row.id)
        ) on conflict (idempotency_key) do nothing;
      end if;
    end if;
  end loop;

  return query select 'requested'::text, refund_row.id, refund_row.amount_minor;
end;
$$;

create or replace function public.get_annual_conference_flexible_ticket_refund_payment(
  p_edition_id uuid, p_refund_id uuid
)
returns table(
  refund_id uuid,
  refund_status text,
  order_id uuid,
  allocation_id uuid,
  amount_minor integer,
  currency text,
  provider text,
  payment_reference text,
  provider_transaction_id text
)
language sql stable security definer set search_path = public as $$
  select
    refund.id,
    refund.status,
    ticket_order.id,
    refund.allocation_id,
    refund.amount_minor,
    ticket_order.currency,
    ticket_order.provider,
    ticket_order.payment_reference,
    payment_event.provider_transaction_id
  from public.annual_conference_flexible_ticket_refunds refund
  join public.annual_conference_ticket_orders ticket_order
    on ticket_order.id = refund.order_id
    and ticket_order.edition_id = p_edition_id
    and ticket_order.checkout_flow = 'flexible'
  join public.annual_conference_flexible_ticket_allocations allocation
    on allocation.id = refund.allocation_id
    and allocation.edition_id = p_edition_id
  left join lateral (
    select coalesce(event.payload_facts ->> 'id', event.payload_facts ->> 'transaction_id') as provider_transaction_id
    from public.annual_conference_ticket_payment_events event
    where event.order_id = ticket_order.id
      and event.provider = 'paystack'
      and event.event_type = 'charge.success'
      and event.status = 'processed'
      and event.payment_reference = ticket_order.payment_reference
    order by event.processed_at desc nulls last, event.received_at desc
    limit 1
  ) payment_event on true
  where refund.id = p_refund_id;
$$;

create or replace function public.bind_annual_conference_flexible_ticket_refund_provider_id(
  p_edition_id uuid, p_refund_id uuid, p_provider_refund_id text
)
returns table(outcome text)
language plpgsql security definer set search_path = public as $$
declare refund_row public.annual_conference_flexible_ticket_refunds;
  normalized_provider_refund_id text := nullif(btrim(p_provider_refund_id), '');
begin
  if normalized_provider_refund_id is null
    or char_length(normalized_provider_refund_id) > 160 then
    return query select 'invalid'::text;
    return;
  end if;

  select refund.* into refund_row
  from public.annual_conference_flexible_ticket_refunds refund
  join public.annual_conference_ticket_orders scope_order
    on scope_order.id = refund.order_id and scope_order.edition_id = p_edition_id
  join public.annual_conference_flexible_ticket_allocations scope_allocation
    on scope_allocation.id = refund.allocation_id and scope_allocation.edition_id = p_edition_id
  where refund.id = p_refund_id
  for update of refund;

  if refund_row.id is null or refund_row.status <> 'requested' then
    return query select 'invalid'::text;
    return;
  end if;
  if refund_row.provider_refund_id = normalized_provider_refund_id then
    return query select 'bound'::text;
    return;
  end if;
  if refund_row.provider_refund_id is not null
    or exists (
      select 1
      from public.annual_conference_flexible_ticket_refund_provider_ids binding
      where binding.provider = 'paystack'
        and binding.provider_refund_id = normalized_provider_refund_id
    ) then
    return query select 'invalid'::text;
    return;
  end if;

  insert into public.annual_conference_flexible_ticket_refund_provider_ids(
    refund_id, provider, provider_refund_id, attempt_number
  ) values (
    refund_row.id, 'paystack', normalized_provider_refund_id, refund_row.attempt_number
  );
  update public.annual_conference_flexible_ticket_refunds
  set provider_refund_id = normalized_provider_refund_id
  where id = refund_row.id;

  return query select 'bound'::text;
end;
$$;

create or replace function public.reject_annual_conference_flexible_ticket_refund(
  p_edition_id uuid,
  p_refund_id uuid,
  p_provider_refund_id text,
  p_provider_payload_sha256 text,
  p_rejection_reason text,
  p_actor_email text
)
returns table(outcome text, ticket_id uuid, delivery_queued boolean)
language plpgsql security definer set search_path = public as $$
declare refund_row public.annual_conference_flexible_ticket_refunds;
  allocation public.annual_conference_flexible_ticket_allocations;
  ticket public.annual_conference_tickets; ticket_order public.annual_conference_ticket_orders;
  qr_token text; queued boolean := false;
  normalized_provider_refund_id text := nullif(btrim(p_provider_refund_id), '');
begin
  if nullif(btrim(p_actor_email), '') is null
    or normalized_provider_refund_id is null
    or char_length(normalized_provider_refund_id) > 160
    or coalesce(p_provider_payload_sha256, '') !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_rejection_reason), '') is null
    or char_length(btrim(p_rejection_reason)) > 500 then
    return query select 'invalid'::text, null::uuid, false;
    return;
  end if;

  select refund.* into refund_row
  from public.annual_conference_flexible_ticket_refunds refund
  join public.annual_conference_ticket_orders scope_order
    on scope_order.id = refund.order_id and scope_order.edition_id = p_edition_id
  join public.annual_conference_flexible_ticket_allocations scope_allocation
    on scope_allocation.id = refund.allocation_id and scope_allocation.edition_id = p_edition_id
  where refund.id = p_refund_id
  for update of refund;
  if refund_row.id is null or refund_row.status = 'refunded' then
    return query select 'invalid'::text, null::uuid, false;
    return;
  end if;

  select * into allocation from public.annual_conference_flexible_ticket_allocations
  where id = refund_row.allocation_id;
  select * into ticket from public.annual_conference_tickets
  where order_id = refund_row.order_id and order_seat_number = allocation.seat_index
  for update;
  select * into ticket_order from public.annual_conference_ticket_orders
  where id = refund_row.order_id;

  if refund_row.status = 'rejected' then
    if exists (
      select 1
      from public.annual_conference_flexible_ticket_refund_provider_ids binding
      where binding.refund_id = refund_row.id
        and binding.provider = 'paystack'
        and binding.provider_refund_id = normalized_provider_refund_id
        and binding.attempt_number = refund_row.attempt_number
        and binding.resolution_status = 'failed'
        and binding.provider_payload_sha256 = p_provider_payload_sha256
    ) then
      return query select 'rejected'::text, ticket.id, false;
    else
      return query select 'invalid'::text, ticket.id, false;
    end if;
    return;
  end if;
  if refund_row.status <> 'requested'
    or refund_row.provider_refund_id is distinct from normalized_provider_refund_id
    or ticket.id is null
    or ticket.status <> 'cancelled' then
    return query select 'invalid'::text, null::uuid, false;
    return;
  end if;

  update public.annual_conference_flexible_ticket_refund_provider_ids
  set resolution_status = 'failed',
      provider_payload_sha256 = p_provider_payload_sha256,
      resolved_at = now()
  where refund_id = refund_row.id
    and provider = 'paystack'
    and provider_refund_id = normalized_provider_refund_id
    and attempt_number = refund_row.attempt_number
    and resolution_status = 'bound';

  if not found then
    return query select 'invalid'::text, null::uuid, false;
    return;
  end if;

  if refund_row.ticket_status_before_request = 'pending' then
    update public.annual_conference_tickets
    set status = 'pending'
    where id = ticket.id
    returning * into ticket;

    if allocation.allocation_kind = 'gift' then
      perform public.queue_annual_conference_flexible_gift_claim(
        allocation.id, ticket.edition_id, ticket.order_id, allocation.recipient_email
      );
      queued := true;
    end if;
  elsif refund_row.ticket_status_before_request = 'issued' then
    qr_token := encode(extensions.gen_random_bytes(32), 'hex');
    update public.annual_conference_tickets
    set status = 'issued', qr_token_hash = encode(extensions.digest(qr_token, 'sha256'), 'hex'),
        issued_at = now()
    where id = ticket.id
    returning * into ticket;

    if allocation.allocation_kind = 'buyer_managed' then
      insert into public.annual_conference_ticket_email_outbox(
        edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
      ) values (
        ticket.edition_id, ticket.order_id, 'flexible_buyer_bundle_delivery',
        ticket_order.purchaser_name, ticket_order.purchaser_email,
        jsonb_build_object(
          'chunk_index', 1,
          'chunk_count', 1,
          'tickets', jsonb_build_array(jsonb_build_object(
            'ticket_id', ticket.id,
            'order_seat_number', ticket.order_seat_number,
            'qr_token', qr_token
          ))
        ),
        concat('flexible-refund-rejected-buyer-ticket:', refund_row.id, ':', refund_row.attempt_number)
      ) on conflict (idempotency_key) do nothing;
    else
      insert into public.annual_conference_ticket_email_outbox(
        edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
      ) values (
        ticket.edition_id, ticket.order_id, 'flexible_admission_delivery',
        ticket.attendee_name, ticket.attendee_email,
        jsonb_build_object('ticket_id', ticket.id, 'qr_token', qr_token),
        concat('flexible-refund-rejected-admission:', refund_row.id, ':', refund_row.attempt_number)
      ) on conflict (idempotency_key) do nothing;
    end if;
    queued := true;
  else
    return query select 'invalid'::text, ticket.id, false;
    return;
  end if;

  update public.annual_conference_flexible_ticket_refunds
  set status = 'rejected', rejection_reason = btrim(p_rejection_reason),
      provider_refund_id = null,
      finalized_at = now(), finalized_by_email = lower(btrim(p_actor_email))
  where id = refund_row.id;

  return query select 'rejected'::text, ticket.id, queued;
end;
$$;

create or replace function public.finalize_annual_conference_flexible_ticket_refund(
  p_edition_id uuid,
  p_refund_id uuid,
  p_provider text,
  p_provider_refund_id text,
  p_provider_refund_reference text,
  p_refunded_amount_minor integer,
  p_provider_payload_sha256 text,
  p_actor_email text
)
returns table(outcome text, ticket_id uuid, order_status public.annual_conference_ticket_order_status)
language plpgsql security definer set search_path = public as $$
declare refund_row public.annual_conference_flexible_ticket_refunds; ticket public.annual_conference_tickets; remaining integer; final_status public.annual_conference_ticket_order_status;
  normalized_provider_refund_id text := nullif(btrim(p_provider_refund_id), '');
begin
  if nullif(btrim(p_actor_email), '') is null
    or coalesce(btrim(p_provider), '') <> 'paystack'
    or normalized_provider_refund_id is null
    or char_length(normalized_provider_refund_id) > 160
    or nullif(btrim(p_provider_refund_reference), '') is null
    or char_length(btrim(p_provider_refund_reference)) > 200
    or p_refunded_amount_minor is distinct from 15000
    or coalesce(p_provider_payload_sha256, '') !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::uuid, null::public.annual_conference_ticket_order_status;
    return;
  end if;
  select refund.* into refund_row
  from public.annual_conference_flexible_ticket_refunds refund
  join public.annual_conference_ticket_orders scope_order
    on scope_order.id = refund.order_id and scope_order.edition_id = p_edition_id
  join public.annual_conference_flexible_ticket_allocations scope_allocation
    on scope_allocation.id = refund.allocation_id and scope_allocation.edition_id = p_edition_id
  where refund.id = p_refund_id
  for update of refund;
  if refund_row.id is null then return query select 'invalid'::text, null::uuid, null::public.annual_conference_ticket_order_status; return; end if;
  if refund_row.status = 'requested'
    and refund_row.provider_refund_id is distinct from normalized_provider_refund_id then
    return query select 'invalid'::text, null::uuid, null::public.annual_conference_ticket_order_status;
    return;
  end if;
  select * into ticket from public.annual_conference_tickets where order_id = refund_row.order_id and order_seat_number = (select seat_index from public.annual_conference_flexible_ticket_allocations where id = refund_row.allocation_id) for update;
  if refund_row.status = 'rejected' then
    return query select 'invalid'::text, ticket.id, 'paid'::public.annual_conference_ticket_order_status;
    return;
  end if;
  if refund_row.status = 'refunded' and (
    refund_row.provider <> 'paystack'
    or refund_row.provider_refund_id <> normalized_provider_refund_id
    or refund_row.provider_refund_reference <> btrim(p_provider_refund_reference)
    or refund_row.provider_refunded_amount_minor <> p_refunded_amount_minor
    or refund_row.provider_payload_sha256 <> p_provider_payload_sha256
  ) then
    return query select 'invalid'::text, ticket.id, null::public.annual_conference_ticket_order_status;
    return;
  end if;
  if refund_row.status = 'requested' then
    if ticket.status <> 'cancelled' or ticket.qr_token_hash is not null then
      return query select 'invalid'::text, ticket.id, null::public.annual_conference_ticket_order_status;
      return;
    end if;

    update public.annual_conference_flexible_ticket_refund_provider_ids
    set resolution_status = 'refunded',
        provider_payload_sha256 = p_provider_payload_sha256,
        resolved_at = now()
    where refund_id = refund_row.id
      and provider = 'paystack'
      and provider_refund_id = normalized_provider_refund_id
      and attempt_number = refund_row.attempt_number
      and resolution_status = 'bound';

    if not found then
      return query select 'invalid'::text, ticket.id, null::public.annual_conference_ticket_order_status;
      return;
    end if;

    update public.annual_conference_tickets
    set attendee_name = null, attendee_email = null
    where id = ticket.id;
    update public.annual_conference_flexible_ticket_claims set revoked_at = now() where allocation_id = refund_row.allocation_id and used_at is null;
    update public.annual_conference_social_cards card set revoked_at = now(), public_enabled = false where card.ticket_id = ticket.id;
    update public.annual_conference_flexible_ticket_refunds
    set status = 'refunded', provider = 'paystack',
        provider_refund_reference = btrim(p_provider_refund_reference),
        provider_refunded_amount_minor = p_refunded_amount_minor,
        provider_payload_sha256 = p_provider_payload_sha256,
        finalized_at = now(), finalized_by_email = lower(btrim(p_actor_email))
    where id = refund_row.id;
  end if;
  select count(*) into remaining from public.annual_conference_flexible_ticket_allocations a left join public.annual_conference_flexible_ticket_refunds r on r.allocation_id = a.id and r.status = 'refunded' where a.order_id = refund_row.order_id and r.id is null;
  if remaining = 0 then
    update public.annual_conference_ticket_orders
    set status = 'refunded', refunded_at = now(), flexible_order_management_capability_hash = null
    where id = refund_row.order_id;
    update public.annual_conference_ticket_email_outbox
    set status = 'failed', next_attempt_at = 'infinity',
        last_error = 'Order management access was revoked after the full refund.',
        claim_token = null, claimed_until = null
    where order_id = refund_row.order_id
      and kind = 'flexible_order_management'
      and status in ('queued', 'failed', 'sending');
    final_status := 'refunded';
  else
    final_status := 'paid';
  end if;
  return query select 'refunded'::text, ticket.id, final_status;
end;
$$;

revoke all on function public.prepare_annual_conference_ticket_payment_attempt(uuid, text, text), public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb), public.confirm_annual_conference_flexible_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb), public.get_annual_conference_flexible_order_management(text) from public, anon, authenticated;
grant execute on function public.prepare_annual_conference_ticket_payment_attempt(uuid, text, text), public.confirm_annual_conference_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb), public.confirm_annual_conference_flexible_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb), public.get_annual_conference_flexible_order_management(text) to service_role;
revoke all on function public.block_unactivated_flexible_ticket_payment_attempt(), public.prevent_annual_conference_flexible_checked_in_mutation(), public.scrub_annual_conference_flexible_delivery_capability(), public.provision_annual_conference_social_card_collection(), public.provision_annual_conference_ticket_social_card(), public.queue_annual_conference_flexible_gift_claim(uuid, uuid, uuid, text), public.claim_annual_conference_flexible_ticket(text, text, text), public.claim_annual_conference_flexible_badge(text, text, text), public.rotate_annual_conference_flexible_ticket_claim(text, uuid, text), public.reissue_annual_conference_gift_claim(text, uuid), public.list_annual_conference_community_managed_ticket_pool(uuid, integer), public.assign_annual_conference_community_managed_ticket(uuid, uuid, text, text, text, uuid), public.request_annual_conference_flexible_ticket_refund(uuid, uuid), public.get_annual_conference_flexible_ticket_refund_payment(uuid, uuid), public.bind_annual_conference_flexible_ticket_refund_provider_id(uuid, uuid, text), public.reject_annual_conference_flexible_ticket_refund(uuid, uuid, text, text, text, text), public.finalize_annual_conference_flexible_ticket_refund(uuid, uuid, text, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.block_unactivated_flexible_ticket_payment_attempt(), public.prevent_annual_conference_flexible_checked_in_mutation(), public.scrub_annual_conference_flexible_delivery_capability(), public.provision_annual_conference_social_card_collection(), public.provision_annual_conference_ticket_social_card(), public.queue_annual_conference_flexible_gift_claim(uuid, uuid, uuid, text), public.claim_annual_conference_flexible_ticket(text, text, text), public.claim_annual_conference_flexible_badge(text, text, text), public.rotate_annual_conference_flexible_ticket_claim(text, uuid, text), public.reissue_annual_conference_gift_claim(text, uuid), public.list_annual_conference_community_managed_ticket_pool(uuid, integer), public.assign_annual_conference_community_managed_ticket(uuid, uuid, text, text, text, uuid), public.request_annual_conference_flexible_ticket_refund(uuid, uuid), public.get_annual_conference_flexible_ticket_refund_payment(uuid, uuid), public.bind_annual_conference_flexible_ticket_refund_provider_id(uuid, uuid, text), public.reject_annual_conference_flexible_ticket_refund(uuid, uuid, text, text, text, text), public.finalize_annual_conference_flexible_ticket_refund(uuid, uuid, text, text, text, integer, text, text) to service_role;

revoke all on function public.prevent_annual_conference_refund_provider_id_mutation() from public, anon, authenticated;
grant execute on function public.prevent_annual_conference_refund_provider_id_mutation() to service_role;
