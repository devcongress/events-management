create unique index short_links_one_active_event_destination_idx
on public.short_links (destination, event_id)
where status = 'active' and event_id is not null;

create unique index short_links_one_active_conference_destination_idx
on public.short_links (destination, conference_edition_id)
where status = 'active' and conference_edition_id is not null;

create or replace function public.ensure_active_short_link(
  input_destination public.short_link_destination,
  input_event_id uuid,
  input_conference_edition_id uuid,
  input_code text,
  input_created_by_membership_id uuid
)
returns setof public.short_links
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_link public.short_links;
  created_link public.short_links;
begin
  if input_destination in ('monthly_cfp', 'event_registration')
    and (input_event_id is null or input_conference_edition_id is not null) then
    raise exception 'Invalid event short-link destination.' using errcode = '22023';
  end if;

  if input_destination = 'conference_cfp'
    and (input_conference_edition_id is null or input_event_id is not null) then
    raise exception 'Invalid conference short-link destination.' using errcode = '22023';
  end if;

  if input_event_id is not null then
    perform pg_advisory_xact_lock(hashtext(input_destination::text || ':' || input_event_id::text));
  else
    perform pg_advisory_xact_lock(hashtext(input_destination::text || ':' || input_conference_edition_id::text));
  end if;

  select * into existing_link
  from public.short_links
  where destination = input_destination
    and event_id is not distinct from input_event_id
    and conference_edition_id is not distinct from input_conference_edition_id
    and status = 'active'
  limit 1
  for update;

  if found then
    return next existing_link;
    return;
  end if;

  insert into public.short_links (
    code,
    destination,
    event_id,
    conference_edition_id,
    created_by_membership_id
  ) values (
    upper(trim(input_code)),
    input_destination,
    input_event_id,
    input_conference_edition_id,
    input_created_by_membership_id
  ) returning * into created_link;

  return next created_link;
end;
$$;

create or replace function public.regenerate_active_short_link(
  input_link_id uuid,
  input_code text,
  input_created_by_membership_id uuid
)
returns setof public.short_links
language plpgsql
security definer
set search_path = public
as $$
declare
  current_link public.short_links;
  replacement_link public.short_links;
begin
  select * into current_link
  from public.short_links
  where id = input_link_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active short link not found.' using errcode = 'P0002';
  end if;

  if current_link.event_id is not null then
    perform pg_advisory_xact_lock(hashtext(current_link.destination::text || ':' || current_link.event_id::text));
  else
    perform pg_advisory_xact_lock(hashtext(current_link.destination::text || ':' || current_link.conference_edition_id::text));
  end if;

  update public.short_links
  set status = 'revoked'
  where id = current_link.id;

  insert into public.short_links (
    code,
    destination,
    event_id,
    conference_edition_id,
    created_by_membership_id
  ) values (
    upper(trim(input_code)),
    current_link.destination,
    current_link.event_id,
    current_link.conference_edition_id,
    input_created_by_membership_id
  ) returning * into replacement_link;

  return next replacement_link;
end;
$$;

revoke all on function public.ensure_active_short_link(public.short_link_destination, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.regenerate_active_short_link(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.ensure_active_short_link(public.short_link_destination, uuid, uuid, text, uuid) to service_role;
grant execute on function public.regenerate_active_short_link(uuid, text, uuid) to service_role;
