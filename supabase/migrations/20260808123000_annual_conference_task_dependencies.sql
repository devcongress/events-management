alter table public.annual_conference_tasks
  add column if not exists dependency_task_ids uuid[] not null default '{}';

create index if not exists annual_conference_tasks_dependency_task_ids_idx
  on public.annual_conference_tasks using gin (dependency_task_ids);

comment on column public.annual_conference_tasks.dependency_task_ids is
  'Direct prerequisite task IDs within the same annual conference edition. Application validation rejects missing tasks, self-links, and cycles.';
