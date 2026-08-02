-- Community submission emails use a durable outbox. Submission intake and
-- moderation decisions remain successful even when Resend is unavailable.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_submission_email_kind') then
    create type public.event_submission_email_kind as enum ('receipt', 'approved', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'event_submission_email_delivery_status') then
    create type public.event_submission_email_delivery_status as enum ('pending', 'accepted', 'failed');
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_submissions'
      and column_name = 'rejection_reason'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_submissions'
      and column_name = 'internal_note'
  ) then
    alter table public.event_submissions rename column rejection_reason to internal_note;
  end if;
end $$;

alter table public.event_submissions
  add column if not exists rejection_category text,
  add column if not exists organizer_message text;

alter table public.event_submissions
  drop constraint if exists event_submissions_rejection_category_valid,
  add constraint event_submissions_rejection_category_valid check (
    rejection_category is null or rejection_category in (
      'calendar_fit',
      'insufficient_information',
      'duplicate',
      'event_passed',
      'other'
    )
  ),
  drop constraint if exists event_submissions_rejection_copy_consistent,
  add constraint event_submissions_rejection_copy_consistent check (
    review_status = 'rejected'
    or (rejection_category is null and organizer_message is null and internal_note is null)
  ),
  drop constraint if exists event_submissions_organizer_message_length,
  add constraint event_submissions_organizer_message_length check (
    organizer_message is null or length(organizer_message) <= 1200
  ),
  drop constraint if exists event_submissions_internal_note_length,
  add constraint event_submissions_internal_note_length check (
    internal_note is null or length(internal_note) <= 1000
  );

create table if not exists public.event_submission_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.event_submissions(id) on delete cascade,
  kind public.event_submission_email_kind not null,
  status public.event_submission_email_delivery_status not null default 'pending',
  attempts integer not null default 0,
  provider_id text,
  idempotency_key text not null unique,
  last_error text,
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_submission_email_deliveries_attempts_nonnegative check (attempts >= 0),
  constraint event_submission_email_deliveries_submission_kind_unique unique (submission_id, kind)
);

create index if not exists event_submission_email_deliveries_retry_idx
  on public.event_submission_email_deliveries (created_at)
  where status in ('pending', 'failed');

drop trigger if exists set_event_submission_email_deliveries_updated_at
  on public.event_submission_email_deliveries;
create trigger set_event_submission_email_deliveries_updated_at
before update on public.event_submission_email_deliveries
for each row execute function public.set_updated_at();

create or replace function public.queue_event_submission_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.event_submission_email_deliveries (
    submission_id,
    kind,
    idempotency_key
  ) values (
    new.id,
    'receipt',
    'event-submission-' || new.id::text || '-receipt'
  ) on conflict (submission_id, kind) do nothing;

  return new;
end;
$$;

drop trigger if exists queue_event_submission_receipt_on_insert on public.event_submissions;
create trigger queue_event_submission_receipt_on_insert
after insert on public.event_submissions
for each row execute function public.queue_event_submission_receipt();

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
    if p_publish then
      update public.community_events
      set publish_to_website = true,
          publication_status = 'published'
      where id = submission.approved_event_id;

      insert into public.event_submission_email_deliveries (
        submission_id,
        kind,
        idempotency_key
      ) values (
        submission.id,
        'approved',
        'event-submission-' || submission.id::text || '-approved'
      ) on conflict (submission_id, kind) do nothing;
    end if;
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
      rejection_category = null,
      organizer_message = null,
      internal_note = null,
      approved_event_id = promoted.id
  where id = submission.id
  returning * into submission;

  if p_publish then
    insert into public.event_submission_email_deliveries (
      submission_id,
      kind,
      idempotency_key
    ) values (
      submission.id,
      'approved',
      'event-submission-' || submission.id::text || '-approved'
    ) on conflict (submission_id, kind) do nothing;
  end if;

  return submission;
end;
$$;

create or replace function public.reject_event_submission(
  p_submission_id uuid,
  p_reviewed_by text,
  p_category text,
  p_organizer_message text,
  p_internal_note text
)
returns public.event_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.event_submissions;
  normalized_category text := nullif(trim(p_category), '');
begin
  if normalized_category is null or normalized_category not in (
    'calendar_fit',
    'insufficient_information',
    'duplicate',
    'event_passed',
    'other'
  ) then
    raise exception 'event_submission_invalid_rejection_category';
  end if;

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
    insert into public.event_submission_email_deliveries (
      submission_id,
      kind,
      idempotency_key
    ) values (
      submission.id,
      'rejected',
      'event-submission-' || submission.id::text || '-rejected'
    ) on conflict (submission_id, kind) do nothing;
    return submission;
  end if;

  update public.event_submissions
  set review_status = 'rejected',
      reviewed_by = lower(trim(p_reviewed_by)),
      reviewed_at = now(),
      rejection_category = normalized_category,
      organizer_message = nullif(trim(p_organizer_message), ''),
      internal_note = nullif(trim(p_internal_note), ''),
      approved_event_id = null
  where id = submission.id
  returning * into submission;

  insert into public.event_submission_email_deliveries (
    submission_id,
    kind,
    idempotency_key
  ) values (
    submission.id,
    'rejected',
    'event-submission-' || submission.id::text || '-rejected'
  ) on conflict (submission_id, kind) do nothing;

  return submission;
end;
$$;

-- Keep the old function signature during rolling deployment. Older app code
-- treats its single rejection reason as an internal note and still benefits
-- from the durable decision outbox.
create or replace function public.reject_event_submission(
  p_submission_id uuid,
  p_reviewed_by text,
  p_reason text
)
returns public.event_submissions
language sql
security definer
set search_path = public
as $$
  select public.reject_event_submission(
    p_submission_id,
    p_reviewed_by,
    'other',
    '',
    p_reason
  );
$$;

alter table public.event_submission_email_deliveries enable row level security;
revoke all on table public.event_submission_email_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.event_submission_email_deliveries to service_role;
grant usage on type public.event_submission_email_kind to service_role;
grant usage on type public.event_submission_email_delivery_status to service_role;

revoke all on function public.queue_event_submission_receipt() from public, anon, authenticated;
revoke all on function public.approve_event_submission(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.reject_event_submission(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.reject_event_submission(uuid, text, text) from public, anon, authenticated;
grant execute on function public.approve_event_submission(uuid, text, boolean) to service_role;
grant execute on function public.reject_event_submission(uuid, text, text, text, text) to service_role;
grant execute on function public.reject_event_submission(uuid, text, text) to service_role;

comment on table public.event_submission_email_deliveries is
  'Durable receipt and moderation-decision email outbox for community event submissions.';
comment on column public.event_submissions.organizer_message is
  'Optional rejection explanation sent to the submitting organizer.';
comment on column public.event_submissions.internal_note is
  'Private organizer-only moderation note that is never copied into email or audit metadata.';

commit;
