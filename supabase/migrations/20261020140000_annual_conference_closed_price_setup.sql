-- Let Owners correct unpublished prices while an edition is free and closed.
-- Existing orders, including abandoned checkout holds, always lock prices.
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

  if settings.sales_status <> 'draft'
    and not (settings.sales_status = 'closed' and settings.public_mode = 'free') then
    raise exception using message = 'ticket_prices_locked';
  end if;

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

revoke all on function public.set_annual_conference_ticket_prices(uuid, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.set_annual_conference_ticket_prices(uuid, integer, integer, integer, text) to service_role;

comment on function public.set_annual_conference_ticket_prices(uuid, integer, integer, integer, text)
  is 'Changes unpublished edition prices in draft or free/closed state only before any checkout order exists.';
