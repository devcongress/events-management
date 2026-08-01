create table if not exists public.quiz_participants (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null,
  user_id uuid not null,
  nickname_used text not null,
  enforce_unique_name boolean not null default false,
  nickname_key text generated always as (
    case when enforce_unique_name then lower(nickname_used) else null end
  ) stored,
  total_score integer not null default 0,
  current_streak integer not null default 0,
  joined_at timestamptz not null default now(),
  constraint quiz_participants_nickname_length check (char_length(nickname_used) between 1 and 24),
  constraint quiz_participants_total_score_nonnegative check (total_score >= 0),
  constraint quiz_participants_current_streak_nonnegative check (current_streak >= 0),
  constraint quiz_participants_session_user_unique unique (quiz_session_id, user_id)
);

create index if not exists quiz_participants_session_joined_idx
  on public.quiz_participants (quiz_session_id, joined_at);

alter table public.quiz_participants enable row level security;
revoke all on table public.quiz_participants from public, anon, authenticated;
grant select, insert, update, delete on table public.quiz_participants to service_role;

-- Backfill the compatibility document without deleting it, so the migration is
-- rollback-safe while the application switches its participant repository.
with session_purposes as (
  select
    session_item->>'id' as id,
    session_item->>'purpose' as purpose
  from public.app_json_documents document
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(document.data) = 'array' then document.data else '[]'::jsonb end
  ) session_item
  where document.key = 'quiz-sessions'
),
participant_source as (
  select distinct on (participant_item->>'quiz_session_id', participant_item->>'user_id')
    (participant_item->>'id')::uuid as id,
    (participant_item->>'quiz_session_id')::uuid as quiz_session_id,
    (participant_item->>'user_id')::uuid as user_id,
    left(participant_item->>'nickname_used', 24) as nickname_used,
    session_purposes.purpose = 'system_design_learning' as enforce_unique_name,
    greatest(coalesce((participant_item->>'total_score')::integer, 0), 0) as total_score,
    greatest(coalesce((participant_item->>'current_streak')::integer, 0), 0) as current_streak,
    coalesce(nullif(participant_item->>'joined_at', '')::timestamptz, now()) as joined_at
  from public.app_json_documents document
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(document.data) = 'array' then document.data else '[]'::jsonb end
  ) participant_item
  left join session_purposes on session_purposes.id = participant_item->>'quiz_session_id'
  where document.key = 'quiz-participants'
    and participant_item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and participant_item->>'quiz_session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and participant_item->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and char_length(coalesce(participant_item->>'nickname_used', '')) between 1 and 24
  order by
    participant_item->>'quiz_session_id',
    participant_item->>'user_id',
    coalesce(nullif(participant_item->>'joined_at', '')::timestamptz, now()),
    participant_item->>'id'
)
insert into public.quiz_participants (
  id,
  quiz_session_id,
  user_id,
  nickname_used,
  enforce_unique_name,
  total_score,
  current_streak,
  joined_at
)
select
  id,
  quiz_session_id,
  user_id,
  nickname_used,
  enforce_unique_name,
  total_score,
  current_streak,
  joined_at
from participant_source
on conflict do nothing;

-- Preserve every historical participant while making any pre-existing
-- duplicate System Design labels unique before adding the database rule.
with ranked_names as (
  select
    id,
    nickname_used,
    row_number() over (
      partition by quiz_session_id, nickname_key
      order by joined_at, id
    ) as duplicate_number
  from public.quiz_participants
  where nickname_key is not null
),
duplicates as (
  select id, nickname_used
  from ranked_names
  where duplicate_number > 1
)
update public.quiz_participants participant
set
  nickname_used = left(duplicates.nickname_used, 15) || ' ' || left(replace(participant.id::text, '-', ''), 8)
from duplicates
where participant.id = duplicates.id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quiz_participants_session_nickname_unique'
      and conrelid = 'public.quiz_participants'::regclass
  ) then
    alter table public.quiz_participants
      add constraint quiz_participants_session_nickname_unique
      unique (quiz_session_id, nickname_key);
  end if;
end $$;

create or replace function public.merge_quiz_participant_users(
  p_target_user_id uuid,
  p_source_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.quiz_participants target
  set
    total_score = target.total_score + source.total_score,
    current_streak = greatest(target.current_streak, source.current_streak)
  from public.quiz_participants source
  where target.user_id = p_target_user_id
    and source.user_id = p_source_user_id
    and target.quiz_session_id = source.quiz_session_id;

  delete from public.quiz_participants source
  where source.user_id = p_source_user_id
    and exists (
      select 1
      from public.quiz_participants target
      where target.user_id = p_target_user_id
        and target.quiz_session_id = source.quiz_session_id
    );

  update public.quiz_participants
  set user_id = p_target_user_id
  where user_id = p_source_user_id;
end;
$$;

revoke all on function public.merge_quiz_participant_users(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_quiz_participant_users(uuid, uuid) to service_role;
