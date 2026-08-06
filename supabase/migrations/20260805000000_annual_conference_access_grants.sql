create table public.annual_conference_access_grants (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  membership_id uuid not null references public.admin_memberships(id) on delete cascade,
  capability text not null,
  granted_by_membership_id uuid references public.admin_memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint annual_conference_access_grants_capability_valid check (
    capability in (
      'work_plan.view_all',
      'work_plan.manage',
      'timeline.view',
      'phases.manage',
      'volunteers.view_team',
      'volunteers.share_intake',
      'volunteers.review_applications',
      'finance.view'
    )
  ),
  constraint annual_conference_access_grants_unique unique (edition_id, membership_id, capability)
);

create index annual_conference_access_grants_member_edition_idx
  on public.annual_conference_access_grants (membership_id, edition_id);

alter table public.annual_conference_access_grants enable row level security;

revoke all on table public.annual_conference_access_grants from public, anon, authenticated;
grant select, insert, delete on table public.annual_conference_access_grants to service_role;
