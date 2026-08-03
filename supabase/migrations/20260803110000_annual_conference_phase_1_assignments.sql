update public.annual_conference_tasks
set
  phase_id = '20260000-0000-4000-8000-000000000101',
  accountable_owner = case source_row
    when 4 then 'Elijah'
    when 8 then null
    when 13 then null
    when 14 then null
    else accountable_owner
  end,
  collaborators = case source_row
    when 4 then array['Elvis']::text[]
    else collaborators
  end,
  updated_by_email = 'angelateyvi@gmail.com'
where edition_id = '20260000-0000-4000-8000-000000000001'
  and source_row in (4, 5, 6, 8, 13, 14, 15, 16, 17, 19, 20);

insert into public.annual_conference_tasks (
  id,
  edition_id,
  phase_id,
  title,
  details,
  workstream,
  accountable_owner,
  collaborators,
  status,
  dependency_note,
  source,
  source_row,
  sort_order,
  created_by_email,
  updated_by_email
) values (
  '20260000-0000-4000-8000-000000000028',
  '20260000-0000-4000-8000-000000000001',
  '20260000-0000-4000-8000-000000000101',
  'Volunteer recruitment',
  'Recruit new volunteers and coordinate promotion of the call for volunteers.',
  'volunteers',
  null,
  '{}',
  'not_started',
  'Coordinate with the organizer responsible for conference calls and announcements.',
  'manual',
  28,
  27,
  'angelateyvi@gmail.com',
  'angelateyvi@gmail.com'
)
on conflict (id) do nothing;
