insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'meetup-media',
  'meetup-media',
  true,
  5242880,
  array[
    'image/avif',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Meetup media is publicly readable" on storage.objects;
create policy "Meetup media is publicly readable"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'meetup-media');
