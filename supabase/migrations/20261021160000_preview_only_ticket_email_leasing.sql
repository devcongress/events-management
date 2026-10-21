-- Preview-only leasing: leave existing registration and live-order mail untouched.
-- Adds two service-only functions. No data changes, sending, cleanup, or activation.

create function public.claim_complete_test_only_admission_emails(p_claim_token uuid, p_limit integer, p_origin text)
returns setof public.annual_conference_ticket_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_origin is null or p_origin !~ '^https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$' then
    raise exception 'complete_test_origin_invalid';
  end if;
  perform set_config('app.complete_test_email_dispatch', 'enabled', true);
  if p_claim_token is null or p_limit not between 1 and 100 then raise exception 'ticket_email_claim_invalid'; end if;
  -- Serialize the policy snapshot with settings changes before leasing mail.
  perform 1 from public.annual_conference_ticketing_settings order by edition_id for update;
  -- Never retry beyond the provider idempotency window. Keep a visible terminal
  -- failure for an operator to reconcile; do not mint another admission silently.
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', next_attempt_at = 'infinity', claim_token = null,
      claimed_until = null, last_error = 'Delivery requires operator reconciliation.'
    where public.complete_test_email_context('admission', id) @> jsonb_build_object('is_test', true, 'allowed', true, 'origin', p_origin)
      and status in ('queued', 'failed', 'sending') and provider_email_id is null
      and next_attempt_at <> 'infinity'::timestamptz
      and (claimed_until is null or claimed_until <= now())
      and (attempt_count >= 5 or first_attempt_at <= now() - interval '1 hour');
  return query with due as (
    select id from public.annual_conference_ticket_email_outbox
    where public.complete_test_email_context('admission', id) @> jsonb_build_object('is_test', true, 'allowed', true, 'origin', p_origin)
      and public.annual_conference_email_allowed('admission', id, recipient_email) and attempt_count < 5 and provider_email_id is null and accepted_at is null
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

create function public.claim_complete_test_only_social_emails(p_claim_token uuid, p_limit integer, p_origin text)
returns setof public.annual_conference_social_card_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_origin is null or p_origin !~ '^https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$' then
    raise exception 'complete_test_origin_invalid';
  end if;
  perform set_config('app.complete_test_email_dispatch', 'enabled', true);
  if p_claim_token is null or p_limit < 1 or p_limit > 100 then raise exception using message = 'social_card_email_claim_invalid'; end if;
  perform 1 from public.annual_conference_ticketing_settings order by edition_id for update;
  update public.annual_conference_social_card_email_outbox
    set status = 'failed', capability = '', last_error = 'Social-card email retry limit reached.',
        next_attempt_at = 'infinity', claim_token = null, claimed_until = null
    where public.complete_test_email_context('social', id) @> jsonb_build_object('is_test', true, 'allowed', true, 'origin', p_origin)
      and attempt_count >= 5 and (
      (status in ('queued', 'failed') and next_attempt_at <= now())
      or (status = 'sending' and claimed_until <= now())
    );
  return query with due as (
    select id from public.annual_conference_social_card_email_outbox
    where public.complete_test_email_context('social', id) @> jsonb_build_object('is_test', true, 'allowed', true, 'origin', p_origin)
      and public.annual_conference_email_allowed('social', id, recipient_email) and attempt_count < 5 and (
      (status in ('queued', 'failed') and next_attempt_at <= now())
      or (status = 'sending' and claimed_until <= now())
    )
    order by next_attempt_at, created_at limit p_limit for update skip locked
  ) update public.annual_conference_social_card_email_outbox outbox
    set status = 'sending', attempt_count = outbox.attempt_count + 1, claim_token = p_claim_token, claimed_until = now() + interval '10 minutes', last_error = null
    from due where outbox.id = due.id returning outbox.*;
end;
$$;

revoke all on function public.claim_complete_test_only_admission_emails(uuid, integer, text),
  public.claim_complete_test_only_social_emails(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_complete_test_only_admission_emails(uuid, integer, text),
  public.claim_complete_test_only_social_emails(uuid, integer, text) to service_role;
