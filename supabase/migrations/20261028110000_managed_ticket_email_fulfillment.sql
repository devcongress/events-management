-- Unified fulfillment applies only to new managed orders and existing preview opt-ins.
-- Historical outbox payloads are unchanged.

create or replace function public.combine_preview_ticket_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare ticket_order public.annual_conference_ticket_orders; target_id uuid;
begin
  select * into ticket_order from public.annual_conference_ticket_orders where id = new.order_id;
  if not (coalesce(ticket_order.preview_combined_email, false) or ticket_order.checkout_settings_version is not null) then
    return new;
  end if;
  -- Paystack owns the payment receipt. No duplicate receipt is queued.
  if new.kind = 'payment_receipt' then return null; end if;
  if new.kind in ('flexible_admission_delivery', 'flexible_order_management', 'flexible_gift_claim') then
    new.payload := new.payload || jsonb_build_object('email_version', 2);
  end if;
  if new.kind = 'flexible_admission_delivery' then
    new.payload := new.payload || jsonb_build_object('seat_number', (
      select order_seat_number from public.annual_conference_tickets
      where id::text = new.payload->>'ticket_id' and order_id = new.order_id
    ));
    -- Later QR reissues can reuse an existing badge without a new badge email.
    if exists (select 1 from public.annual_conference_social_cards
      where ticket_id::text = new.payload->>'ticket_id'
        and is_test = (ticket_order.payment_mode = 'test') and revoked_at is null) then
      new.payload := new.payload || jsonb_build_object('badge_included', true);
    end if;
  end if;
  if new.kind = 'flexible_order_management' then
    select d.id into target_id from public.annual_conference_ticket_email_outbox d
      join public.annual_conference_tickets t on t.id::text = d.payload->>'ticket_id' and t.order_id = d.order_id
      join public.annual_conference_flexible_ticket_allocations a on a.order_id = t.order_id and a.seat_index = t.order_seat_number
      where d.order_id = new.order_id and a.allocation_kind = 'self'
        and d.kind = 'flexible_admission_delivery' and d.payload->>'email_version' = '2'
        and d.recipient_email = new.recipient_email and new.recipient_email = ticket_order.purchaser_email
        and d.status = 'queued' and d.attempt_count = 0 and d.first_attempt_at is null
        and d.provider_payload is null and d.provider_email_id is null and d.accepted_at is null
      for update of d;
    if target_id is not null then
      -- Existing scrub trigger removes capability on acceptance/reconciliation.
      update public.annual_conference_ticket_email_outbox
        set payload = payload || jsonb_build_object('capability', new.payload->>'capability') where id = target_id;
      return null;
    end if;
  end if;
  -- A purchaser without a self ticket still needs their management email.
  return new;
end;
$$;

create or replace function public.combine_preview_badge_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare target_id uuid;
begin
  select d.id into target_id from public.annual_conference_social_cards c
    join public.annual_conference_tickets t on t.id = c.ticket_id
    join public.annual_conference_ticket_orders o on o.id = t.order_id
    join public.annual_conference_ticket_email_outbox d on d.order_id = o.id and d.payload->>'ticket_id' = t.id::text
    where c.id = new.social_card_id and c.is_test = (o.payment_mode = 'test')
      and (o.preview_combined_email or o.checkout_settings_version is not null)
      and d.kind = 'flexible_admission_delivery' and d.recipient_email = new.recipient_email
      and d.payload->>'email_version' = '2' and not (d.payload ? 'badge_included')
      and d.status = 'queued' and d.attempt_count = 0 and d.first_attempt_at is null
      and d.provider_payload is null and d.provider_email_id is null and d.accepted_at is null
    for update of d;
  if target_id is not null then
    -- The sender signs a seat-scoped badge link; no extra raw capability is copied.
    update public.annual_conference_ticket_email_outbox
      set payload = payload || jsonb_build_object('badge_included', true) where id = target_id;
    return null;
  end if;
  -- Explicit later badge reissues and unrelated queued mail retain their behavior.
  return new;
end;
$$;

-- PostgreSQL resolves this integer parameter even on accepted sends.
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
  if p_status is null or p_status not in ('accepted', 'failed') then raise exception using message = 'ticket_email_status_invalid'; end if;
  if p_status = 'accepted' and nullif(btrim(p_provider_email_id), '') is null then raise exception using message = 'ticket_email_provider_id_required'; end if;

  update public.annual_conference_ticket_email_outbox
  set status = p_status,
      provider_email_id = coalesce(nullif(btrim(p_provider_email_id), ''), provider_email_id),
      payload = case when p_status = 'accepted' and kind in ('ticket_delivery', 'ticket_bundle_delivery') then payload - 'qr_token' - 'tickets' else payload end,
      last_error = case when p_status = 'failed' then left(coalesce(p_last_error, 'Email provider did not accept the message.'), 500) else null end,
      next_attempt_at = case when p_status = 'failed' and attempt_count < 5 and provider_email_id is null and accepted_at is null then coalesce(p_next_attempt_at, now() + make_interval(mins => least(60, 5 * (2 ^ greatest(attempt_count - 1, 0)))::integer)) else next_attempt_at end,
      accepted_at = case when p_status = 'accepted' then now() else accepted_at end,
      claim_token = null, claimed_until = null
  where id = p_outbox_id and status = 'sending' and claim_token = p_claim_token
  returning * into delivery;

  if delivery.id is null then raise exception using message = 'ticket_email_claim_lost'; end if;
  return delivery;
end;
$$;

create or replace function public.complete_test_email_context(p_kind text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with source as (
    select o.payment_mode, o.checkout_origin, o.edition_id, o.checkout_settings_version, d.recipient_email
      from public.annual_conference_ticket_email_outbox d
      join public.annual_conference_ticket_orders o on o.id = d.order_id
      where p_kind = 'admission' and d.id = p_id
    union all
    select o.payment_mode, o.checkout_origin, o.edition_id, o.checkout_settings_version, d.recipient_email
      from public.annual_conference_social_card_email_outbox d
      left join public.annual_conference_social_cards c on c.id = d.social_card_id
      left join public.annual_conference_tickets t on t.id = c.ticket_id
      join public.annual_conference_ticket_orders o on o.id = coalesce(d.collection_order_id, t.order_id)
      where p_kind = 'social' and d.id = p_id
  ) select coalesce((select jsonb_build_object(
    'is_test', true,
    'managed_checkout', checkout_settings_version is not null,
    'origin', checkout_origin,
    'allowed', (checkout_settings_version is not null
      or coalesce((public.get_annual_conference_registration_testing(edition_id)->>'enabled')::boolean, false))
      and (public.get_annual_conference_registration_testing(edition_id)->'tester_emails' ? lower(btrim(recipient_email)))
  ) from source where payment_mode = 'test'), '{"is_test":false,"allowed":true}'::jsonb);
$$;

-- Legacy preview test mail remains exclusively in its exact-origin queue.
create function public.managed_conference_email_dispatch_allowed(p_kind text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((context->>'is_test')::boolean, false)
    or (coalesce((context->>'managed_checkout')::boolean, false)
      and coalesce((context->>'allowed')::boolean, false))
  from (select public.complete_test_email_context(p_kind, p_id) as context) policy;
$$;

create or replace function public.guard_complete_test_email_lease()
returns trigger language plpgsql security definer set search_path = public as $$
declare context jsonb;
begin
  if new.status = 'sending' and (old.status is distinct from new.status or old.claim_token is distinct from new.claim_token) then
    context := public.complete_test_email_context(tg_argv[0], new.id);
    if coalesce((context->>'is_test')::boolean, false)
      and (not coalesce((context->>'allowed')::boolean, false)
        or (not coalesce((context->>'managed_checkout')::boolean, false)
          and current_setting('app.complete_test_email_dispatch', true) is distinct from 'enabled')) then
      return null;
    end if;
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

create or replace function public.claim_annual_conference_ticket_email_outbox(p_claim_token uuid, p_limit integer default 20)
returns setof public.annual_conference_ticket_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_claim_token is null or p_limit not between 1 and 100 then raise exception 'ticket_email_claim_invalid'; end if;
  -- Serialize the policy snapshot with settings changes before leasing mail.
  perform 1 from public.annual_conference_ticketing_settings order by edition_id for update;
  -- Never retry beyond the provider idempotency window. Keep a visible terminal
  -- failure for an operator to reconcile; do not mint another admission silently.
  update public.annual_conference_ticket_email_outbox
    set status = 'failed', next_attempt_at = 'infinity', claim_token = null,
      claimed_until = null, last_error = 'Delivery requires operator reconciliation.'
    where public.managed_conference_email_dispatch_allowed('admission', id)
      and status in ('queued', 'failed', 'sending') and provider_email_id is null
      and next_attempt_at <> 'infinity'::timestamptz
      and (claimed_until is null or claimed_until <= now())
      and (attempt_count >= 5 or first_attempt_at <= now() - interval '1 hour');
  return query with due as (
    select id from public.annual_conference_ticket_email_outbox
    where public.managed_conference_email_dispatch_allowed('admission', id)
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

create or replace function public.claim_annual_conference_social_card_email_outbox(p_claim_token uuid, p_limit integer default 20)
returns setof public.annual_conference_social_card_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  if p_claim_token is null or p_limit < 1 or p_limit > 100 then raise exception using message = 'social_card_email_claim_invalid'; end if;
  perform 1 from public.annual_conference_ticketing_settings order by edition_id for update;
  update public.annual_conference_social_card_email_outbox
    set status = 'failed', capability = '', last_error = 'Social-card email retry limit reached.',
        next_attempt_at = 'infinity', claim_token = null, claimed_until = null
    where public.managed_conference_email_dispatch_allowed('social', id)
      and attempt_count >= 5 and (
      (status in ('queued', 'failed') and next_attempt_at <= now())
      or (status = 'sending' and claimed_until <= now())
    );
  return query with due as (
    select id from public.annual_conference_social_card_email_outbox
    where public.managed_conference_email_dispatch_allowed('social', id)
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

revoke all on function public.managed_conference_email_dispatch_allowed(text, uuid) from public, anon, authenticated;
grant execute on function public.managed_conference_email_dispatch_allowed(text, uuid) to service_role;
