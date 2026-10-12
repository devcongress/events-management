-- A paid ticket bundle gets one optional social-card collection link. The
-- collection is independent from admission QR capabilities and is not created
-- by the sandbox checkout flow.

create table public.annual_conference_social_card_collections (
  order_id uuid primary key references public.annual_conference_ticket_orders(id) on delete cascade,
  edition_id uuid not null references public.annual_conference_editions(id) on delete cascade,
  capability_hash text not null unique,
  created_at timestamptz not null default now()
);

alter table public.annual_conference_social_card_collections enable row level security;
revoke all on table public.annual_conference_social_card_collections from public, anon, authenticated;
grant select, insert, update, delete on public.annual_conference_social_card_collections to service_role;

alter table public.annual_conference_social_card_email_outbox
  alter column social_card_id drop not null,
  add column collection_order_id uuid references public.annual_conference_social_card_collections(order_id) on delete cascade,
  add constraint annual_conference_social_card_email_destination check (
    (social_card_id is not null and collection_order_id is null)
    or (social_card_id is null and collection_order_id is not null)
  );

create index annual_conference_social_card_collections_edition_idx
  on public.annual_conference_social_card_collections (edition_id, created_at desc);

create or replace function public.provision_annual_conference_social_card_collection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  collection_capability text := encode(gen_random_bytes(32), 'hex');
begin
  if new.status <> 'paid' or old.status = 'paid' then return new; end if;

  insert into public.annual_conference_social_card_collections (order_id, edition_id, capability_hash)
  values (new.id, new.edition_id, encode(digest(collection_capability, 'sha256'), 'hex'))
  on conflict (order_id) do nothing;

  insert into public.annual_conference_social_card_email_outbox (
    edition_id, social_card_id, collection_order_id, recipient_name, recipient_email, capability, idempotency_key
  )
  values (
    new.edition_id, null, new.id, new.purchaser_name, new.purchaser_email, collection_capability,
    concat('annual-conference-social-card-collection:', new.id)
  )
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

create trigger provision_annual_conference_social_card_collection
  after update of status on public.annual_conference_ticket_orders
  for each row execute function public.provision_annual_conference_social_card_collection();

create or replace function public.provision_annual_conference_ticket_social_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_order public.annual_conference_ticket_orders;
  unused_capability text := encode(gen_random_bytes(32), 'hex');
  public_slug text := replace(replace(trim(trailing '=' from encode(gen_random_bytes(24), 'base64')), '+', '-'), '/', '_');
begin
  select * into ticket_order from public.annual_conference_ticket_orders
    where id = new.order_id and status = 'paid';
  if ticket_order.id is null or new.status not in ('issued', 'checked_in') then return new; end if;

  insert into public.annual_conference_social_cards (
    edition_id, subject_type, ticket_id, display_name, management_token_hash, public_slug
  ) values (
    new.edition_id, 'attendee', new.id, concat('Ticket ', coalesce(new.order_seat_number, 1)),
    encode(digest(unused_capability, 'sha256'), 'hex'), public_slug
  ) on conflict (ticket_id) do nothing;

  return new;
end;
$$;

create trigger provision_annual_conference_ticket_social_card
  after insert on public.annual_conference_tickets
  for each row execute function public.provision_annual_conference_ticket_social_card();

create or replace function public.get_annual_conference_social_card_collection(p_capability text)
returns table (
  order_id uuid,
  seat_number integer,
  display_name text,
  crop_x numeric,
  crop_y numeric,
  crop_scale numeric,
  public_enabled boolean,
  public_slug text,
  photo_available boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_capability is null or length(p_capability) > 200 then return; end if;

  return query
    select ticket_order.id, ticket.order_seat_number, card.display_name, card.crop_x, card.crop_y,
      card.crop_scale, card.public_enabled, card.public_slug, card.photo_path is not null
    from public.annual_conference_social_card_collections collection
    join public.annual_conference_ticket_orders ticket_order on ticket_order.id = collection.order_id and ticket_order.status = 'paid'
    join public.annual_conference_tickets ticket on ticket.order_id = ticket_order.id and ticket.status in ('issued', 'checked_in')
    join public.annual_conference_social_cards card on card.ticket_id = ticket.id and card.revoked_at is null
    where collection.capability_hash = encode(digest(p_capability, 'sha256'), 'hex')
    order by ticket.order_seat_number;
end;
$$;

revoke all on function public.provision_annual_conference_social_card_collection() from public, anon, authenticated;
revoke all on function public.provision_annual_conference_ticket_social_card() from public, anon, authenticated;
revoke all on function public.get_annual_conference_social_card_collection(text) from public, anon, authenticated;
grant execute on function public.provision_annual_conference_social_card_collection() to service_role;
grant execute on function public.provision_annual_conference_ticket_social_card() to service_role;
grant execute on function public.get_annual_conference_social_card_collection(text) to service_role;

comment on table public.annual_conference_social_card_collections is 'Hash-only buyer capability for optionally personalizing one social card per ticket in a paid order.';
comment on function public.get_annual_conference_social_card_collection(text) is 'Returns only active social-card slots for the paid order authorized by the buyer collection capability.';
