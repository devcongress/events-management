-- Website lineup publication controls for confirmed annual conference speakers.
alter table public.annual_conference_sessions
  add column website_featured boolean not null default false,
  add column website_role text,
  add column website_organization text,
  add column website_featured_at timestamptz,
  add constraint annual_conference_sessions_website_role_length check (website_role is null or char_length(website_role) <= 120),
  add constraint annual_conference_sessions_website_org_length check (website_organization is null or char_length(website_organization) <= 120);

create index annual_conference_sessions_website_featured_idx
  on public.annual_conference_sessions (edition_id, website_featured_at, id)
  where status = 'confirmed' and website_featured = true;

-- Initial DevCon26 featured speaker lineup (Edem, Clinton, Stefan, Silas).
update public.annual_conference_sessions
set
  website_featured = true,
  website_role = v.website_role,
  website_organization = v.website_organization,
  website_featured_at = coalesce(website_featured_at, now())
from (
  values
    ('65a61474-2a6c-4313-81be-f667c4e2a623'::uuid, 'Software Architect', 'Microsoft'),
    ('f14f1d3a-d1fc-429e-abcb-20205d766265'::uuid, 'CEO', 'iSupreme'),
    ('8be3abf6-caa7-4da3-9a9a-362601af18b9'::uuid, 'Principal Engineer', 'Spry'),
    ('bf8fc371-e3ec-4e0a-9973-5f99ceecde66'::uuid, 'AI/ML Engineer', null)
) as v(id, website_role, website_organization)
where public.annual_conference_sessions.id = v.id
  and public.annual_conference_sessions.status = 'confirmed';
