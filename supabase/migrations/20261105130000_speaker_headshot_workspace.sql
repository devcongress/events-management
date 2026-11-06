-- Private original headshots are separate from external links and badge photos.
alter table public.annual_conference_sessions
  add column headshot_photo_path text,
  add column headshot_revision integer not null default 0,
  add constraint annual_conference_headshot_revision_nonnegative check (headshot_revision >= 0),
  add constraint annual_conference_headshot_single_source check (headshot_url is null or headshot_photo_path is null);
