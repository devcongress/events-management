-- A row now records an edition-specific decision, including a deliberate denial
-- of a permission otherwise inherited from the member's role.
alter table public.annual_conference_access_grants
  add column if not exists enabled boolean not null default true;

grant update on table public.annual_conference_access_grants to service_role;

create or replace function public.enforce_annual_conference_access_grant_eligibility()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_membership public.admin_memberships;
begin
  select * into v_membership
  from public.admin_memberships
  where id = new.membership_id
  for update;

  if not found or v_membership.status <> 'active' then
    raise exception 'Conference access can only be configured for an active member.';
  end if;

  if v_membership.role = 'organizer'
    and new.capability not in (
      'work_plan.view_all', 'work_plan.manage',
      'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications',
      'speakers.view', 'speakers.manage', 'finance.view'
    ) then
    raise exception 'This conference capability is not configurable for the member role.';
  end if;

  if v_membership.role = 'volunteer'
    and new.capability not in (
      'work_plan.view_all', 'work_plan.manage',
      'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications'
    ) then
    raise exception 'This conference capability is not configurable for the member role.';
  end if;

  if v_membership.role not in ('organizer', 'volunteer') then
    raise exception 'This conference capability is not configurable for the member role.';
  end if;

  return new;
end;
$$;

drop trigger if exists annual_conference_access_grants_eligibility on public.annual_conference_access_grants;
create trigger annual_conference_access_grants_eligibility
before insert or update of membership_id, capability, enabled on public.annual_conference_access_grants
for each row execute function public.enforce_annual_conference_access_grant_eligibility();

revoke all on function public.enforce_annual_conference_access_grant_eligibility() from public;
grant execute on function public.enforce_annual_conference_access_grant_eligibility() to service_role;

comment on function public.enforce_annual_conference_access_grant_eligibility() is
  'Validates editable, edition-specific permission overrides for active Organizers and Volunteers.';
