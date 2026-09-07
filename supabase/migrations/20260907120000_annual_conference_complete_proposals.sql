-- Annual Conference proposals are complete, independently reviewed programme
-- records. Accepted proposals receive an editable, proposal-scoped logistics
-- workspace whose bearer token is stored only as a hash.

begin;

alter table public.annual_conference_editions
  add column if not exists speaker_logistics_deadline timestamptz;

create table if not exists public.annual_conference_speaker_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  bio text not null check (char_length(btrim(bio)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists annual_conference_speaker_profiles_email_uidx
  on public.annual_conference_speaker_profiles (email_normalized);

alter table public.annual_conference_speaker_submissions
  add column if not exists speaker_profile_id uuid references public.annual_conference_speaker_profiles(id) on delete restrict,
  add column if not exists session_type text,
  add column if not exists learning_outcomes jsonb not null default '[]'::jsonb,
  add column if not exists proposal_schema_version smallint;

update public.annual_conference_speaker_submissions
set proposal_schema_version = 1
where proposal_schema_version is null;

alter table public.annual_conference_speaker_submissions
  alter column proposal_schema_version set default 2,
  alter column proposal_schema_version set not null;

insert into public.annual_conference_speaker_profiles (email, name, bio, created_at, updated_at)
select distinct on (lower(btrim(speaker_email)))
  speaker_email, speaker_name, bio, created_at, updated_at
from public.annual_conference_speaker_submissions
where nullif(btrim(bio), '') is not null
order by lower(btrim(speaker_email)), updated_at desc
on conflict (email_normalized) do nothing;

update public.annual_conference_speaker_submissions as submission
set speaker_profile_id = profile.id
from public.annual_conference_speaker_profiles as profile
where submission.speaker_profile_id is null
  and lower(btrim(submission.speaker_email)) = profile.email_normalized;

update public.annual_conference_speaker_submissions
set session_type = case when kind = 'product_demo' then '25-minute short talk' else '40-minute long talk' end
where session_type is null;

alter table public.annual_conference_speaker_submissions
  alter column session_type set not null,
  add constraint annual_conference_speaker_submissions_schema_version_check check (
    proposal_schema_version in (1, 2)
  ),
  add constraint annual_conference_speaker_submissions_profile_check check (
    proposal_schema_version = 1 or speaker_profile_id is not null
  ),
  add constraint annual_conference_speaker_submissions_session_type_check check (
    session_type in ('15-minute short talk', '25-minute short talk', '40-minute long talk', '60-minute workshop')
  ),
  add constraint annual_conference_speaker_submissions_track_check check (
    proposal_schema_version = 1 or topic in ('Open Source & Developer Community', 'AI & Emerging Technologies', 'Tech Education', 'Real-World Impact', 'Cybersecurity', 'UX & Product Design')
  ),
  add constraint annual_conference_speaker_submissions_outcomes_check check (
    proposal_schema_version = 1 or (
      jsonb_typeof(learning_outcomes) = 'array'
      and jsonb_array_length(learning_outcomes) between 3 and 5
      and not jsonb_path_exists(learning_outcomes, '$[*] ? (@.type() != "string" || @ == "")')
    )
  ),
  add constraint annual_conference_speaker_submissions_bio_check check (
    proposal_schema_version = 1 or (
      nullif(btrim(bio), '') is not null
      and char_length(bio) <= 4000
    )
  ),
  add constraint annual_conference_speaker_submissions_abstract_check check (
    proposal_schema_version = 1 or (
      nullif(btrim(abstract), '') is not null
      and cardinality(regexp_split_to_array(btrim(abstract), E'\\s+')) <= 250
    )
  );

alter table public.annual_conference_sessions
  add column if not exists session_type text,
  add column if not exists learning_outcomes jsonb not null default '[]'::jsonb,
  add column if not exists availability_confirmed boolean,
  add column if not exists technical_requirements text,
  add column if not exists workshop_prerequisites text,
  add column if not exists required_software_equipment text,
  add column if not exists participants_need_laptops boolean,
  add column if not exists preferred_workshop_capacity integer,
  add column if not exists logistics_updated_at timestamptz;

update public.annual_conference_sessions
set session_type = case when kind = 'product_demo' then '25-minute short talk' else '40-minute long talk' end
where session_type is null;

alter table public.annual_conference_sessions
  alter column session_type set not null,
  add constraint annual_conference_sessions_session_type_check check (
    session_type in ('15-minute short talk', '25-minute short talk', '40-minute long talk', '60-minute workshop')
  ),
  add constraint annual_conference_sessions_capacity_check check (
    preferred_workshop_capacity is null or preferred_workshop_capacity between 1 and 1000
  );

-- Preserve already accepted legacy proposals. Those decisions remain valid,
-- but new legacy proposals cannot be accepted by the application.
insert into public.annual_conference_sessions (
  edition_id, speaker_submission_id, kind, speaker_name, speaker_email,
  github_username, title, topic, session_type, learning_outcomes, abstract,
  bio, slides_url, status, created_at, updated_at
)
select
  submission.edition_id, submission.id, submission.kind,
  submission.speaker_name, submission.speaker_email,
  submission.github_username, submission.title, submission.topic,
  submission.session_type, submission.learning_outcomes,
  submission.abstract, submission.bio, submission.resource_url,
  'confirmed', coalesce(submission.decided_at, submission.created_at), submission.updated_at
from public.annual_conference_speaker_submissions as submission
where submission.status = 'selected'
on conflict (speaker_submission_id) do nothing;

update public.annual_conference_speaker_submissions as submission
set selected_session_id = session.id
from public.annual_conference_sessions as session
where submission.id = session.speaker_submission_id
  and submission.status = 'selected'
  and submission.selected_session_id is null;

-- Workspaces stay reusable until their edition deadline and point at the
-- accepted session immediately. Legacy consumed links are migrated as revoked.
alter table public.annual_conference_speaker_intake_links
  add column if not exists workspace_session_id uuid references public.annual_conference_sessions(id) on delete cascade,
  add column if not exists revoked_at timestamptz;

update public.annual_conference_speaker_intake_links
set revoked_at = used_at
where used_at is not null and revoked_at is null;

update public.annual_conference_speaker_intake_links as link
set workspace_session_id = coalesce(link.used_session_id, submission.selected_session_id)
from public.annual_conference_speaker_submissions as submission
where link.speaker_submission_id = submission.id
  and link.workspace_session_id is null
  and coalesce(link.used_session_id, submission.selected_session_id) is not null;

drop index if exists public.annual_conference_speaker_intake_links_active_submission_uidx;

create unique index annual_conference_speaker_intake_links_active_submission_uidx
  on public.annual_conference_speaker_intake_links (speaker_submission_id)
  where speaker_submission_id is not null and revoked_at is null;

-- Remove the monthly/archive compatibility shape from the annual domain. The
-- conference no longer models product demos or asks for GitHub/resource data
-- during proposal review.
drop index if exists public.annual_conference_speaker_submissions_identity_uidx;

alter table public.annual_conference_speaker_submissions
  drop constraint if exists annual_conference_speaker_submissions_resource_url_shape,
  drop column if exists kind,
  drop column if exists github_username,
  drop column if exists resource_url;

create unique index annual_conference_speaker_submissions_identity_uidx
  on public.annual_conference_speaker_submissions (edition_id, lower(btrim(speaker_email)), lower(btrim(title)))
  where status <> 'withdrawn';

alter table public.annual_conference_sessions
  drop column if exists kind,
  drop column if exists github_username;

alter table public.annual_conference_speaker_intake_links
  drop constraint if exists annual_conference_speaker_intake_claim_pair,
  drop column if exists kind,
  drop column if exists claim_id,
  drop column if exists claimed_at,
  drop column if exists used_at,
  drop column if exists used_session_id;

create or replace function public.accept_annual_conference_speaker_proposal(
  p_submission_id uuid,
  p_session_id uuid,
  p_link_id uuid,
  p_token_hash text,
  p_deadline timestamptz,
  p_email_idempotency_key text,
  p_internal_note text
)
returns table (session_id uuid, link_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.annual_conference_speaker_submissions%rowtype;
begin
  select * into proposal
  from public.annual_conference_speaker_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Conference proposal not found.' using errcode = 'P0001';
  end if;
  if proposal.status <> 'submitted' then
    raise exception 'This conference proposal has already been decided.' using errcode = 'P0001';
  end if;
  if proposal.proposal_schema_version <> 2 then
    raise exception 'This legacy proposal is incomplete and cannot be accepted.' using errcode = 'P0001';
  end if;

  insert into public.annual_conference_sessions (
    id, edition_id, speaker_submission_id, speaker_name, speaker_email, title,
    topic, session_type, learning_outcomes, abstract, bio, slides_url, status
  ) values (
    p_session_id, proposal.edition_id, proposal.id, proposal.speaker_name,
    proposal.speaker_email, proposal.title, proposal.topic,
    proposal.session_type, proposal.learning_outcomes, proposal.abstract,
    proposal.bio, null, 'confirmed'
  );

  insert into public.annual_conference_speaker_intake_links (
    id, edition_id, speaker_submission_id, speaker_name, speaker_email,
    talk_title, token_hash, email_status, email_idempotency_key,
    email_last_attempt_at, expires_at, workspace_session_id
  ) values (
    p_link_id, proposal.edition_id, proposal.id, proposal.speaker_name,
    proposal.speaker_email, proposal.title, p_token_hash, 'pending',
    p_email_idempotency_key, now(), p_deadline, p_session_id
  );

  update public.annual_conference_speaker_submissions
  set status = 'selected',
      internal_note = nullif(btrim(p_internal_note), ''),
      selected_intake_link_id = p_link_id,
      selected_session_id = p_session_id,
      decided_at = now(),
      updated_at = now()
  where id = proposal.id;

  return query select p_session_id, p_link_id;
end;
$$;

create or replace function public.rotate_annual_conference_speaker_workspace(
  p_submission_id uuid,
  p_expected_link_id uuid,
  p_link_id uuid,
  p_token_hash text,
  p_deadline timestamptz,
  p_email_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposal public.annual_conference_speaker_submissions%rowtype;
  current_link public.annual_conference_speaker_intake_links%rowtype;
begin
  select * into proposal
  from public.annual_conference_speaker_submissions
  where id = p_submission_id
  for update;

  if not found or proposal.status <> 'selected' or proposal.selected_session_id is null then
    raise exception 'Accepted conference proposal not found.' using errcode = 'P0001';
  end if;
  if proposal.selected_intake_link_id is distinct from p_expected_link_id then
    raise exception 'The conference speaker workspace has already been rotated.' using errcode = 'P0001';
  end if;

  if p_expected_link_id is not null then
    select * into current_link
    from public.annual_conference_speaker_intake_links
    where id = p_expected_link_id
    for update;
    if found and current_link.email_status = 'accepted' then
      raise exception 'The conference speaker workspace email was already accepted by the provider.' using errcode = 'P0001';
    end if;
    if found and current_link.email_status = 'pending'
      and current_link.email_last_attempt_at > now() - interval '5 minutes' then
      raise exception 'The conference speaker workspace email is still being sent.' using errcode = 'P0001';
    end if;
  end if;

  update public.annual_conference_speaker_intake_links
  set revoked_at = now(), updated_at = now()
  where id = proposal.selected_intake_link_id and revoked_at is null;

  insert into public.annual_conference_speaker_intake_links (
    id, edition_id, speaker_submission_id, speaker_name, speaker_email,
    talk_title, token_hash, email_status, email_idempotency_key,
    email_last_attempt_at, expires_at, workspace_session_id
  ) values (
    p_link_id, proposal.edition_id, proposal.id, proposal.speaker_name,
    proposal.speaker_email, proposal.title, p_token_hash, 'pending',
    p_email_idempotency_key, now(), p_deadline, proposal.selected_session_id
  );

  update public.annual_conference_speaker_submissions
  set selected_intake_link_id = p_link_id, updated_at = now()
  where id = proposal.id;

  return p_link_id;
end;
$$;

alter table public.annual_conference_speaker_profiles enable row level security;
revoke all on table public.annual_conference_speaker_profiles from public, anon, authenticated;
grant select, insert, update on table public.annual_conference_speaker_profiles to service_role;

revoke all on function public.accept_annual_conference_speaker_proposal(uuid, uuid, uuid, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.accept_annual_conference_speaker_proposal(uuid, uuid, uuid, text, timestamptz, text, text) to service_role;
revoke all on function public.rotate_annual_conference_speaker_workspace(uuid, uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.rotate_annual_conference_speaker_workspace(uuid, uuid, uuid, text, timestamptz, text) to service_role;

drop trigger if exists set_annual_conference_speaker_profiles_updated_at on public.annual_conference_speaker_profiles;
create trigger set_annual_conference_speaker_profiles_updated_at
before update on public.annual_conference_speaker_profiles
for each row execute function public.set_updated_at();

commit;
