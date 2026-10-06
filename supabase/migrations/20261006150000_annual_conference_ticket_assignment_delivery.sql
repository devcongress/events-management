-- Named attendees are immutable in v1. A team seat can be assigned once, at
-- which point a QR capability is created and its raw token is retained only in
-- the private transactional-delivery payload until the email is delivered.
alter table public.annual_conference_ticket_email_outbox
  add column claim_token uuid,
  add column claimed_until timestamptz;

create index annual_conference_ticket_email_outbox_claim_idx
  on public.annual_conference_ticket_email_outbox (next_attempt_at, created_at)
  where status in ('queued', 'failed', 'sending');

create or replace function public.assign_annual_conference_ticket_attendee(
  p_ticket_id uuid,
  p_attendee_name text,
  p_attendee_email text
)
returns public.annual_conference_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.annual_conference_tickets;
  ticket_order public.annual_conference_ticket_orders;
  qr_token text;
begin
  if length(trim(p_attendee_name)) = 0 or length(trim(p_attendee_email)) = 0 then
    raise exception using message = 'ticket_attendee_invalid';
  end if;

  select * into ticket from public.annual_conference_tickets where id = p_ticket_id for update;
  if ticket.id is null or ticket.order_id is null then raise exception using message = 'ticket_assignment_not_available'; end if;
  if ticket.status <> 'pending' or ticket.attendee_email is not null or ticket.qr_token_hash is not null then
    raise exception using message = 'ticket_non_transferable';
  end if;

  select * into ticket_order from public.annual_conference_ticket_orders where id = ticket.order_id;
  if ticket_order.status <> 'paid' then raise exception using message = 'ticket_order_not_paid'; end if;

  qr_token := encode(gen_random_bytes(32), 'hex');

  update public.annual_conference_tickets
  set attendee_name = trim(p_attendee_name),
      attendee_email = lower(trim(p_attendee_email)),
      qr_token_hash = encode(digest(qr_token, 'sha256'), 'hex'),
      status = 'issued',
      issued_at = now()
  where id = ticket.id
  returning * into ticket;

  insert into public.annual_conference_ticket_email_outbox (
    edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
  ) values (
    ticket.edition_id,
    ticket.order_id,
    'ticket_delivery',
    ticket.attendee_name,
    ticket.attendee_email,
    jsonb_build_object('ticket_id', ticket.id, 'order_seat_number', ticket.order_seat_number, 'qr_token', qr_token),
    concat('annual-conference-ticket-delivery:', ticket.id)
  ) on conflict (idempotency_key) do nothing;

  return ticket;
end;
$$;

create or replace function public.claim_annual_conference_ticket_email_outbox(
  p_claim_token uuid,
  p_limit integer default 20
)
returns setof public.annual_conference_ticket_email_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_claim_token is null or p_limit < 1 or p_limit > 100 then
    raise exception using message = 'ticket_email_claim_invalid';
  end if;

  return query
  with due as (
    select id
    from public.annual_conference_ticket_email_outbox
    where (status in ('queued', 'failed') and next_attempt_at <= now())
      or (status = 'sending' and claimed_until <= now())
    order by next_attempt_at, created_at
    limit p_limit
    for update skip locked
  )
  update public.annual_conference_ticket_email_outbox outbox
  set status = 'sending',
      attempt_count = outbox.attempt_count + 1,
      claim_token = p_claim_token,
      claimed_until = now() + interval '10 minutes',
      last_error = null
  from due
  where outbox.id = due.id
  returning outbox.*;
end;
$$;

create or replace function public.finalize_annual_conference_ticket_email_outbox(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_status public.annual_conference_ticket_email_status,
  p_provider_email_id text default null,
  p_last_error text default null,
  p_next_attempt_at timestamptz default null
)
returns public.annual_conference_ticket_email_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery public.annual_conference_ticket_email_outbox;
begin
  if p_status not in ('accepted', 'failed') then raise exception using message = 'ticket_email_status_invalid'; end if;

  update public.annual_conference_ticket_email_outbox
  set status = p_status,
      provider_email_id = coalesce(p_provider_email_id, provider_email_id),
      last_error = case when p_status = 'failed' then left(coalesce(p_last_error, 'Email provider did not accept the message.'), 500) else null end,
      next_attempt_at = case when p_status = 'failed' then coalesce(p_next_attempt_at, now() + interval '5 minutes') else next_attempt_at end,
      accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
      claim_token = null,
      claimed_until = null
  where id = p_outbox_id and status = 'sending' and claim_token = p_claim_token
  returning * into delivery;

  if delivery.id is null then raise exception using message = 'ticket_email_claim_lost'; end if;
  return delivery;
end;
$$;

create or replace function public.record_annual_conference_ticket_email_delivery(
  p_provider_email_id text,
  p_delivered boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.annual_conference_ticket_email_outbox
  set status = case when p_delivered then 'delivered'::public.annual_conference_ticket_email_status else 'failed'::public.annual_conference_ticket_email_status end,
      delivered_at = case when p_delivered then now() else delivered_at end,
      last_error = case when p_delivered then null else 'Email delivery failed after provider acceptance.' end,
      next_attempt_at = case when p_delivered then next_attempt_at else now() + interval '30 minutes' end
  where provider_email_id = p_provider_email_id and status = 'accepted';

  return found;
end;
$$;

revoke all on function public.assign_annual_conference_ticket_attendee(uuid, text, text) from public, anon, authenticated;
grant execute on function public.assign_annual_conference_ticket_attendee(uuid, text, text) to service_role;
revoke all on function public.claim_annual_conference_ticket_email_outbox(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_annual_conference_ticket_email_outbox(uuid, integer) to service_role;
revoke all on function public.finalize_annual_conference_ticket_email_outbox(uuid, uuid, public.annual_conference_ticket_email_status, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_annual_conference_ticket_email_outbox(uuid, uuid, public.annual_conference_ticket_email_status, text, text, timestamptz) to service_role;
revoke all on function public.record_annual_conference_ticket_email_delivery(text, boolean) from public, anon, authenticated;
grant execute on function public.record_annual_conference_ticket_email_delivery(text, boolean) to service_role;

comment on function public.assign_annual_conference_ticket_attendee(uuid, text, text) is 'Assigns one pending paid-order seat once, then creates its server-generated hashed QR capability and a retry-safe ticket-delivery outbox entry.';
comment on function public.claim_annual_conference_ticket_email_outbox(uuid, integer) is 'Claims due ticket emails with SKIP LOCKED and a bounded lease for safe Resend worker retries.';
