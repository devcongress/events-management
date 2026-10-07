-- Forward correction: raw QR capabilities are needed only while a delivery
-- can safely be retried before provider acceptance. Never retain them in
-- terminal/accepted payloads, and require a provider id for accepted sends.
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

  if p_status = 'accepted' and nullif(btrim(p_provider_email_id), '') is null then
    raise exception using message = 'ticket_email_provider_id_required';
  end if;

  update public.annual_conference_ticket_email_outbox
  set status = p_status,
      provider_email_id = coalesce(nullif(btrim(p_provider_email_id), ''), provider_email_id),
      payload = case
        when p_status = 'accepted' and kind = 'ticket_delivery' then payload - 'qr_token'
        else payload
      end,
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
      payload = case when kind = 'ticket_delivery' then payload - 'qr_token' else payload end,
      delivered_at = case when p_delivered then now() else delivered_at end,
      last_error = case when p_delivered then null else 'Email delivery failed after provider acceptance.' end,
      next_attempt_at = case when p_delivered then next_attempt_at else now() + interval '30 minutes' end
  where provider_email_id = p_provider_email_id and status = 'accepted';

  return found;
end;
$$;

-- Also clean up any already accepted delivery retained by older definitions,
-- including failures after acceptance. Pre-acceptance retries keep their token.
update public.annual_conference_ticket_email_outbox
set payload = payload - 'qr_token'
where kind = 'ticket_delivery'
  and (accepted_at is not null or status in ('accepted', 'delivered'))
  and payload ? 'qr_token';

revoke all on function public.finalize_annual_conference_ticket_email_outbox(uuid, uuid, public.annual_conference_ticket_email_status, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_annual_conference_ticket_email_outbox(uuid, uuid, public.annual_conference_ticket_email_status, text, text, timestamptz) to service_role;
revoke all on function public.record_annual_conference_ticket_email_delivery(text, boolean) from public, anon, authenticated;
grant execute on function public.record_annual_conference_ticket_email_delivery(text, boolean) to service_role;

comment on function public.finalize_annual_conference_ticket_email_outbox(uuid, uuid, public.annual_conference_ticket_email_status, text, text, timestamptz) is 'Finalizes the claimed send, requiring a provider id for acceptance and deleting raw QR capabilities once safe resend is no longer possible.';
