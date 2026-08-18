-- Skipping is a non-scoring decision: discard the current attempts and put the
-- next prepared question into the same three-second shared runway immediately.
create or replace function public.skip_system_design_question(p_session_id uuid)
returns public.quiz_sessions language plpgsql security definer set search_path = public as $$
declare
  selected_session public.quiz_sessions%rowtype;
  selected_question public.quiz_questions%rowtype;
  next_question public.quiz_questions%rowtype;
  transition_at timestamptz := clock_timestamp();
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning' or selected_session.status <> 'active'
    or selected_session.question_phase not in ('presenting', 'answering') then raise exception 'question_not_ready_to_skip'; end if;

  select * into selected_question from public.quiz_questions
    where quiz_session_id = p_session_id and order_index = selected_session.current_question_index;
  if not found then raise exception 'question_not_ready_to_skip'; end if;

  -- Stop new attempts, then delete every existing response before recalculating room scores.
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

  select * into next_question from public.quiz_questions
    where quiz_session_id = p_session_id
      and not (id = any(selected_session.released_question_ids))
      and not (id = any(selected_session.skipped_question_ids))
    order by order_index limit 1;

  if found then
    update public.quiz_sessions set
      current_question_index = next_question.order_index,
      question_phase = 'presenting',
      question_started_at = transition_at + interval '3 seconds',
      phase_started_at = transition_at,
      released_question_ids = array_append(released_question_ids, next_question.id),
      skipped_question_ids = array_append(array_remove(skipped_question_ids, selected_question.id), selected_question.id)
    where id = p_session_id returning * into selected_session;
  else
    update public.quiz_sessions set
      current_question_index = -1,
      question_phase = null,
      question_started_at = null,
      phase_started_at = transition_at,
      skipped_question_ids = array_append(array_remove(skipped_question_ids, selected_question.id), selected_question.id)
    where id = p_session_id returning * into selected_session;
  end if;

  return selected_session;
end $$;

revoke all on function public.skip_system_design_question(uuid) from public, anon, authenticated;
grant execute on function public.skip_system_design_question(uuid) to service_role;
