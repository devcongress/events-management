-- Amendment proposals store venue-specific input, while canonical community
-- events expose location_name/location_label instead of venue_name. Keep the
-- review transaction aligned with the canonical table and ensure every
-- location type produces a non-blank location_name.

begin;

create or replace function public.review_event_submission_amendment(
  p_amendment_id uuid,
  p_reviewed_by text,
  p_approve boolean,
  p_message text
)
returns public.event_submission_amendments
language plpgsql
security definer
set search_path = public
as $$
declare
  amendment public.event_submission_amendments;
  submission public.event_submissions;
  current_event public.community_events;
  next_location_name text;
  next_location_label text;
begin
  select *
  into amendment
  from public.event_submission_amendments
  where id = p_amendment_id
  for update;

  if not found then
    raise exception 'event_submission_amendment_not_found';
  end if;

  if amendment.status <> 'submitted' then
    raise exception 'event_submission_amendment_not_pending';
  end if;

  select *
  into submission
  from public.event_submissions
  where id = amendment.submission_id
  for update;

  if submission.review_status <> 'approved' or submission.approved_event_id is null then
    raise exception 'event_submission_not_approved';
  end if;

  select *
  into current_event
  from public.community_events
  where id = submission.approved_event_id
  for update;

  if not found then
    raise exception 'event_submission_not_approved';
  end if;

  if p_approve then
    if current_event.ends_at <= now() then
      raise exception 'event_submission_management_window_closed';
    end if;

    if amendment.ends_at <= now() then
      raise exception 'event_submission_amendment_ends_in_past';
    end if;

    next_location_name := case
      when amendment.location_type = 'online' then 'Online'
      else coalesce(
        nullif(trim(amendment.venue_name), ''),
        nullif(trim(current_event.location_name), ''),
        'Venue to be announced'
      )
    end;

    next_location_label := case
      when amendment.location_type = 'online' then 'Online'
      else coalesce(
        nullif(trim(amendment.venue_address), ''),
        nullif(trim(amendment.venue_name), ''),
        nullif(trim(current_event.location_label), ''),
        next_location_name
      )
    end;

    update public.community_events
    set
      starts_at = amendment.starts_at,
      ends_at = amendment.ends_at,
      location_type = amendment.location_type,
      location_name = next_location_name,
      location_label = next_location_label,
      venue_address = amendment.venue_address,
      online_url = amendment.online_url,
      stream_url = amendment.online_url,
      registration_url = amendment.registration_url,
      external_url = coalesce(amendment.registration_url, amendment.online_url),
      cover_url = coalesce(nullif(trim(amendment.cover_url), ''), current_event.cover_url),
      updated_at = now()
    where id = submission.approved_event_id;

    update public.event_submission_management_links
    set expires_at = amendment.ends_at
    where submission_id = submission.id
      and revoked_at is null;
  end if;

  update public.event_submission_amendments
  set
    status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = lower(trim(p_reviewed_by)),
    reviewed_at = now(),
    decision_message = nullif(trim(p_message), '')
  where id = amendment.id
  returning * into amendment;

  insert into public.event_submission_email_deliveries (
    submission_id,
    amendment_id,
    kind,
    idempotency_key
  ) values (
    submission.id,
    amendment.id,
    case when p_approve then 'amendment_approved' else 'amendment_rejected' end,
    'event-submission-' || submission.id::text || '-amendment-' || amendment.id::text ||
      case when p_approve then '-approved' else '-rejected' end
  )
  on conflict do nothing;

  return amendment;
end;
$$;

revoke all on function public.review_event_submission_amendment(uuid, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.review_event_submission_amendment(uuid, text, boolean, text)
  to service_role;

commit;
