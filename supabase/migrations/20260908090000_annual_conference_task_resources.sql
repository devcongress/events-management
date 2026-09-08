create table if not exists public.annual_conference_task_resources (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.annual_conference_tasks(id) on delete cascade,
  url text not null,
  label text,
  created_by_email text not null,
  updated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_task_resources_url_not_blank check (length(trim(url)) between 1 and 2048),
  constraint annual_conference_task_resources_http_url check (url ~ '^https?://'),
  constraint annual_conference_task_resources_label_length check (label is null or length(label) <= 120),
  constraint annual_conference_task_resources_creator_lowercase check (
    created_by_email = lower(created_by_email) and length(trim(created_by_email)) > 0
  ),
  constraint annual_conference_task_resources_updater_lowercase check (
    updated_by_email = lower(updated_by_email) and length(trim(updated_by_email)) > 0
  )
);

create index if not exists annual_conference_task_resources_task_created_idx
  on public.annual_conference_task_resources (task_id, created_at, id);

create or replace function public.enforce_annual_conference_task_resource_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Lock the parent task so concurrent inserts for one task serialize before
  -- checking the cap. This prevents two requests from both observing 19 rows.
  perform 1
  from public.annual_conference_tasks
  where id = new.task_id
  for update;

  if (
    select count(*)
    from public.annual_conference_task_resources
    where task_id = new.task_id
  ) >= 20 then
    raise exception 'annual_conference_task_resource_limit'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists annual_conference_task_resources_enforce_limit
  on public.annual_conference_task_resources;
create trigger annual_conference_task_resources_enforce_limit
before insert on public.annual_conference_task_resources
for each row execute function public.enforce_annual_conference_task_resource_limit();

drop trigger if exists set_annual_conference_task_resources_updated_at
  on public.annual_conference_task_resources;
create trigger set_annual_conference_task_resources_updated_at
before update on public.annual_conference_task_resources
for each row execute function public.set_updated_at();

alter table public.annual_conference_task_resources enable row level security;
revoke all on public.annual_conference_task_resources from anon, authenticated;
grant select, insert, update, delete on public.annual_conference_task_resources to service_role;

revoke all on function public.enforce_annual_conference_task_resource_limit() from public;
grant execute on function public.enforce_annual_conference_task_resource_limit() to service_role;

comment on table public.annual_conference_task_resources is
  'Attributable external links attached to Annual Conference work-plan tasks; mutations are authorized by the application API.';
