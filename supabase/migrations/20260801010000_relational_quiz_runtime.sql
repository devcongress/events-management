create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  join_code text not null,
  status text not null default 'draft',
  current_question_index integer not null default -1,
  question_phase text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  question_started_at timestamptz,
  phase_started_at timestamptz,
  expires_at timestamptz,
  released_question_ids uuid[] not null default '{}',
  purpose text not null default 'quiz',
  constraint quiz_sessions_join_code_format check (join_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  constraint quiz_sessions_status_valid check (status in ('draft', 'waiting', 'active', 'finished')),
  constraint quiz_sessions_phase_valid check (question_phase is null or question_phase in ('answering', 'revealing', 'scoreboard')),
  constraint quiz_sessions_purpose_valid check (purpose in ('quiz', 'system_design_learning')),
  constraint quiz_sessions_join_code_unique unique (join_code)
);

create index if not exists quiz_sessions_event_created_idx
  on public.quiz_sessions (event_id, created_at desc);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  question_text text not null,
  options text[] not null,
  correct_index integer not null,
  time_limit_seconds integer not null default 20,
  points integer not null default 1000,
  order_index integer not null,
  created_at timestamptz not null default now(),
  explanation text,
  source_url text,
  constraint quiz_questions_text_present check (char_length(btrim(question_text)) > 0),
  constraint quiz_questions_four_options check (cardinality(options) = 4),
  constraint quiz_questions_options_present check (
    array_position(options, null) is null
    and array_position(options, '') is null
  ),
  constraint quiz_questions_correct_index_valid check (correct_index between 0 and 3),
  constraint quiz_questions_time_limit_valid check (time_limit_seconds between 5 and 300),
  constraint quiz_questions_points_nonnegative check (points >= 0),
  constraint quiz_questions_order_nonnegative check (order_index >= 0),
  constraint quiz_questions_session_order_unique unique (quiz_session_id, order_index)
);

create index if not exists quiz_questions_session_order_idx
  on public.quiz_questions (quiz_session_id, order_index);

create table if not exists public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  user_id uuid not null,
  answer_index integer,
  answered_at timestamptz,
  time_taken_ms integer,
  points_awarded integer not null default 0,
  is_correct boolean,
  created_at timestamptz not null default now(),
  constraint quiz_responses_answer_index_valid check (answer_index is null or answer_index between 0 and 3),
  constraint quiz_responses_time_nonnegative check (time_taken_ms is null or time_taken_ms >= 0),
  constraint quiz_responses_points_nonnegative check (points_awarded >= 0),
  constraint quiz_responses_question_user_unique unique (question_id, user_id)
);

create index if not exists quiz_responses_question_created_idx
  on public.quiz_responses (question_id, created_at);

create index if not exists quiz_responses_user_created_idx
  on public.quiz_responses (user_id, created_at desc);

alter table public.quiz_sessions enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_responses enable row level security;

revoke all on table public.quiz_sessions, public.quiz_questions, public.quiz_responses
  from public, anon, authenticated;
grant select, insert, update, delete on table public.quiz_sessions, public.quiz_questions, public.quiz_responses
  to service_role;

-- Backfill the compatibility documents without deleting them. Hosted code
-- switches to these tables only after this migration has completed.
with session_source as (
  select distinct on (session_item->>'id')
    (session_item->>'id')::uuid as id,
    (session_item->>'event_id')::uuid as event_id,
    upper(session_item->>'join_code') as join_code,
    coalesce(nullif(session_item->>'status', ''), 'draft') as status,
    coalesce((session_item->>'current_question_index')::integer, -1) as current_question_index,
    nullif(session_item->>'question_phase', '') as question_phase,
    nullif(session_item->>'started_at', '')::timestamptz as started_at,
    nullif(session_item->>'finished_at', '')::timestamptz as finished_at,
    coalesce(nullif(session_item->>'created_at', '')::timestamptz, now()) as created_at,
    nullif(session_item->>'question_started_at', '')::timestamptz as question_started_at,
    nullif(session_item->>'phase_started_at', '')::timestamptz as phase_started_at,
    nullif(session_item->>'expires_at', '')::timestamptz as expires_at,
    coalesce((
      select array_agg(value::uuid)
      from jsonb_array_elements_text(coalesce(session_item->'released_question_ids', '[]'::jsonb)) value
      where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ), '{}'::uuid[]) as released_question_ids,
    case when session_item->>'purpose' = 'system_design_learning' then 'system_design_learning' else 'quiz' end as purpose
  from public.app_json_documents document
  cross join lateral jsonb_array_elements(document.data) session_item
  join public.community_events event on event.id::text = session_item->>'event_id'
  where document.key = 'quiz-sessions'
    and session_item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and session_item->>'join_code' ~ '^[A-HJ-NP-Z2-9]{6}$'
  order by session_item->>'id', coalesce(nullif(session_item->>'created_at', '')::timestamptz, now()) desc
)
insert into public.quiz_sessions (
  id, event_id, join_code, status, current_question_index, question_phase,
  started_at, finished_at, created_at, question_started_at, phase_started_at,
  expires_at, released_question_ids, purpose
)
select
  id, event_id, join_code, status, current_question_index, question_phase,
  started_at, finished_at, created_at, question_started_at, phase_started_at,
  expires_at, released_question_ids, purpose
from session_source
on conflict do nothing;

with question_source as (
  select distinct on (question_item->>'id')
    (question_item->>'id')::uuid as id,
    (question_item->>'quiz_session_id')::uuid as quiz_session_id,
    question_item->>'question_text' as question_text,
    array(select jsonb_array_elements_text(question_item->'options')) as options,
    (question_item->>'correct_index')::integer as correct_index,
    coalesce((question_item->>'time_limit_seconds')::integer, 20) as time_limit_seconds,
    coalesce((question_item->>'points')::integer, 1000) as points,
    (question_item->>'order_index')::integer as order_index,
    coalesce(nullif(question_item->>'created_at', '')::timestamptz, now()) as created_at,
    nullif(question_item->>'explanation', '') as explanation,
    nullif(question_item->>'source_url', '') as source_url
  from public.app_json_documents document
  cross join lateral jsonb_array_elements(document.data) question_item
  join public.quiz_sessions session on session.id::text = question_item->>'quiz_session_id'
  where document.key = 'questions'
    and question_item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and jsonb_typeof(question_item->'options') = 'array'
    and jsonb_array_length(question_item->'options') = 4
  order by question_item->>'id', coalesce(nullif(question_item->>'created_at', '')::timestamptz, now()) desc
)
insert into public.quiz_questions (
  id, quiz_session_id, question_text, options, correct_index,
  time_limit_seconds, points, order_index, created_at, explanation, source_url
)
select
  id, quiz_session_id, question_text, options, correct_index,
  time_limit_seconds, points, order_index, created_at, explanation, source_url
from question_source
on conflict do nothing;

with response_source as (
  select distinct on (response_item->>'question_id', response_item->>'user_id')
    (response_item->>'id')::uuid as id,
    (response_item->>'question_id')::uuid as question_id,
    (response_item->>'user_id')::uuid as user_id,
    nullif(response_item->>'answer_index', '')::integer as answer_index,
    nullif(response_item->>'answered_at', '')::timestamptz as answered_at,
    nullif(response_item->>'time_taken_ms', '')::integer as time_taken_ms,
    greatest(coalesce((response_item->>'points_awarded')::integer, 0), 0) as points_awarded,
    nullif(response_item->>'is_correct', '')::boolean as is_correct,
    coalesce(nullif(response_item->>'created_at', '')::timestamptz, now()) as created_at
  from public.app_json_documents document
  cross join lateral jsonb_array_elements(document.data) response_item
  join public.quiz_questions question on question.id::text = response_item->>'question_id'
  where document.key = 'responses'
    and response_item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and response_item->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  order by
    response_item->>'question_id',
    response_item->>'user_id',
    coalesce(nullif(response_item->>'created_at', '')::timestamptz, now())
)
insert into public.quiz_responses (
  id, question_id, user_id, answer_index, answered_at, time_taken_ms,
  points_awarded, is_correct, created_at
)
select
  id, question_id, user_id, answer_index, answered_at, time_taken_ms,
  points_awarded, is_correct, created_at
from response_source
on conflict do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quiz_participants_session_fkey'
      and conrelid = 'public.quiz_participants'::regclass
  ) then
    alter table public.quiz_participants
      add constraint quiz_participants_session_fkey
      foreign key (quiz_session_id) references public.quiz_sessions(id) on delete cascade not valid;
  end if;
end $$;

create or replace function public.submit_quiz_answer(
  p_session_id uuid,
  p_user_id uuid,
  p_answer_index integer
)
returns table (
  accepted boolean,
  is_correct boolean,
  points_awarded integer,
  correct_index integer,
  streak_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_session public.quiz_sessions%rowtype;
  selected_question public.quiz_questions%rowtype;
  selected_participant public.quiz_participants%rowtype;
  submitted_at timestamptz := clock_timestamp();
  elapsed_ms integer;
  limit_ms integer;
  next_streak integer;
  base_score integer;
  streak_bonus integer;
begin
  if p_answer_index not between 0 and 3 then
    raise exception using errcode = '22023', message = 'answer_index_invalid';
  end if;

  select * into selected_session
  from public.quiz_sessions
  where id = p_session_id
  for update;

  if not found or selected_session.status <> 'active' or selected_session.question_phase <> 'answering' then
    raise exception using errcode = 'P0001', message = 'quiz_not_accepting_answers';
  end if;

  select * into selected_question
  from public.quiz_questions
  where quiz_session_id = p_session_id
    and order_index = selected_session.current_question_index;

  if not found or selected_session.question_started_at is null then
    raise exception using errcode = 'P0001', message = 'active_question_missing';
  end if;

  select * into selected_participant
  from public.quiz_participants
  where quiz_session_id = p_session_id and user_id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'participant_not_found';
  end if;

  elapsed_ms := greatest(0, floor(extract(epoch from (submitted_at - selected_session.question_started_at)) * 1000)::integer);
  limit_ms := selected_question.time_limit_seconds * 1000;
  if elapsed_ms > limit_ms + 2000 then
    raise exception using errcode = 'P0001', message = 'answer_too_late';
  end if;

  is_correct := p_answer_index = selected_question.correct_index;
  next_streak := case when is_correct then selected_participant.current_streak + 1 else 0 end;
  base_score := case when is_correct then round(
    selected_question.points * (
      0.5 + 0.5 * greatest(0, limit_ms - elapsed_ms)::numeric / limit_ms
    )
  )::integer else 0 end;
  streak_bonus := case
    when not is_correct or next_streak < 2 then 0
    when next_streak = 2 then 100
    when next_streak = 3 then 200
    when next_streak = 4 then 300
    else 500
  end;
  points_awarded := base_score + streak_bonus;
  correct_index := selected_question.correct_index;
  streak_count := next_streak;
  accepted := true;

  insert into public.quiz_responses (
    question_id, user_id, answer_index, answered_at, time_taken_ms,
    points_awarded, is_correct
  ) values (
    selected_question.id, p_user_id, p_answer_index, submitted_at, elapsed_ms,
    points_awarded, is_correct
  );

  update public.quiz_participants
  set
    total_score = total_score + points_awarded,
    current_streak = next_streak
  where id = selected_participant.id;

  return next;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'answer_already_submitted';
end;
$$;

create or replace function public.prepare_system_design_presentation(p_session_id uuid)
returns public.quiz_sessions
language plpgsql
security definer
set search_path = public
as $$
declare selected_session public.quiz_sessions%rowtype;
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning' then
    raise exception using errcode = 'P0001', message = 'system_design_session_not_found';
  end if;

  delete from public.quiz_responses response
  using public.quiz_questions question
  where question.quiz_session_id = p_session_id and response.question_id = question.id;
  delete from public.quiz_participants where quiz_session_id = p_session_id;

  update public.quiz_sessions
  set
    status = 'waiting', current_question_index = -1, question_phase = null,
    started_at = null, finished_at = null, question_started_at = null,
    phase_started_at = null, expires_at = null, released_question_ids = '{}'
  where id = p_session_id
  returning * into selected_session;
  return selected_session;
end;
$$;

create or replace function public.release_system_design_question(p_session_id uuid)
returns public.quiz_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_session public.quiz_sessions%rowtype;
  selected_question public.quiz_questions%rowtype;
  transition_at timestamptz := clock_timestamp();
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning' then
    raise exception using errcode = 'P0001', message = 'system_design_session_not_found';
  end if;
  if selected_session.status = 'finished' then
    raise exception using errcode = 'P0001', message = 'session_finished';
  end if;

  select * into selected_question
  from public.quiz_questions
  where quiz_session_id = p_session_id
    and not (id = any(selected_session.released_question_ids))
  order by order_index
  limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'all_questions_released';
  end if;

  update public.quiz_sessions
  set
    status = 'active',
    current_question_index = selected_question.order_index,
    question_phase = 'answering',
    question_started_at = transition_at,
    phase_started_at = transition_at,
    started_at = coalesce(started_at, transition_at),
    released_question_ids = array_append(released_question_ids, selected_question.id)
  where id = p_session_id
  returning * into selected_session;
  return selected_session;
end;
$$;

create or replace function public.reveal_system_design_question(p_session_id uuid)
returns public.quiz_sessions
language plpgsql
security definer
set search_path = public
as $$
declare selected_session public.quiz_sessions%rowtype;
begin
  update public.quiz_sessions
  set question_phase = 'revealing', phase_started_at = clock_timestamp()
  where id = p_session_id
    and purpose = 'system_design_learning'
    and status = 'active'
    and question_phase = 'answering'
  returning * into selected_session;
  if not found then
    raise exception using errcode = 'P0001', message = 'question_not_ready_to_reveal';
  end if;
  return selected_session;
end;
$$;

create or replace function public.get_quiz_state_analytics(
  p_session_id uuid,
  p_user_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_session as (
    select * from public.quiz_sessions where id = p_session_id
  ),
  current_question as (
    select question.*
    from public.quiz_questions question
    join selected_session session
      on question.quiz_session_id = session.id
     and question.order_index = session.current_question_index
  ),
  current_responses as (
    select response.*
    from public.quiz_responses response
    join current_question question on question.id = response.question_id
  ),
  ranked as (
    select
      participant.id,
      participant.user_id,
      participant.nickname_used,
      participant.total_score,
      participant.current_streak,
      row_number() over (order by participant.total_score desc, participant.joined_at, participant.id) as rank
    from public.quiz_participants participant
    where participant.quiz_session_id = p_session_id
  )
  select jsonb_build_object(
    'participants_count', (select count(*) from ranked),
    'answers_count', (select count(*) from current_responses),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', user_id,
        'nickname', nickname_used,
        'total_score', total_score,
        'streak_count', current_streak,
        'rank', rank,
        'avatar_seed', id
      ) order by rank)
      from ranked
    ), '[]'::jsonb),
    'answer_distribution', (
      select jsonb_agg(jsonb_build_object(
        'option_index', option_index,
        'count', answer_count,
        'percentage', case when total_count = 0 then 0 else round(answer_count * 100.0 / total_count)::integer end
      ) order by option_index)
      from (
        select
          option_index,
          count(response.answer_index)::integer as answer_count,
          (select count(*) from current_responses)::integer as total_count
        from generate_series(0, 3) option_index
        left join current_responses response on response.answer_index = option_index
        group by option_index
      ) distribution
    ),
    'player_response', (
      select to_jsonb(response)
      from current_responses response
      where response.user_id = p_user_id
      limit 1
    )
  );
$$;

create or replace function public.reorder_quiz_questions(
  p_session_id uuid,
  p_question_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_count integer;
  requested_count integer;
begin
  perform 1 from public.quiz_questions where quiz_session_id = p_session_id for update;
  select count(*) into stored_count from public.quiz_questions where quiz_session_id = p_session_id;
  select count(distinct id) into requested_count from unnest(p_question_ids) id;
  if stored_count <> cardinality(p_question_ids)
    or requested_count <> cardinality(p_question_ids)
    or exists (
      select 1 from unnest(p_question_ids) id
      where not exists (
        select 1 from public.quiz_questions question
        where question.id = id and question.quiz_session_id = p_session_id
      )
    ) then
    raise exception using errcode = '22023', message = 'question_order_must_include_session_questions_once';
  end if;

  update public.quiz_questions
  set order_index = order_index + 10000
  where quiz_session_id = p_session_id;

  update public.quiz_questions question
  set order_index = requested.ordinality - 1
  from unnest(p_question_ids) with ordinality requested(id, ordinality)
  where question.id = requested.id and question.quiz_session_id = p_session_id;
end;
$$;

create or replace function public.advance_quiz_session_state(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_session public.quiz_sessions%rowtype;
  selected_question public.quiz_questions%rowtype;
  participant_count integer;
  response_count integer;
  transition_at timestamptz := clock_timestamp();
  did_advance boolean := false;
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found then return null; end if;
  if selected_session.purpose = 'system_design_learning'
    or selected_session.status <> 'active'
    or selected_session.question_phase <> 'answering' then
    return jsonb_build_object('advanced', false, 'session', to_jsonb(selected_session));
  end if;

  select * into selected_question
  from public.quiz_questions
  where quiz_session_id = p_session_id and order_index = selected_session.current_question_index;
  if not found or selected_session.question_started_at is null then
    return jsonb_build_object('advanced', false, 'session', to_jsonb(selected_session));
  end if;

  select count(*) into participant_count
  from public.quiz_participants where quiz_session_id = p_session_id;
  select count(*) into response_count
  from public.quiz_responses where question_id = selected_question.id;

  if transition_at >= selected_session.question_started_at + make_interval(secs => selected_question.time_limit_seconds)
    or (participant_count > 0 and response_count >= participant_count) then
    update public.quiz_sessions
    set question_phase = 'revealing', phase_started_at = transition_at
    where id = p_session_id
    returning * into selected_session;
    did_advance := true;
  end if;

  return jsonb_build_object('advanced', did_advance, 'session', to_jsonb(selected_session));
end;
$$;

revoke all on function public.submit_quiz_answer(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.prepare_system_design_presentation(uuid) from public, anon, authenticated;
revoke all on function public.release_system_design_question(uuid) from public, anon, authenticated;
revoke all on function public.reveal_system_design_question(uuid) from public, anon, authenticated;
revoke all on function public.get_quiz_state_analytics(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reorder_quiz_questions(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.advance_quiz_session_state(uuid) from public, anon, authenticated;
grant execute on function public.submit_quiz_answer(uuid, uuid, integer) to service_role;
grant execute on function public.prepare_system_design_presentation(uuid) to service_role;
grant execute on function public.release_system_design_question(uuid) to service_role;
grant execute on function public.reveal_system_design_question(uuid) to service_role;
grant execute on function public.get_quiz_state_analytics(uuid, uuid) to service_role;
grant execute on function public.reorder_quiz_questions(uuid, uuid[]) to service_role;
grant execute on function public.advance_quiz_session_state(uuid) to service_role;
