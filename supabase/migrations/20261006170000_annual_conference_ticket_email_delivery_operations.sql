-- Ticket email recovery is deliberately conservative. A provider acceptance is
-- not proof of inbox delivery, but it is proof that EMS must not blindly send a
-- duplicate. Only failures recorded before any provider acceptance can be
-- manually re-queued.

alter table public.annual_conference_ticket_email_outbox
  add constraint annual_conference_ticket_email_outbox_attempt_limit check (attempt_count <= 5);

create index annual_conference_ticket_email_outbox_edition_delivery_idx
  on public.annual_conference_ticket_email_outbox (edition_id, created_at desc);

create index annual_conference_ticket_email_outbox_edition_status_idx
  on public.annual_conference_ticket_email_outbox (edition_id, status, created_at desc);

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
    where (
      status = 'queued' and next_attempt_at <= now() and attempt_count < 5
    ) or (
      status = 'failed'
      and next_attempt_at <= now()
      and attempt_count < 5
      and provider_email_id is null
      and accepted_at is null
    ) or (
      status = 'sending'
      and claimed_until <= now()
      and attempt_count < 5
      and provider_email_id is null
      and accepted_at is null
    )
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
  if p_status not in ('accepted', 'failed') then
    raise exception using message = 'ticket_email_status_invalid';
  end if;

  update public.annual_conference_ticket_email_outbox
  set status = p_status,
      provider_email_id = coalesce(p_provider_email_id, provider_email_id),
      last_error = case when p_status = 'failed' then left(coalesce(p_last_error, 'Email provider did not accept the message.'), 500) else null end,
      next_attempt_at = case
        when p_status = 'failed' and attempt_count < 5 and provider_email_id is null and accepted_at is null
          then coalesce(p_next_attempt_at, now() + make_interval(mins => least(60, 5 * (2 ^ greatest(attempt_count - 1, 0)))))
        else next_attempt_at
      end,
      accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
      claim_token = null,
      claimed_until = null
  where id = p_outbox_id and status = 'sending' and claim_token = p_claim_token
  returning * into delivery;

  if delivery.id is null then raise exception using message = 'ticket_email_claim_lost'; end if;
  return delivery;
end;
$$;

create or replace function public.retry_annual_conference_ticket_email_outbox(
  p_edition_id uuid,
  p_outbox_id uuid
)
returns public.annual_conference_ticket_email_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery public.annual_conference_ticket_email_outbox;
begin
  select * into delivery
  from public.annual_conference_ticket_email_outbox
  where id = p_outbox_id and edition_id = p_edition_id
  for update;

  if delivery.id is null then raise exception using message = 'ticket_email_not_found'; end if;
  if delivery.status <> 'failed' then raise exception using message = 'ticket_email_retry_not_failed'; end if;
  if delivery.attempt_count >= 5 then raise exception using message = 'ticket_email_retry_limit_reached'; end if;
  if delivery.provider_email_id is not null or delivery.accepted_at is not null then
    raise exception using message = 'ticket_email_retry_provider_ambiguous';
  end if;
  if delivery.claim_token is not null or delivery.claimed_until > now() then
    raise exception using message = 'ticket_email_retry_claimed';
  end if;

  update public.annual_conference_ticket_email_outbox
  set status = 'queued',
      next_attempt_at = now(),
      claim_token = null,
      claimed_until = null
  where id = delivery.id
  returning * into delivery;

  return delivery;
end;
$$;

revoke all on function public.claim_annual_conference_ticket_email_outbox(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_annual_conference_ticket_email_outbox(uuid, integer) to service_role;
revoke all on function public.finalize_annual_conference_ticket_email_outbox(uuid, uuid, public.annual_conference_ticket_email_status, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_annual_conference_ticket_email_outbox(uuid, uuid, public.annual_conference_ticket_email_status, text, text, timestamptz) to service_role;
revoke all on function public.retry_annual_conference_ticket_email_outbox(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retry_annual_conference_ticket_email_outbox(uuid, uuid) to service_role;

comment on function public.retry_annual_conference_ticket_email_outbox(uuid, uuid) is 'Safely queues one definite pre-provider-acceptance delivery failure. Accepted, delivered, claimed, and provider-ambiguous rows cannot be blindly retried.';
