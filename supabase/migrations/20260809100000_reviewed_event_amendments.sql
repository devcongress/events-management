-- Approved community listings can be amended through a revocable bearer link.
-- Changes remain proposals until an organizer applies them to the canonical event.

alter type public.event_submission_email_kind add value if not exists 'amendment_approved';
alter type public.event_submission_email_kind add value if not exists 'amendment_rejected';
alter type public.event_submission_email_kind add value if not exists 'withdrawn';

begin;

alter table public.event_submission_email_deliveries
  add column if not exists amendment_id uuid;

alter table public.event_submission_email_deliveries
  drop constraint if exists event_submission_email_deliveries_submission_kind_unique;

create unique index if not exists event_submission_email_deliveries_decision_unique
  on public.event_submission_email_deliveries (submission_id, kind, amendment_id)
  where amendment_id is not null;

create unique index if not exists event_submission_email_deliveries_submission_kind_root_unique
  on public.event_submission_email_deliveries (submission_id, kind)
  where amendment_id is null;

create table if not exists public.event_submission_management_links (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.event_submissions(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_submission_amendments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.event_submissions(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location_type text not null check (location_type in ('in_person', 'online', 'hybrid')),
  venue_name text,
  venue_address text,
  online_url text,
  registration_url text,
  organizer_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  decision_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_submission_amendments_window check (ends_at > starts_at),
  constraint event_submission_amendments_note_length check (organizer_note is null or length(organizer_note) <= 1200),
  constraint event_submission_amendments_decision_length check (decision_message is null or length(decision_message) <= 1200)
);

create unique index if not exists event_submission_amendments_one_open_idx
  on public.event_submission_amendments (submission_id)
  where status in ('draft', 'submitted');

create index if not exists event_submission_amendments_review_idx
  on public.event_submission_amendments (status, created_at desc);

alter table public.event_submission_email_deliveries
  drop constraint if exists event_submission_email_deliveries_amendment_id_fkey,
  add constraint event_submission_email_deliveries_amendment_id_fkey
    foreign key (amendment_id) references public.event_submission_amendments(id) on delete cascade;

alter table public.event_submission_management_links enable row level security;
alter table public.event_submission_amendments enable row level security;
revoke all on table public.event_submission_management_links, public.event_submission_amendments from public, anon, authenticated;
grant select, insert, update, delete on table public.event_submission_management_links, public.event_submission_amendments to service_role;

drop trigger if exists set_event_submission_management_links_updated_at on public.event_submission_management_links;
create trigger set_event_submission_management_links_updated_at before update on public.event_submission_management_links for each row execute function public.set_updated_at();
drop trigger if exists set_event_submission_amendments_updated_at on public.event_submission_amendments;
create trigger set_event_submission_amendments_updated_at before update on public.event_submission_amendments for each row execute function public.set_updated_at();

drop trigger if exists queue_event_submission_receipt_on_insert on public.event_submissions;

create or replace function public.ensure_event_submission_management_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.review_status = 'approved' and new.approved_event_id is not null then
    insert into public.event_submission_management_links (submission_id, expires_at)
    values (new.id, greatest(now() + interval '30 days', new.ends_at + interval '30 days'))
    on conflict (submission_id) do update set revoked_at = null, expires_at = excluded.expires_at;
  end if;
  return new;
end;
$$;
revoke all on function public.ensure_event_submission_management_link() from public, anon, authenticated;
drop trigger if exists ensure_event_submission_management_link_on_approval on public.event_submissions;
create trigger ensure_event_submission_management_link_on_approval
after insert or update of review_status, approved_event_id on public.event_submissions
for each row execute function public.ensure_event_submission_management_link();

create or replace function public.review_event_submission_amendment(
  p_amendment_id uuid, p_reviewed_by text, p_approve boolean, p_message text
)
returns public.event_submission_amendments language plpgsql security definer set search_path = public as $$
declare amendment public.event_submission_amendments; submission public.event_submissions;
begin
  select * into amendment from public.event_submission_amendments where id = p_amendment_id for update;
  if not found then raise exception 'event_submission_amendment_not_found'; end if;
  if amendment.status <> 'submitted' then raise exception 'event_submission_amendment_not_pending'; end if;
  select * into submission from public.event_submissions where id = amendment.submission_id for update;
  if submission.review_status <> 'approved' or submission.approved_event_id is null then raise exception 'event_submission_not_approved'; end if;
  if p_approve then
    update public.community_events set starts_at = amendment.starts_at, ends_at = amendment.ends_at,
      location_type = amendment.location_type, location_name = amendment.venue_name,
      venue_name = amendment.venue_name, venue_address = amendment.venue_address,
      location_label = coalesce(amendment.venue_address, amendment.venue_name, case when amendment.location_type = 'online' then 'Online' else location_label end),
      online_url = amendment.online_url, stream_url = amendment.online_url,
      registration_url = amendment.registration_url, external_url = coalesce(amendment.registration_url, amendment.online_url), updated_at = now()
    where id = submission.approved_event_id;
  end if;
  update public.event_submission_amendments set status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = lower(trim(p_reviewed_by)), reviewed_at = now(), decision_message = nullif(trim(p_message), '')
  where id = amendment.id returning * into amendment;
  insert into public.event_submission_email_deliveries (submission_id, amendment_id, kind, idempotency_key)
  values (submission.id, amendment.id, case when p_approve then 'amendment_approved' else 'amendment_rejected' end,
    'event-submission-' || submission.id::text || '-amendment-' || amendment.id::text || case when p_approve then '-approved' else '-rejected' end)
  on conflict do nothing;
  return amendment;
end;
$$;
revoke all on function public.review_event_submission_amendment(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.review_event_submission_amendment(uuid, text, boolean, text) to service_role;

create or replace function public.withdraw_event_submission(
  p_submission_id uuid, p_reviewed_by text, p_message text
)
returns public.event_submissions language plpgsql security definer set search_path = public as $$
declare submission public.event_submissions;
begin
  select * into submission from public.event_submissions where id = p_submission_id for update;
  if not found then raise exception 'event_submission_not_found'; end if;
  if submission.review_status <> 'approved' or submission.approved_event_id is null then raise exception 'event_submission_not_approved'; end if;
  update public.community_events set publication_status = 'archived', publish_to_website = false, updated_at = now()
  where id = submission.approved_event_id;
  update public.event_submission_management_links set revoked_at = coalesce(revoked_at, now()) where submission_id = submission.id;
  update public.event_submissions set organizer_message = nullif(trim(p_message), ''), reviewed_by = lower(trim(p_reviewed_by)), reviewed_at = now()
  where id = submission.id returning * into submission;
  insert into public.event_submission_email_deliveries (submission_id, kind, idempotency_key)
  values (submission.id, 'withdrawn', 'event-submission-' || submission.id::text || '-withdrawn') on conflict do nothing;
  return submission;
end;
$$;
revoke all on function public.withdraw_event_submission(uuid, text, text) from public, anon, authenticated;
grant execute on function public.withdraw_event_submission(uuid, text, text) to service_role;

commit;
