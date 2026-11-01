create table public.annual_conference_speaker_materials (
  id uuid primary key,
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  session_id uuid not null references public.annual_conference_sessions(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index annual_conference_speaker_materials_session_idx on public.annual_conference_speaker_materials(session_id, created_at);
alter table public.annual_conference_speaker_materials enable row level security;
revoke all on public.annual_conference_speaker_materials from public, anon, authenticated;
grant select, insert, delete on public.annual_conference_speaker_materials to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('annual-conference-speaker-materials', 'annual-conference-speaker-materials', false, 5242880, array['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Serialize concurrent inserts for each session so the storage quota cannot be bypassed.
create function public.limit_annual_conference_speaker_materials() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.session_id::text, 0));
  if (select count(*) from public.annual_conference_speaker_materials where session_id = new.session_id) >= 5 then
    raise exception 'Speaker material limit reached';
  end if;
  return new;
end;
$$;
create trigger limit_annual_conference_speaker_materials before insert on public.annual_conference_speaker_materials
for each row execute function public.limit_annual_conference_speaker_materials();
revoke all on function public.limit_annual_conference_speaker_materials() from public, anon, authenticated;
grant execute on function public.limit_annual_conference_speaker_materials() to service_role;
