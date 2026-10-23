-- Preview-only finalization. The production function and existing rows remain unchanged.
-- PostgreSQL make_interval requires integer minutes; retry exponentiation yields
-- double precision, so cast the bounded backoff explicitly.
create function public.finalize_complete_test_only_admission_email(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_status public.annual_conference_ticket_email_status,
  p_origin text,
  p_provider_email_id text default null,
  p_last_error text default null,
  p_next_attempt_at timestamptz default null
)
returns public.annual_conference_ticket_email_outbox
language plpgsql security definer set search_path = public as $$
declare delivery public.annual_conference_ticket_email_outbox;
begin
  if p_origin is null or p_origin !~ '^https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$' then
    raise exception 'complete_test_origin_invalid';
  end if;
  if p_status is null or p_status not in ('accepted', 'failed') then raise exception 'ticket_email_status_invalid'; end if;
  if p_status = 'accepted' and nullif(btrim(p_provider_email_id), '') is null then
    raise exception 'ticket_email_provider_id_required';
  end if;

  -- Acknowledge an already attempted send even if testing is disabled or time
  -- elapses afterward. Exact claim ownership prevents a stale re-leased worker.
  if p_status = 'failed' and nullif(btrim(p_provider_email_id), '') is not null then
    raise exception 'ticket_email_failed_provider_id_invalid';
  end if;

  -- Lock before checking provenance and updating the existing lease.
  select * into delivery from public.annual_conference_ticket_email_outbox
    where id = p_outbox_id for update;
  if delivery.id is null or not (public.complete_test_email_context('admission', p_outbox_id)
      @> jsonb_build_object('is_test', true, 'origin', p_origin)) then
    raise exception 'complete_test_email_unavailable';
  end if;

  update public.annual_conference_ticket_email_outbox
  set status = p_status,
      provider_email_id = coalesce(nullif(btrim(p_provider_email_id), ''), provider_email_id),
      last_error = case when p_status = 'failed' then left(coalesce(p_last_error, 'Email provider did not accept the message.'), 500) else null end,
      next_attempt_at = case
        when p_status = 'failed' and attempt_count < 5 and provider_email_id is null and accepted_at is null
          then coalesce(p_next_attempt_at, now() + make_interval(mins => least(60, 5 * (2 ^ greatest(attempt_count - 1, 0)))::integer))
        else next_attempt_at end,
      accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
      claim_token = null, claimed_until = null
  where id = p_outbox_id and status = 'sending' and claim_token = p_claim_token
  returning * into delivery;
  if delivery.id is null then raise exception 'ticket_email_claim_lost'; end if;
  -- Existing scrub triggers remove QR secrets and frozen payload on acceptance.
  return delivery;
end;
$$;

revoke all on function public.finalize_complete_test_only_admission_email(uuid, uuid, public.annual_conference_ticket_email_status, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_complete_test_only_admission_email(uuid, uuid, public.annual_conference_ticket_email_status, text, text, text, timestamptz) to service_role;
