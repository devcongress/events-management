-- Registration is not a payment. Keep finance history and sandbox orders intact.
-- Existing editions stay in paid mode until an Owner explicitly opens free intake.
alter table public.annual_conference_ticketing_settings
  add column public_mode text not null default 'paid' check (public_mode in ('free', 'paid'));

create table public.annual_conference_registrations (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.annual_conference_editions(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  email text not null check (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  normalized_email text generated always as (lower(btrim(email))) stored,
  status text not null check (status in ('confirmed', 'waitlisted', 'cancelled')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  unique (edition_id, normalized_email),
  unique (id, edition_id)
);

create index annual_conference_registration_queue_idx
  on public.annual_conference_registrations (edition_id, status, created_at, id);
alter table public.annual_conference_registrations enable row level security;
revoke all on public.annual_conference_registrations from public, anon, authenticated;
grant select, insert, update on public.annual_conference_registrations to service_role;

alter table public.annual_conference_tickets
  add column registration_id uuid unique,
  add constraint annual_conference_tickets_registration_fkey foreign key (registration_id, edition_id)
    references public.annual_conference_registrations(id, edition_id),
  drop constraint annual_conference_tickets_source,
  add constraint annual_conference_tickets_source check (
    num_nonnulls(order_id, sponsor_allocation_id, registration_id) = 1
  );

alter table public.annual_conference_ticket_email_outbox
  alter column order_id drop not null,
  add column registration_id uuid references public.annual_conference_registrations(id),
  add constraint annual_conference_ticket_email_source check (num_nonnulls(order_id, registration_id) = 1),
  drop constraint annual_conference_ticket_email_outbox_kind,
  add constraint annual_conference_ticket_email_outbox_kind check (
    kind in ('payment_receipt', 'ticket_delivery', 'ticket_bundle_delivery', 'waitlist_notice')
  );

create or replace function public.annual_conference_reserved_seats(p_edition_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (
    (select count(*) from public.annual_conference_registrations where edition_id = p_edition_id and status = 'confirmed')
    + (select coalesce(sum(quantity), 0) from public.annual_conference_ticket_orders
       where edition_id = p_edition_id and (status = 'paid' or (status = 'pending_payment' and expires_at > now())))
    + (select coalesce(sum(quantity), 0) from public.annual_conference_sponsor_ticket_allocations where edition_id = p_edition_id)
  )::integer;
$$;

create or replace function public.issue_annual_conference_registration_ticket(p_registration_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  registration public.annual_conference_registrations;
  ticket_id uuid;
  qr_token text := encode(gen_random_bytes(32), 'hex');
begin
  select * into registration from public.annual_conference_registrations where id = p_registration_id for update;
  if registration.id is null or registration.status <> 'confirmed' then
    raise exception 'conference_registration_not_confirmed';
  end if;
  if exists (select 1 from public.annual_conference_tickets where registration_id = registration.id) then return; end if;

  insert into public.annual_conference_tickets (
    edition_id, registration_id, status, attendee_name, attendee_email, qr_token_hash, issued_at
  ) values (
    registration.edition_id, registration.id, 'issued', registration.name, registration.email,
    encode(digest(qr_token, 'sha256'), 'hex'), now()
  ) returning id into ticket_id;

  insert into public.annual_conference_ticket_email_outbox (
    edition_id, registration_id, kind, recipient_name, recipient_email, payload, idempotency_key
  ) values (
    registration.edition_id, registration.id, 'ticket_delivery', registration.name, registration.email,
    jsonb_build_object('ticket_id', ticket_id, 'qr_token', qr_token),
    'conference-registration-admission:' || registration.id
  );

  -- Separate capability, separate delivery: sharing a card never grants admission.
  perform public.issue_annual_conference_social_card_delivery(registration.edition_id, 'attendee', ticket_id);
end;
$$;

create or replace function public.promote_annual_conference_waitlist(p_edition_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  settings public.annual_conference_ticketing_settings;
  registration public.annual_conference_registrations;
  available integer;
  promoted integer := 0;
begin
  select * into settings from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  if settings.edition_id is null or settings.public_mode <> 'free' then return 0; end if;
  available := greatest(0, settings.public_capacity - public.annual_conference_reserved_seats(p_edition_id));

  for registration in
    select * from public.annual_conference_registrations
    where edition_id = p_edition_id and status = 'waitlisted'
    order by created_at, id limit least(available, 5000) for update
  loop
    update public.annual_conference_registrations set status = 'confirmed', confirmed_at = now() where id = registration.id;
    update public.annual_conference_ticket_email_outbox
      set status = 'failed', next_attempt_at = 'infinity', payload = '{}'::jsonb, claim_token = null, claimed_until = null,
        last_error = 'Superseded by admission confirmation.'
      where registration_id = registration.id and kind = 'waitlist_notice' and status in ('queued', 'failed');
    perform public.issue_annual_conference_registration_ticket(registration.id);
    promoted := promoted + 1;
  end loop;
  return promoted;
end;
$$;

create or replace function public.register_for_annual_conference(p_edition_id uuid, p_name text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  settings public.annual_conference_ticketing_settings;
  registration public.annual_conference_registrations;
  registration_status text;
begin
  select * into settings from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  if settings.edition_id is null or settings.public_mode <> 'free' or settings.sales_status <> 'open' then
    raise exception 'conference_registration_closed';
  end if;
  -- Duplicate requests cannot change identity, reactivate cancellation, or resend capabilities.
  if exists (select 1 from public.annual_conference_registrations
    where edition_id = p_edition_id and normalized_email = lower(btrim(p_email))) then return; end if;

  perform public.promote_annual_conference_waitlist(p_edition_id);
  registration_status := case when public.annual_conference_reserved_seats(p_edition_id) < settings.public_capacity
    then 'confirmed' else 'waitlisted' end;
  insert into public.annual_conference_registrations (edition_id, name, email, status, confirmed_at)
    values (p_edition_id, btrim(p_name), btrim(p_email), registration_status,
      case when registration_status = 'confirmed' then now() else null end)
    returning * into registration;

  if registration_status = 'confirmed' then
    perform public.issue_annual_conference_registration_ticket(registration.id);
  else
    insert into public.annual_conference_ticket_email_outbox (
      edition_id, registration_id, kind, recipient_name, recipient_email, idempotency_key
    ) values (p_edition_id, registration.id, 'waitlist_notice', registration.name, registration.email,
      'conference-registration-waitlist:' || registration.id);
  end if;
end;
$$;

create or replace function public.cancel_annual_conference_registration(p_edition_id uuid, p_registration_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  perform 1 from public.annual_conference_tickets where registration_id = p_registration_id and edition_id = p_edition_id for update;
  if exists (select 1 from public.annual_conference_tickets
    where registration_id = p_registration_id and edition_id = p_edition_id and status = 'checked_in') then
    raise exception 'conference_attendee_already_admitted';
  end if;
  update public.annual_conference_registrations set status = 'cancelled', cancelled_at = now()
    where id = p_registration_id and edition_id = p_edition_id and status <> 'cancelled';
  update public.annual_conference_tickets set status = 'cancelled', qr_token_hash = null
    where registration_id = p_registration_id and edition_id = p_edition_id;
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', payload = '{}'::jsonb, next_attempt_at = 'infinity', claim_token = null, claimed_until = null,
      last_error = 'Registration cancelled.'
    where registration_id = p_registration_id and edition_id = p_edition_id and status in ('queued', 'failed', 'sending');
  perform public.promote_annual_conference_waitlist(p_edition_id);
end;
$$;

create or replace function public.configure_annual_conference_registration(
  p_edition_id uuid, p_mode text, p_status public.annual_conference_ticket_sales_status, p_actor_email text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  if not found then raise exception 'conference_settings_not_found'; end if;
  if p_mode = 'paid' and exists (select 1 from public.annual_conference_registrations
    where edition_id = p_edition_id and status = 'waitlisted') then
    raise exception 'conference_resolve_waitlist_before_paid_mode';
  end if;
  if exists (select 1 from public.annual_conference_ticket_orders
    where edition_id = p_edition_id and status = 'pending_payment' and expires_at > now()) then
    raise exception 'conference_wait_for_active_checkout_holds';
  end if;
  update public.annual_conference_ticketing_settings
    set public_mode = p_mode, sales_status = p_status, updated_by_email = lower(btrim(p_actor_email))
    where edition_id = p_edition_id;
end;
$$;

-- Keep older allocation/capacity commands safe while sharing inventory with free registrations.
create or replace function public.guard_annual_conference_shared_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  capacity integer;
begin
  select public_capacity into capacity from public.annual_conference_ticketing_settings where edition_id = new.edition_id for update;
  if public.annual_conference_reserved_seats(new.edition_id) > capacity then raise exception 'ticketing_capacity_exhausted'; end if;
  return new;
end;
$$;
create trigger guard_conference_order_capacity after insert or update on public.annual_conference_ticket_orders
  for each row execute function public.guard_annual_conference_shared_capacity();
create trigger guard_conference_sponsor_capacity after insert or update on public.annual_conference_sponsor_ticket_allocations
  for each row execute function public.guard_annual_conference_shared_capacity();
create trigger guard_conference_settings_capacity after update on public.annual_conference_ticketing_settings
  for each row execute function public.guard_annual_conference_shared_capacity();

create or replace function public.guard_annual_conference_paid_intake()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mode text;
begin
  select public_mode into mode from public.annual_conference_ticketing_settings where edition_id = new.edition_id for update;
  if mode <> 'paid' or new.tier_key <> 'regular' or new.quantity <> 1 then raise exception 'conference_paid_checkout_unavailable'; end if;
  return new;
end;
$$;
create trigger guard_conference_paid_intake before insert on public.annual_conference_ticket_orders
  for each row execute function public.guard_annual_conference_paid_intake();

create or replace function public.promote_conference_after_capacity_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.public_capacity > old.public_capacity then perform public.promote_annual_conference_waitlist(new.edition_id); end if;
  return new;
end;
$$;
create trigger promote_conference_after_capacity_change after update of public_capacity on public.annual_conference_ticketing_settings
  for each row execute function public.promote_conference_after_capacity_change();

revoke all on function public.annual_conference_reserved_seats(uuid) from public, anon, authenticated;
revoke all on function public.issue_annual_conference_registration_ticket(uuid) from public, anon, authenticated;
revoke all on function public.promote_annual_conference_waitlist(uuid) from public, anon, authenticated;
revoke all on function public.register_for_annual_conference(uuid, text, text) from public, anon, authenticated;
revoke all on function public.cancel_annual_conference_registration(uuid, uuid) from public, anon, authenticated;
revoke all on function public.configure_annual_conference_registration(uuid, text, public.annual_conference_ticket_sales_status, text) from public, anon, authenticated;
revoke all on function public.guard_annual_conference_shared_capacity() from public, anon, authenticated;
revoke all on function public.guard_annual_conference_paid_intake() from public, anon, authenticated;
revoke all on function public.promote_conference_after_capacity_change() from public, anon, authenticated;
grant execute on function public.annual_conference_reserved_seats(uuid), public.issue_annual_conference_registration_ticket(uuid),
  public.promote_annual_conference_waitlist(uuid), public.register_for_annual_conference(uuid, text, text),
  public.cancel_annual_conference_registration(uuid, uuid),
  public.configure_annual_conference_registration(uuid, text, public.annual_conference_ticket_sales_status, text),
  public.guard_annual_conference_shared_capacity(), public.guard_annual_conference_paid_intake(),
  public.promote_conference_after_capacity_change() to service_role;

create function public.get_annual_conference_registration_overview(p_year integer)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'edition_id', e.id, 'mode', s.public_mode, 'status', s.sales_status,
    'capacity', s.public_capacity, 'reserved', public.annual_conference_reserved_seats(e.id),
    'confirmed', (select count(*) from public.annual_conference_registrations where edition_id = e.id and status = 'confirmed'),
    'waitlisted', (select count(*) from public.annual_conference_registrations where edition_id = e.id and status = 'waitlisted')
  ) from public.annual_conference_editions e
  join public.annual_conference_ticketing_settings s on s.edition_id = e.id where e.year = p_year;
$$;

create function public.list_annual_conference_registrations(p_edition_id uuid, p_offset integer default 0)
returns setof public.annual_conference_registrations language sql stable security definer set search_path = public as $$
  select * from public.annual_conference_registrations where edition_id = p_edition_id
  order by created_at, id limit 100 offset greatest(0, p_offset);
$$;
revoke all on function public.get_annual_conference_registration_overview(integer), public.list_annual_conference_registrations(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_annual_conference_registration_overview(integer), public.list_annual_conference_registrations(uuid, integer) to service_role;

alter table public.annual_conference_ticket_email_outbox
  add column first_attempt_at timestamptz,
  add column provider_payload jsonb;

create or replace function public.claim_annual_conference_ticket_email_outbox(p_claim_token uuid, p_limit integer default 20)
returns setof public.annual_conference_ticket_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_claim_token is null or p_limit not between 1 and 100 then raise exception 'ticket_email_claim_invalid'; end if;
  -- Never retry beyond the provider idempotency window. Keep a visible terminal
  -- failure for an operator to reconcile; do not mint another admission silently.
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', next_attempt_at = 'infinity', claim_token = null,
      claimed_until = null, last_error = 'Delivery requires operator reconciliation.'
    where status in ('queued', 'failed', 'sending') and provider_email_id is null
      and next_attempt_at <> 'infinity'::timestamptz
      and (claimed_until is null or claimed_until <= now())
      and (attempt_count >= 5 or first_attempt_at <= now() - interval '1 hour');
  return query with due as (
    select id from public.annual_conference_ticket_email_outbox
    where attempt_count < 5 and provider_email_id is null and accepted_at is null
      and (first_attempt_at is null or first_attempt_at > now() - interval '1 hour')
      and ((status in ('queued', 'failed') and next_attempt_at <= now())
        or (status = 'sending' and claimed_until <= now()))
    order by next_attempt_at, created_at limit p_limit for update skip locked
  ) update public.annual_conference_ticket_email_outbox o
    set status = 'sending', attempt_count = o.attempt_count + 1, claim_token = p_claim_token,
      claimed_until = now() + interval '10 minutes', first_attempt_at = coalesce(o.first_attempt_at, now()), last_error = null
    from due where o.id = due.id returning o.*;
end;
$$;

create function public.freeze_annual_conference_admission_email(p_id uuid, p_claim uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare frozen jsonb;
begin
  update public.annual_conference_ticket_email_outbox
    set provider_payload = coalesce(provider_payload, p_payload)
    where id = p_id and claim_token = p_claim and status = 'sending' and claimed_until > now()
      and first_attempt_at > now() - interval '1 hour'
    returning provider_payload into frozen;
  return frozen;
end;
$$;

create function public.scrub_annual_conference_admission_payload()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status in ('accepted', 'delivered') or new.next_attempt_at = 'infinity'::timestamptz then
    new.provider_payload := null;
    new.payload := new.payload - 'qr_token' - 'tickets';
  end if;
  return new;
end;
$$;
create trigger scrub_annual_conference_admission_payload before update on public.annual_conference_ticket_email_outbox
  for each row execute function public.scrub_annual_conference_admission_payload();
revoke all on function public.freeze_annual_conference_admission_email(uuid, uuid, jsonb), public.scrub_annual_conference_admission_payload() from public, anon, authenticated;
grant execute on function public.freeze_annual_conference_admission_email(uuid, uuid, jsonb), public.scrub_annual_conference_admission_payload() to service_role;
