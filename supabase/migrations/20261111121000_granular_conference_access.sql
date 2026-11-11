-- Convert coarse decisions to explicit leaves. No new section inherits future permissions.
alter table public.annual_conference_access_grants drop constraint annual_conference_access_grants_capability_valid;
alter table public.annual_conference_access_grants disable trigger annual_conference_access_grants_eligibility;

with mapping(legacy, leaf) as (values
    ('work_plan.view_all', 'work_plan.tasks.view'),
    ('work_plan.manage', 'work_plan.tasks.view'),
    ('work_plan.manage', 'work_plan.tasks.manage'),
    ('timeline.view', 'work_plan.timeline.view'),
    ('phases.manage', 'work_plan.phases.manage'),
    ('volunteers.view_team', 'volunteers.directory.view'),
    ('volunteers.share_intake', 'volunteers.intake.share'),
    ('volunteers.review_applications', 'volunteers.reviews.view'),
    ('volunteers.review_applications', 'volunteers.reviews.manage'),
    ('speakers.view', 'speakers.proposals.view'),
    ('speakers.view', 'speakers.participation.view'),
    ('speakers.manage', 'speakers.proposals.view'),
    ('speakers.manage', 'speakers.proposals.manage'),
    ('speakers.manage', 'speakers.participation.view'),
    ('speakers.manage', 'speakers.participation.manage'),
    ('ticketing.view', 'ticketing.overview.view'),
    ('ticketing.view', 'ticketing.orders.view'),
    ('ticketing.view', 'ticketing.delivery.view'),
    ('ticketing.view', 'ticketing.sponsors.view'),
    ('ticketing.manage', 'ticketing.overview.view'),
    ('ticketing.manage', 'ticketing.overview.manage'),
    ('ticketing.manage', 'ticketing.orders.view'),
    ('ticketing.manage', 'ticketing.orders.manage'),
    ('ticketing.manage', 'ticketing.delivery.view'),
    ('ticketing.manage', 'ticketing.delivery.manage'),
    ('ticketing.manage', 'ticketing.sponsors.view'),
    ('ticketing.manage', 'ticketing.sponsors.manage'),
    ('registration.view', 'registration.summary.view'),
    ('registration.view', 'registration.guests.view'),
    ('registration.manage', 'registration.summary.view'),
    ('registration.manage', 'registration.guests.view'),
    ('registration.manage', 'registration.guests.manage')
), expanded as (
  select distinct on (g.edition_id, g.membership_id, m.leaf)
    g.edition_id, g.membership_id, m.leaf, g.enabled, g.granted_by_membership_id, g.created_at
  from public.annual_conference_access_grants g join mapping m on m.legacy = g.capability
  where g.enabled or m.legacy not like '%.manage' or m.leaf not like '%.view'
  order by g.edition_id, g.membership_id, m.leaf, g.enabled asc, g.created_at desc
)
insert into public.annual_conference_access_grants
  (edition_id, membership_id, capability, enabled, granted_by_membership_id, created_at)
select edition_id, membership_id, leaf, enabled, granted_by_membership_id, created_at from expanded
on conflict (edition_id, membership_id, capability) do nothing;

delete from public.annual_conference_access_grants where capability in ('work_plan.view_all', 'work_plan.manage', 'timeline.view', 'phases.manage', 'volunteers.view_team', 'volunteers.share_intake', 'volunteers.review_applications', 'speakers.view', 'speakers.manage', 'ticketing.view', 'ticketing.manage', 'registration.view', 'registration.manage');

alter table public.annual_conference_access_grants
  add constraint annual_conference_access_grants_capability_valid check (capability in (
  'work_plan.tasks.view',
  'work_plan.tasks.manage',
  'work_plan.timeline.view',
  'work_plan.phases.manage',
  'volunteers.directory.view',
  'volunteers.intake.share',
  'volunteers.reviews.view',
  'volunteers.reviews.manage',
  'volunteers.campaign.view',
  'volunteers.campaign.manage',
  'volunteers.campaign.send',
  'programme.view',
  'programme.manage',
  'speakers.proposals.view',
  'speakers.proposals.manage',
  'speakers.participation.view',
  'speakers.participation.manage',
  'speakers.delivery.view',
  'speakers.delivery.manage',
  'speakers.delivery.retry',
  'speakers.outcomes.view',
  'speakers.outcomes.manage',
  'speakers.outcomes.send',
  'finance.view',
  'ticketing.overview.view',
  'ticketing.overview.manage',
  'ticketing.orders.view',
  'ticketing.orders.manage',
  'ticketing.delivery.view',
  'ticketing.delivery.manage',
  'ticketing.delivery.retry',
  'ticketing.sponsors.view',
  'ticketing.sponsors.manage',
  'ticketing.complimentary.view',
  'ticketing.complimentary.manage',
  'ticketing.coupons.view',
  'ticketing.coupons.manage',
  'registration.summary.view',
  'registration.guests.view',
  'registration.guests.manage',
  'registration.form.view',
  'registration.form.manage',
  'registration.emails.view',
  'registration.emails.manage',
  'registration.emails.retry',
  'registration.community.view',
  'registration.community.manage',
  'registration.blasts.view',
  'registration.blasts.manage',
  'registration.blasts.send',
  'ticketing.check_in'
  ));

create or replace function public.enforce_annual_conference_access_grant_eligibility()
returns trigger language plpgsql set search_path = public as $$
declare
  v_membership public.admin_memberships;
begin
  select * into v_membership from public.admin_memberships where id = new.membership_id for update;
  if not found or v_membership.status <> 'active' then
    raise exception 'Conference access can only be configured for an active member.';
  end if;
  if v_membership.role not in ('organizer', 'volunteer', 'member') or
    (v_membership.role = 'volunteer' and new.capability not in (
  'work_plan.tasks.view',
  'work_plan.tasks.manage',
  'volunteers.directory.view',
  'volunteers.intake.share',
  'volunteers.reviews.view',
  'volunteers.reviews.manage',
  'ticketing.check_in'
    )) then
    raise exception 'This conference capability is not configurable for the member role.';
  end if;
  return new;
end;
$$;

alter table public.annual_conference_access_grants enable trigger annual_conference_access_grants_eligibility;
