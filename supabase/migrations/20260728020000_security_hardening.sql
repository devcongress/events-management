-- Security hardening for public write flows, organizer sessions, and one-time
-- speaker links. Apply this migration before deploying the matching Worker.

drop policy if exists "Active feedback testers are public" on public.feedback_testers;
drop policy if exists "Anyone can submit feedback" on public.feedback_submissions;

revoke all on table public.feedback_testers from public, anon, authenticated;
revoke all on table public.feedback_submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.feedback_testers to service_role;
grant select, insert, update, delete on table public.feedback_submissions to service_role;

-- Reassert the server-only boundary for every table that contains organizer,
-- attendee, operational, or compatibility-document data. RLS remains enabled,
-- but explicit privilege revocation also protects against grant drift.
revoke all on table
  public.admin_memberships,
  public.admin_sessions,
  public.admin_audit_log,
  public.app_json_documents,
  public.annual_conference_editions,
  public.annual_conference_tasks,
  public.event_registration_campaigns,
  public.event_registrations,
  public.event_registration_checkins,
  public.registration_email_deliveries
from public, anon, authenticated;

grant select, insert, update, delete on table public.admin_memberships to service_role;
grant select, insert, update, delete on table public.admin_sessions to service_role;
grant select, insert on table public.admin_audit_log to service_role;
grant select, insert, update, delete on table public.app_json_documents to service_role;
grant select, insert, update, delete on table public.annual_conference_editions to service_role;
grant select, insert, update, delete on table public.annual_conference_tasks to service_role;
grant select, insert, update, delete on table public.event_registration_campaigns to service_role;
grant select, insert, update, delete on table public.event_registrations to service_role;
grant select, insert, update, delete on table public.event_registration_checkins to service_role;
grant select, insert, update, delete on table public.registration_email_deliveries to service_role;

create table if not exists public.public_rate_limit_buckets (
  action text not null,
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (action, key_hash),
  constraint public_rate_limit_action_format check (action ~ '^[a-z0-9_:-]{1,80}$'),
  constraint public_rate_limit_key_hash_format check (key_hash ~ '^[a-f0-9]{64}$'),
  constraint public_rate_limit_attempt_count_positive check (attempt_count >= 0)
);

create index if not exists public_rate_limit_buckets_updated_idx
  on public.public_rate_limit_buckets (updated_at);

alter table public.public_rate_limit_buckets enable row level security;
revoke all on table public.public_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.public_rate_limit_buckets to service_role;

create or replace function public.consume_public_rate_limit(
  p_action text,
  p_key_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket public.public_rate_limit_buckets%rowtype;
  current_time timestamptz := clock_timestamp();
begin
  if p_action !~ '^[a-z0-9_:-]{1,80}$'
    or p_key_hash !~ '^[a-f0-9]{64}$'
    or p_max_attempts < 1
    or p_max_attempts > 10000
    or p_window_seconds < 1
    or p_window_seconds > 604800 then
    raise exception 'invalid_rate_limit_configuration';
  end if;

  -- The longest accepted window is seven days. Bound storage growth from
  -- rotating client keys before consuming the current bucket.
  delete from public.public_rate_limit_buckets
  where updated_at < current_time - interval '8 days';

  insert into public.public_rate_limit_buckets (
    action,
    key_hash,
    window_started_at,
    attempt_count,
    updated_at
  )
  values (
    p_action,
    p_key_hash,
    current_time,
    1,
    current_time
  )
  on conflict (action, key_hash)
  do update set
    window_started_at = case
      when public.public_rate_limit_buckets.window_started_at
        + make_interval(secs => p_window_seconds) <= current_time
      then current_time
      else public.public_rate_limit_buckets.window_started_at
    end,
    attempt_count = case
      when public.public_rate_limit_buckets.window_started_at
        + make_interval(secs => p_window_seconds) <= current_time
      then 1
      else public.public_rate_limit_buckets.attempt_count + 1
    end,
    updated_at = current_time
  returning * into bucket;

  allowed := bucket.attempt_count <= p_max_attempts;
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        bucket.window_started_at
          + make_interval(secs => p_window_seconds)
          - current_time
      )))::integer
    )
  end;
  return next;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, integer, integer) to service_role;

create table if not exists public.speaker_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  kind text not null default 'talk',
  speaker_name text not null,
  speaker_email text not null,
  github_username text,
  title text not null,
  topic text not null,
  abstract text,
  bio text,
  status text not null default 'submitted',
  internal_note text,
  selected_intake_link_id uuid,
  selected_talk_id uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint speaker_submissions_kind check (kind in ('talk', 'product_demo')),
  constraint speaker_submissions_status check (status in ('submitted', 'selected', 'not_selected', 'withdrawn')),
  constraint speaker_submissions_name_length check (char_length(speaker_name) between 1 and 120),
  constraint speaker_submissions_email_length check (char_length(speaker_email) between 3 and 254),
  constraint speaker_submissions_title_length check (char_length(title) between 1 and 200),
  constraint speaker_submissions_topic_length check (char_length(topic) between 1 and 120)
);

create index if not exists speaker_submissions_event_created_idx
  on public.speaker_submissions (event_id, created_at desc);

-- Enforce the same active-proposal identity as the API, at the database
-- boundary where concurrent Worker requests can no longer race.
create unique index if not exists speaker_submissions_active_identity_idx
  on public.speaker_submissions (
    event_id,
    kind,
    lower(btrim(speaker_email)),
    lower(btrim(title))
  )
  where status <> 'withdrawn';

alter table public.speaker_submissions enable row level security;
revoke all on table public.speaker_submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.speaker_submissions to service_role;

drop trigger if exists set_speaker_submissions_updated_at on public.speaker_submissions;
create trigger set_speaker_submissions_updated_at
before update on public.speaker_submissions
for each row execute function public.set_updated_at();

insert into public.speaker_submissions (
  id,
  event_id,
  kind,
  speaker_name,
  speaker_email,
  github_username,
  title,
  topic,
  abstract,
  bio,
  status,
  internal_note,
  selected_intake_link_id,
  selected_talk_id,
  decided_at,
  created_at,
  updated_at
)
select
  (item->>'id')::uuid,
  (item->>'event_id')::uuid,
  case when item->>'kind' = 'product_demo' then 'product_demo' else 'talk' end,
  item->>'speaker_name',
  item->>'speaker_email',
  nullif(item->>'github_username', ''),
  item->>'title',
  coalesce(nullif(item->>'topic', ''), 'General'),
  nullif(item->>'abstract', ''),
  nullif(item->>'bio', ''),
  case
    when item->>'status' in ('selected', 'not_selected', 'withdrawn') then item->>'status'
    else 'submitted'
  end,
  nullif(item->>'internal_note', ''),
  case
    when item->>'selected_intake_link_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (item->>'selected_intake_link_id')::uuid
    else null
  end,
  case
    when item->>'selected_talk_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (item->>'selected_talk_id')::uuid
    else null
  end,
  nullif(item->>'decided_at', '')::timestamptz,
  coalesce(nullif(item->>'created_at', '')::timestamptz, now()),
  coalesce(nullif(item->>'updated_at', '')::timestamptz, now())
from public.app_json_documents document
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(document.data) = 'array' then document.data
    else '[]'::jsonb
  end
) item
join public.community_events event
  on event.id::text = item->>'event_id'
where document.key = 'speaker-submissions'
  and item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and nullif(item->>'speaker_name', '') is not null
  and char_length(item->>'speaker_name') <= 120
  and char_length(item->>'speaker_email') between 3 and 254
  and nullif(item->>'title', '') is not null
  and char_length(item->>'title') <= 200
  and char_length(coalesce(nullif(item->>'topic', ''), 'General')) <= 120
on conflict do nothing;

update public.app_json_documents
set data = '[]'::jsonb
where key = 'speaker-submissions';

create table if not exists public.speaker_intake_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  event_month text not null,
  kind text not null default 'talk',
  purpose text not null default 'archive_backfill',
  speaker_submission_id uuid references public.speaker_submissions(id) on delete set null,
  speaker_name text,
  speaker_email text,
  talk_title text,
  token_hash text not null unique,
  email_status text,
  email_provider_id text,
  email_idempotency_key text,
  email_sent_at timestamptz,
  email_last_attempt_at timestamptz,
  email_last_error text,
  expires_at timestamptz not null,
  claim_id uuid,
  claimed_at timestamptz,
  used_at timestamptz,
  used_talk_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint speaker_intake_event_month_format check (event_month ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint speaker_intake_kind check (kind in ('talk', 'product_demo')),
  constraint speaker_intake_purpose check (purpose in ('archive_backfill', 'selected_speaker_confirmation')),
  constraint speaker_intake_token_hash_format check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint speaker_intake_email_status check (email_status is null or email_status in ('pending', 'accepted', 'failed')),
  constraint speaker_intake_claim_pair check (
    (claim_id is null and claimed_at is null)
    or (claim_id is not null and claimed_at is not null)
  )
);

create index if not exists speaker_intake_links_event_created_idx
  on public.speaker_intake_links (event_id, created_at desc);

create index if not exists speaker_intake_links_submission_idx
  on public.speaker_intake_links (speaker_submission_id)
  where speaker_submission_id is not null;

alter table public.speaker_intake_links enable row level security;
revoke all on table public.speaker_intake_links from public, anon, authenticated;
grant select, insert, update, delete on table public.speaker_intake_links to service_role;

drop trigger if exists set_speaker_intake_links_updated_at on public.speaker_intake_links;
create trigger set_speaker_intake_links_updated_at
before update on public.speaker_intake_links
for each row execute function public.set_updated_at();

-- Move compatibility records into the relational store without retaining raw
-- bearer tokens. Legacy links are expired deliberately and must be reissued.
insert into public.speaker_intake_links (
  id,
  event_id,
  event_month,
  kind,
  purpose,
  speaker_submission_id,
  speaker_name,
  speaker_email,
  talk_title,
  token_hash,
  email_status,
  email_provider_id,
  email_idempotency_key,
  email_sent_at,
  email_last_attempt_at,
  email_last_error,
  expires_at,
  claim_id,
  claimed_at,
  used_at,
  used_talk_id,
  created_at,
  updated_at
)
select
  (item->>'id')::uuid,
  (item->>'event_id')::uuid,
  item->>'event_month',
  case when item->>'kind' = 'product_demo' then 'product_demo' else 'talk' end,
  case
    when item->>'purpose' = 'selected_speaker_confirmation' then 'selected_speaker_confirmation'
    else 'archive_backfill'
  end,
  submission.id,
  nullif(item->>'speaker_name', ''),
  nullif(item->>'speaker_email', ''),
  nullif(item->>'talk_title', ''),
  item->>'token_hash',
  case
    when item->>'email_status' in ('pending', 'accepted', 'failed') then item->>'email_status'
    else null
  end,
  nullif(item->>'email_provider_id', ''),
  nullif(item->>'email_idempotency_key', ''),
  nullif(item->>'email_sent_at', '')::timestamptz,
  nullif(item->>'email_last_attempt_at', '')::timestamptz,
  nullif(item->>'email_last_error', ''),
  least((item->>'expires_at')::timestamptz, now()),
  null,
  null,
  nullif(item->>'used_at', '')::timestamptz,
  nullif(item->>'used_talk_id', '')::uuid,
  coalesce(nullif(item->>'created_at', '')::timestamptz, now()),
  coalesce(nullif(item->>'updated_at', '')::timestamptz, now())
from public.app_json_documents document
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(document.data) = 'array' then document.data
    else '[]'::jsonb
  end
) item
join public.community_events event
  on event.id::text = item->>'event_id'
left join public.speaker_submissions submission
  on submission.id::text = item->>'speaker_submission_id'
  and submission.event_id = event.id
where document.key = 'speaker-intake-links'
  and item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and item->>'event_month' ~ '^[0-9]{4}-[0-9]{2}$'
  and item->>'token_hash' ~ '^[a-f0-9]{64}$'
  and item->>'expires_at' is not null
on conflict do nothing;

update public.app_json_documents
set data = '[]'::jsonb
where key = 'speaker-intake-links';

create or replace function public.claim_speaker_intake_link(
  p_event_id uuid,
  p_token_hash text,
  p_claim_id uuid
)
returns public.speaker_intake_links
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.speaker_intake_links%rowtype;
begin
  update public.speaker_intake_links
  set
    claim_id = p_claim_id,
    claimed_at = now(),
    updated_at = now()
  where event_id = p_event_id
    and token_hash = p_token_hash
    and used_at is null
    and expires_at > now()
    and (claim_id is null or claimed_at < now() - interval '10 minutes')
  returning * into link;

  if link.id is null then
    select *
    into link
    from public.speaker_intake_links
    where event_id = p_event_id
      and token_hash = p_token_hash;

    if link.id is null then
      raise exception 'speaker_intake_link_invalid';
    end if;
    if link.used_at is not null then
      raise exception 'speaker_intake_link_used';
    end if;
    if link.expires_at <= now() then
      raise exception 'speaker_intake_link_expired';
    end if;
    raise exception 'speaker_intake_link_claimed';
  end if;

  return link;
end;
$$;

revoke all on function public.claim_speaker_intake_link(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_speaker_intake_link(uuid, text, uuid) to service_role;

create or replace function public.consume_speaker_intake_link(
  p_event_id uuid,
  p_token_hash text,
  p_claim_id uuid,
  p_talk_id uuid
)
returns public.speaker_intake_links
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.speaker_intake_links%rowtype;
begin

  update public.speaker_intake_links
  set
    used_at = now(),
    used_talk_id = p_talk_id,
    claim_id = null,
    claimed_at = null,
    updated_at = now()
  where event_id = p_event_id
    and token_hash = p_token_hash
    and claim_id = p_claim_id
    and used_at is null
    and expires_at > now()
  returning * into link;

  if link.id is null then
    raise exception 'speaker_intake_link_claim_invalid';
  end if;

  return link;
end;
$$;

revoke all on function public.consume_speaker_intake_link(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_speaker_intake_link(uuid, text, uuid, uuid) to service_role;

create or replace function public.release_speaker_intake_link_claim(
  p_event_id uuid,
  p_token_hash text,
  p_claim_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with released as (
    update public.speaker_intake_links
    set
      claim_id = null,
      claimed_at = null,
      updated_at = now()
    where event_id = p_event_id
      and token_hash = p_token_hash
      and claim_id = p_claim_id
      and used_at is null
    returning 1
  )
  select exists(select 1 from released);
$$;

revoke all on function public.release_speaker_intake_link_claim(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.release_speaker_intake_link_claim(uuid, text, uuid) to service_role;

create or replace function public.revoke_admin_sessions_on_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role or old.status is distinct from new.status then
    update public.admin_sessions
    set revoked_at = coalesce(revoked_at, now())
    where membership_id = new.id
      and revoked_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.revoke_admin_sessions_on_membership_change() from public, anon, authenticated;

drop trigger if exists revoke_admin_sessions_on_membership_change on public.admin_memberships;
create trigger revoke_admin_sessions_on_membership_change
after update of role, status on public.admin_memberships
for each row execute function public.revoke_admin_sessions_on_membership_change();
