-- Preserve the question wording and options that an attendee actually saw.
-- Campaign question editing remains possible until the first public response.

create table public.feedback_submission_question_snapshots (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.feedback_submissions(id) on delete cascade,
  question_id uuid not null,
  question_type text not null,
  question_label text not null,
  required boolean not null,
  options jsonb not null default '[]'::jsonb,
  answer jsonb not null,
  created_at timestamptz not null default now(),
  constraint feedback_submission_question_snapshots_submission_question_unique unique (submission_id, question_id),
  constraint feedback_submission_question_snapshots_options_array check (jsonb_typeof(options) = 'array')
);

create index feedback_submission_question_snapshots_submission_idx
  on public.feedback_submission_question_snapshots (submission_id);

alter table public.feedback_submission_question_snapshots enable row level security;
revoke all on table public.feedback_submission_question_snapshots from public, anon, authenticated;
grant select, insert on table public.feedback_submission_question_snapshots to service_role;

create or replace function public.snapshot_feedback_submission_questions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.trigger_source <> 'event_feedback_form' or new.campaign_id is null then
    return new;
  end if;

  insert into public.feedback_submission_question_snapshots (
    submission_id, question_id, question_type, question_label, required, options, answer
  )
  select
    new.id,
    question.id,
    question.type,
    question.label,
    question.required,
    question.options,
    answer.value -> 'value'
  from jsonb_array_elements(new.structured_answers) as answer(value)
  join public.feedback_questions question
    on question.id = (answer.value ->> 'question_id')::uuid
   and question.campaign_id = new.campaign_id
  on conflict (submission_id, question_id) do nothing;

  return new;
end;
$$;

drop trigger if exists feedback_submissions_snapshot_questions on public.feedback_submissions;
create trigger feedback_submissions_snapshot_questions
after insert on public.feedback_submissions
for each row execute function public.snapshot_feedback_submission_questions();

-- Existing rows did not retain a historical definition. Capture the current
-- matching definition once as a best-effort baseline before future edits are
-- frozen; it is explicitly not evidence of the original wording.
insert into public.feedback_submission_question_snapshots (
  submission_id, question_id, question_type, question_label, required, options, answer
)
select submission.id, question.id, question.type, question.label, question.required, question.options, answer.value -> 'value'
from public.feedback_submissions submission
cross join lateral jsonb_array_elements(submission.structured_answers) as answer(value)
join public.feedback_questions question
  on question.id = (answer.value ->> 'question_id')::uuid
 and question.campaign_id = submission.campaign_id
where submission.trigger_source = 'event_feedback_form'
on conflict (submission_id, question_id) do nothing;

create or replace function public.prevent_feedback_question_history_rewrite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.feedback_submissions submission
    where submission.campaign_id = old.campaign_id
      and submission.trigger_source = 'event_feedback_form'
  ) then
    raise exception 'Feedback questions cannot be replaced after responses exist.';
  end if;
  return old;
end;
$$;

drop trigger if exists feedback_questions_preserve_history on public.feedback_questions;
create trigger feedback_questions_preserve_history
before delete on public.feedback_questions
for each row execute function public.prevent_feedback_question_history_rewrite();
