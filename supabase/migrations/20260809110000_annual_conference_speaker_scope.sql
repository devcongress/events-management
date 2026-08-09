-- Annual Conference programme data belongs to an edition, never to a community event.
-- Move the existing private programme-event records before removing that bridge.

begin;

alter table public.annual_conference_editions
  add column if not exists speaker_call_status text not null default 'closed'
    check (speaker_call_status in ('open', 'closed'));

update public.annual_conference_editions as edition
set speaker_call_status = case when event.status = 'cfp_open' then 'open' else 'closed' end
from public.community_events as event
where event.id = edition.conference_event_id;

create table if not exists public.annual_conference_speaker_submissions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  kind text not null default 'talk' check (kind in ('talk', 'product_demo')),
  speaker_name text not null check (char_length(speaker_name) between 1 and 120),
  speaker_email text not null check (char_length(speaker_email) between 3 and 254),
  github_username text,
  title text not null check (char_length(title) between 1 and 200),
  topic text not null check (char_length(topic) between 1 and 120),
  abstract text,
  bio text,
  status text not null default 'submitted' check (status in ('submitted', 'selected', 'not_selected', 'withdrawn')),
  internal_note text,
  selected_intake_link_id uuid,
  selected_session_id uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists annual_conference_speaker_submissions_identity_uidx
  on public.annual_conference_speaker_submissions (edition_id, kind, lower(btrim(speaker_email)), lower(btrim(title)))
  where status <> 'withdrawn';
create index if not exists annual_conference_speaker_submissions_edition_created_idx
  on public.annual_conference_speaker_submissions (edition_id, created_at desc);

create table if not exists public.annual_conference_sessions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  speaker_submission_id uuid unique references public.annual_conference_speaker_submissions(id) on delete set null,
  kind text not null default 'talk' check (kind in ('talk', 'product_demo')),
  speaker_name text not null check (char_length(speaker_name) between 1 and 120),
  speaker_email text not null check (char_length(speaker_email) between 3 and 254),
  github_username text,
  title text not null check (char_length(title) between 1 and 200),
  topic text not null check (char_length(topic) between 1 and 120),
  abstract text,
  bio text,
  slides_url text,
  status text not null default 'confirmed' check (status in ('confirmed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists annual_conference_sessions_edition_created_idx
  on public.annual_conference_sessions (edition_id, created_at desc);

create table if not exists public.annual_conference_speaker_intake_links (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  speaker_submission_id uuid references public.annual_conference_speaker_submissions(id) on delete set null,
  kind text not null default 'talk' check (kind in ('talk', 'product_demo')),
  speaker_name text,
  speaker_email text,
  talk_title text,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  email_status text check (email_status is null or email_status in ('pending', 'accepted', 'failed')),
  email_provider_id text,
  email_idempotency_key text,
  email_sent_at timestamptz,
  email_last_attempt_at timestamptz,
  email_last_error text,
  expires_at timestamptz not null,
  claim_id uuid,
  claimed_at timestamptz,
  used_at timestamptz,
  used_session_id uuid references public.annual_conference_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_speaker_intake_claim_pair check (
    (claim_id is null and claimed_at is null) or (claim_id is not null and claimed_at is not null)
  )
);

create index if not exists annual_conference_speaker_intake_links_edition_created_idx
  on public.annual_conference_speaker_intake_links (edition_id, created_at desc);
create index if not exists annual_conference_speaker_intake_links_submission_idx
  on public.annual_conference_speaker_intake_links (speaker_submission_id)
  where speaker_submission_id is not null;

insert into public.annual_conference_speaker_submissions (
  id, edition_id, kind, speaker_name, speaker_email, github_username, title, topic,
  abstract, bio, status, internal_note, selected_intake_link_id, decided_at, created_at, updated_at
)
select
  submission.id, edition.id, submission.kind, submission.speaker_name, submission.speaker_email,
  submission.github_username, submission.title, submission.topic, submission.abstract, submission.bio,
  submission.status, submission.internal_note, submission.selected_intake_link_id, submission.decided_at,
  submission.created_at, submission.updated_at
from public.speaker_submissions as submission
join public.annual_conference_editions as edition on edition.conference_event_id = submission.event_id
on conflict (id) do nothing;

insert into public.annual_conference_speaker_intake_links (
  id, edition_id, speaker_submission_id, kind, speaker_name, speaker_email, talk_title,
  token_hash, email_status, email_provider_id, email_idempotency_key, email_sent_at,
  email_last_attempt_at, email_last_error, expires_at, claim_id, claimed_at, used_at,
  created_at, updated_at
)
select
  link.id, edition.id, link.speaker_submission_id, link.kind, link.speaker_name, link.speaker_email,
  link.talk_title, link.token_hash, link.email_status, link.email_provider_id,
  link.email_idempotency_key, link.email_sent_at, link.email_last_attempt_at, link.email_last_error,
  link.expires_at, link.claim_id, link.claimed_at, link.used_at, link.created_at, link.updated_at
from public.speaker_intake_links as link
join public.annual_conference_editions as edition on edition.conference_event_id = link.event_id
on conflict (id) do nothing;

alter table public.annual_conference_speaker_submissions enable row level security;
alter table public.annual_conference_sessions enable row level security;
alter table public.annual_conference_speaker_intake_links enable row level security;
revoke all on table public.annual_conference_speaker_submissions, public.annual_conference_sessions, public.annual_conference_speaker_intake_links from public, anon, authenticated;
grant select, insert, update, delete on table public.annual_conference_speaker_submissions, public.annual_conference_sessions, public.annual_conference_speaker_intake_links to service_role;

drop trigger if exists set_annual_conference_speaker_submissions_updated_at on public.annual_conference_speaker_submissions;
create trigger set_annual_conference_speaker_submissions_updated_at before update on public.annual_conference_speaker_submissions for each row execute function public.set_updated_at();
drop trigger if exists set_annual_conference_sessions_updated_at on public.annual_conference_sessions;
create trigger set_annual_conference_sessions_updated_at before update on public.annual_conference_sessions for each row execute function public.set_updated_at();
drop trigger if exists set_annual_conference_speaker_intake_links_updated_at on public.annual_conference_speaker_intake_links;
create trigger set_annual_conference_speaker_intake_links_updated_at before update on public.annual_conference_speaker_intake_links for each row execute function public.set_updated_at();

drop trigger if exists annual_conference_editions_create_programme_event on public.annual_conference_editions;
drop function if exists public.create_annual_conference_programme_event();
drop index if exists public.annual_conference_editions_conference_event_uidx;
alter table public.annual_conference_editions drop column if exists conference_event_id;

delete from public.community_events
where slug like 'annual-conference-%'
  and series_type = 'special'
  and event_format = 'conference'
  and publish_to_website = false;

commit;
