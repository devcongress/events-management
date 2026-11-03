create or replace function public.annual_conference_speaker_badge_storage_usage(p_edition_id uuid)
returns table(speaker_photo_count bigint, speaker_photo_bytes bigint, shared_bucket_bytes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with bucket_objects as (
    select name,
      case when metadata->>'size' ~ '^[0-9]{1,18}$'
        then (metadata->>'size')::bigint else null end as bytes
    from storage.objects
    where bucket_id = 'annual-conference-social-cards'
  ),
  active_photos as (
    select object.bytes
    from public.annual_conference_social_cards card
    join public.annual_conference_sessions session
      on session.id = card.session_id and session.edition_id = card.edition_id and session.status = 'confirmed'
    join public.annual_conference_speaker_submissions submission
      on submission.id = session.speaker_submission_id and submission.edition_id = card.edition_id
      and submission.status = 'selected' and submission.selected_session_id = session.id
    join bucket_objects object on object.name = card.photo_path
    where card.edition_id = p_edition_id and card.subject_type = 'speaker' and card.revoked_at is null
  )
  select
    (select count(*) from active_photos),
    (select case when count(*) filter (where bytes is null) > 0 then null else coalesce(sum(bytes), 0)::bigint end from active_photos),
    (select case when count(*) filter (where bytes is null) > 0 then null else coalesce(sum(bytes), 0)::bigint end from bucket_objects);
$$;

revoke all on function public.annual_conference_speaker_badge_storage_usage(uuid) from public, anon, authenticated;
grant execute on function public.annual_conference_speaker_badge_storage_usage(uuid) to service_role;
