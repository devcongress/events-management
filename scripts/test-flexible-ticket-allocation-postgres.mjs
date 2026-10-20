// Disposable local PostgreSQL only; never connect this fixture to Supabase or a shared database.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

assert.equal(process.env.PGDATABASE, 'flexible_ticket_allocation_test');
assert.match(process.env.PGHOST ?? '', /^\/private\/tmp\/(?:devcon26|flexible-ticket)-postgres\./);

const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'];
const runConcurrent = promisify(execFile);
const sql = (query) => execFileSync('psql', args, { input: query, encoding: 'utf8' }).trim();
const fails = (query, expected) => {
  assert.throws(() => sql(query), expected);
};
const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const allocations = (quantity, kind = 'buyer_managed') => `(
  select jsonb_agg(jsonb_build_object('seat_index', seat_index, 'kind', '${kind}') order by seat_index)
  from generate_series(1, ${quantity}) as seat_index
)`;

sql(`drop schema if exists public cascade;
create schema public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create table public.annual_conference_editions (
  id uuid primary key default gen_random_uuid(),
  year integer unique not null
);`);

for (const name of [
  '20261006110000_annual_conference_ticketing_foundation',
  '20261006120000_atomic_sponsor_ticket_allocations',
  '20261006130000_annual_conference_checkout_holds',
  '20261006140000_annual_conference_ticket_payment_processing',
  '20261006150000_annual_conference_ticket_assignment_delivery',
  '20261006160000_annual_conference_ticket_prices',
  '20261011130000_annual_conference_bearer_ticket_issuance',
  '20261011140000_annual_conference_ticket_payment_fee_breakdown',
  '20261016100000_annual_conference_free_registration',
  '20261016130000_annual_conference_registration_payment_capacity',
  '20261020100000_annual_conference_flexible_ticket_allocation_foundation',
]) sql(migration(name));

// The fixture intentionally omits the wider social-card feature migrations.
// These minimal private dependencies let the lifecycle payment branch execute
// its real isolation hooks without importing unrelated speaker tables.
sql(`create type public.annual_conference_social_card_subject as enum ('attendee', 'speaker');
create table public.annual_conference_social_cards (
  id uuid primary key default gen_random_uuid(), edition_id uuid not null,
  subject_type public.annual_conference_social_card_subject not null, ticket_id uuid unique,
  session_id uuid, display_name text not null, management_token_hash text not null unique,
  public_slug text not null unique, public_enabled boolean not null default false, revoked_at timestamptz
);
create table public.annual_conference_social_card_collections (order_id uuid primary key, edition_id uuid not null, capability_hash text not null unique);
create type public.annual_conference_social_card_email_status as enum ('queued', 'sending', 'accepted', 'delivered', 'failed');
create table public.annual_conference_social_card_email_outbox (
  id uuid primary key default gen_random_uuid(), edition_id uuid not null, social_card_id uuid,
  collection_order_id uuid, recipient_name text not null, recipient_email text not null,
  capability text not null, idempotency_key text not null unique,
  status public.annual_conference_social_card_email_status not null default 'queued'
);
create function public.issue_annual_conference_social_card_delivery(uuid, public.annual_conference_social_card_subject, uuid)
returns table(social_card_id uuid, management_capability text)
language plpgsql as $$
declare ticket public.annual_conference_tickets; card public.annual_conference_social_cards; capability text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into ticket from public.annual_conference_tickets where id = $3;
  insert into public.annual_conference_social_cards(edition_id, subject_type, ticket_id, display_name, management_token_hash, public_slug)
  values ($1, 'attendee', ticket.id, ticket.attendee_name, encode(extensions.digest(capability, 'sha256'), 'hex'), encode(extensions.gen_random_bytes(16), 'hex'))
  on conflict(ticket_id) do update set display_name = excluded.display_name returning * into card;
  return query select card.id, capability;
end;
$$;`);
sql(migration('20261020110000_annual_conference_flexible_ticket_lifecycle'));

const edition = sql("insert into public.annual_conference_editions(year) values (2026) returning id;");
const otherEdition = sql("insert into public.annual_conference_editions(year) values (2030) returning id;");

sql(`insert into public.annual_conference_ticketing_settings (
  edition_id, public_capacity, sales_status, public_mode, regular_price_minor, team_3_price_minor, team_5_price_minor, flexible_checkout_max_amount_minor
) values ('${edition}', 1000, 'open', 'paid', 15000, 45000, 75000, 10000000);`);

const cart = `'[
  {"seat_index":2,"kind":"gift","recipient_email":"GIFT@EXAMPLE.TEST"},
  {"seat_index":1,"kind":"self","recipient_name":" Buyer ","recipient_email":"BUYER@example.test"},
  {"seat_index":3,"kind":"buyer_managed"},
  {"seat_index":4,"kind":"community_managed"},
  {"seat_index":5,"kind":"community_shareable"}
]'::jsonb`;
const firstKey = '00000000-0000-4000-8000-000000000001';
const firstOrder = sql(`select id from public.create_annual_conference_flexible_checkout_hold(
  '${edition}', ' Buyer ', 'BUYER@example.test', 5, ${cart}, '${firstKey}'
);`);

assert.equal(sql(`select quantity || ':' || amount_minor || ':' || checkout_flow || ':' || flexible_payment_fee_mode || ':' || provider
  from public.annual_conference_ticket_orders where id = '${firstOrder}';`), '5:75000:flexible:merchant_absorbs:paystack');
assert.equal(sql(`select count(*) from public.annual_conference_flexible_ticket_allocations where order_id = '${firstOrder}';`), '5');
assert.equal(sql(`select recipient_email from public.annual_conference_flexible_ticket_allocations
  where order_id = '${firstOrder}' and allocation_kind = 'gift';`), 'gift@example.test');
assert.equal(sql(`select count(*) from public.annual_conference_flexible_ticket_allocations
  where order_id = '${firstOrder}' and allocation_kind in ('buyer_managed', 'community_managed', 'community_shareable')
    and recipient_name is null and recipient_email is null;`), '3');

const replay = sql(`select id from public.create_annual_conference_flexible_checkout_hold(
  '${edition}', 'Buyer', 'buyer@example.test', 5, ${cart}, '${firstKey}'
);`);

assert.equal(replay, firstOrder, 'Canonical retry must not reserve capacity twice.');
fails(`select public.create_annual_conference_flexible_checkout_hold(
  '${edition}', 'Buyer', 'buyer@example.test', 4, ${allocations(4)}, '${firstKey}'
);`, /conflict/);
fails(`update public.annual_conference_flexible_ticket_allocations
  set seat_index = 9
  where id = (
    select id from public.annual_conference_flexible_ticket_allocations
    where order_id = '${firstOrder}'
    limit 1
  );`, /immutable/);
fails(`update public.annual_conference_ticket_orders
  set amount_minor = 1
  where id = '${firstOrder}';`, /snapshot_immutable/);
fails(`select public.create_annual_conference_flexible_checkout_hold(
  '${edition}', 'Buyer', 'buyer@example.test', 1,
  '[{"seat_index":1,"kind":"gift","recipient_name":"Surprise","recipient_email":"gift@example.test"}]',
  '00000000-0000-4000-8000-000000000002'
);`, /gift_recipient_invalid/);
fails(`select public.create_annual_conference_flexible_checkout_hold(
  '${edition}', 'Buyer', 'buyer@example.test', 1,
  '[{"seat_index":1,"kind":"self","recipient_name":"Other","recipient_email":"buyer@example.test"}]',
  '00000000-0000-4000-8000-000000000003'
);`, /self_identity_invalid/);
fails(`select public.prepare_annual_conference_ticket_payment_attempt('${firstOrder}', 'paystack', 'flexible-blocked');`, /not_activated/);
sql(`update public.annual_conference_ticketing_settings set flexible_checkout_state = 'internal' where edition_id = '${edition}';`);
assert.ok(sql(`select id from public.prepare_annual_conference_ticket_payment_attempt('${firstOrder}', 'paystack', 'flexible-payment');`));
sql(`update public.annual_conference_ticketing_settings set flexible_checkout_state = 'foundation' where edition_id = '${edition}';`);
assert.equal(sql(`select status from public.confirm_annual_conference_ticket_payment(
  '${firstOrder}', 'paystack', 'flexible-event-failed', 'charge.failed', 'flexible-payment', 75000, 'GHS', 'flexible-payload-failed',
  '{"fee_mode":"merchant_absorbs"}'::jsonb
);`), 'pending_payment');
assert.equal(sql(`select status from public.confirm_annual_conference_ticket_payment(
  '${firstOrder}', 'paystack', 'flexible-event-1', 'charge.success', 'flexible-payment', 75000, 'GHS', 'flexible-payload-1',
  '{"fee_mode":"merchant_absorbs","id":123456}'::jsonb
);`), 'paid');
sql(`update public.annual_conference_ticketing_settings set flexible_checkout_state = 'internal' where edition_id = '${edition}';`);
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id = '${firstOrder}';`), '5');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id = '${firstOrder}' and status = 'pending';`), '3');
assert.equal(sql(`select count(*) from public.annual_conference_ticket_email_outbox where order_id = '${firstOrder}' and kind = 'flexible_gift_claim';`), '1');
assert.equal(sql(`select count(*) from public.annual_conference_ticket_email_outbox
  where order_id = '${firstOrder}' and kind = 'flexible_buyer_bundle_delivery';`), '1');
assert.equal(sql(`select (payload ->> 'chunk_index') || ':' || (payload ->> 'chunk_count') || ':' || jsonb_array_length(payload -> 'tickets')
  from public.annual_conference_ticket_email_outbox
  where order_id = '${firstOrder}' and kind = 'flexible_buyer_bundle_delivery';`), '1:1:1');
assert.equal(sql(`select count(*) from public.annual_conference_social_card_collections where order_id = '${firstOrder}';`), '0');
const managementCapability = sql(`select payload ->> 'capability' from public.annual_conference_ticket_email_outbox
  where order_id = '${firstOrder}' and kind = 'flexible_order_management';`);

assert.equal(sql(`select bool_or(can_request_refund)
  from public.get_annual_conference_flexible_order_management('${managementCapability}');`), 'f');

const giftCapability = sql(`select payload ->> 'capability' from public.annual_conference_ticket_email_outbox
  where order_id = '${firstOrder}' and kind = 'flexible_gift_claim';`);
const shareAllocation = sql(`select id from public.annual_conference_flexible_ticket_allocations
  where order_id = '${firstOrder}' and allocation_kind = 'community_shareable';`);
const buyerAllocation = sql(`select id from public.annual_conference_flexible_ticket_allocations
  where order_id = '${firstOrder}' and allocation_kind = 'buyer_managed';`);
const managedAllocation = sql(`select id from public.annual_conference_flexible_ticket_allocations
  where order_id = '${firstOrder}' and allocation_kind = 'community_managed';`);

assert.match(sql(`select outcome from public.claim_annual_conference_flexible_ticket('${giftCapability}', 'Gift Recipient', null);`), /^claimed$/);
assert.equal(sql(`select outcome from public.claim_annual_conference_flexible_ticket('${giftCapability}', 'Gift Recipient', null);`), 'invalid');
const shareCapability = sql(`select claim_capability from public.rotate_annual_conference_flexible_ticket_claim(
  '${managementCapability}', '${shareAllocation}', 'admission'
);`);

assert.match(sql(`select outcome from public.claim_annual_conference_flexible_ticket('${shareCapability}', 'Community Recipient', 'community@example.test');`), /^claimed$/);
assert.equal(sql(`select outcome from public.rotate_annual_conference_flexible_ticket_claim(
  '${managementCapability}', '${shareAllocation}', 'admission'
);`), 'invalid');
const badgeCapability = sql(`select claim_capability from public.rotate_annual_conference_flexible_ticket_claim(
  '${managementCapability}', '${buyerAllocation}', 'badge'
);`);

assert.match(sql(`select outcome from public.claim_annual_conference_flexible_badge('${badgeCapability}', 'Badge Recipient', 'badge@example.test');`), /^claimed$/);
assert.equal(sql(`select outcome from public.rotate_annual_conference_flexible_ticket_claim(
  '${managementCapability}', '${buyerAllocation}', 'badge'
);`), 'invalid');
assert.equal(sql(`select outcome from public.assign_annual_conference_community_managed_ticket(
  '${otherEdition}', '${managedAllocation}', 'Managed Recipient', 'managed@example.test', 'owner@example.test', '00000000-0000-4000-8000-000000000098'
);`), 'invalid');
assert.match(sql(`select outcome from public.assign_annual_conference_community_managed_ticket(
  '${edition}', '${managedAllocation}', 'Managed Recipient', 'managed@example.test', 'owner@example.test', '00000000-0000-4000-8000-000000000099'
);`), /^assigned$/);
const selfAllocation = sql(`select id from public.annual_conference_flexible_ticket_allocations
  where order_id = '${firstOrder}' and allocation_kind = 'self';`);

sql(`update public.annual_conference_tickets set status = 'checked_in', checked_in_at = now(), checked_in_by_email = 'scanner@example.test'
  where order_id = '${firstOrder}' and order_seat_number = 1;`);
assert.equal(sql(`select outcome from public.request_annual_conference_flexible_ticket_refund('${edition}', '${selfAllocation}');`), 'invalid');
assert.equal(sql(`select outcome from public.request_annual_conference_flexible_ticket_refund('${otherEdition}', '${buyerAllocation}');`), 'invalid');
const refundId = sql(`select refund_id from public.request_annual_conference_flexible_ticket_refund('${edition}', '${buyerAllocation}');`);

assert.equal(sql(`select status || ':' || coalesce(qr_token_hash, '') from public.annual_conference_tickets
  where order_id = '${firstOrder}' and order_seat_number = 3;`), 'cancelled:');
assert.equal(sql(`select refund_status || ':' || provider || ':' || currency || ':' || amount_minor || ':' || payment_reference || ':' || provider_transaction_id
  from public.get_annual_conference_flexible_ticket_refund_payment('${edition}', '${refundId}');`),
  'requested:paystack:GHS:15000:flexible-payment:123456');
assert.equal(sql(`select count(*) from public.get_annual_conference_flexible_ticket_refund_payment('${otherEdition}', '${refundId}');`), '0');
assert.equal(sql(`select outcome from public.bind_annual_conference_flexible_ticket_refund_provider_id(
  '${otherEdition}', '${refundId}', '1001'
);`), 'invalid');
assert.equal(sql(`select outcome from public.bind_annual_conference_flexible_ticket_refund_provider_id(
  '${edition}', '${refundId}', '1001'
);`), 'bound');
fails(`update public.annual_conference_flexible_ticket_refund_provider_ids
  set provider_refund_id = 'mutated'
  where refund_id = '${refundId}';`, /annual_conference_refund_provider_id_immutable/);
fails(`update public.annual_conference_flexible_ticket_refund_provider_ids
  set id = '00000000-0000-4000-8000-000000000777'
  where refund_id = '${refundId}';`, /annual_conference_refund_provider_id_immutable/);
assert.equal(sql(`select outcome from public.bind_annual_conference_flexible_ticket_refund_provider_id(
  '${edition}', '${refundId}', '1001'
);`), 'bound');
assert.equal(sql(`select outcome from public.bind_annual_conference_flexible_ticket_refund_provider_id(
  '${edition}', '${refundId}', '1002'
);`), 'invalid');
assert.equal(sql(`select outcome from public.finalize_annual_conference_flexible_ticket_refund(
  '${edition}', '${refundId}', 'paystack', '1001', 'partial-refund-1', 14999, '${'a'.repeat(64)}', 'owner@example.test'
);`), 'invalid');
assert.equal(sql(`select outcome from public.finalize_annual_conference_flexible_ticket_refund(
  '${otherEdition}', '${refundId}', 'paystack', '1001', 'partial-refund-1', 15000, '${'a'.repeat(64)}', 'owner@example.test'
);`), 'invalid');
assert.equal(sql(`select outcome from public.finalize_annual_conference_flexible_ticket_refund(
  '${edition}', '${refundId}', 'paystack', '1002', 'partial-refund-1', 15000, '${'a'.repeat(64)}', 'owner@example.test'
);`), 'invalid');
assert.equal(sql(`select status from public.annual_conference_tickets
  where order_id = '${firstOrder}' and order_seat_number = 3;`), 'cancelled');
assert.equal(sql(`select outcome from public.reject_annual_conference_flexible_ticket_refund(
  '${otherEdition}', '${refundId}', '1001', '${'b'.repeat(64)}', 'wrong edition', 'owner@example.test'
);`), 'invalid');
assert.equal(sql(`select outcome from public.reject_annual_conference_flexible_ticket_refund(
  '${edition}', '${refundId}', '1002', '${'b'.repeat(64)}', 'wrong provider refund', 'owner@example.test'
);`), 'invalid');
assert.equal(sql(`select status from public.annual_conference_tickets
  where order_id = '${firstOrder}' and order_seat_number = 3;`), 'cancelled');
assert.equal(sql(`select outcome from public.reject_annual_conference_flexible_ticket_refund(
  '${edition}', '${refundId}', '1001', '${'b'.repeat(64)}', 'provider refund failed', 'owner@example.test'
);`), 'rejected');
assert.equal(sql(`select outcome from public.reject_annual_conference_flexible_ticket_refund(
  '${edition}', '${refundId}', '1001', '${'b'.repeat(64)}', 'provider refund failed', 'owner@example.test'
);`), 'rejected');
assert.equal(sql(`select status || ':' || (qr_token_hash is not null)::text from public.annual_conference_tickets
  where order_id = '${firstOrder}' and order_seat_number = 3;`), 'issued:true');
assert.equal(sql(`select refund_id from public.request_annual_conference_flexible_ticket_refund(
  '${edition}', '${buyerAllocation}'
);`), refundId);
assert.equal(sql(`select status || ':' || coalesce(qr_token_hash, '') from public.annual_conference_tickets
  where order_id = '${firstOrder}' and order_seat_number = 3;`), 'cancelled:');
assert.equal(sql(`select outcome from public.bind_annual_conference_flexible_ticket_refund_provider_id(
  '${edition}', '${refundId}', '1001'
);`), 'invalid');
assert.equal(sql(`select outcome from public.bind_annual_conference_flexible_ticket_refund_provider_id(
  '${edition}', '${refundId}', '1002'
);`), 'bound');
assert.equal(sql(`select outcome from public.reject_annual_conference_flexible_ticket_refund(
  '${edition}', '${refundId}', '1002', '${'c'.repeat(64)}', 'provider refund failed again', 'owner@example.test'
);`), 'rejected');
assert.equal(sql(`select count(*) from public.annual_conference_ticket_email_outbox
  where idempotency_key like 'flexible-refund-rejected-buyer-ticket:${refundId}:%';`), '2');
assert.equal(sql(`select refund_id from public.request_annual_conference_flexible_ticket_refund(
  '${edition}', '${buyerAllocation}'
);`), refundId);
assert.equal(sql(`select outcome from public.bind_annual_conference_flexible_ticket_refund_provider_id(
  '${edition}', '${refundId}', '1003'
);`), 'bound');
assert.match(sql(`select outcome from public.finalize_annual_conference_flexible_ticket_refund(
  '${edition}', '${refundId}', 'paystack', '1003', 'partial-refund-1', 15000, '${'a'.repeat(64)}', 'owner@example.test'
);`), /^refunded$/);
assert.equal(sql(`select outcome from public.finalize_annual_conference_flexible_ticket_refund(
  '${edition}', '${refundId}', 'paystack', '1003', 'partial-refund-replay-mismatch', 15000, '${'a'.repeat(64)}', 'owner@example.test'
);`), 'invalid');
assert.equal(sql(`select string_agg(provider_refund_id || ':' || resolution_status || ':' || provider_payload_sha256, ',' order by attempt_number)
  from public.annual_conference_flexible_ticket_refund_provider_ids
  where refund_id = '${refundId}';`),
  `1001:failed:${'b'.repeat(64)},1002:failed:${'c'.repeat(64)},1003:refunded:${'a'.repeat(64)}`);
assert.equal(sql(`select status || ':' || coalesce(qr_token_hash, '') from public.annual_conference_tickets
  where order_id = '${firstOrder}' and order_seat_number = 3;`), 'cancelled:');
assert.match(sql(`select outcome from public.assign_annual_conference_community_managed_ticket(
  '${edition}', '${managedAllocation}', 'Managed Recipient', 'managed@example.test', 'owner@example.test', '00000000-0000-4000-8000-000000000099'
);`), /^assigned$/);
assert.equal(sql(`select outcome from public.assign_annual_conference_community_managed_ticket(
  '${edition}', '${managedAllocation}', 'Different Recipient', 'different@example.test', 'owner@example.test', '00000000-0000-4000-8000-000000000099'
);`), 'invalid');
assert.equal(sql(`select has_function_privilege('anon',
  'create_annual_conference_flexible_checkout_hold(uuid,text,text,integer,jsonb,uuid)', 'execute');`), 'f');
assert.equal(sql(`select has_function_privilege('authenticated',
  'create_annual_conference_flexible_checkout_hold(uuid,text,text,integer,jsonb,uuid)', 'execute');`), 'f');
assert.equal(sql(`select has_function_privilege('anon',
  'get_annual_conference_flexible_ticket_refund_payment(uuid,uuid)', 'execute');`), 'f');

const refundedOrder = sql(`select id from public.create_annual_conference_flexible_checkout_hold(
  '${edition}', 'Refund Buyer', 'refund-buyer@example.test', 2, ${allocations(2)}, '00000000-0000-4000-8000-000000000014'
);`);

assert.ok(sql(`select id from public.prepare_annual_conference_ticket_payment_attempt(
  '${refundedOrder}', 'paystack', 'flexible-refund-payment'
);`));
assert.equal(sql(`select status from public.confirm_annual_conference_ticket_payment(
  '${refundedOrder}', 'paystack', 'flexible-refund-event', 'charge.success', 'flexible-refund-payment', 30000, 'GHS', 'flexible-refund-payload',
  '{"fee_mode":"merchant_absorbs"}'::jsonb
);`), 'paid');
const refundedAllocations = sql(`select string_agg(id::text, ',' order by seat_index)
  from public.annual_conference_flexible_ticket_allocations where order_id = '${refundedOrder}';`).split(',');
const originalRefundBundle = sql(`select id from public.annual_conference_ticket_email_outbox
  where order_id = '${refundedOrder}' and kind = 'flexible_buyer_bundle_delivery';`);

sql(`update public.annual_conference_ticket_email_outbox
  set first_attempt_at = now(), provider_payload = '{"frozen":true}'::jsonb
  where id = '${originalRefundBundle}';`);

for (const [index, allocationId] of refundedAllocations.entries()) {
  const seatRefund = sql(`select refund_id from public.request_annual_conference_flexible_ticket_refund(
    '${edition}', '${allocationId}'
  );`);
  const expectedOrderStatus = index === refundedAllocations.length - 1 ? 'refunded' : 'paid';

  if (index === 0) {
    assert.equal(sql(`select outcome from public.bind_annual_conference_flexible_ticket_refund_provider_id(
      '${edition}', '${seatRefund}', '1001'
    );`), 'invalid');
  }

  assert.equal(sql(`select outcome from public.bind_annual_conference_flexible_ticket_refund_provider_id(
    '${edition}', '${seatRefund}', '${2001 + index}'
  );`), 'bound');
  assert.equal(sql(`select order_status from public.finalize_annual_conference_flexible_ticket_refund(
    '${edition}', '${seatRefund}', 'paystack', '${2001 + index}', 'full-refund-${index + 1}', 15000, '${String(index + 1).repeat(64)}', 'owner@example.test'
  );`), expectedOrderStatus);

  if (index === 0) {
    assert.equal(sql(`select (provider_payload is null)::text || ':' || (payload ? 'tickets')::text
      from public.annual_conference_ticket_email_outbox where id = '${originalRefundBundle}';`), 'true:false');
    assert.equal(sql(`select jsonb_array_length(payload -> 'tickets')
      from public.annual_conference_ticket_email_outbox
      where idempotency_key like 'flexible-buyer-bundle-refund-replacement:%';`), '1');
  }
}

assert.equal(sql(`select status || ':' || coalesce(flexible_order_management_capability_hash, '')
  from public.annual_conference_ticket_orders where id = '${refundedOrder}';`), 'refunded:');
assert.equal(sql(`select count(*) from public.annual_conference_tickets
  where order_id = '${refundedOrder}' and status = 'cancelled' and qr_token_hash is null;`), '2');
assert.equal(sql(`select bool_or(payload ? 'tickets') from public.annual_conference_ticket_email_outbox
  where order_id = '${refundedOrder}' and kind = 'flexible_buyer_bundle_delivery';`), 'f');
assert.equal(sql(`select status || ':' || (payload ? 'capability')::text || ':' || (provider_payload is null)::text
  from public.annual_conference_ticket_email_outbox
  where order_id = '${refundedOrder}' and kind = 'flexible_order_management';`), 'failed:false:true');

sql(`update public.annual_conference_ticketing_settings
  set regular_price_minor = 19999
  where edition_id = '${edition}';`);
fails(`select public.create_annual_conference_flexible_checkout_hold(
  '${edition}', 'Buyer', 'buyer@example.test', 1, ${allocations(1)}, '00000000-0000-4000-8000-000000000004'
);`, /regular_price_not_configured/);
sql(`update public.annual_conference_ticketing_settings
  set regular_price_minor = 15000
  where edition_id = '${edition}';`);

sql(`update public.annual_conference_ticketing_settings
  set flexible_checkout_max_amount_minor = null
  where edition_id = '${edition}';`);
fails(`select public.create_annual_conference_flexible_checkout_hold(
  '${edition}', 'Buyer', 'buyer@example.test', 1, ${allocations(1)}, '00000000-0000-4000-8000-000000000005'
);`, /ceiling_unconfigured/);
sql(`update public.annual_conference_ticketing_settings
  set flexible_checkout_max_amount_minor = 10000000
  where edition_id = '${edition}';`);
fails(`select public.create_annual_conference_flexible_checkout_hold(
  '${edition}', 'Buyer', 'buyer@example.test', 667, ${allocations(667)}, '00000000-0000-4000-8000-000000000006'
);`, /ceiling_exceeded/);
assert.ok(sql(`select id from public.create_annual_conference_flexible_checkout_hold(
  '${edition}', 'Buyer', 'buyer@example.test', 666, ${allocations(666)}, '00000000-0000-4000-8000-000000000007'
);`));

const capacityEdition = sql("insert into public.annual_conference_editions(year) values (2027) returning id;");

sql(`insert into public.annual_conference_ticketing_settings (
  edition_id, public_capacity, sales_status, public_mode, regular_price_minor, team_3_price_minor, team_5_price_minor, flexible_checkout_max_amount_minor
) values ('${capacityEdition}', 5, 'open', 'paid', 15000, 45000, 75000, 10000000);`);
sql(`insert into public.annual_conference_ticket_orders (
  edition_id, purchaser_name, purchaser_email, tier_key, quantity, amount_minor, status
) values ('${capacityEdition}', 'Paid', 'paid@example.test', 'regular', 1, 15000, 'paid');`);
sql(`insert into public.annual_conference_sponsor_ticket_allocations (
  edition_id, sponsor_name, contact_name, contact_email, quantity, created_by_email
) values ('${capacityEdition}', 'Sponsor', 'Contact', 'contact@example.test', 1, 'owner@example.test');`);
sql(`insert into public.annual_conference_ticket_orders (
  edition_id, purchaser_name, purchaser_email, tier_key, quantity, amount_minor, expires_at
) values ('${capacityEdition}', 'Hold', 'hold@example.test', 'regular', 1, 15000, now() + interval '15 minutes');`);
sql(`insert into public.annual_conference_registrations (edition_id, name, email, status)
  values ('${capacityEdition}', 'Confirmed', 'confirmed@example.test', 'confirmed');`);
fails(`select public.create_annual_conference_flexible_checkout_hold(
  '${capacityEdition}', 'Buyer', 'buyer@example.test', 2, ${allocations(2)}, '00000000-0000-4000-8000-000000000009'
);`, /capacity_exhausted/);
assert.ok(sql(`select id from public.create_annual_conference_flexible_checkout_hold(
  '${capacityEdition}', 'Buyer', 'buyer@example.test', 1, ${allocations(1)}, '00000000-0000-4000-8000-000000000010'
);`));

const legacyEdition = sql("insert into public.annual_conference_editions(year) values (2028) returning id;");

sql(`insert into public.annual_conference_ticketing_settings (
  edition_id, public_capacity, sales_status, public_mode, regular_price_minor, team_3_price_minor, team_5_price_minor
) values ('${legacyEdition}', 2, 'open', 'paid', 15000, 45000, 75000);`);
const legacyOrder = sql(`select id from public.create_annual_conference_checkout_hold(
  '${legacyEdition}', 'Legacy', 'legacy@example.test', 'regular', '00000000-0000-4000-8000-000000000011'
);`);

assert.ok(sql(`select id from public.prepare_annual_conference_ticket_payment_attempt(
  '${legacyOrder}', 'paystack', 'legacy-still-payable'
);`), 'Legacy regular checkout must keep its existing preparation behavior.');
assert.equal(sql(`select status from public.confirm_annual_conference_ticket_payment(
  '${legacyOrder}', 'paystack', 'legacy-event', 'charge.success', 'legacy-still-payable', 15000, 'GHS', 'legacy-payload',
  '{"fee_mode":"merchant_absorbs"}'::jsonb
);`), 'paid');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id = '${legacyOrder}';`), '1');

const expiredLegacyOrder = sql(`insert into public.annual_conference_ticket_orders (
  edition_id, purchaser_name, purchaser_email, tier_key, quantity, amount_minor, expires_at
) values (
  '${legacyEdition}', 'Expired', 'expired@example.test', 'regular', 1, 15000, now() - interval '1 minute'
) returning id;`);

fails(`select public.prepare_annual_conference_ticket_payment_attempt(
  '${expiredLegacyOrder}', 'paystack', 'legacy-expired'
);`, /not_payable/);

const concurrentEdition = sql("insert into public.annual_conference_editions(year) values (2029) returning id;");

sql(`insert into public.annual_conference_ticketing_settings (
  edition_id, public_capacity, sales_status, public_mode, regular_price_minor, team_3_price_minor, team_5_price_minor, flexible_checkout_max_amount_minor
) values ('${concurrentEdition}', 2, 'open', 'paid', 15000, 45000, 75000, 10000000);`);
const concurrentCall = (requestKey) => `select public.create_annual_conference_flexible_checkout_hold(
  '${concurrentEdition}', 'Buyer', 'buyer@example.test', 2, ${allocations(2)}, '${requestKey}'
);`;
const concurrentResults = await Promise.allSettled([
  runConcurrent('psql', [...args, '-c', concurrentCall('00000000-0000-4000-8000-000000000012')]),
  runConcurrent('psql', [...args, '-c', concurrentCall('00000000-0000-4000-8000-000000000013')]),
]);

assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
assert.equal(sql(`select coalesce(sum(quantity), 0) from public.annual_conference_ticket_orders
  where edition_id = '${concurrentEdition}' and status = 'pending_payment';`), '2');

console.log('Flexible ticket allocation: immutable cart snapshots, validation, provider ceiling, shared capacity, idempotency, concurrency, payment gating, and legacy preservation passed.');
