create type public.short_link_destination as enum (
  'monthly_cfp',
  'event_registration',
  'conference_cfp'
);

create type public.short_link_status as enum ('active', 'revoked');

create table public.short_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  destination public.short_link_destination not null,
  event_id uuid references public.community_events(id) on delete restrict,
  conference_edition_id uuid references public.annual_conference_editions(id) on delete restrict,
  status public.short_link_status not null default 'active',
  created_by_membership_id uuid references public.admin_memberships(id) on delete set null,
  redirect_count bigint not null default 0 check (redirect_count >= 0),
  last_redirected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint short_links_code_format check (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5,8}$'),
  constraint short_links_destination_target check (
    (destination in ('monthly_cfp', 'event_registration') and event_id is not null and conference_edition_id is null)
    or (destination = 'conference_cfp' and conference_edition_id is not null and event_id is null)
  )
);

create index short_links_status_created_idx on public.short_links (status, created_at desc);
create index short_links_event_idx on public.short_links (event_id) where event_id is not null;
create index short_links_conference_edition_idx on public.short_links (conference_edition_id) where conference_edition_id is not null;

create trigger set_short_links_updated_at
before update on public.short_links
for each row execute function public.set_updated_at();

alter table public.short_links enable row level security;
revoke all on table public.short_links from anon, authenticated;
grant select, insert, update, delete on table public.short_links to service_role;

create or replace function public.resolve_active_short_link(input_code text)
returns table (
  id uuid,
  destination public.short_link_destination,
  event_id uuid,
  conference_edition_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.short_links as link
  set redirect_count = link.redirect_count + 1,
      last_redirected_at = now()
  where link.code = upper(trim(input_code))
    and link.status = 'active'
  returning link.id, link.destination, link.event_id, link.conference_edition_id;
end;
$$;

revoke all on function public.resolve_active_short_link(text) from public, anon, authenticated;
grant execute on function public.resolve_active_short_link(text) to service_role;
