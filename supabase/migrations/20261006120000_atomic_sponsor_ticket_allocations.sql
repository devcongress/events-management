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

  if p_quantity < 1 or paid_seats + sponsor_seats + p_quantity > settings.public_capacity then
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
