-- Presenting a question schedules one shared answer start immediately. The
-- presenter and attendee views derive their countdown from this same value.
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
      question_started_at = transition_at + interval '3 seconds',
      phase_started_at = transition_at,
      started_at = coalesce(started_at, transition_at),
      released_question_ids = array_append(released_question_ids, selected_question.id)
    where id = p_session_id
    returning * into selected_session;
  return selected_session;
end $$;

create or replace function public.advance_system_design_question(p_session_id uuid)
returns public.quiz_sessions language plpgsql security definer set search_path = public as $$
declare selected_session public.quiz_sessions%rowtype;
begin
  select * into selected_session from public.quiz_sessions where id = p_session_id for update;
  if not found or selected_session.purpose <> 'system_design_learning' then raise exception 'system_design_session_not_found'; end if;
  if selected_session.question_phase <> 'presenting'
    or selected_session.question_started_at is null
    or clock_timestamp() < selected_session.question_started_at then
    return selected_session;
  end if;

  update public.quiz_sessions
    set question_phase = 'answering', phase_started_at = clock_timestamp()
    where id = p_session_id
    returning * into selected_session;
  return selected_session;
end $$;

revoke all on function public.advance_system_design_question(uuid) from public, anon, authenticated;
grant execute on function public.advance_system_design_question(uuid) to service_role;
