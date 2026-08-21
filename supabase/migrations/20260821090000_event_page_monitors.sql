-- Read-only monitoring of approved external event registration pages. The
-- service role owns all access; public clients cannot inspect or mutate checks.
create table if not exists public.event_page_monitors (
  event_id uuid primary key references public.community_events(id) on delete cascade,
  enabled boolean not null default true,
  source_url text not null check (source_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'unchanged', 'changed', 'warning', 'unavailable', 'unmonitorable')),
  baseline jsonb not null default '{}'::jsonb check (jsonb_typeof(baseline) = 'object'),
  last_observed jsonb check (last_observed is null or jsonb_typeof(last_observed) = 'object'),
  differences jsonb not null default '[]'::jsonb check (jsonb_typeof(differences) = 'array'),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_http_status integer,
  last_error text,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_change_fingerprint text,
  last_alerted_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_page_monitors enable row level security;
revoke all on public.event_page_monitors from public, anon, authenticated;
grant select, insert, update, delete on public.event_page_monitors to service_role;

create index if not exists event_page_monitors_due_idx
  on public.event_page_monitors (next_check_at)
  where enabled = true and next_check_at is not null;

drop trigger if exists set_event_page_monitors_updated_at on public.event_page_monitors;
create trigger set_event_page_monitors_updated_at
before update on public.event_page_monitors
for each row execute function public.set_updated_at();
