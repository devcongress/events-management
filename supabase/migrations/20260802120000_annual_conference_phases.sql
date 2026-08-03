create table public.annual_conference_phases (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  sort_order integer not null default 0,
  created_by_email text,
  updated_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_phases_name_not_blank check (length(trim(name)) > 0),
  constraint annual_conference_phases_dates_check check (ends_on >= starts_on),
  constraint annual_conference_phases_sort_order_check check (sort_order >= 0),
  constraint annual_conference_phases_edition_name_unique unique (edition_id, name)
);

alter table public.annual_conference_tasks
  add column phase_id uuid references public.annual_conference_phases(id) on delete set null;

create index annual_conference_phases_edition_order_idx
  on public.annual_conference_phases (edition_id, sort_order, starts_on);

create index annual_conference_tasks_edition_phase_idx
  on public.annual_conference_tasks (edition_id, phase_id, target_date);

create or replace function public.validate_annual_conference_phase_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.annual_conference_phases phase
    where phase.edition_id = new.edition_id
      and phase.id <> new.id
      and new.starts_on <= phase.ends_on
      and new.ends_on >= phase.starts_on
  ) then
    raise exception 'Phase dates cannot overlap another phase.';
  end if;

  if exists (
    select 1
    from public.annual_conference_tasks task
    where task.phase_id = new.id
      and task.target_date is not null
      and task.target_date > new.ends_on
  ) then
    raise exception 'Phase end date cannot precede an assigned task target date.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_annual_conference_task_phase()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  selected_phase public.annual_conference_phases%rowtype;
begin
  if new.phase_id is null then
    return new;
  end if;

  select * into selected_phase
  from public.annual_conference_phases
  where id = new.phase_id;

  if selected_phase.id is null or selected_phase.edition_id <> new.edition_id then
    raise exception 'The selected phase does not belong to this conference edition.';
  end if;

  if new.target_date is not null and new.target_date > selected_phase.ends_on then
    raise exception 'Task target date cannot be after the selected phase end date.';
  end if;

  return new;
end;
$$;

create trigger validate_annual_conference_phase_schedule_trigger
before insert or update of edition_id, starts_on, ends_on
on public.annual_conference_phases
for each row
execute function public.validate_annual_conference_phase_schedule();

create trigger validate_annual_conference_task_phase_trigger
before insert or update of edition_id, phase_id, target_date
on public.annual_conference_tasks
for each row
execute function public.validate_annual_conference_task_phase();

create trigger set_annual_conference_phases_updated_at
before update on public.annual_conference_phases
for each row
execute function public.set_updated_at();

alter table public.annual_conference_phases enable row level security;

grant select, insert, update, delete on public.annual_conference_phases to service_role;

insert into public.annual_conference_phases (
  id,
  edition_id,
  name,
  starts_on,
  ends_on,
  sort_order,
  created_by_email,
  updated_by_email
) values
  (
    '20260000-0000-4000-8000-000000000101',
    '20260000-0000-4000-8000-000000000001',
    'Phase 1',
    '2026-08-01',
    '2026-08-31',
    1,
    'angelateyvi@gmail.com',
    'angelateyvi@gmail.com'
  ),
  (
    '20260000-0000-4000-8000-000000000102',
    '20260000-0000-4000-8000-000000000001',
    'Phase 2',
    '2026-09-01',
    '2026-12-19',
    2,
    'angelateyvi@gmail.com',
    'angelateyvi@gmail.com'
  )
on conflict (id) do nothing;
