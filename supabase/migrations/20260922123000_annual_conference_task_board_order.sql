alter table public.annual_conference_tasks
  add column board_entered_at timestamptz;

create or replace function public.set_annual_conference_task_board_entered_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.board_entered_at = now();
  elsif new.status is distinct from old.status or new.phase_id is distinct from old.phase_id then
    new.board_entered_at = now();
  end if;

  return new;
end;
$$;

create trigger set_annual_conference_task_board_entered_at
before insert or update on public.annual_conference_tasks
for each row
execute function public.set_annual_conference_task_board_entered_at();
