-- Community event submissions are public proposals, not events. A proposal
-- becomes a canonical external event only after an organizer approves it.

begin;

alter table public.community_events
  add column if not exists event_ownership text not null default 'devcongress',
  add column if not exists event_format text not null default 'meetup',
  add column if not exists submission_source text not null default 'internal',
  add column if not exists moderation_status text,
  add column if not exists publication_status text not null default 'draft',
  add column if not exists timezone text not null default 'Africa/Accra',
  add column if not exists location_type text not null default 'in_person',
  add column if not exists venue_address text,
  add column if not exists online_url text,
  add column if not exists organizer_name text,
  add column if not exists organizer_url text,
  add column if not exists source_submission_id uuid;

-- Replace the abandoned preview-only classification column. Its hosted rows
-- are all `official`; ownership plus moderation now expresses the boundary
-- without conflating partners, community listings, and DevCongress events.
alter table public.community_events
  drop column if exists event_classification;

update public.community_events
set publication_status = case when publish_to_website then 'published' else 'draft' end
where publication_status = 'draft';

alter table public.community_events
  drop constraint if exists community_events_event_ownership_valid,
  add constraint community_events_event_ownership_valid
    check (event_ownership in ('devcongress', 'external')),
  drop constraint if exists community_events_event_format_valid,
  add constraint community_events_event_format_valid
    check (event_format in ('meetup', 'conference', 'workshop', 'hackathon', 'webinar', 'other')),
  drop constraint if exists community_events_submission_source_valid,
  add constraint community_events_submission_source_valid
    check (submission_source in ('internal', 'public_submission')),
  drop constraint if exists community_events_moderation_status_valid,
  add constraint community_events_moderation_status_valid
    check (moderation_status is null or moderation_status in ('pending', 'approved', 'rejected')),
  drop constraint if exists community_events_publication_status_valid,
  add constraint community_events_publication_status_valid
    check (publication_status in ('draft', 'published', 'archived')),
  drop constraint if exists community_events_location_type_valid,
  add constraint community_events_location_type_valid
    check (location_type in ('in_person', 'online', 'hybrid')),
  drop constraint if exists community_events_classification_consistent,
  add constraint community_events_classification_consistent check (
    (event_ownership = 'devcongress' and moderation_status is null)
    or
    (event_ownership = 'external' and series_type is null and moderation_status = 'approved')
  ),
  drop constraint if exists community_events_publication_consistent,
  add constraint community_events_publication_consistent check (
    (publication_status = 'published') = publish_to_website
  );

create unique index if not exists community_events_source_submission_uidx
  on public.community_events (source_submission_id)
  where source_submission_id is not null;

create index if not exists community_events_public_listing_idx
  on public.community_events (publication_status, event_ownership, starts_at desc);

create table if not exists public.event_submissions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  event_format text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  location_type text not null,
  location_name text,
  venue_name text,
  venue_address text,
  online_url text,
  registration_url text,
  organizer_name text not null,
  organizer_email text not null,
  organizer_website text,
  submitter_notes text,
  source_app text not null default 'website',
  review_status text not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  approved_event_id uuid references public.community_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade the abandoned preview table safely if it already exists in a hosted
-- project. The migration is intentionally additive and does not assume that
-- preview migration history was applied.
alter table public.event_submissions
  add column if not exists event_format text,
  add column if not exists timezone text,
  add column if not exists location_type text,
  add column if not exists venue_name text,
  add column if not exists venue_address text,
  add column if not exists online_url text,
  add column if not exists organizer_website text,
  add column if not exists submitter_notes text;

update public.event_submissions
set
  ends_at = coalesce(ends_at, starts_at + interval '2 hours'),
  event_format = coalesce(event_format, 'other'),
  timezone = coalesce(timezone, 'Africa/Accra'),
  location_type = coalesce(location_type, 'in_person'),
  venue_name = coalesce(venue_name, location_name)
where ends_at is null
   or event_format is null
   or timezone is null
   or location_type is null
   or venue_name is null;

alter table public.event_submissions
  alter column event_format set not null,
  alter column timezone set not null,
  alter column location_type set not null,
  alter column ends_at set not null,
  drop constraint if exists event_submissions_title_not_blank,
  add constraint event_submissions_title_not_blank check (length(trim(title)) > 0),
  drop constraint if exists event_submissions_summary_not_blank,
  add constraint event_submissions_summary_not_blank check (length(trim(summary)) > 0),
  drop constraint if exists event_submissions_organizer_name_not_blank,
  add constraint event_submissions_organizer_name_not_blank check (length(trim(organizer_name)) > 0),
  drop constraint if exists event_submissions_event_format_valid,
  add constraint event_submissions_event_format_valid
    check (event_format in ('meetup', 'conference', 'workshop', 'hackathon', 'webinar', 'other')),
  drop constraint if exists event_submissions_location_type_valid,
  add constraint event_submissions_location_type_valid
    check (location_type in ('in_person', 'online', 'hybrid')),
  drop constraint if exists event_submissions_review_status_valid,
  add constraint event_submissions_review_status_valid
    check (review_status in ('pending', 'approved', 'rejected')),
  drop constraint if exists event_submissions_time_order,
  add constraint event_submissions_time_order check (ends_at > starts_at),
  drop constraint if exists event_submissions_review_consistent,
  add constraint event_submissions_review_consistent check (
    (review_status = 'pending' and reviewed_by is null and reviewed_at is null and approved_event_id is null)
    or
    (review_status = 'approved' and reviewed_by is not null and reviewed_at is not null and approved_event_id is not null)
    or
    (review_status = 'rejected' and reviewed_by is not null and reviewed_at is not null and approved_event_id is null)
  );

create index if not exists event_submissions_status_created_idx
  on public.event_submissions (review_status, created_at desc);

drop trigger if exists set_event_submissions_updated_at on public.event_submissions;
create trigger set_event_submissions_updated_at
before update on public.event_submissions
for each row execute function public.set_updated_at();

alter table public.event_submissions enable row level security;
revoke all on table public.event_submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.event_submissions to service_role;

alter table public.community_events
  drop constraint if exists community_events_source_submission_id_fkey,
  add constraint community_events_source_submission_id_fkey
    foreign key (source_submission_id) references public.event_submissions(id) on delete set null;

create or replace function public.approve_event_submission(
  p_submission_id uuid,
  p_reviewed_by text,
  p_publish boolean
)
returns public.event_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.event_submissions;
  promoted public.community_events;
  base_slug text;
  candidate_slug text;
begin
  select * into submission
  from public.event_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'event_submission_not_found';
  end if;

  if submission.review_status = 'rejected' then
    raise exception 'event_submission_already_rejected';
  end if;

  if submission.approved_event_id is not null then
    return submission;
  end if;

  base_slug := trim(both '-' from regexp_replace(lower(submission.title), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then base_slug := 'community-event'; end if;
  candidate_slug := base_slug || '-' || left(replace(submission.id::text, '-', ''), 8);

  insert into public.community_events (
    slug, name, description, series_type, starts_at, ends_at, status,
    cover_url, location_label, location_name, location_url, stream_url,
    registration_url, publish_to_website, external_source, external_id,
    external_url, event_ownership, event_format, submission_source,
    moderation_status, publication_status, timezone, location_type,
    venue_address, online_url, organizer_name, organizer_url,
    source_submission_id
  ) values (
    candidate_slug,
    submission.title,
    submission.summary,
    null,
    submission.starts_at,
    submission.ends_at,
    'upcoming',
    '/images/logo.png',
    coalesce(submission.venue_address, submission.venue_name, case when submission.location_type = 'online' then 'Online' else null end),
    coalesce(submission.venue_name, case when submission.location_type = 'online' then 'Online' else 'Venue to be announced' end),
    null,
    submission.online_url,
    submission.registration_url,
    p_publish,
    'public_submission',
    submission.id::text,
    coalesce(submission.registration_url, submission.online_url),
    'external',
    submission.event_format,
    'public_submission',
    'approved',
    case when p_publish then 'published' else 'draft' end,
    submission.timezone,
    submission.location_type,
    submission.venue_address,
    submission.online_url,
    submission.organizer_name,
    submission.organizer_website,
    submission.id
  )
  on conflict (source_submission_id) where source_submission_id is not null
  do update set updated_at = public.community_events.updated_at
  returning * into promoted;

  update public.event_submissions
  set review_status = 'approved',
      reviewed_by = lower(trim(p_reviewed_by)),
      reviewed_at = now(),
      rejection_reason = null,
      approved_event_id = promoted.id
  where id = submission.id
  returning * into submission;

  return submission;
end;
$$;

create or replace function public.reject_event_submission(
  p_submission_id uuid,
  p_reviewed_by text,
  p_reason text
)
returns public.event_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.event_submissions;
begin
  select * into submission
  from public.event_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'event_submission_not_found';
  end if;

  if submission.review_status = 'approved' then
    raise exception 'event_submission_already_approved';
  end if;

  if submission.review_status = 'rejected' then
    return submission;
  end if;

  update public.event_submissions
  set review_status = 'rejected',
      reviewed_by = lower(trim(p_reviewed_by)),
      reviewed_at = now(),
      rejection_reason = nullif(trim(p_reason), ''),
      approved_event_id = null
  where id = submission.id
  returning * into submission;

  return submission;
end;
$$;

revoke all on function public.approve_event_submission(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.reject_event_submission(uuid, text, text) from public, anon, authenticated;
grant execute on function public.approve_event_submission(uuid, text, boolean) to service_role;
grant execute on function public.reject_event_submission(uuid, text, text) to service_role;

commit;
