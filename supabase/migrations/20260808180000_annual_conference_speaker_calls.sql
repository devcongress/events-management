-- Every Annual Conference edition gets a private programme Event.  The Event
-- is infrastructure only: it reuses the established proposal, selection,
-- secure-intake, and archive lifecycle without appearing in public event feeds.

alter table public.annual_conference_editions
  add column if not exists conference_event_id uuid
    references public.community_events(id) on delete restrict;

create unique index if not exists annual_conference_editions_conference_event_uidx
  on public.annual_conference_editions (conference_event_id)
  where conference_event_id is not null;

create or replace function public.create_annual_conference_programme_event()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_date date;
begin
  if new.conference_event_id is not null then
    return new;
  end if;

  v_date := coalesce(new.provisional_date, make_date(new.year, 12, 19));
  new.conference_event_id := gen_random_uuid();

  insert into public.community_events (
    id, slug, name, description, series_type, event_format,
    starts_at, ends_at, status, cover_url, location_label, location_name,
    publish_to_website, publication_status
  ) values (
    new.conference_event_id,
    'annual-conference-' || new.year,
    new.name || ' ' || new.year,
    'Private programme workspace for the ' || new.label || ' Annual Conference edition.',
    'special', 'conference',
    (v_date + time '09:00') at time zone 'Africa/Accra',
    (v_date + time '18:00') at time zone 'Africa/Accra',
    'draft', '/images/apr-meetup.jpg', 'Accra, Ghana', 'Accra, Ghana',
    false, 'draft'
  );

  return new;
end;
$$;

drop trigger if exists annual_conference_editions_create_programme_event on public.annual_conference_editions;
create trigger annual_conference_editions_create_programme_event
before insert on public.annual_conference_editions
for each row execute function public.create_annual_conference_programme_event();

-- Backfill already-created editions. The deterministic slug makes this safe to
-- re-run and preserves an existing hidden programme Event if it was created
-- during an interrupted deployment.
insert into public.community_events (
  slug, name, description, series_type, event_format,
  starts_at, ends_at, status, cover_url, location_label, location_name,
  publish_to_website, publication_status
)
select
  'annual-conference-' || edition.year,
  edition.name || ' ' || edition.year,
  'Private programme workspace for the ' || edition.label || ' Annual Conference edition.',
  'special', 'conference',
  (coalesce(edition.provisional_date, make_date(edition.year, 12, 19)) + time '09:00') at time zone 'Africa/Accra',
  (coalesce(edition.provisional_date, make_date(edition.year, 12, 19)) + time '18:00') at time zone 'Africa/Accra',
  'draft', '/images/apr-meetup.jpg', 'Accra, Ghana', 'Accra, Ghana', false, 'draft'
from public.annual_conference_editions edition
where edition.conference_event_id is null
on conflict (slug) do nothing;

update public.annual_conference_editions edition
set conference_event_id = event.id
from public.community_events event
where edition.conference_event_id is null
  and event.slug = 'annual-conference-' || edition.year
  and event.publish_to_website = false
  and event.series_type = 'special'
  and event.event_format = 'conference';

alter table public.annual_conference_editions
  alter column conference_event_id set not null;

create index if not exists speaker_submissions_event_status_created_idx
  on public.speaker_submissions (event_id, status, created_at desc);

alter table public.annual_conference_access_grants
  drop constraint if exists annual_conference_access_grants_capability_valid,
  add constraint annual_conference_access_grants_capability_valid check (
    capability in (
      'work_plan.view_all', 'work_plan.manage', 'timeline.view', 'phases.manage',
      'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications',
      'speakers.view', 'speakers.manage', 'finance.view'
    )
  );

-- Conference-speaker access is intentionally organizer-only; existing
-- volunteer grants remain restricted to operational planning capabilities.
create or replace function public.enforce_annual_conference_access_grant_eligibility()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_membership public.admin_memberships;
begin
  select * into v_membership from public.admin_memberships where id = new.membership_id for update;
  if not found or v_membership.status <> 'active' then
    raise exception 'Conference access can only be granted to an active member.';
  end if;
  if (new.capability in ('finance.view', 'speakers.view', 'speakers.manage') and v_membership.role <> 'organizer')
    or (new.capability not in ('finance.view', 'speakers.view', 'speakers.manage') and v_membership.role <> 'volunteer') then
    raise exception 'This conference capability is not eligible for the member role.';
  end if;
  return new;
end;
$$;
