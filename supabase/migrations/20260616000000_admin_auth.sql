create type public.admin_role as enum ('owner', 'organizer');
create type public.admin_membership_status as enum ('active', 'disabled');

create table public.admin_memberships (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  role public.admin_role not null default 'organizer',
  status public.admin_membership_status not null default 'active',
  added_by uuid references auth.users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_memberships_email_not_blank check (length(trim(email)) > 0),
  constraint admin_memberships_email_lowercase check (email = lower(email)),
  constraint admin_memberships_email_unique unique (email)
);

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_id uuid not null references public.admin_memberships(id) on delete cascade,
  email text not null,
  role public.admin_role not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  user_agent text,
  ip_address text,
  constraint admin_sessions_email_not_blank check (length(trim(email)) > 0),
  constraint admin_sessions_expiry_after_create check (expires_at > created_at)
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role public.admin_role,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_log_action_not_blank check (length(trim(action)) > 0),
  constraint admin_audit_log_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index admin_memberships_status_email_idx
  on public.admin_memberships (status, email);

create index admin_sessions_user_expires_idx
  on public.admin_sessions (user_id, expires_at desc);

create index admin_sessions_active_hash_idx
  on public.admin_sessions (token_hash)
  where revoked_at is null;

create index admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

create trigger set_admin_memberships_updated_at
before update on public.admin_memberships
for each row
execute function public.set_updated_at();

alter table public.admin_memberships enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_audit_log enable row level security;

grant usage on schema public to service_role;
grant usage on type public.admin_role to service_role;
grant usage on type public.admin_membership_status to service_role;
grant select, insert, update, delete on public.admin_memberships to service_role;
grant select, insert, update, delete on public.admin_sessions to service_role;
grant select, insert on public.admin_audit_log to service_role;
