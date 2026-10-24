// This imported fixture enforces a disposable local socket/database before any SQL.
import './test-complete-ticket-checkout-postgres.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sql = (query) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8' }).trim();
const edition = sql('select id from public.annual_conference_editions where year=2026');
const reserved = () => Number(sql(`select public.annual_conference_reserved_seats('${edition}')`));
const snapshot = () => sql(`select jsonb_build_object(
  'orders', (select jsonb_agg(to_jsonb(o) order by id) from public.annual_conference_ticket_orders o),
  'tickets', (select jsonb_agg(to_jsonb(t) order by id) from public.annual_conference_tickets t),
  'badges', (select jsonb_agg(to_jsonb(c) order by id) from public.annual_conference_social_cards c))`);
const before = snapshot();

sql(readFileSync(new URL('../supabase/migrations/20261024140000_test_orders_outside_venue_inventory.sql', import.meta.url), 'utf8'));
assert.equal(snapshot(), before, 'migration must preserve orders, QR tickets and badge capabilities');
const liveReserved = Number(sql(`select
  (select coalesce(sum(quantity),0) from public.annual_conference_ticket_orders where edition_id='${edition}' and payment_mode='live' and (status='paid' or (status='pending_payment' and expires_at>now())))
  + (select coalesce(sum(quantity),0) from public.annual_conference_sponsor_ticket_allocations where edition_id='${edition}')
  + (select count(*) from public.annual_conference_registrations where edition_id='${edition}' and status='confirmed')`));

assert.ok(Number(sql(`select sum(quantity) from public.annual_conference_ticket_orders where payment_mode='test' and status='paid'`)) >= 5);
assert.equal(reserved(), liveReserved);
assert.ok(liveReserved > 0, 'fixture retains real inventory for boundary tests');
sql(`select public.set_annual_conference_ticketing_capacity('${edition}', ${liveReserved}, 'owner@example.test')`);
assert.throws(() => sql(`select public.set_annual_conference_ticketing_capacity('${edition}', ${liveReserved - 1}, 'owner@example.test')`), /ticketing_capacity/);
const cart = JSON.stringify([{ seat_index: 1, kind: 'self', recipient_name: 'Tester', recipient_email: 'tester@example.test' }]);
const origin = 'https://preview-site.account.workers.dev';
const request = sql('select gen_random_uuid()');
const liveHold = `select id from public.create_annual_conference_flexible_checkout_hold('${edition}', 'Tester', 'tester@example.test', 1, '${cart}', gen_random_uuid())`;

assert.throws(() => sql(liveHold), /ticketing_capacity_exhausted/);
const testHold = `select id from public.create_complete_test_hold_v2('${edition}', 'Tester', 'tester@example.test', 1, '${cart}', '${request}', '${origin}')`;
const order = sql(testHold);

assert.equal(sql(testHold), order);
assert.equal(reserved(), liveReserved, 'test hold consumes no venue seat even at full capacity');
assert.throws(() => sql(`select id from public.create_annual_conference_flexible_checkout_hold('${edition}', 'Tester', 'tester@example.test', 1, '${cart}', '${request}')`), /flexible_ticket_checkout_request_conflict/);
const reference = `preview-inventory-${order}`;

sql(`select public.prepare_annual_conference_ticket_payment_attempt('${order}', 'paystack', '${reference}')`);
const confirm = `select status from public.confirm_annual_conference_ticket_payment('${order}', 'paystack', '${reference}', 'charge.success', '${reference}', 15000, 'GHS', 'fixture', '{"domain":"test"}')`;

assert.equal(sql(confirm), 'paid');
assert.equal(sql(confirm), 'paid');
assert.equal(reserved(), liveReserved, 'paid test ticket consumes no venue seat');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id='${order}'`), '1');
assert.throws(() => sql(`update public.annual_conference_tickets set status='checked_in', checked_in_at=now() where order_id='${order}'`), /test_ticket_not_valid_for_admission/);
assert.equal(sql("select has_function_privilege('service_role', 'public.create_conference_checkout_hold_for_mode(uuid,text,text,integer,jsonb,uuid,text,text)', 'execute')"), 'f');
assert.throws(() => sql(`update public.annual_conference_ticketing_settings set flexible_checkout_state='public' where edition_id='${edition}'`), /complete_test_cleanup_required_before_live_launch/);

// One remaining live seat is usable, but the next hold cannot oversell it.
sql(`select public.set_annual_conference_ticketing_capacity('${edition}', ${liveReserved + 1}, 'owner@example.test')`);
assert.match(sql(liveHold), /^[a-f0-9-]{36}$/);
assert.equal(reserved(), liveReserved + 1);
assert.throws(() => sql(liveHold), /ticketing_capacity_exhausted/);
execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { readCatalog, evaluateCatalog } from './scripts/migrations/catalog.ts';
  const contract = JSON.parse(readFileSync('supabase/migration-verification-contract.json', 'utf8'));
  contract.verified = contract.verified.filter(entry => entry.file === '20261024140000_test_orders_outside_venue_inventory.sql');
  const results = evaluateCatalog(contract, readCatalog(process.env));
  assert.equal(results[0].status, 'verified', JSON.stringify(results));
`], { stdio: 'inherit' });
console.log('Preview inventory: retained records, live capacity boundaries, full-capacity test payment, mode replay isolation, admission protection and local catalog passed.');
