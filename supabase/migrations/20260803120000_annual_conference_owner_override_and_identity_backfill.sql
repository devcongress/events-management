-- Replace legacy spreadsheet display-name assignments with canonical membership
-- emails only when the first-name alias identifies exactly one active member.
-- Ambiguous or unmatched values remain unchanged for manual review.

with unique_active_member_aliases as (
  select
    lower(split_part(trim(display_name), ' ', 1)) as alias,
    min(email) as email
  from public.admin_memberships
  where status = 'active'
    and display_name is not null
    and length(trim(display_name)) > 0
  group by lower(split_part(trim(display_name), ' ', 1))
  having count(*) = 1
)
update public.annual_conference_tasks as task
set accountable_owner = member.email
from unique_active_member_aliases as member
where task.accountable_owner is not null
  and position('@' in task.accountable_owner) = 0
  and lower(trim(task.accountable_owner)) = member.alias;

with unique_active_member_aliases as (
  select
    lower(split_part(trim(display_name), ' ', 1)) as alias,
    min(email) as email
  from public.admin_memberships
  where status = 'active'
    and display_name is not null
    and length(trim(display_name)) > 0
  group by lower(split_part(trim(display_name), ' ', 1))
  having count(*) = 1
)
update public.annual_conference_tasks as task
set collaborators = (
  select array_agg(coalesce(member.email, collaborator.value) order by collaborator.position)
  from unnest(task.collaborators) with ordinality as collaborator(value, position)
  left join unique_active_member_aliases as member
    on position('@' in collaborator.value) = 0
    and lower(trim(collaborator.value)) = member.alias
)
where exists (
  select 1
  from unnest(task.collaborators) as collaborator(value)
  join unique_active_member_aliases as member
    on position('@' in collaborator.value) = 0
    and lower(trim(collaborator.value)) = member.alias
);
