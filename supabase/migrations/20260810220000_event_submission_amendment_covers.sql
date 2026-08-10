-- Community organizers can propose a replacement cover through their signed
-- management link. The cover stays on the amendment until an organizer
-- approves the complete change request.

begin;

alter table public.event_submission_amendments
  add column if not exists cover_url text;

alter table public.event_submission_amendments
  drop constraint if exists event_submission_amendments_cover_url_not_blank;

alter table public.event_submission_amendments
  add constraint event_submission_amendments_cover_url_not_blank
  check (cover_url is null or length(trim(cover_url)) > 0);

create or replace function public.review_event_submission_amendment(
  p_amendment_id uuid, p_reviewed_by text, p_approve boolean, p_message text
)
returns public.event_submission_amendments language plpgsql security definer set search_path = public as $$
declare amendment public.event_submission_amendments; submission public.event_submissions; event_end_at timestamptz;
begin
  select * into amendment from public.event_submission_amendments where id = p_amendment_id for update;
  if not found then raise exception 'event_submission_amendment_not_found'; end if;
  if amendment.status <> 'submitted' then raise exception 'event_submission_amendment_not_pending'; end if;
  select * into submission from public.event_submissions where id = amendment.submission_id for update;
  if submission.review_status <> 'approved' or submission.approved_event_id is null then raise exception 'event_submission_not_approved'; end if;
  select ends_at into event_end_at from public.community_events where id = submission.approved_event_id for update;
  if not found then raise exception 'event_submission_not_approved'; end if;
  if p_approve then
    if event_end_at <= now() then raise exception 'event_submission_management_window_closed'; end if;
    if amendment.ends_at <= now() then raise exception 'event_submission_amendment_ends_in_past'; end if;
    update public.community_events set starts_at = amendment.starts_at, ends_at = amendment.ends_at,
      location_type = amendment.location_type, location_name = amendment.venue_name,
      venue_name = amendment.venue_name, venue_address = amendment.venue_address,
      location_label = coalesce(amendment.venue_address, amendment.venue_name, case when amendment.location_type = 'online' then 'Online' else location_label end),
      online_url = amendment.online_url, stream_url = amendment.online_url,
      registration_url = amendment.registration_url, external_url = coalesce(amendment.registration_url, amendment.online_url),
      cover_url = coalesce(nullif(trim(amendment.cover_url), ''), cover_url), updated_at = now()
    where id = submission.approved_event_id;
    update public.event_submission_management_links
    set expires_at = amendment.ends_at
    where submission_id = submission.id and revoked_at is null;
  end if;
  update public.event_submission_amendments set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = lower(trim(p_reviewed_by)), reviewed_at = now(), decision_message = nullif(trim(p_message), '')
  where id = amendment.id returning * into amendment;
  insert into public.event_submission_email_deliveries (submission_id, amendment_id, kind, idempotency_key)
  values (submission.id, amendment.id, case when p_approve then 'amendment_approved' else 'amendment_rejected' end,
    'event-submission-' || submission.id::text || '-amendment-' || amendment.id::text || case when p_approve then '-approved' else '-rejected' end)
  on conflict do nothing;
  return amendment;
end;
$$;

revoke all on function public.review_event_submission_amendment(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.review_event_submission_amendment(uuid, text, boolean, text) to service_role;

commit;
