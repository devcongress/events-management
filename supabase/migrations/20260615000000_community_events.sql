do $$
begin
  if not exists (select 1 from pg_type where typname = 'community_event_status') then
    create type public.community_event_status as enum ('draft', 'cfp_open', 'cfp_closed', 'upcoming', 'live', 'completed');
  end if;
end $$;

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.community_event_status not null default 'draft',
  cover_url text not null,
  location_label text,
  location_name text not null,
  location_url text,
  stream_url text,
  embed_stream boolean not null default false,
  registration_url text,
  schedule jsonb not null default '[]'::jsonb,
  speakers jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  videos jsonb not null default '[]'::jsonb,
  publish_to_website boolean not null default false,
  website_source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_events_slug_not_blank check (length(trim(slug)) > 0),
  constraint community_events_name_not_blank check (length(trim(name)) > 0),
  constraint community_events_cover_not_blank check (length(trim(cover_url)) > 0),
  constraint community_events_location_name_not_blank check (length(trim(location_name)) > 0),
  constraint community_events_time_order check (ends_at >= starts_at),
  constraint community_events_schedule_array check (jsonb_typeof(schedule) = 'array'),
  constraint community_events_speakers_array check (jsonb_typeof(speakers) = 'array'),
  constraint community_events_photos_array check (jsonb_typeof(photos) = 'array'),
  constraint community_events_videos_array check (jsonb_typeof(videos) = 'array')
);

create unique index if not exists community_events_slug_uidx
  on public.community_events (slug);

create index if not exists community_events_publish_starts_idx
  on public.community_events (publish_to_website, starts_at desc);

create index if not exists community_events_status_starts_idx
  on public.community_events (status, starts_at desc);

drop trigger if exists set_community_events_updated_at on public.community_events;
create trigger set_community_events_updated_at
before update on public.community_events
for each row
execute function public.set_updated_at();

alter table public.community_events enable row level security;

drop policy if exists "Published community events are public" on public.community_events;
create policy "Published community events are public"
on public.community_events
for select
to anon, authenticated
using (publish_to_website = true);

grant usage on schema public to anon, authenticated, service_role;
grant usage on type public.community_event_status to anon, authenticated, service_role;
grant select on public.community_events to anon, authenticated, service_role;
grant insert, update, delete on public.community_events to service_role;

insert into public.community_events (
  slug,
  name,
  description,
  starts_at,
  ends_at,
  status,
  cover_url,
  location_label,
  location_name,
  location_url,
  stream_url,
  embed_stream,
  registration_url,
  schedule,
  speakers,
  photos,
  videos,
  publish_to_website,
  website_source_id
) values
(
  '100-january-2026',
  'DevCongress January Meetup',
  'DevCongress is a community of tech enthusiasts passionate about growing a strong tech ecosystem in Ghana. Our monthly meetups are all about sharing knowledge, learning from each other, and building a supportive developer community. Our key focus this year is SECURITY and AI. Each meetup includes tech talks and hands-on workshops, and you get to choose the format that works best for you and your topic. Featuring talks on Claude Code and the OWASP Top 10: 2025 release.',
  '2026-01-31T10:00:00+00:00',
  '2026-01-31T15:00:00+00:00',
  'completed',
  'https://pbs.twimg.com/media/G-tCqAnWIAA3ny4?format=jpg&name=large',
  'buro.gh, Accra',
  'buro.gh, Accra',
  'https://maps.app.goo.gl/n8u6C6TgdtW35db67',
  null,
  false,
  'https://luma.com/70danu1w',
  '[{"time":"10:00 AM","title":"Doors open & networking","type":"networking","lead":null,"resources":[]},{"time":"10:30 AM","title":"Talk: Claude Code When You Don''t Know You''re (Yet)","type":"talk","lead":"Philip Narteh","resources":[]},{"time":"11:30 AM","title":"Talk: OWASP Top 10: 2025 Release","type":"talk","lead":null,"resources":[]},{"time":"12:30 PM","title":"System Design","type":"open_discussion","lead":null,"resources":[]},{"time":"1:30 PM","title":"Product & tool demos","type":"talk","lead":null,"resources":[]},{"time":"2:00 PM","title":"Networking & close","type":"networking","lead":null,"resources":[]}]'::jsonb,
  '[]'::jsonb,
  '[{"url":"https://drive.google.com/drive/folders/1jEW8J7xMFu0o1YocISeLbVRy5F5i2gxd","type":"folder"}]'::jsonb,
  '[]'::jsonb,
  true,
  '100-january-2026'
),
(
  '200-february-2026',
  'DevCongress February Meetup',
  'DevCongress is a tech community passionate about growing a strong tech ecosystem in Ghana. This meetup was co-hosted with Blossom, featuring tech talks, hands-on workshops, and showcases of applications built by members of the Ghanaian tech ecosystem. We wrapped up the event with pizza, drinks, and networking.',
  '2026-02-28T10:00:00+00:00',
  '2026-02-28T15:00:00+00:00',
  'completed',
  'https://pbs.twimg.com/media/HAGkdjbWEAAJFba?format=jpg&name=large',
  'Nyansa Square, Accra',
  'Nyansa Square.',
  'https://maps.app.goo.gl/NbaFFBcy89Dehq8VA',
  null,
  false,
  'https://luma.com/frh11t0y',
  '[{"time":"10:00 AM","title":"Doors open & networking","type":"networking","lead":null,"resources":[]},{"time":"10:30 AM","title":"Tech talks","type":"talk","lead":null,"resources":[]},{"time":"11:30 AM","title":"Hands-on workshops","type":"workshop","lead":null,"resources":[]},{"time":"12:30 PM","title":"System Design","type":"open_discussion","lead":null,"resources":[]},{"time":"1:30 PM","title":"Product & tool demos","type":"talk","lead":null,"resources":[]},{"time":"2:00 PM","title":"Pizza, drinks & networking","type":"networking","lead":null,"resources":[]}]'::jsonb,
  '[]'::jsonb,
  '[{"url":"https://pbs.twimg.com/media/HCaAt7HWsAAWOcT?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HCaAt7rbwAAx2qn?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HCaAt7JXwAA4Hi8?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HCaAt7HXUAAX75z?format=jpg&name=large","type":"image"},{"url":"https://drive.google.com/drive/folders/1bowyXOaJiRpZ5XM6SprzJfJ85VqfUrYi","type":"folder"}]'::jsonb,
  '[]'::jsonb,
  true,
  '200-february-2026'
),
(
  '300-march-2026',
  'DevCongress March Meetup',
  'DevCongress Meetups are builder-focused gatherings for developers, engineers, and tech enthusiasts who want to learn from real-world experiences and connect with others building in the ecosystem. Featuring a tech talk on memory consistency and cache coherence, workshops, a hardware session, system design discussion, product demos, a Kahoot session, and pizza & networking.',
  '2026-03-28T10:00:00+00:00',
  '2026-03-28T15:00:00+00:00',
  'completed',
  'https://pbs.twimg.com/media/HCaAt7HWsAAWOcT?format=jpg&name=large',
  'Fido, Accra',
  'Fido, Opposite SSNIT Guest House, Julius Nyerere Rd, Accra',
  'https://www.google.com/maps/search/?api=1&query=5.570918%2C-0.18906119999999998',
  null,
  false,
  'https://luma.com/jf8pjncl',
  '[{"time":"10:00 AM","title":"Doors open & networking","type":"networking","lead":null,"resources":[]},{"time":"10:30 AM","title":"Tech Talk: Memory Consistency & Cache Coherence","type":"talk","lead":null,"resources":[]},{"time":"11:30 AM","title":"Workshops","type":"workshop","lead":null,"resources":[]},{"time":"12:00 PM","title":"Hardware Session","type":"workshop","lead":null,"resources":[]},{"time":"12:30 PM","title":"System Design","type":"open_discussion","lead":null,"resources":[]},{"time":"1:30 PM","title":"Product Demos","type":"talk","lead":null,"resources":[]},{"time":"2:00 PM","title":"Kahoot Session","type":"open_discussion","lead":null,"resources":[]},{"time":"2:30 PM","title":"Pizza & Networking","type":"networking","lead":null,"resources":[]}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  '300-march-2026'
),
(
  '400-april-2026',
  'DevCongress April Meetup',
  'DevCongress Meetups are builder-focused gatherings for developers, engineers, and tech enthusiasts who want to learn from real-world experiences and connect with others building in the ecosystem. Featuring a tech talk on memory consistency and cache coherence, a design session with UXDerrick, system design discussion, product/tool demos, a Kahoot session, and pizza & networking.',
  '2026-04-25T10:00:00+00:00',
  '2026-04-25T15:00:00+00:00',
  'completed',
  'https://pbs.twimg.com/media/HCLwbPBXYAAzGdM?format=jpg&name=large',
  'Fido, Accra',
  'Fido, Opposite SSNIT Guest House, Julius Nyerere Rd, Accra',
  'https://www.google.com/maps/search/?api=1&query=5.570918%2C-0.18906119999999998',
  null,
  false,
  'https://lu.ma/qqx9uk6u',
  '[{"time":"10:00 AM","title":"Doors open & networking","type":"networking","lead":null,"resources":[]},{"time":"10:30 AM","title":"Tech Talk: Memory Consistency & Cache Coherence (cont''d)","type":"talk","lead":null,"resources":[]},{"time":"11:30 AM","title":"Design Session with UXDerrick","type":"talk","lead":"UXDerrick","resources":[]},{"time":"12:00 PM","title":"System Design","type":"open_discussion","lead":null,"resources":[]},{"time":"12:45 PM","title":"Product & Tool Demos","type":"talk","lead":null,"resources":[]},{"time":"1:30 PM","title":"Kahoot Session","type":"open_discussion","lead":null,"resources":[]},{"time":"2:00 PM","title":"Pizza & Networking","type":"networking","lead":null,"resources":[]}]'::jsonb,
  '[]'::jsonb,
  '[{"url":"https://pbs.twimg.com/media/HGwrt-RagAAgX_-?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HGwm9MKbQAAwyPr?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HGwYEdhakAAvmCm?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HGwMz61a0AAor9d?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HGwC7dEbMAAU9os?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HGv0RwAaAAAfNVH?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HEgj8EFWgAAtqPn?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HEgjh9YXcAAubIw?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HEge8jJa0AA6Lg9?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HEgT9zma8AAX3tn?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HEgSynGbIAAuJLn?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HEgAxq1WQAAb8bc?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HEf5kkRbEAAyxIl?format=jpg&name=large","type":"image"},{"url":"https://pbs.twimg.com/media/HEfovhhakAAE4Fl?format=jpg&name=large","type":"image"}]'::jsonb,
  '[]'::jsonb,
  true,
  '400-april-2026'
),
(
  '500-may-2026',
  'DevCongress May Meetup',
  'Featuring product demos from Sankofa, OpenMirror, and JestryAI, a microcontroller workshop with Manny, a session from Old Mutual, system design discussion, FIDCON partnership announcement, and a panel discussion.',
  '2026-05-30T10:00:00+00:00',
  '2026-05-30T16:00:00+00:00',
  'completed',
  'https://pbs.twimg.com/media/HG_xUr-WIAABl-e?format=jpg&name=medium',
  'buro.gh, Accra',
  'buro.gh, Accra',
  'https://maps.app.goo.gl/n8u6C6TgdtW35db67',
  'https://x.com/i/broadcasts/1aKbddMWOjaJX',
  false,
  'https://lu.ma/3b0il40a',
  '[{"time":"10:00 AM","title":"Doors open & networking","type":"networking","lead":null,"resources":[]},{"time":"11:00 AM","title":"Welcome address","type":"talk","lead":null,"resources":[]},{"time":"11:10 AM","title":"Product Demo: Sankofa","type":"talk","lead":null,"resources":[{"title":"Website","url":"https://sankofa.dev"}]},{"time":"11:30 AM","title":"Manny — Demo with Microcontrollers","type":"workshop","lead":"@willofdaedalus","resources":[]},{"time":"12:30 PM","title":"Product Demo: OpenMirror","type":"talk","lead":null,"resources":[]},{"time":"12:50 PM","title":"Old Mutual","type":"talk","lead":null,"resources":[{"title":"Startup Resources","url":"https://ecosystem.oldmutual.com.gh"}]},{"time":"1:25 PM","title":"FIDCON partnership announcement & promo code","type":"talk","lead":null,"resources":[]},{"time":"1:35 PM","title":"Product Demo: JestryAI","type":"talk","lead":null,"resources":[{"title":"Website","url":"https://www.jestryai.com/"}]},{"time":"1:50 PM","title":"System Design Session (Blacko''s Detty December Concert)","type":"open_discussion","lead":"Tonny-Bright","resources":[{"title":"Problem Description","url":"https://docs.google.com/document/d/1qGhdc7L_PoCPuEGaheQ5RT5C-ML9-BzzfVQjmKTfSTQ/edit?usp=sharing"}]},{"time":"2:50 PM","title":"DevCongress Support Announcement","type":"talk","lead":null,"resources":[{"title":"Feedback Form","url":"https://docs.google.com/forms/d/e/1FAIpQLSco-46QfOtkU70eOoFmskRa5TPLBGoVI34KudArxmrzO3dFdw/viewform"}]},{"time":"3:10 PM","title":"Panel Discussion - The New NITA Bill","type":"panel","lead":null,"resources":[{"title":"NATIONAL INFORMATION TECHNOLOGY AUTHORITY BILL, 2025","url":"https://nita.gov.gh/wp-content/uploads/2025/NITA-2008-act-2025-1.pdf"},{"title":"NITA REGULATORY | IT SERVICE PROVIDER REGISTRATION (FEES)","url":"https://regulatory.nita.gov.gh/portal/regulatory/registration-of-it-firms"}]}]'::jsonb,
  '[]'::jsonb,
  '[{"url":"https://drive.google.com/drive/folders/1NblGjqakAaTWZ7SBvTZBsImvnpQzhXrQ?usp=sharing","type":"folder"}]'::jsonb,
  '[]'::jsonb,
  true,
  '500-may-2026'
),
(
  '600-april-2026',
  'DevCongress April Quarterly Meetup',
  'An informal online quarterly meetup for DevCongress members in Ghana and across the diaspora. The April conversation centered on AI, coding, community feedback, and how we can keep monthly meetups funded and useful.',
  '2026-04-04T18:00:00+00:00',
  '2026-04-04T21:45:00+00:00',
  'completed',
  '/images/quarterly-april-meet-up.jpeg',
  'Google Meet',
  'Google Meet',
  null,
  null,
  false,
  null,
  '[{"time":"6:00 PM","title":"Greetings, weather check & community banter","type":"networking","lead":null,"resources":[]},{"time":"6:30 PM","title":"What''s happening in the tech ecosystem","type":"open_discussion","lead":null,"resources":[]},{"time":"6:45 PM","title":"Open discussion: AI, coding, hallucinations & Leetcode for AI","type":"open_discussion","lead":null,"resources":[]},{"time":"8:00 PM","title":"Community feedback: what DevCongress can improve","type":"open_discussion","lead":null,"resources":[]},{"time":"8:45 PM","title":"Funding monthly meetups and community support","type":"open_discussion","lead":null,"resources":[]},{"time":"9:30 PM","title":"Open banter & close","type":"networking","lead":null,"resources":[]}]'::jsonb,
  '[]'::jsonb,
  '[{"url":"/images/quarterly-april-meet-up.jpeg","type":"image"},{"url":"/images/quarterly-april-meetup-2.jpeg","type":"image"}]'::jsonb,
  '[]'::jsonb,
  true,
  '600-april-2026'
),
(
  '700-june-2026',
  'DevCongress June Meetup',
  'A builder-focused meetup for developers, engineers, and tech enthusiasts to learn from real-world experiences, connect with other builders, and discuss software engineering, cloud systems, AI/ML, cybersecurity, and the work of people actively building in the ecosystem.',
  '2026-06-20T10:00:00+00:00',
  '2026-06-20T15:30:00+00:00',
  'upcoming',
  'https://images.lumacdn.com/uploads/cr/1a1af572-a563-4695-8382-2e3063121a4e.png',
  'Fido, Accra',
  'Fido, Opposite SSNIT Guest House, Julius Nyerere Rd, Accra',
  'https://www.google.com/maps/search/?api=1&query=5.5704282%2C-0.1888184',
  null,
  false,
  'https://luma.com/uic56yjo',
  '[{"time":"11:00 AM - 11:05 AM","title":"Welcome address","type":"talk","lead":null,"resources":[]},{"time":"11:10 AM - 11:55 AM","title":"Your fired employee still has access. Here is why.","type":"talk","lead":"Jesse","resources":[]},{"time":"12:00 PM - 12:30 PM","title":"Selling SaaS to Ghanaian Businesses: What''s Working So Far","type":"talk","lead":"Seth","resources":[]},{"time":"12:35 PM - 12:45 PM","title":"Jampoll session","type":"open_discussion","lead":null,"resources":[]},{"time":"12:45 PM - 1:30 PM","title":"Design in the age of AI","type":"talk","lead":"Jeffrey Hinson","resources":[]},{"time":"1:35 PM - 2:35 PM","title":"System Design session","type":"open_discussion","lead":null,"resources":[]},{"time":"2:40 PM - 2:55 PM","title":"QuiverFood demo","type":"talk","lead":"Christian","resources":[]},{"time":"3:00 PM - 3:15 PM","title":"FlameLink demo","type":"talk","lead":"Codekeyz","resources":[]},{"time":"3:15 PM - 3:30 PM","title":"Trospot demo","type":"talk","lead":"Joseph","resources":[]}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  '700-june-2026'
),
(
  '800-july-2026',
  'DevCongress Quarterly Meetup [online]',
  'A casual virtual quarterly meetup for DevCongress members to chat about what is happening in the ecosystem, catch up, and share knowledge with each other. No agenda, no slides, no structure. Just casual banter and real talk.',
  '2026-07-04T18:00:00+00:00',
  '2026-07-04T21:00:00+00:00',
  'upcoming',
  '/images/quarterly-meetup-template.avif',
  'Google Meet',
  'Google Meet',
  'https://luma.com/1e9h6c34',
  null,
  false,
  'https://luma.com/1e9h6c34',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  '800-july-2026'
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  status = excluded.status,
  cover_url = excluded.cover_url,
  location_label = excluded.location_label,
  location_name = excluded.location_name,
  location_url = excluded.location_url,
  stream_url = excluded.stream_url,
  embed_stream = excluded.embed_stream,
  registration_url = excluded.registration_url,
  schedule = excluded.schedule,
  speakers = excluded.speakers,
  photos = excluded.photos,
  videos = excluded.videos,
  publish_to_website = excluded.publish_to_website,
  website_source_id = excluded.website_source_id;
