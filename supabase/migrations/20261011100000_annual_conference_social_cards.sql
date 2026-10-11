create type public.annual_conference_social_card_subject as enum ('attendee', 'speaker');

create table public.annual_conference_social_cards (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  subject_type public.annual_conference_social_card_subject not null,
  ticket_id uuid references public.annual_conference_tickets(id) on delete cascade,
  session_id uuid references public.annual_conference_sessions(id) on delete cascade,
  display_name text not null,
  management_token_hash text not null unique,
  public_slug text not null unique,
  photo_path text,
  crop_x numeric(5,4) not null default 0.5,
  crop_y numeric(5,4) not null default 0.5,
  crop_scale numeric(6,4) not null default 1,
  public_enabled boolean not null default false,
  published_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_conference_social_cards_subject check ((subject_type = 'attendee' and ticket_id is not null and session_id is null) or (subject_type = 'speaker' and session_id is not null and ticket_id is null)),
  constraint annual_conference_social_cards_display_name check (length(trim(display_name)) between 1 and 120),
  constraint annual_conference_social_cards_public_slug check (public_slug ~ '^[A-Za-z0-9_-]{22,80}$'),
  constraint annual_conference_social_cards_crop check (crop_x between 0 and 1 and crop_y between 0 and 1 and crop_scale between 1 and 4),
  unique (ticket_id), unique (session_id)
);

create trigger set_annual_conference_social_cards_updated_at before update on public.annual_conference_social_cards for each row execute function public.set_updated_at();
alter table public.annual_conference_social_cards enable row level security;
revoke all on table public.annual_conference_social_cards from public, anon, authenticated;
grant select, insert, update, delete on public.annual_conference_social_cards to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('annual-conference-social-cards', 'annual-conference-social-cards', false, 5242880, array['image/avif', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.attach_annual_conference_ticket_social_card_capability()
returns trigger language plpgsql security definer set search_path = public as $$
declare ticket public.annual_conference_tickets; social_card public.annual_conference_social_cards; management_capability text;
begin
  if new.kind <> 'ticket_delivery' then return new; end if;
  select * into ticket from public.annual_conference_tickets where id = (new.payload ->> 'ticket_id')::uuid;
  if ticket.id is null or ticket.status not in ('issued', 'checked_in') or coalesce(trim(ticket.attendee_name), '') = '' then return new; end if;
  select * into social_card from public.annual_conference_social_cards where ticket_id = ticket.id;
  if social_card.id is null then
    management_capability := replace(replace(trim(trailing '=' from encode(gen_random_bytes(32), 'base64')), '+', '-'), '/', '_');
    insert into public.annual_conference_social_cards (edition_id, subject_type, ticket_id, display_name, management_token_hash, public_slug)
    values (ticket.edition_id, 'attendee', ticket.id, trim(ticket.attendee_name), encode(digest(management_capability, 'sha256'), 'hex'), replace(replace(trim(trailing '=' from encode(gen_random_bytes(24), 'base64')), '+', '-'), '/', '_'))
    returning * into social_card;
  else management_capability := null; end if;
  if management_capability is not null then new.payload := new.payload || jsonb_build_object('social_card_capability', management_capability); end if;
  return new;
end;
$$;

create trigger attach_annual_conference_ticket_social_card_capability before insert on public.annual_conference_ticket_email_outbox for each row execute function public.attach_annual_conference_ticket_social_card_capability();

create or replace function public.scrub_annual_conference_social_card_capability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('accepted', 'delivered') then new.payload := new.payload - 'social_card_capability'; end if;
  return new;
end;
$$;

create trigger scrub_annual_conference_social_card_capability before update on public.annual_conference_ticket_email_outbox for each row execute function public.scrub_annual_conference_social_card_capability();
