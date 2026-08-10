-- Restore approval and rejection after amendment deliveries split the outbox
-- uniqueness rule into root and amendment-specific partial indexes.

begin;

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
      ) on conflict (submission_id, kind) where amendment_id is null do nothing;
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
    ) on conflict (submission_id, kind) where amendment_id is null do nothing;
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
    ) on conflict (submission_id, kind) where amendment_id is null do nothing;
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
  ) on conflict (submission_id, kind) where amendment_id is null do nothing;

  return submission;
end;
$$;

revoke all on function public.approve_event_submission(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.reject_event_submission(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.approve_event_submission(uuid, text, boolean) to service_role;
grant execute on function public.reject_event_submission(uuid, text, text, text, text) to service_role;

commit;
