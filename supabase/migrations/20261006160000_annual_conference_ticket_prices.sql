-- Public prices remain edition settings, not client-owned cart data. They may
-- change only while the edition is still a draft and before any order exists.
alter table public.annual_conference_ticketing_settings
  add column regular_price_minor integer not null default 19999,
  add column team_3_price_minor integer not null default 54999,
  add column team_5_price_minor integer not null default 84999,
  add constraint annual_conference_ticketing_settings_regular_price check (regular_price_minor > 0),
  add constraint annual_conference_ticketing_settings_team_3_price check (team_3_price_minor > 0),
  add constraint annual_conference_ticketing_settings_team_5_price check (team_5_price_minor > 0),
  add constraint annual_conference_ticketing_settings_team_3_value check (team_3_price_minor <= regular_price_minor * 3),
  add constraint annual_conference_ticketing_settings_team_5_value check (team_5_price_minor <= regular_price_minor * 5);

create or replace function public.set_annual_conference_ticket_prices(
  p_edition_id uuid,
  p_regular_price_minor integer,
  p_team_3_price_minor integer,
  p_team_5_price_minor integer,
  p_actor_email text
)
returns public.annual_conference_ticketing_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.annual_conference_ticketing_settings;
begin
  if p_regular_price_minor < 1 or p_team_3_price_minor < 1 or p_team_5_price_minor < 1
    or p_regular_price_minor > 100000000 or p_team_3_price_minor > 100000000 or p_team_5_price_minor > 100000000 then
    raise exception using message = 'ticket_prices_invalid';
  end if;

  if p_team_3_price_minor > p_regular_price_minor * 3 or p_team_5_price_minor > p_regular_price_minor * 5 then
    raise exception using message = 'ticket_prices_invalid';
  end if;

  insert into public.annual_conference_ticketing_settings (edition_id, updated_by_email)
  values (p_edition_id, p_actor_email)
  on conflict (edition_id) do nothing;

  select * into settings
  from public.annual_conference_ticketing_settings
  where edition_id = p_edition_id
  for update;

  if settings.sales_status <> 'draft' then
    raise exception using message = 'ticket_prices_locked';
  end if;

  -- Even if a status change was reversed, a historical order must preserve the
  -- published price record. This is intentionally broader than paid orders.
  if exists (
    select 1
    from public.annual_conference_ticket_orders
    where edition_id = p_edition_id
  ) then
    raise exception using message = 'ticket_prices_locked';
  end if;

  update public.annual_conference_ticketing_settings
  set regular_price_minor = p_regular_price_minor,
      team_3_price_minor = p_team_3_price_minor,
      team_5_price_minor = p_team_5_price_minor,
      updated_by_email = p_actor_email
  where edition_id = p_edition_id
  returning * into settings;

  return settings;
end;
$$;

-- Re-declare holds so their immutable order amount is copied from the locked
-- edition settings, never from an application constant or checkout request.
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
  where edition_id = p_edition_id and checkout_request_key = p_checkout_request_key;

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

  select coalesce(sum(quantity), 0) into paid_seats from public.annual_conference_ticket_orders where edition_id = p_edition_id and status = 'paid';
  select coalesce(sum(quantity), 0) into sponsor_seats from public.annual_conference_sponsor_ticket_allocations where edition_id = p_edition_id;
  select coalesce(sum(quantity), 0) into active_hold_seats from public.annual_conference_ticket_orders where edition_id = p_edition_id and status = 'pending_payment' and expires_at > now();

  if paid_seats + sponsor_seats + active_hold_seats + order_quantity > settings.public_capacity then raise exception using message = 'ticketing_capacity_exhausted'; end if;

  insert into public.annual_conference_ticket_orders (
    edition_id, purchaser_name, purchaser_email, tier_key, quantity, amount_minor, checkout_request_key, expires_at
  ) values (
    p_edition_id, trim(p_purchaser_name), lower(trim(p_purchaser_email)), p_tier_key, order_quantity, order_amount_minor, p_checkout_request_key, now() + interval '15 minutes'
  ) returning * into checkout_order;

  return checkout_order;
end;
$$;

revoke all on function public.set_annual_conference_ticket_prices(uuid, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.set_annual_conference_ticket_prices(uuid, integer, integer, integer, text) to service_role;
revoke all on function public.create_annual_conference_checkout_hold(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_annual_conference_checkout_hold(uuid, text, text, text, uuid) to service_role;

comment on function public.set_annual_conference_ticket_prices(uuid, integer, integer, integer, text) is 'Atomically changes edition ticket prices only while sales are draft and no order exists.';
