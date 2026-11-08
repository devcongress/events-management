-- Complimentary issuance shares sponsor inventory and the admission outbox.
begin;

alter table public.annual_conference_sponsor_ticket_allocations
  add column released_quantity integer not null default 0 check (released_quantity >= 0),
  drop constraint annual_conference_sponsor_ticket_allocations_quantity,
  add constraint annual_conference_sponsor_ticket_allocations_quantity
    check (quantity > 0 or (quantity = 0 and released_quantity > 0));

create table public.annual_conference_complimentary_batches (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id),
  idempotency_key uuid not null,
  allocation_id uuid not null references public.annual_conference_sponsor_ticket_allocations(id),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  actor_email text not null,
  request jsonb not null,
  created_at timestamptz not null default now(),
  unique (edition_id, idempotency_key)
);

alter table public.annual_conference_tickets
  add column complimentary_batch_id uuid references public.annual_conference_complimentary_batches(id);

alter table public.annual_conference_ticket_email_outbox
  add column sponsor_allocation_id uuid references public.annual_conference_sponsor_ticket_allocations(id),
  drop constraint annual_conference_ticket_email_source,
  add constraint annual_conference_ticket_email_source check (num_nonnulls(order_id, registration_id, sponsor_allocation_id) = 1),
  drop constraint annual_conference_ticket_email_outbox_kind,
  add constraint annual_conference_ticket_email_outbox_kind check (
    kind in ('payment_receipt', 'ticket_delivery', 'ticket_bundle_delivery', 'waitlist_notice',
      'flexible_order_management', 'flexible_gift_claim', 'flexible_admission_delivery',
      'flexible_buyer_bundle_delivery', 'complimentary_admission_delivery')
  );

alter table public.annual_conference_complimentary_batches enable row level security;
revoke all on public.annual_conference_complimentary_batches from public, anon, authenticated;
grant select, insert, update, delete on public.annual_conference_complimentary_batches to service_role;

create function public.issue_annual_conference_complimentary_tickets(
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
    normalized := normalized || jsonb_build_array(jsonb_build_object('name', guest_name, 'email', guest_email));
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
      (edition_id, sponsor_allocation_id, complimentary_batch_id, status, attendee_name, attendee_email, qr_token_hash, issued_at)
    values (p_edition_id, allocation.id, batch.id, 'issued', guest->>'name', guest->>'email',
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

create function public.cancel_annual_conference_complimentary_ticket(p_edition_id uuid, p_ticket_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare ticket public.annual_conference_tickets;
begin
  perform 1 from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  select * into ticket from public.annual_conference_tickets
    where id = p_ticket_id and edition_id = p_edition_id and complimentary_batch_id is not null for update;
  if ticket.id is null then raise exception 'complimentary_ticket_not_found'; end if;
  if ticket.status = 'cancelled' then return false; end if;
  if ticket.status <> 'issued' then raise exception 'complimentary_ticket_not_cancellable'; end if;
  update public.annual_conference_tickets set status = 'cancelled', qr_token_hash = null where id = ticket.id;
  update public.annual_conference_social_cards set revoked_at = now(), public_enabled = false where ticket_id = ticket.id;
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', next_attempt_at = 'infinity', claim_token = null, claimed_until = null,
        last_error = 'Complimentary ticket cancelled.', failure_kind = null,
        payload = payload - 'qr_token' - 'social_card_capability', provider_payload = null
    where kind = 'complimentary_admission_delivery' and payload->>'ticket_id' = ticket.id::text
      and status in ('queued', 'failed', 'sending');
  update public.annual_conference_sponsor_ticket_allocations
    set quantity = quantity - 1, released_quantity = released_quantity + 1 where id = ticket.sponsor_allocation_id;
  perform public.promote_annual_conference_waitlist(p_edition_id);
  return true;
end;
$$;

create or replace function public.scrub_annual_conference_admission_payload()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status in ('accepted', 'delivered') or (new.next_attempt_at = 'infinity'::timestamptz and new.failure_kind is distinct from 'review_required') then
    new.provider_payload := null;
    new.payload := new.payload - 'qr_token' - 'tickets' - 'social_card_capability';
  end if;
  return new;
end;
$$;

create or replace function public.annual_conference_email_allowed(p_kind text, p_id uuid, p_email text, p_testing_only boolean default false)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare edition uuid; recipient text; settings jsonb; rehearsal boolean; managed_mode text;
begin
  if p_kind = 'admission' then
    select edition_id, recipient_email into edition, recipient from public.annual_conference_ticket_email_outbox where id = p_id;
  elsif p_kind = 'social' then
    select edition_id, recipient_email into edition, recipient from public.annual_conference_social_card_email_outbox where id = p_id;
  elsif p_kind = 'update' then
    select b.edition_id, d.recipient_email into edition, recipient from public.annual_conference_attendee_blast_deliveries d
      join public.annual_conference_attendee_blasts b on b.id = d.blast_id where d.id = p_id;
  end if;
  if edition is null or p_email is null or lower(btrim(recipient)) <> lower(btrim(p_email)) then return false; end if;
  -- Complimentary admissions are explicit live issuance, independent of the
  -- registration rehearsal list. A development-only dispatcher cannot send them.
  if p_kind = 'admission' and exists (select 1 from public.annual_conference_ticket_email_outbox
    where id = p_id and kind = 'complimentary_admission_delivery' and sponsor_allocation_id is not null) then
    return not p_testing_only;
  end if;
  -- Managed mail follows immutable order mode, independently of current sales.
  if p_kind = 'admission' then
    select o.payment_mode into managed_mode
    from public.annual_conference_ticket_email_outbox d
    join public.annual_conference_ticket_orders o on o.id = d.order_id
    where d.id = p_id and o.checkout_settings_version is not null;
  elsif p_kind = 'social' then
    select o.payment_mode into managed_mode
    from public.annual_conference_social_card_email_outbox d
    left join public.annual_conference_social_cards c on c.id = d.social_card_id
    left join public.annual_conference_tickets t on t.id = c.ticket_id
    join public.annual_conference_ticket_orders o on o.id = coalesce(d.collection_order_id, t.order_id)
    where d.id = p_id and o.checkout_settings_version is not null;
  end if;
  settings := public.get_annual_conference_registration_testing(edition);
  if managed_mode is not null then
    if managed_mode = 'live' then return not p_testing_only; end if;
    return managed_mode = 'test'
      and (settings->'tester_emails' ? lower(btrim(recipient)))
      and (not p_testing_only or exists (
        select 1 from public.annual_conference_editions where id = edition and year = 2026
      ));
  end if;
  if p_testing_only and (not (settings->>'enabled')::boolean
    or not exists(select 1 from public.annual_conference_editions where id = edition and year = 2026)) then return false; end if;
  select exists(select 1 from public.annual_conference_registrations
    where edition_id = edition and normalized_email = lower(btrim(recipient)) and is_test) into rehearsal;
  return (not (settings->>'enabled')::boolean and not rehearsal)
    or (settings->'tester_emails' ? lower(btrim(recipient)));
end;
$$;

create function public.prevent_cancelled_complimentary_retry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'complimentary_admission_delivery' and new.status in ('queued', 'sending')
    and exists (select 1 from public.annual_conference_tickets
      where 'complimentary-admission:' || id::text = new.idempotency_key and status = 'cancelled') then
    raise exception 'complimentary_ticket_cancelled';
  end if;
  return new;
end;
$$;

create trigger prevent_cancelled_complimentary_retry before update on public.annual_conference_ticket_email_outbox
for each row execute function public.prevent_cancelled_complimentary_retry();
revoke all on function public.prevent_cancelled_complimentary_retry() from public, anon, authenticated;
grant execute on function public.prevent_cancelled_complimentary_retry() to service_role;

create function public.list_annual_conference_complimentary_tickets(p_edition_id uuid, p_offset integer default 0)
returns table (ticket_id uuid, name text, email text, status public.annual_conference_ticket_status,
  reason text, allocation_id uuid, allocation_name text, created_at timestamptz, delivery_status public.annual_conference_ticket_email_status, delivery_id uuid, active_total bigint, total_count bigint)
language sql stable security definer set search_path = public as $$
  select t.id, t.attendee_name, t.attendee_email, t.status, b.reason, a.id, a.sponsor_name,
    t.created_at, d.status, d.id, count(*) filter (where t.status in ('issued', 'checked_in')) over (), count(*) over ()
  from public.annual_conference_tickets t
  join public.annual_conference_complimentary_batches b on b.id = t.complimentary_batch_id
  join public.annual_conference_sponsor_ticket_allocations a on a.id = t.sponsor_allocation_id
  left join public.annual_conference_ticket_email_outbox d on d.idempotency_key = 'complimentary-admission:' || t.id
  where t.edition_id = p_edition_id order by t.created_at desc, t.id
  limit 26 offset greatest(0, least(p_offset, 100000));
$$;

revoke all on function public.list_annual_conference_complimentary_tickets(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_annual_conference_complimentary_tickets(uuid, integer) to service_role;

revoke all on function public.issue_annual_conference_complimentary_tickets(uuid, uuid, text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.cancel_annual_conference_complimentary_ticket(uuid, uuid) from public, anon, authenticated;
grant execute on function public.issue_annual_conference_complimentary_tickets(uuid, uuid, text, jsonb, text, uuid) to service_role;
grant execute on function public.cancel_annual_conference_complimentary_ticket(uuid, uuid) to service_role;
commit;
