-- Native event email blasts. Provider IDs are retained only for operational
-- reconciliation; attendee emails remain in event_registrations.

create type public.event_blast_status as enum (
  'scheduled',
  'sent',
  'needs_capacity',
  'failed'
);

create table public.event_blasts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 160),
  body text not null check (char_length(body) between 1 and 5000),
  status public.event_blast_status not null,
  recipient_count integer not null check (recipient_count between 1 and 100),
  scheduled_for timestamptz,
  sent_at timestamptz,
  provider_broadcast_id text,
  provider_segment_id text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or scheduled_for is not null)
);

create index event_blasts_event_created_at_idx
  on public.event_blasts (event_id, created_at desc);

alter table public.event_blasts enable row level security;

-- The server-only Supabase service role owns all organizer access. No direct
-- browser or anonymous access is permitted.
