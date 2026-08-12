alter table public.community_events
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_email text,
  add column if not exists delete_reason text,
  add column if not exists restore_until timestamptz,
  add column if not exists deletion_snapshot jsonb not null default '{}'::jsonb;

create index if not exists community_events_deleted_restore_idx
  on public.community_events (deleted_at desc, restore_until)
  where deleted_at is not null;

create or replace function public.archive_community_event(
  p_event_id uuid,
  p_deleted_by_email text,
  p_delete_reason text default null,
  p_restore_days integer default 30
)
returns setof public.community_events
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.community_events;
  archived_row public.community_events;
  registration_campaign_snapshot jsonb;
  short_link_snapshot jsonb;
begin
  select * into event_row
  from public.community_events
  where id = p_event_id
  for update;

  if not found then
    return;
  end if;

  if event_row.deleted_at is not null then
    raise exception 'event_already_archived';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status)), '[]'::jsonb)
  into registration_campaign_snapshot
  from public.event_registration_campaigns
  where event_id = p_event_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status)), '[]'::jsonb)
  into short_link_snapshot
  from public.short_links
  where event_id = p_event_id;

  update public.event_registration_campaigns
  set status = 'closed',
      updated_at = now()
  where event_id = p_event_id;

  update public.short_links
  set status = 'revoked',
      updated_at = now()
  where event_id = p_event_id
    and status = 'active';

  update public.community_events
  set deleted_at = now(),
      deleted_by_email = lower(nullif(trim(p_deleted_by_email), '')),
      delete_reason = nullif(trim(coalesce(p_delete_reason, '')), ''),
      restore_until = now() + make_interval(days => greatest(p_restore_days, 1)),
      deletion_snapshot = jsonb_build_object(
        'publish_to_website', event_row.publish_to_website,
        'publication_status', event_row.publication_status,
        'registration_campaigns', registration_campaign_snapshot,
        'short_links', short_link_snapshot
      ),
      publish_to_website = false,
      publication_status = 'archived',
      updated_at = now()
  where id = p_event_id
  returning * into archived_row;

  return next archived_row;
end;
$$;

create or replace function public.restore_archived_community_event(p_event_id uuid)
returns setof public.community_events
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row public.community_events;
  restored_row public.community_events;
  snapshot jsonb;
begin
  select * into event_row
  from public.community_events
  where id = p_event_id
  for update;

  if not found then
    return;
  end if;

  if event_row.deleted_at is null then
    raise exception 'event_not_archived';
  end if;

  if event_row.restore_until is not null and event_row.restore_until < now() then
    raise exception 'event_restore_window_expired';
  end if;

  if event_row.ends_at <= now() then
    raise exception 'event_timeline_not_viable';
  end if;

  snapshot := coalesce(event_row.deletion_snapshot, '{}'::jsonb);

  update public.event_registration_campaigns as campaign
  set status = (item.value ->> 'status')::public.event_registration_campaign_status,
      updated_at = now()
  from jsonb_array_elements(coalesce(snapshot -> 'registration_campaigns', '[]'::jsonb)) as item(value)
  where campaign.id = (item.value ->> 'id')::uuid;

  update public.short_links as link
  set status = (item.value ->> 'status')::public.short_link_status,
      updated_at = now()
  from jsonb_array_elements(coalesce(snapshot -> 'short_links', '[]'::jsonb)) as item(value)
  where link.id = (item.value ->> 'id')::uuid;

  update public.community_events
  set deleted_at = null,
      deleted_by_email = null,
      delete_reason = null,
      restore_until = null,
      deletion_snapshot = '{}'::jsonb,
      publish_to_website = coalesce((snapshot ->> 'publish_to_website')::boolean, false),
      publication_status = coalesce(snapshot ->> 'publication_status', 'draft'),
      updated_at = now()
  where id = p_event_id
  returning * into restored_row;

  return next restored_row;
end;
$$;

create or replace function public.hard_delete_community_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.short_links
  where event_id = p_event_id;

  delete from public.community_events
  where id = p_event_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.archive_community_event(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.restore_archived_community_event(uuid) from public, anon, authenticated;
revoke all on function public.hard_delete_community_event(uuid) from public, anon, authenticated;
grant execute on function public.archive_community_event(uuid, text, text, integer) to service_role;
grant execute on function public.restore_archived_community_event(uuid) to service_role;
grant execute on function public.hard_delete_community_event(uuid) to service_role;
