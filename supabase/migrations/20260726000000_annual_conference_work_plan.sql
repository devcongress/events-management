create type public.annual_conference_task_status as enum (
  'not_started',
  'in_progress',
  'blocked',
  'done'
);

create type public.annual_conference_workstream as enum (
  'programme_speakers',
  'volunteers',
  'website_registration',
  'sponsors_partners',
  'venue_production_logistics',
  'creative_marketing',
  'photo_video_livestream',
  'feedback_reporting'
);

create type public.annual_conference_task_priority as enum (
  'high',
  'medium',
  'low'
);

create table public.annual_conference_editions (
  id uuid primary key default gen_random_uuid(),
  year integer not null unique,
  name text not null,
  label text not null,
  provisional_date date,
  date_status text not null default 'provisional',
  venue_note text,
  keynote_note text,
  task_creator_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_editions_year_check check (year between 2000 and 2200),
  constraint annual_conference_editions_name_not_blank check (length(trim(name)) > 0),
  constraint annual_conference_editions_label_not_blank check (length(trim(label)) > 0),
  constraint annual_conference_editions_date_status_check check (date_status in ('provisional', 'confirmed')),
  constraint annual_conference_editions_task_creator_email_lowercase check (
    task_creator_email = lower(task_creator_email)
    and length(trim(task_creator_email)) > 0
  )
);

create table public.annual_conference_tasks (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  title text not null,
  details text,
  internal_note text,
  workstream public.annual_conference_workstream not null,
  accountable_owner text,
  collaborators text[] not null default '{}',
  priority public.annual_conference_task_priority,
  target_date date,
  status public.annual_conference_task_status not null default 'not_started',
  dependency_note text,
  source text not null default 'manual',
  source_row integer,
  sort_order integer not null default 0,
  created_by_email text,
  updated_by_email text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_tasks_title_not_blank check (length(trim(title)) > 0),
  constraint annual_conference_tasks_owner_not_blank check (
    accountable_owner is null or length(trim(accountable_owner)) > 0
  ),
  constraint annual_conference_tasks_source_check check (source in ('excel_seed', 'manual')),
  constraint annual_conference_tasks_source_row_check check (source_row is null or source_row > 0),
  constraint annual_conference_tasks_sort_order_check check (sort_order >= 0)
);

create index annual_conference_tasks_edition_order_idx
  on public.annual_conference_tasks (edition_id, sort_order, created_at);

create index annual_conference_tasks_edition_status_idx
  on public.annual_conference_tasks (edition_id, status);

create index annual_conference_tasks_edition_workstream_idx
  on public.annual_conference_tasks (edition_id, workstream);

create index annual_conference_tasks_edition_owner_idx
  on public.annual_conference_tasks (edition_id, accountable_owner);

create trigger set_annual_conference_editions_updated_at
before update on public.annual_conference_editions
for each row
execute function public.set_updated_at();

create trigger set_annual_conference_tasks_updated_at
before update on public.annual_conference_tasks
for each row
execute function public.set_updated_at();

alter table public.annual_conference_editions enable row level security;
alter table public.annual_conference_tasks enable row level security;

grant usage on schema public to service_role;
grant usage on type public.annual_conference_task_status to service_role;
grant usage on type public.annual_conference_workstream to service_role;
grant usage on type public.annual_conference_task_priority to service_role;
grant select, insert, update, delete on public.annual_conference_editions to service_role;
grant select, insert, update, delete on public.annual_conference_tasks to service_role;

insert into public.annual_conference_editions (
  id,
  year,
  name,
  label,
  provisional_date,
  date_status,
  venue_note,
  keynote_note,
  task_creator_email
) values (
  '20260000-0000-4000-8000-000000000001',
  2026,
  'DevCongress Annual Conference',
  'December 2026',
  '2026-12-19',
  'provisional',
  'Current venue candidates: UPSA or Accra Digital Centre.',
  'Patrick G. Awuah is the preferred keynote candidate.',
  'angelateyvi@gmail.com'
)
on conflict (id) do nothing;

insert into public.annual_conference_tasks (
  id,
  edition_id,
  title,
  details,
  internal_note,
  workstream,
  accountable_owner,
  collaborators,
  priority,
  status,
  dependency_note,
  source,
  source_row,
  sort_order,
  completed_at
) values
  (
    '20260000-0000-4000-8000-000000000002',
    '20260000-0000-4000-8000-000000000001',
    'Date',
    'Set the conference date. The current starting point is 19 December 2026.',
    'The date remains provisional until the organizers confirm it.',
    'venue_production_logistics',
    null,
    '{}',
    'high',
    'done',
    null,
    'excel_seed',
    2,
    1,
    '2026-07-26T00:00:00.000Z'
  ),
  (
    '20260000-0000-4000-8000-000000000003',
    '20260000-0000-4000-8000-000000000001',
    'Theme',
    'Agree the event theme.',
    null,
    'creative_marketing',
    null,
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    3,
    2,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000004',
    '20260000-0000-4000-8000-000000000001',
    'Venue',
    'Confirm the location, capacity, and breakout rooms.',
    'Current candidates: UPSA or Accra Digital Centre.',
    'venue_production_logistics',
    'Angela',
    array['Elijah', 'Elvis'],
    null,
    'not_started',
    null,
    'excel_seed',
    4,
    3,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000005',
    '20260000-0000-4000-8000-000000000001',
    'Keynote speaker(s)',
    'Invite the keynote speaker. The original shortlist also mentioned the NSMQ quiz mistress.',
    'Patrick G. Awuah is the preferred candidate.',
    'programme_speakers',
    'Elijah',
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    5,
    4,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000006',
    '20260000-0000-4000-8000-000000000001',
    'Call for Speakers (announce)',
    'Define the submission criteria, deadline, and review committee, then announce the call.',
    null,
    'programme_speakers',
    null,
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    6,
    5,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000007',
    '20260000-0000-4000-8000-000000000001',
    'Speaker Submission Form (Website)',
    'Publish the speaker form for name, bio, topic, abstract, format, and technical requirements.',
    null,
    'programme_speakers',
    'Elvis',
    array['Ernest'],
    null,
    'not_started',
    null,
    'excel_seed',
    7,
    6,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000008',
    '20260000-0000-4000-8000-000000000001',
    'Call for Volunteers',
    'Announce volunteer recruitment.',
    null,
    'volunteers',
    'Elvis',
    array['Ernest'],
    null,
    'not_started',
    null,
    'excel_seed',
    8,
    7,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000009',
    '20260000-0000-4000-8000-000000000001',
    'Volunteer Submission Form (Website)',
    'The volunteer submission form is live. Volunteer review, assignment, briefing, and communications will be itemized as separate later-stage tasks.',
    'Done means the public form is live; it does not mean the volunteer workflow is complete.',
    'volunteers',
    'Elvis',
    array['Ernest'],
    null,
    'done',
    null,
    'excel_seed',
    9,
    8,
    '2026-07-26T00:00:00.000Z'
  ),
  (
    '20260000-0000-4000-8000-000000000010',
    '20260000-0000-4000-8000-000000000001',
    'Workshops/Breakout Sessions planning',
    'Confirm facilitators, room assignments, and required materials or equipment.',
    null,
    'programme_speakers',
    null,
    '{}',
    null,
    'not_started',
    'Depends on the venue and breakout-room setup.',
    'excel_seed',
    10,
    9,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000011',
    '20260000-0000-4000-8000-000000000001',
    'Panel Discussions',
    'Confirm topics, moderator, panelists, and format.',
    null,
    'programme_speakers',
    null,
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    11,
    10,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000012',
    '20260000-0000-4000-8000-000000000001',
    'Demo Sessions',
    'Confirm presenters, time slots, and power or AV needs.',
    null,
    'programme_speakers',
    null,
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    12,
    11,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000013',
    '20260000-0000-4000-8000-000000000001',
    'Flyer Designs',
    'Prepare digital and print versions in the required social and email sizes.',
    null,
    'creative_marketing',
    'Emmanuel',
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    13,
    12,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000014',
    '20260000-0000-4000-8000-000000000001',
    'Backdrop/Stage Designs',
    'Design the main stage, photo wall, and other branding elements.',
    null,
    'creative_marketing',
    'Emmanuel',
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    14,
    13,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000015',
    '20260000-0000-4000-8000-000000000001',
    'Website/Registration Page',
    'Publish the conference page with ticketing, agenda, and embedded forms.',
    null,
    'website_registration',
    'Elvis',
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    15,
    14,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000016',
    '20260000-0000-4000-8000-000000000001',
    'Sponsorship Packages',
    'Define sponsorship tiers, prepare the deck, and build the outreach list.',
    null,
    'sponsors_partners',
    'Dede',
    array['Angela', 'Philipa'],
    null,
    'not_started',
    null,
    'excel_seed',
    16,
    15,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000017',
    '20260000-0000-4000-8000-000000000001',
    'Call for sponsors and partners',
    'Run partner outreach and follow-ups.',
    null,
    'sponsors_partners',
    null,
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    17,
    16,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000018',
    '20260000-0000-4000-8000-000000000001',
    'Catering',
    'Plan breakfast and lunch.',
    null,
    'venue_production_logistics',
    'Dede',
    array['Ernest'],
    null,
    'not_started',
    null,
    'excel_seed',
    18,
    17,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000019',
    '20260000-0000-4000-8000-000000000001',
    'Photography',
    'Book the photographer and agree the shot list and deliverables timeline.',
    null,
    'photo_video_livestream',
    'Dede',
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    19,
    18,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000020',
    '20260000-0000-4000-8000-000000000001',
    'Videography/Livestream',
    'Confirm the videographer, recording setup, and streaming platform.',
    'Talk to Kweku Tech about sponsorship.',
    'photo_video_livestream',
    'Dede',
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    20,
    19,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000021',
    '20260000-0000-4000-8000-000000000001',
    'AV Equipment',
    'Confirm microphones, projectors, screens, and breakout-room technology.',
    null,
    'venue_production_logistics',
    null,
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    21,
    20,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000022',
    '20260000-0000-4000-8000-000000000001',
    'Wifi/Connectivity',
    'Confirm sufficient bandwidth for high-density use.',
    null,
    'venue_production_logistics',
    'Elijah',
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    22,
    21,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000023',
    '20260000-0000-4000-8000-000000000001',
    'Badges/Lanyards',
    'Plan design, printing, and the check-in or registration process.',
    null,
    'venue_production_logistics',
    null,
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    23,
    22,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000024',
    '20260000-0000-4000-8000-000000000001',
    'Swag/Merchandise',
    'Confirm items, sponsor branding, and quantities.',
    null,
    'venue_production_logistics',
    null,
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    24,
    23,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000025',
    '20260000-0000-4000-8000-000000000001',
    'Signage/Wayfinding',
    'Prepare room labels, directional signs, and schedule boards.',
    null,
    'venue_production_logistics',
    null,
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    25,
    24,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000026',
    '20260000-0000-4000-8000-000000000001',
    'Feedback Survey',
    'Prepare the post-event form and QR code.',
    null,
    'feedback_reporting',
    'Elvis',
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    26,
    25,
    null
  ),
  (
    '20260000-0000-4000-8000-000000000027',
    '20260000-0000-4000-8000-000000000001',
    'Create Program outline',
    'Define the agenda structure, session blocks, and timings.',
    null,
    'programme_speakers',
    'Angela',
    '{}',
    null,
    'not_started',
    null,
    'excel_seed',
    27,
    26,
    null
  )
on conflict (id) do nothing;
