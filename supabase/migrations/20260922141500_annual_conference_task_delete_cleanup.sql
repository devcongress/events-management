create or replace function public.remove_annual_conference_task_dependencies()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.annual_conference_tasks
  set dependency_task_ids = array_remove(dependency_task_ids, old.id),
      updated_at = now()
  where edition_id = old.edition_id
    and old.id = any(dependency_task_ids);

  return old;
end;
$$;

drop trigger if exists remove_annual_conference_task_dependencies
  on public.annual_conference_tasks;
create trigger remove_annual_conference_task_dependencies
before delete on public.annual_conference_tasks
for each row execute function public.remove_annual_conference_task_dependencies();

revoke all on function public.remove_annual_conference_task_dependencies() from public;
grant execute on function public.remove_annual_conference_task_dependencies() to service_role;

comment on function public.remove_annual_conference_task_dependencies() is
  'Removes an Annual Conference task from remaining task dependency arrays before deletion.';
