begin;

alter table public.event_submissions add column reviewed_via text;
alter table public.event_submissions add constraint event_submissions_reviewed_via_valid check (reviewed_via is null or reviewed_via in ('slack_ems', 'slack_only'));

create function public.clear_event_submission_reviewed_via()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
    new.reviewed_via := null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_event_submission_reviewed_via() from public, anon, authenticated;
grant execute on function public.clear_event_submission_reviewed_via() to service_role;
create trigger clear_event_submission_reviewed_via
before update of reviewed_by, reviewed_at on public.event_submissions
for each row execute function public.clear_event_submission_reviewed_via();

create table public.event_submission_slack_cards (
  submission_id uuid primary key references public.event_submissions(id) on delete cascade,
  channel_id text not null,
  message_ts text not null,
  payload jsonb not null,
  delivered_status text not null default 'pending',
  sync_token uuid,
  sync_until timestamptz,
  sync_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_submission_slack_card_status check (delivered_status in ('pending', 'approved', 'rejected', 'withdrawn')),
  constraint event_submission_slack_card_reference unique (channel_id, message_ts)
);

alter table public.event_submission_slack_cards enable row level security;
revoke all on public.event_submission_slack_cards from public, anon, authenticated;
grant select, insert, update, delete on public.event_submission_slack_cards to service_role;

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

  if p_approve then
    submission := public.approve_event_submission(p_submission_id, p_reviewed_by, true);
  else
    submission := public.reject_event_submission(p_submission_id, p_reviewed_by, p_category, p_organizer_message, p_internal_note);
  end if;
  update public.event_submissions set reviewed_via = p_reviewed_via where id = p_submission_id returning * into submission;
  insert into public.admin_audit_log (actor_email, actor_role, action, target_type, target_id, metadata, created_at)
  values (lower(trim(p_reviewed_by)), actor_role,
    case when p_approve then 'event_submission.approve_and_publish' else 'event_submission.reject' end,
    'event_submission', p_submission_id::text,
    jsonb_build_object('source', p_reviewed_via, 'slack_team_id', p_team_id, 'slack_channel_id', p_channel_id,
      'slack_user_id', p_slack_user_id, 'reviewed_at', submission.reviewed_at,
      'category', case when p_approve then null else p_category end,
      'organizer_message_provided', coalesce(length(trim(p_organizer_message)) > 0, false),
      'internal_note_provided', coalesce(length(trim(p_internal_note)) > 0, false)), submission.reviewed_at);
  return submission;
end;
$$;

revoke all on function public.slack_decide_event_submission(uuid, text, boolean, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.slack_decide_event_submission(uuid, text, boolean, text, text, text, text, text, text, text) to service_role;

create or replace function public.claim_event_submission_slack_card(p_submission_id uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.event_submission_slack_cards set sync_token = p_token, sync_until = now() + interval '30 seconds', sync_attempted_at = now()
  where submission_id = p_submission_id and (sync_until is null or sync_until < now());
  return found;
end;
$$;
revoke all on function public.claim_event_submission_slack_card(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_event_submission_slack_card(uuid, uuid) to service_role;

create or replace function public.pending_event_submission_slack_card_sync(p_channel_id text)
returns table (submission_id uuid)
language sql security definer set search_path = public
as $$
  select c.submission_id from public.event_submission_slack_cards c
  join public.event_submissions s on s.id = c.submission_id
  where c.channel_id = p_channel_id and c.delivered_status <> s.review_status::text
    and (c.sync_until is null or c.sync_until < now())
  order by c.sync_attempted_at asc nulls first, c.created_at asc limit 5;
$$;
revoke all on function public.pending_event_submission_slack_card_sync(text) from public, anon, authenticated;
grant execute on function public.pending_event_submission_slack_card_sync(text) to service_role;

commit;
