-- Terminal cancellation/promotion records must never be revived by manual retry.
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
  if not isfinite(delivery.next_attempt_at) then
    raise exception using message = 'ticket_email_retry_terminal';
  end if;
  if delivery.attempt_count >= 5 then raise exception using message = 'ticket_email_retry_limit_reached'; end if;
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

revoke all on function public.retry_annual_conference_ticket_email_outbox(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retry_annual_conference_ticket_email_outbox(uuid, uuid) to service_role;
