// The imported fixture refuses nonlocal sockets and nondisposable databases.
import './test-complete-ticket-checkout-postgres.mjs';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = (query) => execFileSync('psql', args, { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const concurrent = (query) => promisify(execFile)('psql', [...args, '-c', query]);
const migration = readFileSync(new URL('../supabase/migrations/20261028100000_ems_managed_checkout.sql', import.meta.url), 'utf8');
const edition = sql('select id from public.annual_conference_editions where year = 2026');
const uuid = () => sql('select gen_random_uuid()');
const savedRecords = sql(`select jsonb_build_object(
  'orders', (select jsonb_agg(to_jsonb(o) order by id) from public.annual_conference_ticket_orders o),
  'tickets', (select jsonb_agg(to_jsonb(t) order by id) from public.annual_conference_tickets t),
  'badges', (select jsonb_agg(to_jsonb(c) order by id) from public.annual_conference_social_cards c))`);

sql(migration);
assert.equal(sql(`select jsonb_build_object(
  'orders', (select jsonb_agg(to_jsonb(o) - 'checkout_settings_version' order by id) from public.annual_conference_ticket_orders o),
  'tickets', (select jsonb_agg(to_jsonb(t) order by id) from public.annual_conference_tickets t),
  'badges', (select jsonb_agg(to_jsonb(c) order by id) from public.annual_conference_social_cards c))`), savedRecords);
assert.equal(sql('select count(*) from public.annual_conference_ticket_orders where checkout_settings_version is not null'), '0');
assert.equal(sql('select public.get_managed_conference_checkout_settings(1901) is null'), 't');

const settings = () => JSON.parse(sql('select public.get_managed_conference_checkout_settings(2026)'));
const version = () => settings().settings_version;
const origin = 'https://devcongress.org';
const allowed = ['tester@example.test', 'gift@example.test', 'community@example.test'];
const saveTesters = (enabled, emails = allowed) => sql(`select public.configure_managed_conference_payment_mode(
  '${edition}', '${enabled ? 'test' : 'live'}', ${version()}, 'owner@example.test', array[${emails.map((email) => `'${email}'`).join(',')}]::text[])`);
const setMode = (mode, expected = version()) => JSON.parse(sql(`select public.configure_managed_conference_payment_mode(
  '${edition}', '${mode}', ${expected}, 'owner@example.test')`));
const self = { seat_index: 1, kind: 'self', recipient_name: 'Tester', recipient_email: 'tester@example.test' };
const gift = { seat_index: 2, kind: 'gift', recipient_email: 'gift@example.test' };
const holdQuery = ({ mode = settings().payment_mode, expected = version(), request = uuid(), cart = [self], email = 'tester@example.test', site = origin } = {}) =>
  `select id from public.create_managed_conference_checkout_hold('${edition}', 'Tester', '${email}', ${cart.length},
    '${JSON.stringify(cart)}'::jsonb, '${request}', '${mode}', ${expected}, '${site}')`;
const hold = (options) => sql(holdQuery(options));
const reference = (order) => `devcon26-managed-${sql(`select payment_mode from public.annual_conference_ticket_orders where id = '${order}'`)}-${order.replaceAll('-', '')}`;
const claimQuery = (order, token, ref = reference(order)) => `select initialization_claim from public.claim_managed_conference_checkout_initialization('${order}', '${ref}', '${token}')`;
const confirmation = (order, mode, ref = reference(order)) => `select status from public.confirm_annual_conference_ticket_payment(
  '${order}', 'paystack', '${ref}', 'charge.success', '${ref}',
  (select amount_minor from public.annual_conference_ticket_orders where id = '${order}'), 'GHS', 'fixture',
  '{"domain":"${mode}","fee_mode":"merchant_absorbs"}'::jsonb)`;

assert.throws(() => sql(`select public.configure_annual_conference_registration_testing('${edition}', false, array['tester@example.test'], 'owner@example.test')`), /managed_payment_settings_required/);
sql(`update public.annual_conference_ticketing_settings set public_mode = 'free' where edition_id = '${edition}'`);
sql(`select public.configure_annual_conference_registration_testing('${edition}', true, array['tester@example.test'], 'owner@example.test')`);
assert.equal(settings().payment_mode, 'test', 'free-registration testing remains available through its existing RPC');
sql(`update public.annual_conference_ticketing_settings set public_mode = 'paid' where edition_id = '${edition}'`);
assert.throws(() => sql(`select public.configure_annual_conference_registration_testing('${edition}', false, array['tester@example.test'], 'owner@example.test')`), /managed_payment_settings_required/);
saveTesters(true);
const beforeBusinessChange = version();

sql(`update public.annual_conference_ticketing_settings set public_capacity = public_capacity + 1000,
  sales_status = 'open', public_mode = 'paid', flexible_checkout_state = 'internal' where edition_id = '${edition}'`);
assert.ok(version() > beforeBusinessChange);
sql(`update public.annual_conference_ticketing_settings set flexible_checkout_state = 'foundation' where edition_id = '${edition}'`);
assert.equal(settings().flexible_checkout_state, 'foundation');
assert.throws(() => hold(), /managed_checkout_not_available/);
sql(`update public.annual_conference_ticketing_settings set flexible_checkout_state = 'internal' where edition_id = '${edition}'`);
assert.equal(settings().flexible_checkout_state, 'internal');
const unchangedVersion = version();

sql(`update public.annual_conference_ticketing_settings set updated_by_email = 'another-owner@example.test' where edition_id = '${edition}'`);
saveTesters(true);
assert.equal(version(), unchangedVersion, 'audit-only and identical tester writes do not invalidate checkout');
assert.equal(Object.hasOwn(settings(), 'tester_emails'), false, 'catalog settings never include the tester allowlist');
assert.throws(() => setMode('live', version() - 1), /checkout_settings_changed/);
assert.throws(() => hold({ mode: 'live' }), /checkout_settings_changed/);
assert.throws(() => hold({ expected: version() - 1 }), /checkout_settings_changed/);

for (const site of ['http://devcongress.org', 'https://devcongress.org/', 'https://user@devcongress.org', 'https://devcongress.org?x=1', 'https://devcongress.org:99999']) {
  assert.throws(() => hold({ site }), /managed_checkout_origin_invalid/);
}
assert.throws(() => hold({ email: 'outsider@example.test', cart: [{ ...self, recipient_email: 'outsider@example.test' }] }), /complete_test_recipient_not_allowed/);
assert.throws(() => hold({ cart: [self, { ...gift, recipient_email: 'outsider@example.test' }] }), /complete_test_recipient_not_allowed/);
saveTesters(true, []);
assert.throws(() => hold(), /complete_test_recipient_not_allowed/);
saveTesters(true);

const request = uuid();
const testVersion = version();
const testOrder = hold({ request, cart: [self, gift, { seat_index: 3, kind: 'community_managed' }] });

assert.equal(hold({ request, cart: [self, gift, { seat_index: 3, kind: 'community_managed' }] }), testOrder);
assert.equal(sql(`select payment_mode || '|' || checkout_origin || '|' || checkout_settings_version from public.annual_conference_ticket_orders where id = '${testOrder}'`), `test|${origin}|${testVersion}`);
const testClaim = uuid();

sql(claimQuery(testOrder, testClaim));
assert.throws(() => sql(claimQuery(testOrder, uuid())), /checkout_initialization_in_progress/);
assert.throws(() => sql(claimQuery(testOrder, testClaim)), /checkout_initialization_in_progress/);
assert.throws(() => sql(claimQuery(testOrder, uuid(), `devcon26-managed-live-${testOrder.replaceAll('-', '')}`)), /ticket_payment_reference_mismatch/);

// Switch to Live without deleting history; an old test callback stays test.
assert.equal(setMode('live').payment_mode, 'live');
assert.deepEqual(JSON.parse(sql(`select to_jsonb(tester_emails) from public.annual_conference_registration_test_settings where edition_id = '${edition}'`)), allowed.slice().sort());
assert.throws(() => hold({ mode: 'test', expected: testVersion }), /checkout_settings_changed/);
assert.throws(() => sql(confirmation(testOrder, 'live')), /ticket_payment_domain_mismatch/);
assert.equal(sql(confirmation(testOrder, 'test')), 'paid');
assert.equal(sql(confirmation(testOrder, 'test')), 'paid');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id = '${testOrder}'`), '3');
assert.throws(() => sql(`update public.annual_conference_tickets set status = 'checked_in', checked_in_at = now() where order_id = '${testOrder}' and order_seat_number = 1`), /test_ticket_not_valid_for_admission/);

const giftCapability = sql(`select payload->>'capability' from public.annual_conference_ticket_email_outbox where order_id = '${testOrder}' and kind = 'flexible_gift_claim'`);
const communityAllocation = sql(`select id from public.annual_conference_flexible_ticket_allocations where order_id = '${testOrder}' and allocation_kind = 'community_managed'`);

saveTesters(false, ['tester@example.test']);
assert.throws(() => sql(`select * from public.claim_annual_conference_flexible_ticket('${giftCapability}', 'Gift recipient', 'gift@example.test')`), /complete_test_recipient_not_allowed/);
assert.throws(() => sql(`select * from public.assign_annual_conference_community_managed_ticket('${edition}', '${communityAllocation}', 'Community recipient', 'community@example.test', 'owner@example.test', '${uuid()}')`), /complete_test_recipient_not_allowed/);
saveTesters(false);
assert.equal(sql(`select outcome from public.claim_annual_conference_flexible_ticket('${giftCapability}', 'Gift recipient', 'gift@example.test')`), 'claimed');
assert.equal(sql(`select outcome from public.assign_annual_conference_community_managed_ticket('${edition}', '${communityAllocation}', 'Community recipient', 'community@example.test', 'owner@example.test', '${uuid()}')`), 'assigned');

const liveOrder = hold();
const liveClaim = uuid();

sql(claimQuery(liveOrder, liveClaim));
setMode('test');
assert.throws(() => sql(confirmation(liveOrder, 'test')), /ticket_payment_domain_mismatch/);
assert.equal(sql(confirmation(liveOrder, 'live')), 'paid');
assert.equal(sql(confirmation(liveOrder, 'live')), 'paid');
assert.throws(() => sql(`update public.annual_conference_ticket_orders set payment_mode = 'test', checkout_origin = '${origin}' where id = '${liveOrder}'`), /ticket_payment_mode_immutable/);
assert.throws(() => sql(`update public.annual_conference_ticket_orders set checkout_settings_version = checkout_settings_version + 1 where id = '${testOrder}'`), /ticket_payment_mode_immutable/);
assert.throws(() => sql(`update public.annual_conference_ticket_orders set checkout_origin = 'https://www.devcongress.org' where id = '${testOrder}'`), /ticket_payment_mode_immutable/);
sql(`update public.annual_conference_ticketing_settings set flexible_checkout_state = 'public' where edition_id = '${edition}'`);

// A concurrent request may resume a frozen URL, but may never initialize twice.
const pending = hold();
const claims = [uuid(), uuid()];
const competing = await Promise.allSettled(claims.map((token) => concurrent(claimQuery(pending, token))));

assert.equal(competing.filter((result) => result.status === 'fulfilled').length, 1);
const rejected = competing.find((result) => result.status === 'rejected');

assert.match(rejected.reason.stderr, /checkout_initialization_in_progress/);
const ownerClaim = sql(`select initialization_claim from public.annual_conference_ticket_payment_attempts where order_id = '${pending}'`);

sql(`update public.annual_conference_ticket_payment_attempts set initialization_claimed_until = now() - interval '1 second' where order_id = '${pending}'`);
assert.throws(() => sql(claimQuery(pending, uuid())), /checkout_initialization_uncertain/);
assert.throws(() => sql(claimQuery(pending, ownerClaim)), /checkout_initialization_uncertain/);
assert.throws(() => sql(`select * from public.finalize_managed_conference_checkout_initialization('${pending}', '${uuid()}', 'https://checkout.paystack.com/fixture')`), /checkout_initialization_claim_mismatch/);
for (const url of ['http://checkout.paystack.com/fixture', 'https://checkout.paystack.com.evil.test/fixture', 'https://user@checkout.paystack.com/fixture', 'https://checkout.paystack.com:443/fixture']) {
  assert.throws(() => sql(`select * from public.finalize_managed_conference_checkout_initialization('${pending}', '${ownerClaim}', '${url}')`), /checkout_initialization_url_invalid/);
}
const finalized = sql(`select authorization_url from public.finalize_managed_conference_checkout_initialization('${pending}', '${ownerClaim}', 'https://checkout.paystack.com/fixture')`);

assert.equal(finalized, 'https://checkout.paystack.com/fixture');
assert.equal(sql(`select authorization_url from public.claim_managed_conference_checkout_initialization('${pending}', '${reference(pending)}', '${uuid()}')`), finalized);
assert.equal(sql(`select authorization_url from public.finalize_managed_conference_checkout_initialization('${pending}', '${ownerClaim}', '${finalized}')`), finalized);
assert.throws(() => sql(`select * from public.finalize_managed_conference_checkout_initialization('${pending}', '${ownerClaim}', 'https://checkout.paystack.com/changed')`), /checkout_initialization_immutable/);
assert.throws(() => sql(`update public.annual_conference_ticket_payment_attempts set initialization_claim = gen_random_uuid() where order_id = '${pending}'`), /checkout_initialization_immutable/);
const legacyOrder = sql('select id from public.annual_conference_ticket_orders where checkout_settings_version is null and id not in (select order_id from public.annual_conference_ticket_payment_attempts) limit 1');

if (legacyOrder) {
  assert.throws(() => sql(`update public.annual_conference_ticket_payment_attempts set order_id = '${legacyOrder}' where order_id = '${pending}'`), /checkout_initialization_immutable/);
}
assert.equal(sql(`select public.annual_conference_reserved_seats('${edition}') >= (select quantity from public.annual_conference_ticket_orders where id = '${liveOrder}')`), 't');

const versionBeforeAtomicSave = version();
const atomicSave = JSON.parse(sql(`select public.configure_managed_conference_payment_mode('${edition}', 'live', ${versionBeforeAtomicSave}, 'owner@example.test', array['tester@example.test'])`));

assert.equal(atomicSave.settings_version, versionBeforeAtomicSave + 1, 'mode and tester list save as one versioned change');
assert.equal(atomicSave.payment_mode, 'live');
assert.deepEqual(JSON.parse(sql(`select to_jsonb(tester_emails) from public.annual_conference_registration_test_settings where edition_id = '${edition}'`)), ['tester@example.test']);
saveTesters(true);
const raceVersion = version();
const staleHold = holdQuery({ mode: 'test', expected: raceVersion });
const switchInFlight = concurrent(`set application_name = 'managed-checkout-mode-switch'; begin;
  select public.configure_managed_conference_payment_mode('${edition}', 'live', ${raceVersion}, 'owner@example.test');
  select pg_sleep(0.5); commit;`);
let modeSwitchLocked = false;

for (let attempt = 0; attempt < 30; attempt += 1) {
  modeSwitchLocked = sql("select exists(select 1 from pg_stat_activity where application_name = 'managed-checkout-mode-switch' and wait_event = 'PgSleep')") === 't';
  if (modeSwitchLocked) break;
  await new Promise((resolve) => setTimeout(resolve, 10));
}
assert.equal(modeSwitchLocked, true, 'mode switch must hold the settings lock before racing initialization');
await assert.rejects(concurrent(staleHold), /checkout_settings_changed/);
await switchInFlight;
setMode('test');

// A late simulated payment is recorded without admission or real refund work.
const expiredTest = hold();

sql(claimQuery(expiredTest, uuid()));
sql(`update public.annual_conference_ticket_orders set expires_at = now() - interval '1 second' where id = '${expiredTest}'`);
assert.equal(sql(confirmation(expiredTest, 'test')), 'expired');
assert.equal(sql(confirmation(expiredTest, 'test')), 'expired');
assert.equal(sql(`select status from public.annual_conference_ticket_payment_attempts where order_id = '${expiredTest}'`), 'confirmed');
assert.equal(sql(`select status || '|' || rejection_reason from public.annual_conference_ticket_payment_events where order_id = '${expiredTest}'`), 'processed|managed_test_checkout_expired');
assert.equal(sql(`select count(*) from public.annual_conference_ticket_refunds where order_id = '${expiredTest}'`), '0');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id = '${expiredTest}'`), '0');
assert.equal(sql(`select count(*) from public.annual_conference_ticket_email_outbox where order_id = '${expiredTest}'`), '0');

// Live late payments keep their existing refund-required operations record.
setMode('live');
const expiredLive = hold();

sql(claimQuery(expiredLive, uuid()));
sql(`update public.annual_conference_ticket_orders set expires_at = now() - interval '1 second' where id = '${expiredLive}'`);
setMode('test');
assert.equal(sql(confirmation(expiredLive, 'live')), 'expired');
assert.equal(sql(confirmation(expiredLive, 'live')), 'expired');
assert.equal(sql(`select status from public.annual_conference_ticket_payment_attempts where order_id = '${expiredLive}'`), 'refund_pending');
assert.equal(sql(`select count(*) from public.annual_conference_ticket_refunds where order_id = '${expiredLive}'`), '1');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id = '${expiredLive}'`), '0');

for (const functionSignature of [
  'public.get_managed_conference_checkout_settings(integer)',
  'public.configure_managed_conference_payment_mode(uuid,text,bigint,text,text[])',
  'public.create_managed_conference_checkout_hold(uuid,text,text,integer,jsonb,uuid,text,bigint,text)',
  'public.claim_managed_conference_checkout_initialization(uuid,text,uuid)',
  'public.finalize_managed_conference_checkout_initialization(uuid,uuid,text)',
]) {
  assert.equal(sql(`select has_function_privilege('anon', '${functionSignature}', 'execute')`), 'f');
  assert.equal(sql(`select has_function_privilege('authenticated', '${functionSignature}', 'execute')`), 'f');
  assert.equal(sql(`select has_function_privilege('service_role', '${functionSignature}', 'execute')`), 't');
}

console.log('EMS-managed checkout: stale settings, canonical modes, exact tester restrictions, callbacks across mode switches, permanent provenance, concurrent initialization, cached resume, uncertain recovery and service-only grants passed.');
