-- System Design learning-room authoring and delivery metadata.  These columns
-- intentionally live on the existing quiz runtime so generic quizzes retain
-- their current behaviour.
alter table public.quiz_sessions
  add column if not exists generated_question_count integer not null default 0,
  add column if not exists skipped_question_ids uuid[] not null default '{}';

alter table public.quiz_sessions
  drop column if exists question_set_locked_at;

alter table public.quiz_sessions
  drop constraint if exists quiz_sessions_generated_question_count_valid;
alter table public.quiz_sessions
  add constraint quiz_sessions_generated_question_count_valid
  check (generated_question_count between 0 and 10);

alter table public.quiz_questions
  add column if not exists authoring_source text not null default 'manual',
  add column if not exists difficulty text not null default 'intermediate',
  add column if not exists category text;

alter table public.quiz_questions
  drop constraint if exists quiz_questions_authoring_source_valid,
  drop constraint if exists quiz_questions_difficulty_valid;
alter table public.quiz_questions
  add constraint quiz_questions_authoring_source_valid check (authoring_source in ('manual', 'generated')),
  add constraint quiz_questions_difficulty_valid check (difficulty in ('foundational', 'intermediate', 'advanced'));

-- Existing source-backed questions came from the old deterministic generator.
update public.quiz_questions
set authoring_source = 'generated'
where source_url is not null and authoring_source = 'manual';

update public.quiz_sessions session
set generated_question_count = least(10, coalesce(counts.count, 0))
from (
  select quiz_session_id, count(*)::integer as count
  from public.quiz_questions
  where authoring_source = 'generated'
  group by quiz_session_id
) counts
where counts.quiz_session_id = session.id
  and session.purpose = 'system_design_learning';

create or replace function public.reserve_system_design_generated_question()
returns trigger language plpgsql security definer set search_path = public as $$
declare session_row public.quiz_sessions%rowtype;
begin
  if new.authoring_source <> 'generated' then return new; end if;
  select * into session_row from public.quiz_sessions where id = new.quiz_session_id for update;
  if not found or session_row.purpose <> 'system_design_learning' then return new; end if;
  if session_row.generated_question_count >= 10 then raise exception using errcode = 'P0001', message = 'system_design_generation_cap_reached'; end if;
  update public.quiz_sessions set generated_question_count = generated_question_count + 1 where id = new.quiz_session_id;
  return new;
end $$;
drop trigger if exists reserve_system_design_generated_question on public.quiz_questions;
create trigger reserve_system_design_generated_question before insert on public.quiz_questions for each row execute function public.reserve_system_design_generated_question();

-- Keep the hosted release transition aligned with the local learning-room
-- runtime: skipped questions are held back until explicitly reopened.
create or replace function public.prepare_system_design_presentation(p_session_id uuid)
returns public.quiz_sessions language plpgsql security definer set search_path = public as $$
declare selected_session public.quiz_sessions%rowtype;
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning' then raise exception 'system_design_session_not_found'; end if;
  delete from public.quiz_responses response using public.quiz_questions question where question.quiz_session_id = p_session_id and response.question_id = question.id;
  delete from public.quiz_participants where quiz_session_id = p_session_id;
  update public.quiz_sessions set status = 'waiting', current_question_index = -1, question_phase = null, started_at = null, finished_at = null, question_started_at = null, phase_started_at = null, expires_at = null, released_question_ids = '{}', skipped_question_ids = '{}' where id = p_session_id returning * into selected_session;
  return selected_session;
end $$;

create or replace function public.release_system_design_question(p_session_id uuid)
returns public.quiz_sessions language plpgsql security definer set search_path = public as $$
declare selected_session public.quiz_sessions%rowtype; selected_question public.quiz_questions%rowtype; transition_at timestamptz := clock_timestamp();
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning' then raise exception 'system_design_session_not_found'; end if;
  if selected_session.status = 'finished' then raise exception 'session_finished'; end if;
  select * into selected_question from public.quiz_questions where quiz_session_id = p_session_id and not (id = any(selected_session.released_question_ids)) and not (id = any(selected_session.skipped_question_ids)) order by order_index limit 1;
  if not found then raise exception 'all_questions_released'; end if;
  update public.quiz_sessions set status = 'active', current_question_index = selected_question.order_index, question_phase = 'answering', question_started_at = transition_at, phase_started_at = transition_at, started_at = coalesce(started_at, transition_at), released_question_ids = array_append(released_question_ids, selected_question.id) where id = p_session_id returning * into selected_session;
  return selected_session;
end $$;

-- The session row is locked before deleting answers, so concurrent submitters
-- wait and then observe a non-answering phase. A skipped question therefore
-- cannot leak a scored attempt.
create or replace function public.skip_system_design_question(p_session_id uuid)
returns public.quiz_sessions language plpgsql security definer set search_path = public as $$
declare selected_session public.quiz_sessions%rowtype; selected_question public.quiz_questions%rowtype;
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning' or selected_session.status <> 'active' or selected_session.question_phase <> 'answering' then raise exception 'question_not_ready_to_skip'; end if;
  select * into selected_question from public.quiz_questions where quiz_session_id = p_session_id and order_index = selected_session.current_question_index;
  if not found then raise exception 'question_not_ready_to_skip'; end if;
  -- Stop acceptance before response deletion while holding the same row lock
  -- used by submit_quiz_answer.
  update public.quiz_sessions set question_phase = null where id = p_session_id;
  delete from public.quiz_responses where question_id = selected_question.id;
  update public.quiz_participants participant set
    total_score = coalesce((select sum(response.points_awarded) from public.quiz_responses response join public.quiz_questions question on question.id = response.question_id where question.quiz_session_id = p_session_id and response.user_id = participant.user_id), 0),
    current_streak = coalesce((
      select count(*) from (
        select response.is_correct,
          sum(case when response.is_correct then 0 else 1 end) over (order by question.order_index desc) as incorrect_after
        from public.quiz_responses response join public.quiz_questions question on question.id = response.question_id
        where question.quiz_session_id = p_session_id and response.user_id = participant.user_id
      ) trailing_rows where trailing_rows.is_correct and trailing_rows.incorrect_after = 0
    ), 0)
  where participant.quiz_session_id = p_session_id;
  update public.quiz_sessions set current_question_index = -1, question_started_at = null, phase_started_at = clock_timestamp(), released_question_ids = array_remove(released_question_ids, selected_question.id), skipped_question_ids = array_append(array_remove(skipped_question_ids, selected_question.id), selected_question.id) where id = p_session_id returning * into selected_session;
  return selected_session;
end $$;
