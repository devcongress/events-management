-- Keep presenter-submitted resource links separate from the archive's
-- compatibility slides_url field until an organizer publishes the item.
alter table public.speaker_submissions
  add column if not exists resource_url text;

alter table public.speaker_submissions
  drop constraint if exists speaker_submissions_resource_url_shape;

alter table public.speaker_submissions
  add constraint speaker_submissions_resource_url_shape
  check (
    resource_url is null
    or (
      char_length(resource_url) between 1 and 2048
      and resource_url ~ '^https://[^[:space:]]+$'
    )
  );

alter table public.annual_conference_speaker_submissions
  add column if not exists resource_url text;

alter table public.annual_conference_speaker_submissions
  drop constraint if exists annual_conference_speaker_submissions_resource_url_shape;

alter table public.annual_conference_speaker_submissions
  add constraint annual_conference_speaker_submissions_resource_url_shape
  check (
    resource_url is null
    or (
      char_length(resource_url) between 1 and 2048
      and resource_url ~ '^https://[^[:space:]]+$'
    )
  );
