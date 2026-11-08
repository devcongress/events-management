alter table public.annual_conference_access_grants
  drop constraint if exists annual_conference_access_grants_capability_valid,
  add constraint annual_conference_access_grants_capability_valid check (
    capability in (
      'work_plan.view_all', 'work_plan.manage', 'timeline.view', 'phases.manage',
      'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications',
      'speakers.view', 'speakers.manage', 'finance.view', 'ticketing.view',
      'ticketing.manage', 'ticketing.check_in', 'registration.view', 'registration.manage'
    )
  );

create or replace function public.enforce_annual_conference_access_grant_eligibility()
returns trigger language plpgsql set search_path = public as $$
declare
  v_membership public.admin_memberships;
begin
  select * into v_membership from public.admin_memberships
    where id = new.membership_id for update;

  if not found or v_membership.status <> 'active' then
    raise exception 'Conference access can only be configured for an active member.';
  end if;

  if v_membership.role = 'organizer' and new.capability not in (
    'work_plan.view_all', 'work_plan.manage',
    'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications',
    'speakers.view', 'speakers.manage', 'finance.view', 'ticketing.manage', 'ticketing.check_in'
  ) then
    raise exception 'This conference capability is not configurable for the member role.';
  end if;

  if v_membership.role = 'member' and new.capability not in (
    'work_plan.view_all', 'work_plan.manage',
    'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications',
    'speakers.view', 'speakers.manage', 'finance.view', 'ticketing.view', 'ticketing.manage',
    'ticketing.check_in', 'registration.view', 'registration.manage'
  ) then
    raise exception 'This conference capability is not configurable for the member role.';
  end if;

  if v_membership.role = 'volunteer' and new.capability not in (
    'work_plan.view_all', 'work_plan.manage', 'volunteers.view_team',
    'volunteers.share_intake', 'volunteers.review_applications', 'ticketing.check_in'
  ) then
    raise exception 'This conference capability is not configurable for the member role.';
  end if;

  if v_membership.role not in ('organizer', 'volunteer', 'member') then
    raise exception 'This conference capability is not configurable for the member role.';
  end if;

  return new;
end;
$$;

create function public.clear_restricted_member_conference_grants()
returns trigger language plpgsql set search_path = public as $$
begin
  if (old.role = 'member' or new.role = 'member')
    and (old.role is distinct from new.role or old.status is distinct from new.status) then
    delete from public.annual_conference_access_grants where membership_id = old.id;
  end if;

  return new;
end;
$$;

create trigger clear_restricted_member_conference_grants
before update of role, status on public.admin_memberships
for each row execute function public.clear_restricted_member_conference_grants();

revoke all on function public.clear_restricted_member_conference_grants() from public;
grant execute on function public.clear_restricted_member_conference_grants() to service_role;

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
    if p_role is null or p_role not in ('organizer', 'volunteer', 'member') then raise exception 'invalid_role'; end if;
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
