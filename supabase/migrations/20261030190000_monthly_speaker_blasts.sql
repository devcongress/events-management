-- Separate operational speaker correspondence from attendee broadcasts.
create table public.speaker_blasts (
  id uuid primary key,
  event_id uuid not null references public.community_events(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create index speaker_blasts_event_created_idx on public.speaker_blasts(event_id, created_at desc);
alter table public.speaker_blasts enable row level security;
revoke all on public.speaker_blasts from public, anon, authenticated;
grant select, insert, update, delete on public.speaker_blasts to service_role;
