alter table public.annual_conference_access_grants
  drop constraint if exists annual_conference_access_grants_capability_valid,
  add constraint annual_conference_access_grants_capability_valid check (
    capability in (
      'work_plan.view_all', 'work_plan.manage', 'timeline.view', 'phases.manage',
      'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications',
      'speakers.view', 'speakers.manage', 'finance.view', 'ticketing.manage'
    )
  );

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
      'speakers.view', 'speakers.manage', 'finance.view', 'ticketing.manage'
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

revoke all on function public.enforce_annual_conference_access_grant_eligibility() from public;
grant execute on function public.enforce_annual_conference_access_grant_eligibility() to service_role;

comment on function public.enforce_annual_conference_access_grant_eligibility() is
  'Allows Ticketing responsibility for active Organizers only; Volunteers remain ineligible.';
