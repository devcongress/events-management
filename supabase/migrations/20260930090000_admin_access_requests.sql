create type public.admin_access_request_status as enum ('pending', 'approved', 'declined');

create table public.admin_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  reason text,
  status public.admin_access_request_status not null default 'pending',
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_access_requests_email_lowercase check (email = lower(email)),
  constraint admin_access_requests_display_name_not_blank check (length(trim(display_name)) between 1 and 120),
  constraint admin_access_requests_reason_bounded check (reason is null or length(reason) <= 1000)
);

create unique index admin_access_requests_pending_email_idx
  on public.admin_access_requests (email) where status = 'pending';
create unique index admin_access_requests_pending_user_idx
  on public.admin_access_requests (user_id) where status = 'pending';
create index admin_access_requests_queue_idx
  on public.admin_access_requests (created_at asc) where status = 'pending';

create table public.admin_access_request_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint admin_access_request_sessions_email_lowercase check (email = lower(email)),
  constraint admin_access_request_sessions_expiry_after_create check (expires_at > created_at)
);
create index admin_access_request_sessions_active_hash_idx
  on public.admin_access_request_sessions (token_hash) where revoked_at is null;

alter table public.admin_access_requests enable row level security;
alter table public.admin_access_request_sessions enable row level security;
grant usage on type public.admin_access_request_status to service_role;
grant select, insert, update, delete on public.admin_access_requests to service_role;
grant select, insert, update, delete on public.admin_access_request_sessions to service_role;

create or replace function public.submit_admin_access_request(
  p_user_id uuid,
  p_email text,
  p_display_name text,
  p_reason text default null
) returns public.admin_access_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare request public.admin_access_requests;
begin
  perform pg_advisory_xact_lock(hashtext(lower(trim(p_email))));
  if exists (select 1 from public.admin_memberships where email = lower(trim(p_email))) then
    raise exception 'membership_exists';
  end if;
  select * into request from public.admin_access_requests
    where user_id = p_user_id and email = lower(trim(p_email)) and status = 'pending'
    for update;
  if found then return request; end if;
  insert into public.admin_access_requests (user_id, email, display_name, reason)
    values (p_user_id, lower(trim(p_email)), trim(p_display_name), nullif(trim(coalesce(p_reason, '')), ''))
    returning * into request;
  return request;
end; $$;

create or replace function public.decide_admin_access_request(
  p_request_id uuid,
  p_actor_id uuid,
  p_role public.admin_role default null,
  p_approve boolean default false
) returns public.admin_access_requests
language plpgsql security definer set search_path = public, pg_temp as $$
declare request public.admin_access_requests; member public.admin_memberships;
begin
  select * into request from public.admin_access_requests where id = p_request_id;
  if not found or request.status <> 'pending' then raise exception 'request_not_pending'; end if;
  perform pg_advisory_xact_lock(hashtext(request.email));
  select * into request from public.admin_access_requests where id = p_request_id for update;
  if not found or request.status <> 'pending' then raise exception 'request_not_pending'; end if;
  perform 1 from public.admin_memberships memberships
    join public.admin_sessions sessions on sessions.membership_id = memberships.id
    where sessions.user_id = p_actor_id and sessions.revoked_at is null
      and sessions.expires_at > now() and memberships.status = 'active' and memberships.role = 'owner'
    for share of memberships;
  if not found then raise exception 'owner_required'; end if;
  if p_approve then
    if p_role is null or p_role not in ('organizer', 'volunteer') then raise exception 'invalid_role'; end if;
    select * into member from public.admin_memberships where email = request.email for update;
    if found then
      if member.status = 'disabled' then raise exception 'disabled_membership'; end if;
      raise exception 'membership_exists';
    end if;
    insert into public.admin_memberships (email, display_name, role, status, added_by)
      values (request.email, request.display_name, p_role, 'active', p_actor_id);
    update public.admin_access_requests set status = 'approved', decided_at = now(), decided_by = p_actor_id
      where id = request.id returning * into request;
    insert into public.admin_audit_log (actor_user_id, action, target_type, target_id, metadata)
      values (p_actor_id, 'admin.access_request_approved', 'admin_access_request', request.id::text, jsonb_build_object('role', p_role));
  else
    update public.admin_access_requests set status = 'declined', decided_at = now(), decided_by = p_actor_id
      where id = request.id returning * into request;
    insert into public.admin_audit_log (actor_user_id, action, target_type, target_id)
      values (p_actor_id, 'admin.access_request_declined', 'admin_access_request', request.id::text);
  end if;
  return request;
end; $$;
grant execute on function public.submit_admin_access_request(uuid, text, text, text) to service_role;
grant execute on function public.decide_admin_access_request(uuid, uuid, public.admin_role, boolean) to service_role;
revoke all on function public.submit_admin_access_request(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.decide_admin_access_request(uuid, uuid, public.admin_role, boolean) from public, anon, authenticated;
revoke all on table public.admin_access_requests from anon, authenticated;
revoke all on table public.admin_access_request_sessions from anon, authenticated;
