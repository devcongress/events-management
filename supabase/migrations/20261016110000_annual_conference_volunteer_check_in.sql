alter table public.annual_conference_access_grants
  drop constraint if exists annual_conference_access_grants_capability_valid,
  add constraint annual_conference_access_grants_capability_valid check (
    capability in (
      'work_plan.view_all', 'work_plan.manage', 'timeline.view', 'phases.manage',
      'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications',
      'speakers.view', 'speakers.manage', 'finance.view', 'ticketing.manage', 'ticketing.check_in'
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
      'speakers.view', 'speakers.manage', 'finance.view', 'ticketing.manage', 'ticketing.check_in'
    ) then
    raise exception 'This conference capability is not configurable for the member role.';
  end if;

  if v_membership.role = 'volunteer'
    and new.capability not in (
      'work_plan.view_all', 'work_plan.manage',
      'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications', 'ticketing.check_in'
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
  'Allows separately scoped admission scanning for assigned active Volunteers and Organizers.';

create or replace function public.check_in_annual_conference_bearer_ticket(
  p_edition_id uuid,
  p_qr_token text,
  p_checked_in_by_email text
)
returns table (outcome text, ticket_id uuid, order_id uuid, order_seat_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.annual_conference_tickets;
begin
  -- The scanner receives one neutral outcome for malformed, stale, cancelled,
  -- or unknown capabilities; it must not become a ticket-enumeration oracle.
  if p_edition_id is null
    or coalesce(trim(p_checked_in_by_email), '') = ''
    or coalesce(p_qr_token, '') !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  select * into ticket
  from public.annual_conference_tickets
  where edition_id = p_edition_id
    and qr_token_hash = encode(digest(p_qr_token, 'sha256'), 'hex')
  for update;

  if ticket.id is null or ticket.status not in ('issued', 'checked_in') then
    return query select 'invalid'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if ticket.status = 'checked_in' then
    return query select 'already_checked_in'::text, ticket.id, ticket.order_id, ticket.order_seat_number;
    return;
  end if;

  update public.annual_conference_tickets
  set status = 'checked_in', checked_in_at = now(), checked_in_by_email = lower(trim(p_checked_in_by_email))
  where id = ticket.id;

  return query select 'checked_in'::text, ticket.id, ticket.order_id, ticket.order_seat_number;
end;
$$;

revoke all on function public.check_in_annual_conference_bearer_ticket(uuid, text, text) from public, anon, authenticated;
grant execute on function public.check_in_annual_conference_bearer_ticket(uuid, text, text) to service_role;

create function public.find_annual_conference_admissions(p_edition_id uuid, p_search text)
returns table(ticket_id uuid, attendee_name text, status public.annual_conference_ticket_status, checked_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.attendee_name, t.status, t.checked_in_at from public.annual_conference_tickets t
  where t.edition_id = p_edition_id and t.status in ('issued', 'checked_in') and length(btrim(p_search)) between 3 and 254
    and (lower(btrim(t.attendee_email)) = lower(btrim(p_search))
      or position(lower(btrim(p_search)) in lower(t.attendee_name)) > 0)
  order by t.attendee_name, t.id limit 10;
$$;

create function public.check_in_annual_conference_named_ticket(p_edition_id uuid, p_ticket_id uuid, p_actor text)
returns text language plpgsql security definer set search_path = public as $$
declare ticket public.annual_conference_tickets;
begin
  if nullif(btrim(p_actor), '') is null then return 'invalid'; end if;
  select * into ticket from public.annual_conference_tickets
    where id = p_ticket_id and edition_id = p_edition_id and attendee_name is not null for update;
  if ticket.id is null or ticket.status not in ('issued', 'checked_in') then return 'invalid'; end if;
  if ticket.status = 'checked_in' then return 'already_checked_in'; end if;
  update public.annual_conference_tickets set status = 'checked_in', checked_in_at = now(), checked_in_by_email = lower(btrim(p_actor)) where id = ticket.id;
  return 'checked_in';
end;
$$;
revoke all on function public.find_annual_conference_admissions(uuid, text), public.check_in_annual_conference_named_ticket(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.find_annual_conference_admissions(uuid, text), public.check_in_annual_conference_named_ticket(uuid, uuid, text) to service_role;

