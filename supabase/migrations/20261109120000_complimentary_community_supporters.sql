begin;

alter table public.annual_conference_tickets
  add column complimentary_supporter_order_id uuid,
  add constraint annual_conference_tickets_complimentary_supporter_order_fkey
    foreign key (complimentary_supporter_order_id, edition_id)
    references public.annual_conference_ticket_orders (id, edition_id) on delete restrict,
  add constraint annual_conference_tickets_complimentary_supporter_batch_check
    check (complimentary_supporter_order_id is null or complimentary_batch_id is not null);

create unique index annual_conference_tickets_active_supporter_email_idx
  on public.annual_conference_tickets (edition_id, lower(btrim(attendee_email)))
  where complimentary_supporter_order_id is not null and status in ('issued', 'checked_in');

create function public.annual_conference_has_named_live_admission(p_edition_id uuid, p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.annual_conference_tickets t
    left join public.annual_conference_ticket_orders o on o.id = t.order_id and o.edition_id = t.edition_id
    left join public.annual_conference_registrations r on r.id = t.registration_id and r.edition_id = t.edition_id
    where t.edition_id = p_edition_id and t.status in ('issued', 'checked_in')
      and lower(btrim(t.attendee_email)) = lower(btrim(p_email))
      and coalesce(o.payment_mode, 'live') = 'live' and not coalesce(r.is_test, false)
  );
$$;

create function public.list_annual_conference_complimentary_supporters(p_edition_id uuid, p_offset integer default 0)
returns table (order_id uuid, name text, email text, seats bigint, existing_admission boolean, issued_complimentary boolean, total_count bigint)
language sql stable security definer set search_path = public as $$
  with eligible as (
    select o.id, btrim(o.purchaser_name) as name, lower(btrim(o.purchaser_email)) as email,
      o.created_at, count(a.id) as seats
    from public.annual_conference_ticket_orders o
    join public.annual_conference_flexible_ticket_allocations a on a.order_id = o.id and a.edition_id = o.edition_id
      and a.allocation_kind = 'community_managed'
      and not exists (select 1 from public.annual_conference_flexible_ticket_refunds r where r.allocation_id = a.id and r.status = 'refunded')
    where o.edition_id = p_edition_id and o.status = 'paid' and o.refunded_at is null
      and o.payment_mode = 'live' and o.checkout_flow = 'flexible'
    group by o.id
  ), grouped as (
    select distinct on (email) id, name, email, sum(seats) over (partition by email) as seats
    from eligible order by email, created_at desc, id desc
  )
  select g.id, g.name, g.email, g.seats,
    public.annual_conference_has_named_live_admission(p_edition_id, g.email),
    exists (select 1 from public.annual_conference_tickets t where t.edition_id = p_edition_id
      and t.complimentary_supporter_order_id is not null and t.status in ('issued', 'checked_in')
      and lower(btrim(t.attendee_email)) = g.email), count(*) over ()
  from grouped g order by g.name, g.email limit 26 offset greatest(0, least(p_offset, 100000));
$$;

revoke all on function public.annual_conference_has_named_live_admission(uuid, text) from public, anon, authenticated;
revoke all on function public.list_annual_conference_complimentary_supporters(uuid, integer) from public, anon, authenticated;
grant execute on function public.annual_conference_has_named_live_admission(uuid, text) to service_role;
grant execute on function public.list_annual_conference_complimentary_supporters(uuid, integer) to service_role;

create or replace function public.issue_annual_conference_complimentary_tickets(
  p_edition_id uuid, p_allocation_id uuid, p_reason text, p_guests jsonb,
  p_actor_email text, p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  settings public.annual_conference_ticketing_settings;
  allocation public.annual_conference_sponsor_ticket_allocations;
  batch public.annual_conference_complimentary_batches;
  guest jsonb;
  normalized jsonb := '[]'::jsonb;
  request_data jsonb;
  guest_name text;
  guest_email text;
  ticket_id uuid;
  token text;
  capability text;
  slug text;
  count_guests integer;
  assigned integer;
  source_order public.annual_conference_ticket_orders;
begin
  if p_edition_id is null or p_idempotency_key is null or length(btrim(coalesce(p_actor_email, ''))) = 0
    or length(btrim(coalesce(p_reason, ''))) not between 1 and 1000
    or p_guests is null or jsonb_typeof(p_guests) <> 'array' then
    raise exception 'complimentary_request_invalid';
  end if;
  count_guests := jsonb_array_length(p_guests);
  if count_guests not between 1 and 100 then raise exception 'complimentary_request_invalid'; end if;
  for guest in select value from jsonb_array_elements(p_guests) loop
    guest_name := btrim(coalesce(guest->>'name', ''));
    guest_email := lower(btrim(coalesce(guest->>'email', '')));
    if jsonb_typeof(guest) <> 'object' or length(guest_name) not between 1 and 120
      or length(guest_email) > 254 or guest_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'complimentary_guest_invalid';
    end if;
    if guest ? 'supporter_order_id' then
      if coalesce(guest->>'supporter_order_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'complimentary_supporter_invalid';
      end if;
      normalized := normalized || jsonb_build_array(jsonb_build_object('name', guest_name, 'email', guest_email,
        'supporter_order_id', (guest->>'supporter_order_id')::uuid));
    else
      normalized := normalized || jsonb_build_array(jsonb_build_object('name', guest_name, 'email', guest_email));
    end if;
  end loop;
  if (select count(distinct value->>'email') from jsonb_array_elements(normalized)) <> count_guests then
    raise exception 'complimentary_guest_duplicate';
  end if;
  request_data := jsonb_build_object('allocation_id', p_allocation_id, 'reason', btrim(p_reason), 'guests', normalized);

  -- The same lock orders issuance, checkout and cancellation for this edition.
  select * into settings from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  if settings.edition_id is null then raise exception 'ticketing_unavailable'; end if;
  select * into batch from public.annual_conference_complimentary_batches
    where edition_id = p_edition_id and idempotency_key = p_idempotency_key;
  if batch.id is not null then
    if batch.request <> request_data then raise exception 'complimentary_idempotency_mismatch'; end if;
    return batch.id;
  end if;

  for guest in select value from jsonb_array_elements(normalized) where value ? 'supporter_order_id' loop
    select * into source_order from public.annual_conference_ticket_orders o
      where o.id = (guest->>'supporter_order_id')::uuid and o.edition_id = p_edition_id
        and o.status = 'paid' and o.refunded_at is null and o.payment_mode = 'live' and o.checkout_flow = 'flexible'
        and exists (select 1 from public.annual_conference_flexible_ticket_allocations a
          where a.order_id = o.id and a.edition_id = o.edition_id and a.allocation_kind = 'community_managed'
            and not exists (select 1 from public.annual_conference_flexible_ticket_refunds r where r.allocation_id = a.id and r.status = 'refunded'));
    if source_order.id is null or btrim(source_order.purchaser_name) <> guest->>'name'
      or lower(btrim(source_order.purchaser_email)) <> guest->>'email' then
      raise exception 'complimentary_supporter_invalid';
    end if;
    if public.annual_conference_has_named_live_admission(p_edition_id, guest->>'email') then
      raise exception 'complimentary_supporter_existing_admission';
    end if;
  end loop;

  if p_allocation_id is null then
    if public.annual_conference_reserved_seats(p_edition_id) + count_guests > settings.public_capacity then
      raise exception 'ticketing_capacity_exhausted';
    end if;
    insert into public.annual_conference_sponsor_ticket_allocations
      (edition_id, sponsor_name, contact_name, contact_email, quantity, created_by_email)
    values (p_edition_id, 'Complimentary guests', 'Conference team', lower(btrim(p_actor_email)), count_guests, lower(btrim(p_actor_email)))
    returning * into allocation;
  else
    select * into allocation from public.annual_conference_sponsor_ticket_allocations
      where id = p_allocation_id and edition_id = p_edition_id for update;
    if allocation.id is null then raise exception 'complimentary_allocation_not_found'; end if;
    select count(*) into assigned from public.annual_conference_tickets
      where sponsor_allocation_id = allocation.id and status in ('pending', 'issued', 'checked_in');
    if assigned + count_guests > allocation.quantity then raise exception 'complimentary_allocation_exhausted'; end if;
  end if;

  insert into public.annual_conference_complimentary_batches
    (edition_id, idempotency_key, allocation_id, reason, actor_email, request)
  values (p_edition_id, p_idempotency_key, allocation.id, btrim(p_reason), lower(btrim(p_actor_email)), request_data)
  returning * into batch;

  for guest in select value from jsonb_array_elements(normalized) loop
    token := encode(extensions.gen_random_bytes(32), 'hex');
    capability := replace(replace(trim(trailing '=' from encode(extensions.gen_random_bytes(32), 'base64')), '+', '-'), '/', '_');
    slug := replace(replace(trim(trailing '=' from encode(extensions.gen_random_bytes(24), 'base64')), '+', '-'), '/', '_');
    insert into public.annual_conference_tickets
      (edition_id, sponsor_allocation_id, complimentary_batch_id, complimentary_supporter_order_id, status, attendee_name, attendee_email, qr_token_hash, issued_at)
    values (p_edition_id, allocation.id, batch.id, (guest->>'supporter_order_id')::uuid, 'issued', guest->>'name', guest->>'email',
      encode(extensions.digest(token, 'sha256'), 'hex'), now()) returning id into ticket_id;
    insert into public.annual_conference_social_cards
      (edition_id, subject_type, ticket_id, display_name, management_token_hash, public_slug)
    values (p_edition_id, 'attendee', ticket_id, guest->>'name', encode(extensions.digest(capability, 'sha256'), 'hex'), slug);
    insert into public.annual_conference_ticket_email_outbox
      (edition_id, sponsor_allocation_id, kind, recipient_name, recipient_email, payload, idempotency_key)
    values (p_edition_id, allocation.id, 'complimentary_admission_delivery', guest->>'name', guest->>'email',
      jsonb_build_object('ticket_id', ticket_id, 'qr_token', token, 'social_card_capability', capability),
      'complimentary-admission:' || ticket_id);
  end loop;
  return batch.id;
end;
$$;


drop function public.list_annual_conference_complimentary_tickets(uuid, integer);
create function public.list_annual_conference_complimentary_tickets(p_edition_id uuid, p_offset integer default 0)
returns table (ticket_id uuid, name text, email text, status public.annual_conference_ticket_status,
  reason text, allocation_id uuid, allocation_name text, created_at timestamptz, delivery_status public.annual_conference_ticket_email_status, delivery_id uuid, active_total bigint, total_count bigint, supporter_order_id uuid)
language sql stable security definer set search_path = public as $$
  select t.id, t.attendee_name, t.attendee_email, t.status, b.reason, a.id, a.sponsor_name,
    t.created_at, d.status, d.id, count(*) filter (where t.status in ('issued', 'checked_in')) over (), count(*) over (), t.complimentary_supporter_order_id
  from public.annual_conference_tickets t
  join public.annual_conference_complimentary_batches b on b.id = t.complimentary_batch_id
  join public.annual_conference_sponsor_ticket_allocations a on a.id = t.sponsor_allocation_id
  left join public.annual_conference_ticket_email_outbox d on d.idempotency_key = 'complimentary-admission:' || t.id
  where t.edition_id = p_edition_id order by t.created_at desc, t.id
  limit 26 offset greatest(0, least(p_offset, 100000));
$$;

revoke all on function public.list_annual_conference_complimentary_tickets(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_annual_conference_complimentary_tickets(uuid, integer) to service_role;

commit;
