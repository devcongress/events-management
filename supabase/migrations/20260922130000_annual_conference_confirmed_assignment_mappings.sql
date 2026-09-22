-- The organizer confirmed these legacy spreadsheet labels after the automatic
-- display-name backfill could not resolve their current member identities.
-- Keep this edition-scoped and idempotent: it must never create fuzzy access.

with mappings (legacy_label, email) as (
  values
    ('angela', 'angelateyvi@gmail.com'),
    ('dede', 'blossomddb@gmail.com'),
    ('ernest', 'essienernest.kojoowusu@gmail.com'),
    ('philipa', 'abenabennett@gmail.com')
)
update public.annual_conference_tasks as task
set accountable_owner = mapping.email
from mappings as mapping
where task.edition_id in (
  select id
  from public.annual_conference_editions
  where year = 2026
)
  and lower(trim(task.accountable_owner)) = mapping.legacy_label
  and task.accountable_owner is distinct from mapping.email;

with mappings (legacy_label, email) as (
  values
    ('angela', 'angelateyvi@gmail.com'),
    ('dede', 'blossomddb@gmail.com'),
    ('ernest', 'essienernest.kojoowusu@gmail.com'),
    ('philipa', 'abenabennett@gmail.com')
), replacements as (
  select
    task.id,
    array_agg(coalesce(mapping.email, collaborator.value) order by collaborator.position) as collaborators
  from public.annual_conference_tasks as task
  join public.annual_conference_editions as edition on edition.id = task.edition_id
  cross join lateral unnest(task.collaborators) with ordinality as collaborator(value, position)
  left join mappings as mapping on lower(trim(collaborator.value)) = mapping.legacy_label
  where edition.year = 2026
  group by task.id
)
update public.annual_conference_tasks as task
set collaborators = replacements.collaborators
from replacements
where task.id = replacements.id
  and task.collaborators is distinct from replacements.collaborators;
