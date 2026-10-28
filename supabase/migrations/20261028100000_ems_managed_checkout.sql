-- EMS selects the environment for new checkouts. Orders and attempts retain
-- their original environment across later settings and tester-list changes.
begin;

alter table public.annual_conference_ticketing_settings
  add column checkout_settings_version bigint not null default 1
    check (checkout_settings_version > 0);

alter table public.annual_conference_ticket_orders
  add column checkout_settings_version bigint
    check (checkout_settings_version > 0);

create function public.version_managed_conference_checkout_settings()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (to_jsonb(new) - 'checkout_settings_version' - 'updated_at' - 'updated_by_email')
    is distinct from
    (to_jsonb(old) - 'checkout_settings_version' - 'updated_at' - 'updated_by_email') then
    new.checkout_settings_version := old.checkout_settings_version + 1;
  elsif new.checkout_settings_version is distinct from old.checkout_settings_version
    and new.checkout_settings_version <> old.checkout_settings_version + 1 then
    raise exception 'checkout_settings_version_invalid';
  end if;

  return new;
end;
$$;

create trigger version_managed_conference_checkout_settings
before update on public.annual_conference_ticketing_settings
for each row execute function public.version_managed_conference_checkout_settings();

create function public.version_managed_conference_testing_settings()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  edition uuid;
  changed boolean;
begin
  if tg_op = 'DELETE' then
    edition := old.edition_id;
    changed := true;
  else
    edition := new.edition_id;
    if tg_op = 'UPDATE' and new.edition_id is distinct from old.edition_id then
      raise exception 'conference_testing_edition_immutable';
    end if;
    changed := tg_op = 'INSERT';
    if tg_op = 'UPDATE' then
      changed := (new.enabled, new.tester_emails) is distinct from (old.enabled, old.tester_emails);
    end if;
  end if;

  -- The canonical configure RPC acquires this lock before touching testing rows.
  -- Keep a single authority lock even for direct administrative SQL changes.
  perform 1 from public.annual_conference_ticketing_settings
    where edition_id = edition for update;
  if not found then raise exception 'conference_settings_not_found'; end if;

  if changed then
    update public.annual_conference_ticketing_settings
      set checkout_settings_version = checkout_settings_version + 1
      where edition_id = edition;
  end if;

  if tg_op = 'DELETE' then return old; end if;

  return new;
end;
$$;

create trigger version_managed_conference_testing_settings
after insert or update or delete on public.annual_conference_registration_test_settings
for each row execute function public.version_managed_conference_testing_settings();

create function public.managed_conference_checkout_origin_valid(p_origin text)
returns boolean
language sql immutable set search_path = public as $$
  select p_origin is not null and char_length(p_origin) <= 512
    and p_origin ~ '^https://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:[1-9][0-9]{0,4})?$'
    and coalesce(substring(p_origin from ':([0-9]+)$')::integer between 1 and 65535, true);
$$;

alter table public.annual_conference_ticket_orders
  drop constraint ticket_test_origin_required,
  add constraint ticket_test_origin_required check (
    payment_mode = 'live'
    or public.managed_conference_checkout_origin_valid(checkout_origin)
  );

-- Test inventory has been excluded from venue capacity since 20261024140000.
-- Preserve test records and their permanent admission restrictions at launch.
drop trigger guard_complete_test_live_launch on public.annual_conference_ticketing_settings;
drop function public.guard_complete_test_live_launch();

create or replace function public.guard_complete_test_order_identity()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.payment_mode, new.checkout_origin, new.checkout_settings_version)
    is distinct from (old.payment_mode, old.checkout_origin, old.checkout_settings_version) then
    raise exception 'ticket_payment_mode_immutable';
  end if;

  return new;
end;
$$;

create function public.snapshot_managed_conference_checkout_settings()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  version_snapshot text := nullif(current_setting('app.managed_checkout_settings_version', true), '');
begin
  if version_snapshot is not null then
    new.checkout_settings_version := version_snapshot::bigint;
  end if;

  return new;
end;
$$;

create trigger snapshot_managed_conference_checkout_settings
before insert on public.annual_conference_ticket_orders
for each row execute function public.snapshot_managed_conference_checkout_settings();

create function public.get_managed_conference_checkout_settings(p_year integer)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'edition_id', settings.edition_id,
    'payment_mode', case when coalesce(testing.enabled, false) then 'test' else 'live' end,
    'settings_version', settings.checkout_settings_version,
    'public_mode', settings.public_mode,
    'sales_status', settings.sales_status,
    'flexible_checkout_state', settings.flexible_checkout_state,
    'regular_price_minor', settings.regular_price_minor,
    'flexible_checkout_max_amount_minor', settings.flexible_checkout_max_amount_minor
  )
  from public.annual_conference_editions edition
  join public.annual_conference_ticketing_settings settings on settings.edition_id = edition.id
  left join public.annual_conference_registration_test_settings testing on testing.edition_id = edition.id
  where edition.year = p_year;
$$;

-- Keep free-registration testing intact. Paid mode and recipient changes must
-- pass the versioned managed RPC, including after a concurrent free/paid change.
create or replace function public.configure_annual_conference_registration_testing(
  p_edition_id uuid, p_enabled boolean, p_emails text[], p_actor text
)
returns void language plpgsql security definer set search_path = public as $$
declare normalized text[];
begin
  -- Same lock as allocation and mode changes; no partially applied allowlist.
  perform 1 from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  if not found then raise exception 'conference_settings_not_found'; end if;
  if exists (select 1 from public.annual_conference_ticketing_settings
    where edition_id = p_edition_id and public_mode = 'paid')
    and current_setting('app.managed_payment_settings', true) is distinct from 'enabled' then
    raise exception 'managed_payment_settings_required';
  end if;
  if p_enabled is null or p_emails is null or cardinality(p_emails) > 200
    or exists (select 1 from unnest(p_emails) e where e is null or position('*' in e) > 0 or length(btrim(e)) > 254
      or btrim(e) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'invalid_tester_emails';
  end if;
  select coalesce(array_agg(distinct lower(btrim(e)) order by lower(btrim(e))), '{}') into normalized from unnest(p_emails) e;
  insert into public.annual_conference_registration_test_settings(edition_id, enabled, tester_emails, updated_by_email)
    values (p_edition_id, p_enabled, normalized, lower(btrim(p_actor)))
    on conflict (edition_id) do update set enabled = excluded.enabled, tester_emails = excluded.tester_emails,
      updated_by_email = excluded.updated_by_email, updated_at = now();
end;
$$;

create function public.configure_managed_conference_payment_mode(
  p_edition_id uuid, p_mode text, p_settings_version bigint, p_actor text,
  p_tester_emails text[] default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  settings public.annual_conference_ticketing_settings;
  emails text[];
  conference_year integer;
  previous_payment_context text := coalesce(current_setting('app.managed_payment_settings', true), '');
begin
  if p_mode is null or p_mode not in ('test', 'live')
    or nullif(btrim(p_actor), '') is null then
    raise exception 'managed_checkout_mode_invalid';
  end if;

  select * into settings from public.annual_conference_ticketing_settings
    where edition_id = p_edition_id for update;
  if settings.edition_id is null then raise exception 'conference_settings_not_found'; end if;
  if p_settings_version is distinct from settings.checkout_settings_version then
    raise exception 'checkout_settings_changed';
  end if;

  select tester_emails into emails from public.annual_conference_registration_test_settings
    where edition_id = p_edition_id;
  perform set_config('app.managed_payment_settings', 'enabled', true);
  perform public.configure_annual_conference_registration_testing(
    p_edition_id, p_mode = 'test', coalesce(p_tester_emails, emails, '{}'::text[]), p_actor
  );
  perform set_config('app.managed_payment_settings', previous_payment_context, true);
  select year into conference_year from public.annual_conference_editions where id = p_edition_id;

  return public.get_managed_conference_checkout_settings(conference_year);
end;
$$;

create function public.create_managed_conference_checkout_hold(
  p_edition_id uuid,
  p_purchaser_name text,
  p_purchaser_email text,
  p_quantity integer,
  p_allocations jsonb,
  p_checkout_request_key uuid,
  p_expected_mode text,
  p_settings_version bigint,
  p_origin text
)
returns public.annual_conference_ticket_orders
language plpgsql security definer set search_path = public as $$
declare
  settings public.annual_conference_ticketing_settings;
  testing jsonb;
  selected_mode text;
  result public.annual_conference_ticket_orders;
  previous_version_context text := coalesce(current_setting('app.managed_checkout_settings_version', true), '');
begin
  select * into settings from public.annual_conference_ticketing_settings
    where edition_id = p_edition_id for update;
  if settings.edition_id is null then raise exception 'conference_settings_not_found'; end if;

  testing := public.get_annual_conference_registration_testing(p_edition_id);
  selected_mode := case when coalesce((testing->>'enabled')::boolean, false) then 'test' else 'live' end;
  if p_expected_mode is distinct from selected_mode
    or p_settings_version is distinct from settings.checkout_settings_version then
    raise exception 'checkout_settings_changed';
  end if;
  if settings.public_mode <> 'paid' or settings.sales_status <> 'open'
    or settings.flexible_checkout_state not in ('internal', 'public') then
    raise exception 'managed_checkout_not_available';
  end if;
  if not public.managed_conference_checkout_origin_valid(p_origin) then
    raise exception 'managed_checkout_origin_invalid';
  end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception 'flexible_ticket_allocations_invalid';
  end if;

  if selected_mode = 'test' and (
    not (testing->'tester_emails' ? lower(btrim(p_purchaser_email)))
    or exists (
      select 1 from jsonb_array_elements(p_allocations) allocation
      where allocation->>'recipient_email' is not null
        and not (testing->'tester_emails' ? lower(btrim(allocation->>'recipient_email')))
    )
  ) then
    raise exception 'complete_test_recipient_not_allowed';
  end if;

  perform set_config('app.managed_checkout_settings_version', settings.checkout_settings_version::text, true);
  select * into result from public.create_conference_checkout_hold_for_mode(
    p_edition_id, p_purchaser_name, p_purchaser_email, p_quantity, p_allocations,
    p_checkout_request_key, selected_mode, case when selected_mode = 'test' then p_origin else null end
  );
  perform set_config('app.managed_checkout_settings_version', previous_version_context, true);

  if result.checkout_settings_version is distinct from settings.checkout_settings_version then
    raise exception 'flexible_ticket_checkout_request_conflict';
  end if;

  return result;
end;
$$;

-- Current selection controls new purchases. Existing test records remain test
-- after selecting Live; only the saved exact recipient list controls their use.
create or replace function public.guard_complete_test_ticket()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  settings jsonb;
  mode text;
begin
  select payment_mode into mode from public.annual_conference_ticket_orders where id = new.order_id;
  if mode = 'test' then
    if new.status = 'checked_in' then raise exception 'test_ticket_not_valid_for_admission'; end if;
    if tg_op = 'INSERT' or new.attendee_email is distinct from old.attendee_email then
      settings := public.get_annual_conference_registration_testing(new.edition_id);
      if new.attendee_email is not null
        and not (settings->'tester_emails' ? lower(btrim(new.attendee_email))) then
        raise exception 'complete_test_recipient_not_allowed';
      end if;
    end if;
  end if;

  return new;
end;
$$;

alter table public.annual_conference_ticket_payment_attempts
  add column authorization_url text,
  add column initialization_claim uuid,
  add column initialization_claimed_until timestamptz,
  add constraint managed_checkout_authorization_url check (
    authorization_url is null
    or (char_length(authorization_url) <= 2048
      and authorization_url ~ '^https://checkout[.]paystack[.]com/[^[:space:][:cntrl:]]+$')
  );

create function public.guard_managed_conference_checkout_initialization()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ticket_order public.annual_conference_ticket_orders;
begin
  if tg_op = 'UPDATE' and new.order_id is distinct from old.order_id
    and exists (select 1 from public.annual_conference_ticket_orders
      where id = old.order_id and checkout_settings_version is not null) then
    raise exception 'checkout_initialization_immutable';
  end if;

  select * into ticket_order from public.annual_conference_ticket_orders where id = new.order_id;
  if ticket_order.checkout_settings_version is not null then
    if new.provider <> 'paystack' or new.payment_reference is distinct from
      'devcon26-managed-' || ticket_order.payment_mode || '-' || replace(ticket_order.id::text, '-', '') then
      raise exception 'ticket_payment_reference_mismatch';
    end if;
    if tg_op = 'UPDATE' and (
      (old.authorization_url is not null and new.authorization_url is distinct from old.authorization_url)
      or (old.initialization_claim is not null and new.initialization_claim is distinct from old.initialization_claim)
      or new.order_id is distinct from old.order_id
    ) then
      raise exception 'checkout_initialization_immutable';
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_managed_conference_checkout_initialization
before insert or update on public.annual_conference_ticket_payment_attempts
for each row execute function public.guard_managed_conference_checkout_initialization();

create function public.claim_managed_conference_checkout_initialization(
  p_order_id uuid, p_reference text, p_claim_token uuid
)
returns public.annual_conference_ticket_payment_attempts
language plpgsql security definer set search_path = public as $$
declare
  ticket_order public.annual_conference_ticket_orders;
  attempt public.annual_conference_ticket_payment_attempts;
begin
  select * into ticket_order from public.annual_conference_ticket_orders where id = p_order_id for update;
  if ticket_order.checkout_settings_version is null or ticket_order.status <> 'pending_payment'
    or ticket_order.expires_at is null or ticket_order.expires_at <= now() then
    raise exception 'ticket_checkout_not_payable';
  end if;
  if p_claim_token is null or p_reference is distinct from
    'devcon26-managed-' || ticket_order.payment_mode || '-' || replace(ticket_order.id::text, '-', '') then
    raise exception 'ticket_payment_reference_mismatch';
  end if;

  insert into public.annual_conference_ticket_payment_attempts(order_id, provider, payment_reference)
    values (ticket_order.id, 'paystack', p_reference)
    on conflict (order_id) do nothing;
  select * into attempt from public.annual_conference_ticket_payment_attempts
    where order_id = ticket_order.id for update;
  if attempt.provider <> 'paystack' or attempt.payment_reference is distinct from p_reference then
    raise exception 'ticket_payment_reference_mismatch';
  end if;
  if attempt.authorization_url is not null then return attempt; end if;
  if attempt.initialization_claim is not null then
    if attempt.initialization_claimed_until > now() then
      raise exception 'checkout_initialization_in_progress';
    end if;
    -- Provider initialization may already have succeeded. Never issue another
    -- initialize request after an ambiguous timeout, even with the same token.
    raise exception 'checkout_initialization_uncertain';
  end if;

  update public.annual_conference_ticket_payment_attempts
    set initialization_claim = p_claim_token, initialization_claimed_until = now() + interval '1 minute'
    where id = attempt.id returning * into attempt;

  return attempt;
end;
$$;

create function public.finalize_managed_conference_checkout_initialization(
  p_order_id uuid, p_claim_token uuid, p_authorization_url text
)
returns public.annual_conference_ticket_payment_attempts
language plpgsql security definer set search_path = public as $$
declare
  attempt public.annual_conference_ticket_payment_attempts;
begin
  perform 1 from public.annual_conference_ticket_orders
    where id = p_order_id and checkout_settings_version is not null for update;
  if not found then raise exception 'ticket_checkout_not_payable'; end if;
  select * into attempt from public.annual_conference_ticket_payment_attempts
    where order_id = p_order_id for update;
  if attempt.id is null or p_claim_token is null or attempt.initialization_claim is distinct from p_claim_token then
    raise exception 'checkout_initialization_claim_mismatch';
  end if;
  if p_authorization_url is null or char_length(p_authorization_url) > 2048
    or p_authorization_url !~ '^https://checkout[.]paystack[.]com/[^[:space:][:cntrl:]]+$' then
    raise exception 'checkout_initialization_url_invalid';
  end if;
  if attempt.authorization_url is not null then
    if attempt.authorization_url is distinct from p_authorization_url then
      raise exception 'checkout_initialization_immutable';
    end if;

    return attempt;
  end if;

  update public.annual_conference_ticket_payment_attempts
    set authorization_url = p_authorization_url, initialization_claimed_until = null,
      status = case when status = 'prepared' then 'initialized' else status end
    where id = attempt.id returning * into attempt;

  return attempt;
end;
$$;

-- Preserve the current capacity-isolated fulfillment contract and add only
-- managed-test reconciliation when a verified payment cannot fulfill its hold.
create or replace function public.confirm_annual_conference_flexible_ticket_payment(
  p_order_id uuid, p_provider text, p_provider_event_id text, p_event_type text, p_payment_reference text,
  p_amount_minor integer, p_currency text, p_payload_sha256 text, p_payment_facts jsonb
)
returns public.annual_conference_ticket_orders
language plpgsql security definer set search_path = public as $$
declare ticket_order public.annual_conference_ticket_orders; settings public.annual_conference_ticketing_settings;
  attempt public.annual_conference_ticket_payment_attempts; event_row public.annual_conference_ticket_payment_events;
  allocation public.annual_conference_flexible_ticket_allocations; issued_ticket public.annual_conference_tickets;
  management_capability text; qr_token text; paid_seats integer; held_seats integer; sponsor_seats integer;
  buyer_bundle jsonb := '[]'::jsonb; buyer_chunk jsonb; buyer_ticket_count integer;
  buyer_chunk_count integer; buyer_chunk_index integer;
  provider_requested_amount integer; provider_fee integer;
begin
  if coalesce(length(btrim(p_provider_event_id)), 0) = 0
    or coalesce(length(btrim(p_event_type)), 0) = 0
    or coalesce(length(btrim(p_payment_reference)), 0) = 0
    or coalesce(length(btrim(p_payload_sha256)), 0) = 0
    or coalesce(btrim(p_provider), '') <> 'paystack'
    or p_amount_minor is null or p_amount_minor < 0 then
    raise exception using message = 'ticket_payment_event_invalid';
  end if;

  select * into ticket_order from public.annual_conference_ticket_orders where id = p_order_id for update;
  if ticket_order.id is null or ticket_order.checkout_flow <> 'flexible' or ticket_order.tier_key <> 'regular_flexible'
    or ticket_order.provider <> 'paystack' or ticket_order.flexible_payment_fee_mode <> 'merchant_absorbs'
    or ticket_order.amount_minor <> ticket_order.quantity * 15000
    or (select count(*) from public.annual_conference_flexible_ticket_allocations where order_id = ticket_order.id) <> ticket_order.quantity then
    raise exception using message = 'flexible_ticket_payment_invalid';
  end if;

  if p_payment_facts ? 'requested_amount' then
    if (p_payment_facts ->> 'requested_amount') !~ '^[0-9]+$'
      or (p_payment_facts ->> 'requested_amount')::numeric > 2147483647 then
      raise exception using message = 'ticket_payment_facts_invalid';
    end if;
    provider_requested_amount := (p_payment_facts ->> 'requested_amount')::integer;
  end if;

  if p_payment_facts ? 'fees' then
    if (p_payment_facts ->> 'fees') !~ '^[0-9]+$'
      or (p_payment_facts ->> 'fees')::numeric > 2147483647 then
      raise exception using message = 'ticket_payment_facts_invalid';
    end if;
    provider_fee := (p_payment_facts ->> 'fees')::integer;
  end if;
  select * into attempt from public.annual_conference_ticket_payment_attempts where order_id = ticket_order.id for update;
  if attempt.id is null or attempt.provider <> 'paystack' or trim(p_provider) <> 'paystack'
    or attempt.payment_reference <> trim(p_payment_reference) then raise exception using message = 'ticket_payment_reference_mismatch'; end if;
  insert into public.annual_conference_ticket_payment_events(provider, provider_event_id, order_id, event_type, payment_reference, payload_sha256, payload_facts)
  values ('paystack', trim(p_provider_event_id), ticket_order.id, trim(p_event_type), trim(p_payment_reference), trim(p_payload_sha256), coalesce(p_payment_facts, '{}'::jsonb))
  on conflict (provider, provider_event_id) do nothing returning * into event_row;
  if event_row.id is not null and btrim(p_event_type) <> 'charge.success' then
    update public.annual_conference_ticket_payment_events
    set status = 'rejected', rejection_reason = 'ticket_payment_event_not_success', processed_at = now()
    where id = event_row.id;
    return ticket_order;
  end if;
  if ticket_order.status = 'paid' then
    if ticket_order.provider <> 'paystack'
      or ticket_order.payment_reference <> btrim(p_payment_reference)
      or ticket_order.amount_paid_minor is distinct from p_amount_minor
      or ticket_order.payment_fee_mode <> 'merchant_absorbs'
      or ticket_order.provider_requested_amount_minor is distinct from provider_requested_amount
      or ticket_order.provider_fee_minor is distinct from provider_fee
      or ticket_order.currency is distinct from upper(btrim(p_currency)) then
      update public.annual_conference_ticket_payment_events
      set status = 'rejected', rejection_reason = 'ticket_payment_replay_mismatch', processed_at = now()
      where id = event_row.id;
      return ticket_order;
    end if;

    update public.annual_conference_ticket_payment_events set status = 'processed', processed_at = now() where id = event_row.id;
    return ticket_order;
  end if;
  if event_row.id is null then return ticket_order; end if;
  if p_amount_minor <> ticket_order.amount_minor or coalesce(upper(trim(p_currency)), '') <> 'GHS'
    or coalesce(p_payment_facts ->> 'fee_mode', 'merchant_absorbs') <> 'merchant_absorbs'
    or (provider_requested_amount is not null and provider_requested_amount <> ticket_order.amount_minor) then
    update public.annual_conference_ticket_payment_events set status = 'rejected', rejection_reason = 'ticket_payment_amount_mismatch', processed_at = now() where id = event_row.id;
    return ticket_order;
  end if;
  select * into settings from public.annual_conference_ticketing_settings where edition_id = ticket_order.edition_id for update;
  update public.annual_conference_ticket_orders set status = 'expired'
    where edition_id = ticket_order.edition_id and status = 'pending_payment' and expires_at <= now() and id <> ticket_order.id;
  select coalesce(sum(quantity), 0) into paid_seats from public.annual_conference_ticket_orders where edition_id = ticket_order.edition_id and payment_mode = 'live' and status = 'paid';
  select coalesce(sum(quantity), 0) into held_seats from public.annual_conference_ticket_orders where edition_id = ticket_order.edition_id and payment_mode = 'live' and status = 'pending_payment' and expires_at > now() and id <> ticket_order.id;
  select coalesce(sum(quantity), 0) into sponsor_seats from public.annual_conference_sponsor_ticket_allocations where edition_id = ticket_order.edition_id;
  if ticket_order.status <> 'pending_payment' or ticket_order.expires_at <= now()
    or settings.sales_status <> 'open' or settings.public_mode <> 'paid'
    or (ticket_order.payment_mode = 'live' and paid_seats + held_seats + sponsor_seats + ticket_order.quantity +
      (select count(*) from public.annual_conference_registrations where edition_id = ticket_order.edition_id and status = 'confirmed') > settings.public_capacity) then
    update public.annual_conference_ticket_orders
    set status = 'expired', provider = 'paystack', payment_reference = trim(p_payment_reference), paid_at = now(), expires_at = null,
        amount_paid_minor = p_amount_minor, payment_fee_mode = 'merchant_absorbs', processing_fee_minor = 0,
        provider_requested_amount_minor = provider_requested_amount, provider_fee_minor = provider_fee
    where id = ticket_order.id;
    if ticket_order.payment_mode = 'test' and ticket_order.checkout_settings_version is not null then
      -- A simulated charge has no money to refund. Preserve verification evidence
      -- and expire the managed test order without tickets or live refund work.
      update public.annual_conference_ticket_payment_attempts
        set status = 'confirmed' where id = attempt.id;
      update public.annual_conference_ticket_payment_events
        set status = 'processed', rejection_reason = 'managed_test_checkout_expired', processed_at = now()
        where id = event_row.id;
      select * into ticket_order from public.annual_conference_ticket_orders where id = ticket_order.id;

      return ticket_order;
    end if;

    update public.annual_conference_ticket_payment_attempts set status = 'refund_pending' where id = attempt.id;
    insert into public.annual_conference_ticket_refunds(order_id, provider, payment_reference, amount_minor, currency, reason)
      values (ticket_order.id, 'paystack', trim(p_payment_reference), p_amount_minor, 'GHS', 'flexible_ticket_refund_required') on conflict (order_id) do nothing;
    update public.annual_conference_ticket_payment_events set status = 'processed', rejection_reason = 'ticket_refund_required', processed_at = now() where id = event_row.id;
    select * into ticket_order from public.annual_conference_ticket_orders where id = ticket_order.id; return ticket_order;
  end if;
  management_capability := encode(extensions.gen_random_bytes(32), 'hex');
  update public.annual_conference_ticket_orders
  set status = 'paid', provider = 'paystack', payment_reference = trim(p_payment_reference), paid_at = now(), expires_at = null,
      amount_paid_minor = p_amount_minor, payment_fee_mode = 'merchant_absorbs', processing_fee_minor = 0,
      provider_requested_amount_minor = provider_requested_amount, provider_fee_minor = provider_fee,
      flexible_order_management_capability_hash = encode(extensions.digest(management_capability, 'sha256'), 'hex')
  where id = ticket_order.id
  returning * into ticket_order;
  for allocation in select * from public.annual_conference_flexible_ticket_allocations where order_id = ticket_order.id order by seat_index loop
    if allocation.allocation_kind = 'self' then
      qr_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.annual_conference_tickets(edition_id, order_id, status, is_bearer_ticket, attendee_name, attendee_email, qr_token_hash, issued_at, order_seat_number)
      values (ticket_order.edition_id, ticket_order.id, 'issued', false, allocation.recipient_name, allocation.recipient_email, encode(extensions.digest(qr_token, 'sha256'), 'hex'), now(), allocation.seat_index) returning * into issued_ticket;
      insert into public.annual_conference_ticket_email_outbox(edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key)
      values (ticket_order.edition_id, ticket_order.id, 'flexible_admission_delivery', allocation.recipient_name, allocation.recipient_email, jsonb_build_object('ticket_id', issued_ticket.id, 'qr_token', qr_token), 'flexible-self-admission:' || issued_ticket.id);
      perform public.issue_annual_conference_social_card_delivery(ticket_order.edition_id, 'attendee', issued_ticket.id);
    elsif allocation.allocation_kind = 'buyer_managed' then
      qr_token := encode(extensions.gen_random_bytes(32), 'hex');
      insert into public.annual_conference_tickets(edition_id, order_id, status, is_bearer_ticket, qr_token_hash, issued_at, order_seat_number)
      values (ticket_order.edition_id, ticket_order.id, 'issued', true, encode(extensions.digest(qr_token, 'sha256'), 'hex'), now(), allocation.seat_index) returning * into issued_ticket;
      buyer_bundle := buyer_bundle || jsonb_build_array(jsonb_build_object(
        'ticket_id', issued_ticket.id,
        'order_seat_number', issued_ticket.order_seat_number,
        'qr_token', qr_token
      ));
    else
      insert into public.annual_conference_tickets(edition_id, order_id, status, is_bearer_ticket, order_seat_number)
      values (ticket_order.edition_id, ticket_order.id, 'pending', false, allocation.seat_index) returning * into issued_ticket;
      if allocation.allocation_kind = 'gift' then
        perform public.queue_annual_conference_flexible_gift_claim(allocation.id, ticket_order.edition_id, ticket_order.id, allocation.recipient_email);
      end if;
    end if;
  end loop;

  buyer_ticket_count := jsonb_array_length(buyer_bundle);
  if buyer_ticket_count > 0 then
    buyer_chunk_count := ceil(buyer_ticket_count::numeric / 20)::integer;

    for buyer_chunk_index in 0..buyer_chunk_count - 1 loop
      select jsonb_agg(value order by ordinality)
      into buyer_chunk
      from jsonb_array_elements(buyer_bundle) with ordinality
      where ordinality between buyer_chunk_index * 20 + 1 and least((buyer_chunk_index + 1) * 20, buyer_ticket_count);

      insert into public.annual_conference_ticket_email_outbox(
        edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
      ) values (
        ticket_order.edition_id,
        ticket_order.id,
        'flexible_buyer_bundle_delivery',
        ticket_order.purchaser_name,
        ticket_order.purchaser_email,
        jsonb_build_object(
          'chunk_index', buyer_chunk_index + 1,
          'chunk_count', buyer_chunk_count,
          'tickets', buyer_chunk
        ),
        concat('flexible-buyer-bundle:', ticket_order.id, ':', buyer_chunk_index + 1)
      );
    end loop;
  end if;
  insert into public.annual_conference_ticket_email_outbox(edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key)
  values (ticket_order.edition_id, ticket_order.id, 'flexible_order_management', ticket_order.purchaser_name, ticket_order.purchaser_email, jsonb_build_object('capability', management_capability), 'flexible-management:' || ticket_order.id);
  insert into public.annual_conference_ticket_email_outbox(
    edition_id, order_id, kind, recipient_name, recipient_email, payload, idempotency_key
  ) values (
    ticket_order.edition_id,
    ticket_order.id,
    'payment_receipt',
    ticket_order.purchaser_name,
    ticket_order.purchaser_email,
    jsonb_build_object(
      'order_id', ticket_order.id,
      'quantity', ticket_order.quantity,
      'ticket_amount_minor', ticket_order.ticket_amount_minor,
      'processing_fee_minor', ticket_order.processing_fee_minor,
      'amount_paid_minor', ticket_order.amount_paid_minor,
      'provider_fee_minor', ticket_order.provider_fee_minor,
      'currency', ticket_order.currency
    ),
    'annual-conference-ticket-receipt:' || ticket_order.id
  ) on conflict (idempotency_key) do nothing;
  update public.annual_conference_ticket_payment_events set status = 'processed', processed_at = now() where id = event_row.id;
  update public.annual_conference_ticket_payment_attempts set status = 'confirmed' where id = attempt.id;
  return ticket_order;
end;
$$;

revoke all on function public.version_managed_conference_checkout_settings(),
  public.version_managed_conference_testing_settings(),
  public.managed_conference_checkout_origin_valid(text),
  public.snapshot_managed_conference_checkout_settings(),
  public.get_managed_conference_checkout_settings(integer),
  public.configure_managed_conference_payment_mode(uuid, text, bigint, text, text[]),
  public.create_managed_conference_checkout_hold(uuid, text, text, integer, jsonb, uuid, text, bigint, text),
  public.guard_managed_conference_checkout_initialization(),
  public.claim_managed_conference_checkout_initialization(uuid, text, uuid),
  public.finalize_managed_conference_checkout_initialization(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.managed_conference_checkout_origin_valid(text),
  public.get_managed_conference_checkout_settings(integer),
  public.configure_managed_conference_payment_mode(uuid, text, bigint, text, text[]),
  public.create_managed_conference_checkout_hold(uuid, text, text, integer, jsonb, uuid, text, bigint, text),
  public.claim_managed_conference_checkout_initialization(uuid, text, uuid),
  public.finalize_managed_conference_checkout_initialization(uuid, uuid, text)
to service_role;

commit;
