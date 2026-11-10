-- The older five-attempt cap conflicts with the existing 23-hour retry policy.
alter table public.annual_conference_ticket_email_outbox
  drop constraint if exists annual_conference_ticket_email_outbox_attempt_limit;

-- Recovery retains the same claim eligibility as immediate delivery, including
-- queued first attempts left behind by the immediate dispatch budget.
create index annual_conference_admission_recovery_due
  on public.annual_conference_ticket_email_outbox (next_attempt_at, created_at)
  where status in ('queued', 'failed') and provider_email_id is null and accepted_at is null
    and next_attempt_at <> 'infinity'::timestamptz;
create index annual_conference_admission_recovery_lease
  on public.annual_conference_ticket_email_outbox (claimed_until, created_at)
  where status = 'sending' and provider_email_id is null and accepted_at is null;

create function public.next_annual_conference_admission_recovery_at()
returns timestamptz language sql security definer set search_path = public as $$
  select greatest(due.at, control.claimed_until, control.next_send_at)
  from public.admission_dispatch_control control
  cross join lateral (
    select min(candidate.at) as at from (
      (select o.next_attempt_at as at
       from public.annual_conference_ticket_email_outbox o
       where o.status in ('queued', 'failed') and o.provider_email_id is null and o.accepted_at is null
         and o.next_attempt_at <> 'infinity'::timestamptz
         and public.managed_conference_email_dispatch_allowed('admission', o.id)
         and public.annual_conference_email_allowed('admission', o.id, o.recipient_email)
       order by o.next_attempt_at, o.created_at limit 1)
      union all
      (select o.claimed_until as at from public.annual_conference_ticket_email_outbox o
       where o.status = 'sending' and o.provider_email_id is null and o.accepted_at is null
         and o.claimed_until is not null and o.next_attempt_at <> 'infinity'::timestamptz
         and public.managed_conference_email_dispatch_allowed('admission', o.id)
         and public.annual_conference_email_allowed('admission', o.id, o.recipient_email)
       order by o.claimed_until, o.created_at limit 1)
    ) candidate
  ) due
  where control.singleton and due.at is not null;
$$;
revoke all on function public.next_annual_conference_admission_recovery_at() from public, anon, authenticated;
grant execute on function public.next_annual_conference_admission_recovery_at() to service_role;

create or replace function public.scrub_annual_conference_admission_payload()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status in ('accepted', 'delivered') or (new.next_attempt_at = 'infinity'::timestamptz and (new.failure_kind is distinct from 'review_required' and not coalesce(new.failure_kind = 'rejected' and new.last_error = 'Delivery needs review before retry.', false))) then
    new.provider_payload := null;
    new.payload := new.payload - 'qr_token' - 'tickets' - 'social_card_capability';
  end if;
  return new;
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
  if not isfinite(delivery.next_attempt_at) and not coalesce((delivery.failure_kind = 'rejected' and delivery.last_error = 'Delivery needs review before retry.'
    and delivery.provider_payload is not null and delivery.first_attempt_at is not null
    and delivery.first_attempt_at > now() - interval '23 hours'), false) then
    raise exception using message = 'ticket_email_retry_terminal';
  end if;
  if delivery.first_attempt_at <= now() - interval '23 hours' then raise exception 'ticket_email_retry_limit_reached'; end if;
  if delivery.provider_email_id is not null or delivery.accepted_at is not null then
    raise exception using message = 'ticket_email_retry_provider_ambiguous';
  end if;
  if delivery.claim_token is not null or delivery.claimed_until > now() then
    raise exception using message = 'ticket_email_retry_claimed';
  end if;

  update public.annual_conference_ticket_email_outbox
  set status = 'queued', next_attempt_at = now(), claim_token = null, claimed_until = null
  where id = delivery.id
  returning * into delivery;

  return delivery;
end;
$$;

create or replace function public.defer_admission_delivery(p_id uuid, p_claim uuid, p_kind text, p_seconds integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('throttled', 'rejected', 'ambiguous') or p_seconds not between 1 and 86400 then raise exception 'delivery_failure_invalid'; end if;
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', failure_kind = p_kind, last_error = case when p_kind = 'rejected' then 'Delivery needs review before retry.' else 'Admission email awaiting safe retry.' end,
      next_attempt_at = case when p_kind = 'rejected' then 'infinity'::timestamptz else now() + make_interval(secs => p_seconds) end, claim_token = null, claimed_until = null
    where id = p_id and claim_token = p_claim and status = 'sending' and claimed_until > now()
      and provider_email_id is null and accepted_at is null;
  if not found then raise exception 'delivery_lease_lost'; end if;
end;
$$;
