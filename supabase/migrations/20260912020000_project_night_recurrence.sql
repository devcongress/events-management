-- One explicitly enabled Project Night series. No existing event is enabled by migration.
create table public.project_night_recurrence (
  id boolean primary key default true check (id),
  source_event_id uuid not null references public.community_events(id),
  enabled boolean not null default false,
  next_date date not null check (extract(isodow from next_date) = 4),
  cover_url text not null,
  updated_at timestamptz not null default now()
);
create table public.project_night_occurrences (
  occurrence_date date primary key,
  event_id uuid unique references public.community_events(id),
  skipped boolean not null default false,
  published_at timestamptz
);
alter table public.project_night_recurrence enable row level security;
alter table public.project_night_occurrences enable row level security;
revoke all on public.project_night_recurrence, public.project_night_occurrences from anon, authenticated;
grant all on public.project_night_recurrence, public.project_night_occurrences to service_role;

create function public.configure_project_night(p_event_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  source public.community_events;
  config public.project_night_recurrence;
  first_date date;
  latest_cover text;
begin
  perform pg_advisory_xact_lock(hashtext('project-night-recurrence'));
  select * into source from public.community_events where id = p_event_id and deleted_at is null;
  if not found or source.name !~* '\mproject[[:space:]-]+night\M' then
    raise exception 'Project Night event required';
  end if;
  select * into config from public.project_night_recurrence where id;
  if p_action = 'enable' then
    if config.id is not null then
      select * into source from public.community_events where id = config.source_event_id and deleted_at is null;
      if not found then raise exception 'Restore the recurrence source event first'; end if;
    end if;
    if source.timezone <> 'Africa/Accra' or extract(isodow from source.starts_at at time zone 'Africa/Accra') <> 4 then
      raise exception 'Project Night must be on Thursday in Africa/Accra';
    end if;
    -- Start at the next Monday announcement, never immediately announce an old event.
    first_date := (date_trunc('week', now() at time zone 'Africa/Accra') + interval '3 days')::date;
    if now() >= ((first_date - 3) + time '09:00') at time zone 'Africa/Accra' then first_date := first_date + 7; end if;
    while first_date <= (source.starts_at at time zone 'Africa/Accra')::date loop first_date := first_date + 7; end loop;
    select e.cover_url into latest_cover from public.event_slack_announcements a
      join public.community_events e on e.id = a.event_id
      where a.status = 'sent' and e.name ~* '\mproject[[:space:]-]+night\M' and e.deleted_at is null
      order by a.sent_at desc nulls last limit 1;
    insert into public.project_night_recurrence(id, source_event_id, enabled, next_date, cover_url)
      values (true, source.id, true, first_date, coalesce(latest_cover, source.cover_url))
      on conflict (id) do update set enabled = true,
        next_date = case when project_night_recurrence.enabled then project_night_recurrence.next_date
          else greatest(project_night_recurrence.next_date, first_date) end,
        updated_at = now();
  elsif p_action = 'pause' then
    if config.id is null then raise exception 'Enable recurrence first'; end if;
    update public.project_night_recurrence set enabled = false, updated_at = now() where id;
  elsif p_action = 'skip' then
    if config.id is null then raise exception 'Enable recurrence first'; end if;
    insert into public.project_night_occurrences(occurrence_date, skipped) values(config.next_date, true)
      on conflict (occurrence_date) do update set skipped = true;
    update public.project_night_recurrence set next_date = next_date + 7, updated_at = now() where id;
  else raise exception 'Invalid recurrence action';
  end if;
  return (select to_jsonb(r) from public.project_night_recurrence r where id);
end $$;

create function public.advance_project_night()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  config public.project_night_recurrence;
  source public.community_events;
  occurrence public.project_night_occurrences;
  start_time timestamptz;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('project-night-recurrence'));
  select * into config from public.project_night_recurrence where id and enabled;
  if not found then return null; end if;
  select * into source from public.community_events where id = config.source_event_id and deleted_at is null;
  if not found then return null; end if;
  -- Missed weeks are never published as a backlog.
  start_time := (config.next_date + (source.starts_at at time zone 'Africa/Accra')::time) at time zone 'Africa/Accra';
  while start_time <= now() loop
    config.next_date := config.next_date + 7;
    start_time := start_time + interval '7 days';
  end loop;
  update public.project_night_recurrence set next_date = config.next_date where id;
  select * into occurrence from public.project_night_occurrences where occurrence_date = config.next_date;
  if not found then
    -- An already-created event for this Thursday is adopted without re-announcing it.
    select id into new_id from public.community_events
      where name ~* '\mproject[[:space:]-]+night\M'
      and (starts_at at time zone 'Africa/Accra')::date = config.next_date
      order by deleted_at nulls first, created_at, id limit 1;
    if new_id is null then
      new_id := gen_random_uuid();
      insert into public.community_events (
        id, slug, name, description, starts_at, ends_at, status, cover_url,
        location_label, location_name, location_url, stream_url, embed_stream,
        registration_url, publish_to_website, event_ownership, event_format,
        submission_source, moderation_status, publication_status, timezone,
        location_type, venue_address, online_url, organizer_name, organizer_url, series_type
      ) values (
        new_id, 'project-night-' || config.next_date, source.name, source.description,
        start_time, start_time + (source.ends_at - source.starts_at), 'draft', config.cover_url,
        source.location_label, source.location_name, source.location_url, source.stream_url, source.embed_stream,
        source.registration_url, false, source.event_ownership, source.event_format,
        source.submission_source, source.moderation_status, 'draft', 'Africa/Accra',
        source.location_type, source.venue_address, source.online_url, source.organizer_name, source.organizer_url, source.series_type
      );
    end if;
    insert into public.project_night_occurrences(occurrence_date, event_id) values(config.next_date, new_id);
    select * into occurrence from public.project_night_occurrences where occurrence_date = config.next_date;
  end if;
  if occurrence.skipped then return null; end if;
  if now() < ((config.next_date - 3) + time '09:00') at time zone 'Africa/Accra' then return null; end if;
  -- A removed occurrence stays removed. Saved announcements remain untouched.
  update public.community_events set publication_status = 'published', publish_to_website = true, status = 'upcoming'
    where id = occurrence.event_id and deleted_at is null and publication_status = 'draft';
  if found then
    insert into public.admin_audit_log(action, target_type, target_id, metadata)
      values ('event.recurrence.publish', 'event', occurrence.event_id::text,
        jsonb_build_object('source', 'scheduler', 'occurrence_date', config.next_date));
  end if;
  update public.project_night_recurrence set next_date = next_date + 7 where id;
  if not exists(select 1 from public.community_events where id = occurrence.event_id and deleted_at is null and publication_status = 'published') then return null; end if;
  update public.project_night_occurrences set published_at = coalesce(published_at, now()) where occurrence_date = config.next_date;
  return occurrence.event_id;
end $$;

-- An organizer's image replacement becomes the series default; old posts are not edited here.
create function public.project_night_cover_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cover_url is distinct from old.cover_url then
    update public.project_night_recurrence set cover_url = new.cover_url, updated_at = now()
      where source_event_id = new.id or exists(select 1 from public.project_night_occurrences where event_id = new.id);
    update public.community_events e set cover_url = new.cover_url
      where e.id <> new.id and e.publication_status = 'draft'
      and exists(select 1 from public.project_night_occurrences o where o.event_id = e.id and not o.skipped)
      and exists(select 1 from public.project_night_recurrence r where r.cover_url = new.cover_url);
  end if;
  return new;
end $$;
create trigger project_night_cover_changed after update of cover_url on public.community_events
  for each row execute function public.project_night_cover_changed();

revoke all on function public.configure_project_night(uuid, text), public.advance_project_night(), public.project_night_cover_changed() from public, anon, authenticated;
grant execute on function public.configure_project_night(uuid, text), public.advance_project_night() to service_role;
