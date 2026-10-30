-- New EMS managed orders quote the buyer-paid processing charge once. Historic
-- orders keep their merchant-absorbed snapshots and their base `amount_minor`.
begin;

alter table public.annual_conference_ticketing_settings
  add column processing_fee_rate_basis_points integer not null default 195
    check (processing_fee_rate_basis_points > 0 and processing_fee_rate_basis_points < 10000);

-- A default does not pass through the versioning trigger, so explicitly force
-- existing browser catalogs to refresh before they can create a new quote.
update public.annual_conference_ticketing_settings
  set checkout_settings_version = checkout_settings_version + 1;

alter table public.annual_conference_ticket_orders
  add column quoted_processing_fee_rate_basis_points integer,
  add column quoted_processing_fee_policy text,
  add column quoted_processing_fee_minor integer,
  add column quoted_gross_amount_minor integer,
  add constraint annual_conference_ticket_orders_processing_fee_quote check (
    (quoted_processing_fee_rate_basis_points is null and quoted_processing_fee_policy is null
      and quoted_processing_fee_minor is null and quoted_gross_amount_minor is null)
    or (quoted_processing_fee_rate_basis_points > 0 and quoted_processing_fee_rate_basis_points < 10000
      and quoted_processing_fee_policy = 'buyer_pays_processing'
      and quoted_processing_fee_minor >= 0 and quoted_gross_amount_minor = amount_minor + quoted_processing_fee_minor)
  );

alter table public.annual_conference_ticket_orders
  drop constraint annual_conference_ticket_orders_flexible_cart_snapshot,
  add constraint annual_conference_ticket_orders_flexible_cart_snapshot check (
    (checkout_flow = 'standard' and flexible_cart_request_key is null and flexible_cart_snapshot is null
      and flexible_payment_fee_mode is null)
    or (checkout_flow = 'flexible' and flexible_cart_request_key is not null and flexible_cart_snapshot is not null
      and jsonb_typeof(flexible_cart_snapshot) = 'array'
      and flexible_payment_fee_mode in ('merchant_absorbs', 'buyer_pays_processing') and provider = 'paystack')
  ),
  drop constraint annual_conference_ticket_orders_payment_fee_mode,
  add constraint annual_conference_ticket_orders_payment_fee_mode check (
    payment_fee_mode is null or payment_fee_mode in ('merchant_absorbs', 'paystack_pass_fees', 'buyer_pays_processing')
  );

create or replace function public.snapshot_managed_conference_checkout_settings()
returns trigger language plpgsql security definer set search_path = public as $$
declare version_snapshot text := nullif(current_setting('app.managed_checkout_settings_version', true), '');
  rate_snapshot text := nullif(current_setting('app.managed_processing_fee_rate_basis_points', true), '');
  quoted_gross bigint;
begin
  if version_snapshot is not null then new.checkout_settings_version := version_snapshot::bigint; end if;
  if rate_snapshot is not null then
    if new.checkout_flow <> 'flexible' or new.amount_minor < 1 or rate_snapshot !~ '^[1-9][0-9]{0,3}$'
      or rate_snapshot::integer >= 10000 then raise exception 'managed_processing_fee_quote_invalid'; end if;
    quoted_gross := ceil(new.amount_minor::numeric * 10000 / (10000 - rate_snapshot::integer))::bigint;
    if quoted_gross > 2147483647 then raise exception 'managed_processing_fee_quote_overflow'; end if;
    new.flexible_payment_fee_mode := 'buyer_pays_processing';
    new.quoted_processing_fee_rate_basis_points := rate_snapshot::integer;
    new.quoted_processing_fee_policy := 'buyer_pays_processing';
    new.quoted_processing_fee_minor := quoted_gross::integer - new.amount_minor;
    new.quoted_gross_amount_minor := quoted_gross::integer;
  end if;
  return new;
end;
$$;

create or replace function public.get_managed_conference_checkout_settings(p_year integer)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'edition_id', settings.edition_id,
    'payment_mode', case when coalesce(testing.enabled, false) then 'test' else 'live' end,
    'settings_version', settings.checkout_settings_version,
    'public_mode', settings.public_mode,
    'sales_status', settings.sales_status,
    'flexible_checkout_state', settings.flexible_checkout_state,
    'regular_price_minor', settings.regular_price_minor,
    'flexible_checkout_max_amount_minor', settings.flexible_checkout_max_amount_minor,
    'processing_fee_rate_basis_points', settings.processing_fee_rate_basis_points
  )
  from public.annual_conference_editions edition
  join public.annual_conference_ticketing_settings settings on settings.edition_id = edition.id
  left join public.annual_conference_registration_test_settings testing on testing.edition_id = edition.id
  where edition.year = p_year;
$$;

create or replace function public.prevent_annual_conference_flexible_ticket_order_snapshot_mutation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.checkout_flow = 'flexible' and (
    new.checkout_flow is distinct from old.checkout_flow or new.flexible_cart_request_key is distinct from old.flexible_cart_request_key
      or new.flexible_cart_snapshot is distinct from old.flexible_cart_snapshot
      or (new.flexible_payment_fee_mode is distinct from old.flexible_payment_fee_mode
        and current_setting('app.buyer_paid_confirmation', true) is distinct from 'enabled')
      or new.provider is distinct from old.provider or new.quantity is distinct from old.quantity or new.amount_minor is distinct from old.amount_minor
      or new.purchaser_name is distinct from old.purchaser_name or new.purchaser_email is distinct from old.purchaser_email
      or new.tier_key is distinct from old.tier_key or new.quoted_processing_fee_rate_basis_points is distinct from old.quoted_processing_fee_rate_basis_points
      or new.quoted_processing_fee_policy is distinct from old.quoted_processing_fee_policy or new.quoted_processing_fee_minor is distinct from old.quoted_processing_fee_minor
      or new.quoted_gross_amount_minor is distinct from old.quoted_gross_amount_minor) then
    raise exception 'flexible_ticket_order_snapshot_immutable';
  end if;
  return new;
end;
$$;

create or replace function public.create_managed_conference_checkout_hold(
  p_edition_id uuid, p_purchaser_name text, p_purchaser_email text, p_quantity integer, p_allocations jsonb,
  p_checkout_request_key uuid, p_expected_mode text, p_settings_version bigint, p_origin text
)
returns public.annual_conference_ticket_orders
language plpgsql security definer set search_path = public as $$
declare settings public.annual_conference_ticketing_settings; testing jsonb; selected_mode text;
  result public.annual_conference_ticket_orders; previous_version text := coalesce(current_setting('app.managed_checkout_settings_version', true), '');
  previous_rate text := coalesce(current_setting('app.managed_processing_fee_rate_basis_points', true), '');
begin
  select * into settings from public.annual_conference_ticketing_settings where edition_id = p_edition_id for update;
  if settings.edition_id is null then raise exception 'conference_settings_not_found'; end if;
  testing := public.get_annual_conference_registration_testing(p_edition_id);
  selected_mode := case when coalesce((testing->>'enabled')::boolean, false) then 'test' else 'live' end;
  if p_expected_mode is distinct from selected_mode or p_settings_version is distinct from settings.checkout_settings_version then raise exception 'checkout_settings_changed'; end if;
  if settings.public_mode <> 'paid' or settings.sales_status <> 'open' or settings.flexible_checkout_state not in ('internal', 'public') then raise exception 'managed_checkout_not_available'; end if;
  if not public.managed_conference_checkout_origin_valid(p_origin) then raise exception 'managed_checkout_origin_invalid'; end if;
  if selected_mode = 'test' and (not (testing->'tester_emails' ? lower(btrim(p_purchaser_email))) or exists (
    select 1 from jsonb_array_elements(p_allocations) allocation where allocation->>'recipient_email' is not null
      and not (testing->'tester_emails' ? lower(btrim(allocation->>'recipient_email'))))) then raise exception 'complete_test_recipient_not_allowed'; end if;
  if ceil((settings.regular_price_minor::numeric * p_quantity::numeric) * 10000 / (10000 - settings.processing_fee_rate_basis_points))
    > settings.flexible_checkout_max_amount_minor then raise exception 'flexible_ticket_provider_ceiling_exceeded'; end if;
  perform set_config('app.managed_checkout_settings_version', settings.checkout_settings_version::text, true);
  perform set_config('app.managed_processing_fee_rate_basis_points', settings.processing_fee_rate_basis_points::text, true);
  select * into result from public.create_conference_checkout_hold_for_mode(p_edition_id, p_purchaser_name, p_purchaser_email,
    p_quantity, p_allocations, p_checkout_request_key, selected_mode, case when selected_mode = 'test' then p_origin else null end);
  perform set_config('app.managed_checkout_settings_version', previous_version, true);
  perform set_config('app.managed_processing_fee_rate_basis_points', previous_rate, true);
  if result.checkout_settings_version is distinct from settings.checkout_settings_version then raise exception 'flexible_ticket_checkout_request_conflict'; end if;
  return result;
end;
$$;

-- The established function owns allocation, ticket issuance, idempotency, and
-- capacity logic. This narrow wrapper preserves it while reconciling a stored
-- buyer quote; the temporary legacy shape is transaction-local and never
-- committed.
alter function public.confirm_annual_conference_flexible_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb)
  rename to confirm_annual_conference_flexible_ticket_payment_merchant_absorbed;

create function public.confirm_annual_conference_flexible_ticket_payment(
  p_order_id uuid, p_provider text, p_provider_event_id text, p_event_type text, p_payment_reference text,
  p_amount_minor integer, p_currency text, p_payload_sha256 text, p_payment_facts jsonb
)
returns public.annual_conference_ticket_orders
language plpgsql security definer set search_path = public as $$
declare ticket_order public.annual_conference_ticket_orders; result public.annual_conference_ticket_orders;
  attempt public.annual_conference_ticket_payment_attempts; provider_requested integer; provider_fee integer; legacy_facts jsonb;
  event_processed boolean; previous_confirmation text := coalesce(current_setting('app.buyer_paid_confirmation', true), '');
begin
  select * into ticket_order from public.annual_conference_ticket_orders where id = p_order_id for update;
  if ticket_order.quoted_processing_fee_policy is null then
    return public.confirm_annual_conference_flexible_ticket_payment_merchant_absorbed(
      p_order_id, p_provider, p_provider_event_id, p_event_type, p_payment_reference, p_amount_minor, p_currency, p_payload_sha256, p_payment_facts);
  end if;
  if ticket_order.quoted_processing_fee_policy <> 'buyer_pays_processing' or ticket_order.flexible_payment_fee_mode <> 'buyer_pays_processing'
    or ticket_order.quoted_gross_amount_minor <> ticket_order.amount_minor + ticket_order.quoted_processing_fee_minor
    or ticket_order.quoted_gross_amount_minor <> ceil(ticket_order.amount_minor::numeric * 10000 / (10000 - ticket_order.quoted_processing_fee_rate_basis_points))::integer
    or p_amount_minor <> ticket_order.quoted_gross_amount_minor or upper(btrim(p_currency)) <> 'GHS'
    or coalesce(p_payment_facts->>'fee_mode', '') <> 'buyer_pays_processing' then raise exception 'ticket_payment_amount_mismatch'; end if;
  if p_payment_facts ? 'requested_amount' then
    if (p_payment_facts->>'requested_amount') !~ '^[0-9]+$' or (p_payment_facts->>'requested_amount')::numeric > 2147483647
      or (p_payment_facts->>'requested_amount')::integer <> ticket_order.quoted_gross_amount_minor then raise exception 'ticket_payment_amount_mismatch'; end if;
    provider_requested := (p_payment_facts->>'requested_amount')::integer;
  end if;
  if p_payment_facts ? 'fees' then
    if (p_payment_facts->>'fees') !~ '^[0-9]+$' or (p_payment_facts->>'fees')::numeric > 2147483647 then raise exception 'ticket_payment_facts_invalid'; end if;
    provider_fee := (p_payment_facts->>'fees')::integer;
  end if;
  select * into attempt from public.annual_conference_ticket_payment_attempts where order_id = ticket_order.id;
  if coalesce(btrim(p_provider), '') <> 'paystack' or coalesce(btrim(p_event_type), '') <> 'charge.success'
    or attempt.id is null or attempt.provider <> 'paystack' or attempt.payment_reference <> btrim(p_payment_reference) then
    raise exception 'ticket_payment_reference_mismatch';
  end if;
  if ticket_order.status = 'paid' then
    if ticket_order.provider <> 'paystack' or ticket_order.payment_reference <> btrim(p_payment_reference)
      or ticket_order.amount_paid_minor <> p_amount_minor or ticket_order.processing_fee_minor <> ticket_order.quoted_processing_fee_minor
      or ticket_order.payment_fee_mode <> 'buyer_pays_processing' or ticket_order.provider_requested_amount_minor is distinct from provider_requested
      or ticket_order.provider_fee_minor is distinct from provider_fee then raise exception 'ticket_payment_replay_mismatch'; end if;
    return ticket_order;
  end if;
  perform set_config('app.buyer_paid_confirmation', 'enabled', true);
  update public.annual_conference_ticket_orders set flexible_payment_fee_mode = 'merchant_absorbs' where id = ticket_order.id;
  legacy_facts := (coalesce(p_payment_facts, '{}'::jsonb) - 'requested_amount' - 'fees') || jsonb_build_object('fee_mode', 'merchant_absorbs');
  select * into result from public.confirm_annual_conference_flexible_ticket_payment_merchant_absorbed(
    p_order_id, p_provider, p_provider_event_id, p_event_type, p_payment_reference, ticket_order.amount_minor, p_currency, p_payload_sha256, legacy_facts);
  update public.annual_conference_ticket_orders set flexible_payment_fee_mode = 'buyer_pays_processing' where id = ticket_order.id;
  perform set_config('app.buyer_paid_confirmation', previous_confirmation, true);
  select exists(select 1 from public.annual_conference_ticket_payment_events
    where provider = 'paystack' and provider_event_id = btrim(p_provider_event_id) and order_id = ticket_order.id
      and payment_reference = btrim(p_payment_reference) and status = 'processed' and payload_sha256 = p_payload_sha256)
    into event_processed;
  if result.status in ('paid', 'expired') and event_processed then
    update public.annual_conference_ticket_orders set processing_fee_minor = quoted_processing_fee_minor,
      amount_paid_minor = p_amount_minor, payment_fee_mode = 'buyer_pays_processing', provider_requested_amount_minor = provider_requested,
      provider_fee_minor = provider_fee where id = ticket_order.id;
    if result.status = 'expired' and result.payment_mode = 'live' then
      update public.annual_conference_ticket_refunds set amount_minor = p_amount_minor
        where order_id = ticket_order.id and status = 'required';
      if not found then raise exception 'ticket_refund_quote_reconciliation_failed'; end if;
    end if;
  end if;
  update public.annual_conference_ticket_payment_events set payload_sha256 = p_payload_sha256, payload_facts = coalesce(p_payment_facts, '{}'::jsonb)
    where provider = 'paystack' and provider_event_id = btrim(p_provider_event_id) and order_id = ticket_order.id;
  select * into result from public.annual_conference_ticket_orders where id = ticket_order.id;
  return result;
end;
$$;

revoke all on function public.confirm_annual_conference_flexible_ticket_payment_merchant_absorbed(uuid, text, text, text, text, integer, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.confirm_annual_conference_flexible_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_managed_conference_checkout_hold(uuid, text, text, integer, jsonb, uuid, text, bigint, text),
  public.confirm_annual_conference_flexible_ticket_payment(uuid, text, text, text, text, integer, text, text, jsonb) to service_role;

commit;
