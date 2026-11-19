begin;

-- Only trusted service-role code may insert a test marker. It cannot be changed.
alter table public.event_submissions add column is_test boolean not null default false;
alter table public.event_submissions drop constraint event_submissions_review_consistent;
alter table public.event_submissions add constraint event_submissions_review_consistent check (
  (review_status = 'pending' and reviewed_by is null and reviewed_at is null and approved_event_id is null)
  or (review_status = 'approved' and reviewed_by is not null and reviewed_at is not null and ((is_test and approved_event_id is null) or (not is_test and approved_event_id is not null)))
  or (review_status = 'rejected' and reviewed_by is not null and reviewed_at is not null and approved_event_id is null)
);

create function public.guard_test_event_submission() returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_test is distinct from old.is_test then raise exception 'event_submission_test_marker_immutable'; end if;
  if old.is_test and (new.review_status is distinct from old.review_status or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at)
    and current_setting('app.test_submission_decision', true) is distinct from old.id::text then
    raise exception 'test_submission_requires_slack_review';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_test_event_submission() from public, anon, authenticated;
create trigger guard_test_event_submission before update on public.event_submissions for each row execute function public.guard_test_event_submission();

create function public.block_test_submission_event() returns trigger language plpgsql set search_path = public as $$
begin
  if new.source_submission_id is not null and exists (select 1 from public.event_submissions where id = new.source_submission_id and is_test) then
    raise exception 'test_submission_cannot_create_event';
  end if;
  return new;
end;
$$;
revoke all on function public.block_test_submission_event() from public, anon, authenticated;
create trigger block_test_submission_event before insert or update of source_submission_id on public.community_events for each row execute function public.block_test_submission_event();

create function public.block_test_submission_email() returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.event_submissions where id = new.submission_id and is_test) then
    raise exception 'test_submission_cannot_send_email';
  end if;
  return new;
end;
$$;
revoke all on function public.block_test_submission_email() from public, anon, authenticated;
create trigger block_test_submission_email before insert or update on public.event_submission_email_deliveries for each row execute function public.block_test_submission_email();

create or replace function public.slack_decide_event_submission(
  p_submission_id uuid,
  p_reviewed_by text,
  p_approve boolean,
  p_category text,
  p_organizer_message text,
  p_internal_note text,
  p_team_id text,
  p_channel_id text,
  p_slack_user_id text,
  p_reviewed_via text
)
returns public.event_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  submission public.event_submissions;
  actor_role public.admin_role;
begin
  select * into submission from public.event_submissions where id = p_submission_id for update;
  if not found then raise exception 'event_submission_not_found'; end if;
  if submission.review_status <> 'pending' then raise exception 'event_submission_not_pending'; end if;

  if p_reviewed_via = 'slack_ems' then
    select m.role into actor_role from public.event_submission_slack_identities i
    join public.admin_memberships m on m.id = i.membership_id
    where i.team_id = p_team_id and i.slack_user_id = p_slack_user_id
      and m.email = lower(trim(p_reviewed_by)) and m.status = 'active' and m.role in ('owner', 'organizer')
    for share of m;
    if not found then raise exception 'slack_reviewer_not_authorized'; end if;
  elsif p_reviewed_via = 'slack_only' then
    if exists (select 1 from public.event_submission_slack_identities where team_id = p_team_id and slack_user_id = p_slack_user_id)
      or exists (select 1 from public.admin_memberships where email = lower(trim(p_reviewed_by)))
      or not exists (select 1 from public.event_submission_slack_grants where team_id = p_team_id and channel_id = p_channel_id and slack_user_id = p_slack_user_id)
    then raise exception 'slack_reviewer_not_authorized'; end if;
  else
    raise exception 'slack_reviewer_not_authorized';
  end if;

  if submission.is_test then
    if not p_approve and (nullif(trim(p_category), '') is null or trim(p_category) not in ('calendar_fit', 'insufficient_information', 'duplicate', 'event_passed', 'other')) then
      raise exception 'event_submission_invalid_rejection_category';
    end if;
    perform set_config('app.test_submission_decision', p_submission_id::text, true);
    update public.event_submissions set
      review_status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = lower(trim(p_reviewed_by)), reviewed_at = now(),
      rejection_category = case when p_approve then null else trim(p_category) end,
      organizer_message = case when p_approve then null else nullif(trim(p_organizer_message), '') end,
      internal_note = case when p_approve then null else nullif(trim(p_internal_note), '') end
      where id = p_submission_id returning * into submission;
    perform set_config('app.test_submission_decision', '', true);
  elsif p_approve then
    submission := public.approve_event_submission(p_submission_id, p_reviewed_by, true);
  else
    submission := public.reject_event_submission(p_submission_id, p_reviewed_by, p_category, p_organizer_message, p_internal_note);
  end if;
  update public.event_submissions set reviewed_via = p_reviewed_via where id = p_submission_id returning * into submission;
  insert into public.admin_audit_log (actor_email, actor_role, action, target_type, target_id, metadata, created_at)
  values (lower(trim(p_reviewed_by)), actor_role,
    case when submission.is_test then case when p_approve then 'event_submission.test_approve' else 'event_submission.test_reject' end
      when p_approve then 'event_submission.approve_and_publish' else 'event_submission.reject' end,
    'event_submission', p_submission_id::text,
    jsonb_build_object('is_test', submission.is_test, 'source', p_reviewed_via, 'slack_team_id', p_team_id, 'slack_channel_id', p_channel_id,
      'slack_user_id', p_slack_user_id, 'reviewed_at', submission.reviewed_at,
      'category', case when p_approve then null else p_category end,
      'organizer_message_provided', coalesce(length(trim(p_organizer_message)) > 0, false),
      'internal_note_provided', coalesce(length(trim(p_internal_note)) > 0, false)), submission.reviewed_at);
  return submission;
end;
$$;

revoke all on function public.slack_decide_event_submission(uuid, text, boolean, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.slack_decide_event_submission(uuid, text, boolean, text, text, text, text, text, text, text) to service_role;

commit;
