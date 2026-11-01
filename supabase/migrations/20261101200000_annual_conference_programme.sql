create table public.annual_conference_programmes (
  edition_id uuid primary key references public.annual_conference_editions(id) on delete cascade,
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) <= 100),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by text not null
);

alter table public.annual_conference_programmes enable row level security;
revoke all on public.annual_conference_programmes from public, anon, authenticated;
grant select, insert, update, delete on public.annual_conference_programmes to service_role;

create function public.save_annual_conference_programme(p_edition_id uuid, p_revision integer, p_rows jsonb, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.annual_conference_programmes;
begin
  if p_revision = 0 then
    insert into public.annual_conference_programmes (edition_id, rows, revision, updated_by)
    values (p_edition_id, p_rows, 1, p_actor)
    on conflict (edition_id) do nothing
    returning * into saved;
  else
    update public.annual_conference_programmes
    set rows = p_rows, revision = revision + 1, updated_at = now(), updated_by = p_actor
    where edition_id = p_edition_id and revision = p_revision
    returning * into saved;
  end if;

  if saved.edition_id is null then return null; end if;

  return jsonb_build_object('rows', saved.rows, 'revision', saved.revision, 'updated_at', saved.updated_at, 'updated_by', saved.updated_by);
end;
$$;

revoke all on function public.save_annual_conference_programme(uuid, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_annual_conference_programme(uuid, integer, jsonb, text) to service_role;
