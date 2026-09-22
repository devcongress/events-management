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
    raise exception 'Conference access can only be granted to an active member.';
  end if;

  if (
    new.capability in ('finance.view', 'speakers.view', 'speakers.manage')
    and v_membership.role <> 'organizer'
  ) or (
    new.capability = 'work_plan.manage'
    and v_membership.role not in ('organizer', 'volunteer')
  ) or (
    new.capability not in ('finance.view', 'speakers.view', 'speakers.manage', 'work_plan.manage')
    and v_membership.role <> 'volunteer'
  ) then
    raise exception 'This conference capability is not eligible for the member role.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_annual_conference_access_grant_eligibility() from public;
grant execute on function public.enforce_annual_conference_access_grant_eligibility() to service_role;

comment on function public.enforce_annual_conference_access_grant_eligibility() is
  'Allows work-plan management grants for active Organizers and Volunteers; Finance and Speaker grants remain Organizer-only.';
