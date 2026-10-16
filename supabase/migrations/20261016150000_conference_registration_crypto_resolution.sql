-- Resolve Supabase pgcrypto explicitly while preserving restricted search paths.
-- No registration settings, records, or queued deliveries are modified.
BEGIN;

create or replace function public.issue_annual_conference_registration_ticket(p_registration_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  registration public.annual_conference_registrations;
  ticket_id uuid;
  qr_token text := encode(extensions.gen_random_bytes(32), 'hex');
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
    encode(extensions.digest(qr_token, 'sha256'), 'hex'), now()
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

create or replace function public.provision_annual_conference_ticket_social_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_order public.annual_conference_ticket_orders;
  unused_capability text := encode(extensions.gen_random_bytes(32), 'hex');
  public_slug text := replace(replace(trim(trailing '=' from encode(extensions.gen_random_bytes(24), 'base64')), '+', '-'), '/', '_');
begin
  select * into ticket_order from public.annual_conference_ticket_orders
    where id = new.order_id and status = 'paid';
  if ticket_order.id is null or new.status not in ('issued', 'checked_in') then return new; end if;

  insert into public.annual_conference_social_cards (
    edition_id, subject_type, ticket_id, display_name, management_token_hash, public_slug
  ) values (
    new.edition_id, 'attendee', new.id, concat('Ticket ', coalesce(new.order_seat_number, 1)),
    encode(extensions.digest(unused_capability, 'sha256'), 'hex'), public_slug
  ) on conflict (ticket_id) do nothing;

  return new;
end;
$$;

create or replace function public.issue_annual_conference_social_card_delivery(
  p_edition_id uuid,
  p_subject_type public.annual_conference_social_card_subject,
  p_subject_id uuid
)
returns table (social_card_id uuid, management_capability text)
language plpgsql security definer set search_path = public as $$
declare
  card public.annual_conference_social_cards;
  capability text := replace(replace(trim(trailing '=' from encode(extensions.gen_random_bytes(32), 'base64')), '+', '-'), '/', '_');
  slug text := replace(replace(trim(trailing '=' from encode(extensions.gen_random_bytes(24), 'base64')), '+', '-'), '/', '_');
  normalized_name text;
  normalized_email text;
begin
  -- The row does not exist on first issuance, so take a subject-scoped
  -- transaction lock before eligibility and card-row reads. This serializes
  -- concurrent first issues and rotations without relying on a unique-error
  -- retry that might leave a second raw capability in an outbox row.
  perform pg_advisory_xact_lock(hashtextextended(p_subject_type::text || ':' || p_subject_id::text, 0));

  if p_subject_type = 'attendee' then
    select btrim(attendee_name), lower(btrim(attendee_email)) into normalized_name, normalized_email
      from public.annual_conference_tickets
      where id = p_subject_id and edition_id = p_edition_id and status in ('issued', 'checked_in')
      for share;
  else
    select btrim(session.speaker_name), lower(btrim(session.speaker_email)) into normalized_name, normalized_email
      from public.annual_conference_sessions session
      join public.annual_conference_speaker_submissions submission on submission.id = session.speaker_submission_id
      where session.id = p_subject_id and session.edition_id = p_edition_id and session.status = 'confirmed'
        and submission.status = 'selected'
      for share of session, submission;
  end if;
  if not found or length(normalized_name) not between 1 and 120 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using message = 'social_card_subject_ineligible';
  end if;

  if p_subject_type = 'attendee' then
    select * into card from public.annual_conference_social_cards where ticket_id = p_subject_id for update;
  else
    select * into card from public.annual_conference_social_cards where session_id = p_subject_id for update;
  end if;

  if card.id is null then
    if p_subject_type = 'attendee' then
      insert into public.annual_conference_social_cards (edition_id, subject_type, ticket_id, display_name, management_token_hash, public_slug, revoked_at)
      values (p_edition_id, p_subject_type, p_subject_id, normalized_name, encode(extensions.digest(capability, 'sha256'), 'hex'), slug, null)
      returning * into card;
    else
      insert into public.annual_conference_social_cards (edition_id, subject_type, session_id, display_name, management_token_hash, public_slug, revoked_at)
      values (p_edition_id, p_subject_type, p_subject_id, normalized_name, encode(extensions.digest(capability, 'sha256'), 'hex'), slug, null)
      returning * into card;
    end if;
  else
    update public.annual_conference_social_card_email_outbox
      set status = 'failed', capability = '', last_error = 'Superseded by a newer social-card delivery.',
          next_attempt_at = 'infinity', claim_token = null, claimed_until = null
      -- A sender may still hold an old capability in memory. The card hash is
      -- already rotated, so that link is invalid; terminalizing the leased
      -- row prevents a late finalize from returning it to the retry pool.
      where social_card_id = card.id and status in ('queued', 'failed', 'sending');
    update public.annual_conference_social_cards
      set display_name = normalized_name, management_token_hash = encode(extensions.digest(capability, 'sha256'), 'hex'), revoked_at = null
      where id = card.id returning * into card;
  end if;

  insert into public.annual_conference_social_card_email_outbox (edition_id, social_card_id, recipient_name, recipient_email, capability, idempotency_key)
  values (p_edition_id, card.id, normalized_name, normalized_email, capability, concat('annual-conference-social-card:', card.id, ':', encode(extensions.digest(capability, 'sha256'), 'hex')));

  return query select card.id, capability;
end;
$$;

create or replace function public.check_in_annual_conference_bearer_ticket(
  p_edition_id uuid,
  p_qr_token text,
  p_checked_in_by_email text
)
returns table (outcome text, ticket_id uuid, order_id uuid, order_seat_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.annual_conference_tickets;
begin
  -- The scanner receives one neutral outcome for malformed, stale, cancelled,
  -- or unknown capabilities; it must not become a ticket-enumeration oracle.
  if p_edition_id is null
    or coalesce(trim(p_checked_in_by_email), '') = ''
    or coalesce(p_qr_token, '') !~ '^[0-9a-f]{64}$' then
    return query select 'invalid'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  select * into ticket
  from public.annual_conference_tickets
  where edition_id = p_edition_id
    and qr_token_hash = encode(extensions.digest(p_qr_token, 'sha256'), 'hex')
  for update;

  if ticket.id is null or ticket.status not in ('issued', 'checked_in') then
    return query select 'invalid'::text, null::uuid, null::uuid, null::integer;
    return;
  end if;

  if ticket.status = 'checked_in' then
    return query select 'already_checked_in'::text, ticket.id, ticket.order_id, ticket.order_seat_number;
    return;
  end if;

  update public.annual_conference_tickets
  set status = 'checked_in', checked_in_at = now(), checked_in_by_email = lower(trim(p_checked_in_by_email))
  where id = ticket.id;

  return query select 'checked_in'::text, ticket.id, ticket.order_id, ticket.order_seat_number;
end;
$$;

COMMIT;
