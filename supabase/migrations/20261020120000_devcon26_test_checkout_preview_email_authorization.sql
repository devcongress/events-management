-- Persist the server-verified preview origin that authorizes one sandbox
-- confirmation email. Existing sessions remain exact-recipient allowlist only.
alter table public.devcon26_test_checkout_sessions
  add column preview_email_authorized_origin text,
  add column preview_email_authorized_until timestamptz,
  add constraint devcon26_test_checkout_preview_email_origin_check check (
    preview_email_authorized_origin is null
    or (
      length(preview_email_authorized_origin) between 12 and 300
      and preview_email_authorized_origin = btrim(preview_email_authorized_origin)
      and preview_email_authorized_origin ~ '^https://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?$'
    )
  ),
  add constraint devcon26_test_checkout_preview_email_authorization_check check (
    (preview_email_authorized_origin is null and preview_email_authorized_until is null)
    or (preview_email_authorized_origin is not null and preview_email_authorized_until is not null)
  );

alter table public.devcon26_test_checkout_email_outbox
  add column preview_email_authorized_origin text,
  add column preview_email_authorized_until timestamptz,
  add constraint devcon26_test_checkout_email_preview_origin_check check (
    preview_email_authorized_origin is null
    or (
      length(preview_email_authorized_origin) between 12 and 300
      and preview_email_authorized_origin = btrim(preview_email_authorized_origin)
      and preview_email_authorized_origin ~ '^https://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?$'
    )
  ),
  add constraint devcon26_test_checkout_email_preview_authorization_check check (
    (preview_email_authorized_origin is null and preview_email_authorized_until is null)
    or (preview_email_authorized_origin is not null and preview_email_authorized_until is not null)
  );

create or replace function public.freeze_devcon26_test_checkout_terms() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if row(new.checkout_request_key, new.tier_key, new.quantity, new.amount_minor, new.currency,
      new.payment_reference, new.purchaser_name, new.purchaser_email, new.base_amount_minor,
      new.discount_amount_minor, new.coupon_id, new.coupon_code, new.preview_email_authorized_origin,
      new.preview_email_authorized_until)
    is distinct from row(old.checkout_request_key, old.tier_key, old.quantity, old.amount_minor, old.currency,
      old.payment_reference, old.purchaser_name, old.purchaser_email, old.base_amount_minor,
      old.discount_amount_minor, old.coupon_id, old.coupon_code, old.preview_email_authorized_origin,
      old.preview_email_authorized_until) then
    raise exception 'test_checkout_terms_immutable';
  end if;
  return new;
end;
$$;

drop function public.prepare_devcon26_test_checkout(uuid, text, text, text, text);
create function public.prepare_devcon26_test_checkout(
  p_request_key uuid, p_tier_key text, p_purchaser_name text, p_purchaser_email text,
  p_coupon_code text default null, p_preview_email_authorized_origin text default null
) returns public.devcon26_test_checkout_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  session public.devcon26_test_checkout_sessions;
  coupon public.devcon26_test_coupon_codes;
  quote jsonb;
  normalized_code text := nullif(upper(btrim(p_coupon_code)), '');
  buyer_name text := btrim(p_purchaser_name);
  buyer_email text := lower(btrim(p_purchaser_email));
  session_id uuid := gen_random_uuid();
begin
  if buyer_name is null or length(buyer_name) not between 1 and 160 or buyer_name ~ '[[:cntrl:]]'
    or buyer_email is null or length(buyer_email) > 254 or buyer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or (normalized_code is not null and normalized_code !~ '^[A-Z0-9-]{3,48}$') then
    raise exception 'test_checkout_invalid_buyer';
  end if;
  if p_preview_email_authorized_origin is not null
    and (length(p_preview_email_authorized_origin) not between 12 and 300
      or p_preview_email_authorized_origin <> btrim(p_preview_email_authorized_origin)
      or p_preview_email_authorized_origin !~ '^https://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?$') then
    raise exception 'test_checkout_invalid_preview_email_origin';
  end if;
  -- Serialize a retry key first; every coupon operation then locks coupon -> session -> claim.
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text, 0));
  select * into session from public.devcon26_test_checkout_sessions where checkout_request_key = p_request_key;
  if found then
    if row(session.tier_key, session.purchaser_name, session.purchaser_email, session.coupon_code,
        session.preview_email_authorized_origin)
      is distinct from row(p_tier_key, buyer_name, buyer_email, normalized_code,
        p_preview_email_authorized_origin) then raise exception 'test_checkout_cart_conflict'; end if;
    if session.coupon_id is not null then
      select * into coupon from public.devcon26_test_coupon_codes where id = session.coupon_id for update;
    end if;
    select * into session from public.devcon26_test_checkout_sessions where id = session.id for update;
    if session.status in ('verified', 'rejected', 'refund_required') or session.expires_at <= now() then
      raise exception 'test_checkout_finished';
    end if;
    if session.authorization_url is not null then return session; end if;
    if session.initialization_lease_until > now() then raise exception 'test_checkout_in_progress'; end if;
  else
    if normalized_code is not null then
      select * into coupon from public.devcon26_test_coupon_codes
        where edition_year = 2026 and code = normalized_code for update;
      if not found then raise exception 'test_coupon_invalid'; end if;
      update public.devcon26_test_coupon_claims set status = 'released', resolution_reason = 'expired'
        where coupon_id = coupon.id and status = 'held' and expires_at <= now();
    end if;
    quote := public.quote_devcon26_test_checkout(p_tier_key, normalized_code);
    insert into public.devcon26_test_checkout_sessions (
      id, checkout_request_key, tier_key, quantity, amount_minor, payment_reference,
      purchaser_name, purchaser_email, base_amount_minor, discount_amount_minor, coupon_id, coupon_code,
      preview_email_authorized_origin, preview_email_authorized_until, expires_at
    ) values (
      session_id, p_request_key, p_tier_key, (quote->>'quantity')::integer,
      (quote->>'final_amount_minor')::integer, 'devcon26-test-' || replace(session_id::text, '-', ''),
      buyer_name, buyer_email, (quote->>'base_amount_minor')::integer,
      (quote->>'discount_amount_minor')::integer, coupon.id, normalized_code,
      p_preview_email_authorized_origin,
      case when p_preview_email_authorized_origin is not null then now() + interval '1 hour' end,
      now() + interval '15 minutes'
    ) returning * into session;
    if coupon.id is not null then
      insert into public.devcon26_test_coupon_claims (coupon_id, session_id, status, expires_at)
        values (coupon.id, session.id, 'held', session.expires_at);
    end if;
  end if;
  update public.devcon26_test_checkout_sessions set initialization_lease = gen_random_uuid(),
    initialization_lease_until = now() + interval '45 seconds'
    where id = session.id returning * into session;
  return session;
end;
$$;

create or replace function public.queue_devcon26_test_checkout_email() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.purchaser_email is not null and new.purchaser_name is not null then
    insert into public.devcon26_test_checkout_email_outbox
      (session_id, recipient_email, recipient_name, tier_key, quantity, amount_minor,
        idempotency_key, preview_email_authorized_origin, preview_email_authorized_until)
    values (new.id, lower(trim(new.purchaser_email)), new.purchaser_name, new.tier_key,
      new.quantity, new.amount_minor, 'devcon26-test-confirmation/' || new.id::text,
      new.preview_email_authorized_origin, new.preview_email_authorized_until)
    on conflict (session_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.claim_devcon26_test_checkout_emails(p_claim_token uuid)
returns setof public.devcon26_test_checkout_email_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_claim_token is null then raise exception 'missing_claim_token'; end if;

  update public.devcon26_test_checkout_email_outbox
  set status = 'suppressed', claim_token = null, lease_until = null, updated_at = now()
  where status in ('queued', 'failed', 'sending')
    and preview_email_authorized_origin is not null
    and (preview_email_authorized_until is null or preview_email_authorized_until <= now())
    and (lease_until is null or lease_until <= now());

  update public.devcon26_test_checkout_email_outbox
  set status = 'needs_attention', claim_token = null, lease_until = null, updated_at = now()
  where status in ('queued', 'failed', 'sending')
    and (lease_until is null or lease_until <= now())
    and (attempt_count >= 5 or first_attempt_at <= now() - interval '1 hour');

  return query
  with due as (
    select id from public.devcon26_test_checkout_email_outbox
    where status in ('queued', 'failed', 'sending') and next_attempt_at <= now()
      and (lease_until is null or lease_until <= now())
      and attempt_count < 5
      and (first_attempt_at is null or first_attempt_at > now() - interval '1 hour')
      and (preview_email_authorized_origin is null or preview_email_authorized_until > now())
    order by next_attempt_at, id for update skip locked limit 5
  )
  update public.devcon26_test_checkout_email_outbox o
  set status = 'sending', claim_token = p_claim_token, lease_until = now() + interval '10 minutes',
    attempt_count = o.attempt_count + 1, first_attempt_at = coalesce(o.first_attempt_at, now()), updated_at = now()
  from due where o.id = due.id returning o.*;
end;
$$;

revoke all on function public.prepare_devcon26_test_checkout(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.prepare_devcon26_test_checkout(uuid, text, text, text, text, text)
  to service_role;
