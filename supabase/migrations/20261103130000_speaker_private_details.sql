-- Private speaker workspace details; never included in public programme projections.
alter table public.annual_conference_sessions
  add column accessibility_requirements text,
  add column headshot_url text,
  add column social_handle text;
