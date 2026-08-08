-- Secure presenter follow-up links update an existing JSON-backed Talk record.
-- `talk_id` is deliberately not a foreign key because Talks remain in the
-- versioned app_json_documents compatibility store during this migration wave.
alter table public.speaker_intake_links
  add column if not exists talk_id uuid,
  add column if not exists requested_fields text[] not null default '{}'::text[];

alter table public.speaker_intake_links
  drop constraint if exists speaker_intake_purpose_check;

alter table public.speaker_intake_links
  add constraint speaker_intake_purpose_check
  check (purpose in ('archive_backfill', 'selected_speaker_confirmation', 'archive_materials_follow_up'));

create or replace function public.has_distinct_text_array_values(p_values text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select cardinality(p_values) = cardinality(array(select distinct unnest(p_values)));
$$;

alter table public.speaker_intake_links
  add constraint speaker_intake_follow_up_shape_check
  check (
    (purpose <> 'archive_materials_follow_up' and talk_id is null and cardinality(requested_fields) = 0)
    or (
      purpose = 'archive_materials_follow_up'
      and talk_id is not null
      and cardinality(requested_fields) between 1 and 3
      and requested_fields <@ array['abstract', 'bio', 'slides_url']::text[]
      and public.has_distinct_text_array_values(requested_fields)
    )
  );

create index if not exists speaker_intake_links_follow_up_active_idx
  on public.speaker_intake_links (event_id, talk_id, created_at desc)
  where purpose = 'archive_materials_follow_up' and used_at is null;
