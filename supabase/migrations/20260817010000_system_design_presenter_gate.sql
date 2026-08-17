-- A System Design question is first shown on the shared presenter screen.
-- Participants receive it only after the facilitator starts the shared timer.
alter table public.quiz_sessions drop constraint if exists quiz_sessions_phase_valid;
alter table public.quiz_sessions add constraint quiz_sessions_phase_valid
  check (question_phase is null or question_phase in ('presenting', 'answering', 'revealing', 'scoreboard'));

create or replace function public.present_system_design_question(p_session_id uuid)
returns public.quiz_sessions language plpgsql security definer set search_path = public as $$
declare selected_session public.quiz_sessions%rowtype; selected_question public.quiz_questions%rowtype; transition_at timestamptz := clock_timestamp();
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning' then raise exception 'system_design_session_not_found'; end if;
  if selected_session.status = 'finished' then raise exception 'session_finished'; end if;
  select * into selected_question from public.quiz_questions
    where quiz_session_id = p_session_id
      and not (id = any(selected_session.released_question_ids))
      and not (id = any(selected_session.skipped_question_ids))
    order by order_index limit 1;
  if not found then raise exception 'all_questions_released'; end if;

  update public.quiz_sessions
    set status = 'active',
      current_question_index = selected_question.order_index,
      question_phase = 'presenting',
      question_started_at = null,
      phase_started_at = transition_at,
      started_at = coalesce(started_at, transition_at),
      released_question_ids = array_append(released_question_ids, selected_question.id)
    where id = p_session_id
    returning * into selected_session;
  return selected_session;
end $$;

create or replace function public.start_system_design_question(p_session_id uuid)
returns public.quiz_sessions language plpgsql security definer set search_path = public as $$
declare selected_session public.quiz_sessions%rowtype; transition_at timestamptz := clock_timestamp();
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning'
    or selected_session.status <> 'active' or selected_session.question_phase <> 'presenting' then
    raise exception 'question_not_ready_to_start';
  end if;

  -- A small server-owned runway lets polling clients receive the transition
  -- before the configured question timer begins.
  update public.quiz_sessions
    set question_phase = 'answering',
      question_started_at = transition_at + interval '3 seconds',
      phase_started_at = transition_at
    where id = p_session_id
    returning * into selected_session;
  return selected_session;
end $$;

-- A facilitator may discard a question while it is still presenter-only.
create or replace function public.skip_system_design_question(p_session_id uuid)
returns public.quiz_sessions language plpgsql security definer set search_path = public as $$
declare selected_session public.quiz_sessions%rowtype; selected_question public.quiz_questions%rowtype;
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning' or selected_session.status <> 'active'
    or selected_session.question_phase not in ('presenting', 'answering') then raise exception 'question_not_ready_to_skip'; end if;
  select * into selected_question from public.quiz_questions where quiz_session_id = p_session_id and order_index = selected_session.current_question_index;
  if not found then raise exception 'question_not_ready_to_skip'; end if;
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

revoke all on function public.present_system_design_question(uuid) from public, anon, authenticated;
revoke all on function public.start_system_design_question(uuid) from public, anon, authenticated;
grant execute on function public.present_system_design_question(uuid) to service_role;
grant execute on function public.start_system_design_question(uuid) to service_role;
