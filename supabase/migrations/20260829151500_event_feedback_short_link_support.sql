alter table public.short_links
drop constraint short_links_destination_target;

alter table public.short_links
add constraint short_links_destination_target check (
  (destination in ('monthly_cfp', 'event_registration', 'event_feedback') and event_id is not null and conference_edition_id is null)
  or (destination = 'conference_cfp' and conference_edition_id is not null and event_id is null)
  or (destination = 'volunteer_intake' and event_id is null and conference_edition_id is null)
);

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
  if input_destination in ('monthly_cfp', 'event_registration', 'event_feedback') then
    if input_event_id is null or input_conference_edition_id is not null then
      raise exception 'Invalid event short-link destination.' using errcode = '22023';
    end if;
  elsif input_destination = 'conference_cfp' then
    if input_conference_edition_id is null or input_event_id is not null then
      raise exception 'Invalid conference short-link destination.' using errcode = '22023';
    end if;
  elsif input_destination = 'volunteer_intake' then
    if input_event_id is not null or input_conference_edition_id is not null then
      raise exception 'Invalid volunteer short-link destination.' using errcode = '22023';
    end if;
  else
    raise exception 'Unsupported short-link destination.' using errcode = '22023';
  end if;

  if input_event_id is not null then
    perform pg_advisory_xact_lock(hashtext(input_destination::text || ':' || input_event_id::text));
  elsif input_conference_edition_id is not null then
    perform pg_advisory_xact_lock(hashtext(input_destination::text || ':' || input_conference_edition_id::text));
  else
    perform pg_advisory_xact_lock(hashtext(input_destination::text));
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

revoke all on function public.ensure_active_short_link(public.short_link_destination, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.ensure_active_short_link(public.short_link_destination, uuid, uuid, text, uuid) to service_role;
