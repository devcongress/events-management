-- A checkout hold is a pending-payment order with a short, server-owned expiry.
-- All capacity decisions stay in this command so concurrent checkouts cannot oversell.
alter table public.annual_conference_ticket_orders
  add column checkout_request_key uuid;

create unique index annual_conference_ticket_orders_edition_checkout_request_key_idx
  on public.annual_conference_ticket_orders (edition_id, checkout_request_key)
  where checkout_request_key is not null;

create index annual_conference_ticket_orders_active_hold_idx
  on public.annual_conference_ticket_orders (edition_id, expires_at)
  where status = 'pending_payment';

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

  if settings.edition_id is null then
    raise exception using message = 'ticketing_not_configured';
  end if;

  if p_checkout_request_key is null then
    raise exception using message = 'checkout_request_key_required';
  end if;

  -- A browser/network retry returns its original order and never reserves twice.
  -- Bind its key to the original cart and purchaser to avoid a replay mixing carts.
  select * into existing_order
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id
    and checkout_request_key = p_checkout_request_key;

  if existing_order.id is not null then
    if existing_order.purchaser_name <> trim(p_purchaser_name)
      or existing_order.purchaser_email <> lower(trim(p_purchaser_email))
      or existing_order.tier_key <> p_tier_key then
      raise exception using message = 'checkout_request_conflict';
    end if;

    return existing_order;
  end if;

  if settings.sales_status <> 'open' then
    raise exception using message = 'ticket_sales_not_open';
  end if;

  case p_tier_key
    when 'regular' then
      order_quantity := 1;
      order_amount_minor := 19999;
    when 'team_3' then
      order_quantity := 3;
      order_amount_minor := 54999;
    when 'team_5' then
      order_quantity := 5;
      order_amount_minor := 84999;
    else
      raise exception using message = 'ticket_tier_invalid';
  end case;

  if length(trim(p_purchaser_name)) = 0 or length(trim(p_purchaser_email)) = 0 then
    raise exception using message = 'ticket_purchaser_invalid';
  end if;

  -- Expiration is durable, so abandoned holds immediately stop consuming inventory.
  update public.annual_conference_ticket_orders
  set status = 'expired'
  where edition_id = p_edition_id
    and status = 'pending_payment'
    and expires_at <= now();

  select coalesce(sum(quantity), 0) into paid_seats
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id
    and status = 'paid';

  select coalesce(sum(quantity), 0) into sponsor_seats
  from public.annual_conference_sponsor_ticket_allocations
  where edition_id = p_edition_id;

  select coalesce(sum(quantity), 0) into active_hold_seats
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id
    and status = 'pending_payment'
    and expires_at > now();

  if paid_seats + sponsor_seats + active_hold_seats + order_quantity > settings.public_capacity then
    raise exception using message = 'ticketing_capacity_exhausted';
  end if;

  insert into public.annual_conference_ticket_orders (
    edition_id,
    purchaser_name,
    purchaser_email,
    tier_key,
    quantity,
    amount_minor,
    checkout_request_key,
    expires_at
  ) values (
    p_edition_id,
    trim(p_purchaser_name),
    lower(trim(p_purchaser_email)),
    p_tier_key,
    order_quantity,
    order_amount_minor,
    p_checkout_request_key,
    now() + interval '15 minutes'
  ) returning * into checkout_order;

  return checkout_order;
end;
$$;

revoke all on function public.create_annual_conference_checkout_hold(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_annual_conference_checkout_hold(uuid, text, text, text, uuid) to service_role;

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
  where edition_id = p_edition_id and status = 'paid';

  select coalesce(sum(quantity), 0) into sponsor_seats
  from public.annual_conference_sponsor_ticket_allocations
  where edition_id = p_edition_id;

  select coalesce(sum(quantity), 0) into active_hold_seats
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id
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

revoke all on function public.set_annual_conference_ticketing_capacity(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.set_annual_conference_ticketing_capacity(uuid, integer, text) to service_role;

-- Re-declare the existing sponsor command because checkout holds now consume capacity too.
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
  where edition_id = p_edition_id and status = 'paid';

  select coalesce(sum(quantity), 0) into sponsor_seats
  from public.annual_conference_sponsor_ticket_allocations
  where edition_id = p_edition_id;

  select coalesce(sum(quantity), 0) into active_hold_seats
  from public.annual_conference_ticket_orders
  where edition_id = p_edition_id
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

revoke all on function public.allocate_annual_conference_sponsor_tickets(uuid, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.allocate_annual_conference_sponsor_tickets(uuid, text, text, text, integer, text) to service_role;

comment on column public.annual_conference_ticket_orders.checkout_request_key is 'Client-generated UUID that makes checkout-hold creation safe to retry.';
comment on function public.create_annual_conference_checkout_hold(uuid, text, text, text, uuid) is 'Creates one retry-safe 15-minute checkout hold using server-owned DevCon26 prices and an edition inventory lock.';
comment on function public.set_annual_conference_ticketing_capacity(uuid, integer, text) is 'Updates public capacity only when it remains at or above paid, sponsor-held, and active checkout-held seats.';
