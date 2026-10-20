-- Flexible carts are intentionally staged before payment and QR activation.
-- They reserve capacity and persist immutable allocation intent, but the
-- existing payment path cannot prepare or confirm them until a later migration
-- explicitly activates that flow.

alter table public.annual_conference_ticketing_settings
  add column flexible_checkout_max_amount_minor integer default 10000000,
  add constraint annual_conference_ticketing_settings_flexible_checkout_max_amount check (
    flexible_checkout_max_amount_minor is null or flexible_checkout_max_amount_minor > 0
  );

alter table public.annual_conference_ticket_orders
  drop constraint annual_conference_ticket_orders_quantity,
  add column checkout_flow text not null default 'standard',
  add column flexible_cart_request_key uuid,
  add column flexible_cart_snapshot jsonb,
  add column flexible_payment_fee_mode text,
  add constraint annual_conference_ticket_orders_checkout_flow check (
    checkout_flow in ('standard', 'flexible')
  ),
  add constraint annual_conference_ticket_orders_quantity check (
    (checkout_flow = 'standard' and quantity in (1, 3, 5))
    or (checkout_flow = 'flexible' and quantity > 0)
  ),
  add constraint annual_conference_ticket_orders_flexible_cart_snapshot check (
    (
      checkout_flow = 'standard'
      and flexible_cart_request_key is null
      and flexible_cart_snapshot is null
      and flexible_payment_fee_mode is null
    )
    or (
      checkout_flow = 'flexible'
      and flexible_cart_request_key is not null
      and flexible_cart_snapshot is not null
      and jsonb_typeof(flexible_cart_snapshot) = 'array'
      and flexible_payment_fee_mode = 'merchant_absorbs'
      and provider = 'paystack'
    )
  );

create unique index annual_conference_ticket_orders_flexible_cart_request_key_idx
  on public.annual_conference_ticket_orders (edition_id, flexible_cart_request_key)
  where flexible_cart_request_key is not null;

create table public.annual_conference_flexible_ticket_allocations (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete restrict,
  order_id uuid not null,
  seat_index integer not null,
  allocation_kind text not null,
  recipient_name text,
  recipient_email text,
  created_at timestamptz not null default now(),
  constraint annual_conference_flexible_ticket_allocations_order_edition_fkey
    foreign key (order_id, edition_id)
    references public.annual_conference_ticket_orders (id, edition_id)
    on delete restrict,
  constraint annual_conference_flexible_ticket_allocations_seat_index check (seat_index > 0),
  constraint annual_conference_flexible_ticket_allocations_kind check (
    allocation_kind in ('self', 'gift', 'buyer_managed', 'community_managed', 'community_shareable')
  ),
  constraint annual_conference_flexible_ticket_allocations_identity check (
    (allocation_kind = 'self' and recipient_name is not null and recipient_email is not null)
    or (allocation_kind = 'gift' and recipient_name is null and recipient_email is not null)
    or (allocation_kind in ('buyer_managed', 'community_managed', 'community_shareable')
      and recipient_name is null and recipient_email is null)
  ),
  constraint annual_conference_flexible_ticket_allocations_order_seat_unique unique (order_id, seat_index)
);

create unique index annual_conference_flexible_ticket_allocations_one_self_idx
  on public.annual_conference_flexible_ticket_allocations (order_id)
  where allocation_kind = 'self';

create index annual_conference_flexible_ticket_allocations_order_idx
  on public.annual_conference_flexible_ticket_allocations (order_id, seat_index);

alter table public.annual_conference_flexible_ticket_allocations enable row level security;
revoke all on public.annual_conference_flexible_ticket_allocations from public, anon, authenticated;
grant select on public.annual_conference_flexible_ticket_allocations to service_role;

create function public.prevent_annual_conference_flexible_ticket_allocation_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception using message = 'flexible_ticket_allocation_immutable';
end;
$$;

create trigger prevent_annual_conference_flexible_ticket_allocation_mutation
before update or delete on public.annual_conference_flexible_ticket_allocations
for each row execute function public.prevent_annual_conference_flexible_ticket_allocation_mutation();

create function public.prevent_annual_conference_flexible_ticket_order_snapshot_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.checkout_flow = 'flexible'
    and (
      new.checkout_flow is distinct from old.checkout_flow
      or new.flexible_cart_request_key is distinct from old.flexible_cart_request_key
      or new.flexible_cart_snapshot is distinct from old.flexible_cart_snapshot
      or new.flexible_payment_fee_mode is distinct from old.flexible_payment_fee_mode
      or new.provider is distinct from old.provider
      or new.quantity is distinct from old.quantity
      or new.amount_minor is distinct from old.amount_minor
      or new.purchaser_name is distinct from old.purchaser_name
      or new.purchaser_email is distinct from old.purchaser_email
      or new.tier_key is distinct from old.tier_key
    ) then
    raise exception using message = 'flexible_ticket_order_snapshot_immutable';
  end if;

  return new;
end;
$$;

create trigger prevent_annual_conference_flexible_ticket_order_snapshot_mutation
before update on public.annual_conference_ticket_orders
for each row execute function public.prevent_annual_conference_flexible_ticket_order_snapshot_mutation();

-- Keep the historical paid-intake function intact. The replacement trigger
-- preserves its legacy Regular-one-seat rule and narrowly admits the staged
-- flexible flow that this migration owns.
create function public.guard_annual_conference_paid_intake_with_flexible()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mode text;
begin
  select public_mode into mode
  from public.annual_conference_ticketing_settings
  where edition_id = new.edition_id
  for update;

  if mode <> 'paid' then
    raise exception using message = 'conference_paid_checkout_unavailable';
  end if;

  if new.checkout_flow = 'standard'
    and new.tier_key = 'regular'
    and new.quantity = 1 then
    return new;
  end if;

  if new.checkout_flow = 'flexible'
    and new.tier_key = 'regular_flexible'
    and new.quantity > 0 then
    return new;
  end if;

  raise exception using message = 'conference_paid_checkout_unavailable';
end;
$$;

drop trigger guard_conference_paid_intake on public.annual_conference_ticket_orders;
create trigger guard_conference_paid_intake
before insert on public.annual_conference_ticket_orders
for each row execute function public.guard_annual_conference_paid_intake_with_flexible();

create function public.block_unactivated_flexible_ticket_payment_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.annual_conference_ticket_orders
    where id = new.order_id
      and checkout_flow = 'flexible'
  ) then
    raise exception using message = 'flexible_ticket_checkout_not_activated';
  end if;

  return new;
end;
$$;

create trigger block_unactivated_flexible_ticket_payment_attempt
before insert or update on public.annual_conference_ticket_payment_attempts
for each row execute function public.block_unactivated_flexible_ticket_payment_attempt();

create function public.create_annual_conference_flexible_checkout_hold(
  p_edition_id uuid,
  p_purchaser_name text,
  p_purchaser_email text,
  p_quantity integer,
  p_allocations jsonb,
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
      or existing_order.provider <> 'paystack' then
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
  where edition_id = p_edition_id
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

  if reserved_seats + confirmed_registrations + p_quantity::numeric > settings.public_capacity::numeric then
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

revoke all on function public.prevent_annual_conference_flexible_ticket_allocation_mutation() from public, anon, authenticated;
revoke all on function public.prevent_annual_conference_flexible_ticket_order_snapshot_mutation() from public, anon, authenticated;
revoke all on function public.guard_annual_conference_paid_intake_with_flexible() from public, anon, authenticated;
revoke all on function public.block_unactivated_flexible_ticket_payment_attempt() from public, anon, authenticated;
revoke all on function public.create_annual_conference_flexible_checkout_hold(uuid, text, text, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.prevent_annual_conference_flexible_ticket_allocation_mutation() to service_role;
grant execute on function public.prevent_annual_conference_flexible_ticket_order_snapshot_mutation() to service_role;
grant execute on function public.guard_annual_conference_paid_intake_with_flexible() to service_role;
grant execute on function public.block_unactivated_flexible_ticket_payment_attempt() to service_role;
grant execute on function public.create_annual_conference_flexible_checkout_hold(uuid, text, text, integer, jsonb, uuid) to service_role;

comment on column public.annual_conference_ticketing_settings.flexible_checkout_max_amount_minor is 'Server-owned flexible-cart provider transaction ceiling in minor units. It defaults to Paystack''s documented 10,000,000-subunit maximum; null deliberately keeps flexible checkout creation fail-closed.';
comment on table public.annual_conference_flexible_ticket_allocations is 'Immutable per-seat flexible-cart intent. Gift records retain only a normalized recipient email; community and buyer-managed intents retain no recipient PII.';
comment on function public.create_annual_conference_flexible_checkout_hold(uuid, text, text, integer, jsonb, uuid) is 'Creates a retry-safe inactive flexible-cart capacity hold from server-owned Regular pricing. Payment and QR issuance remain blocked until a later activation migration.';
