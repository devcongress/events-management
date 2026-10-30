// Reuse the disposable socket-only fixture; never run against a shared database.
import './test-managed-ticket-email-postgres.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = (query) => execFileSync('psql', args, {
  input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
}).trim();
const uuid = () => sql('select gen_random_uuid()');
const edition = sql('select id from public.annual_conference_editions where year = 2026');
const settings = () => JSON.parse(sql('select public.get_managed_conference_checkout_settings(2026)'));
const origin = 'https://devcongress.org';
const cart = JSON.stringify([{ seat_index: 1, kind: 'self', recipient_name: 'Tester', recipient_email: 'tester@example.test' }]);
const before = sql(`select jsonb_agg(jsonb_build_object('id', id, 'amount_minor', amount_minor,
  'amount_paid_minor', amount_paid_minor, 'processing_fee_minor', processing_fee_minor) order by id)
  from public.annual_conference_ticket_orders`);
const oldVersion = settings().settings_version;

sql(readFileSync(new URL('../supabase/migrations/20261030110000_managed_buyer_processing_fee.sql', import.meta.url), 'utf8'));

assert.equal(settings().processing_fee_rate_basis_points, 195);
assert.ok(settings().settings_version > oldVersion, 'existing catalogs become stale after migration');
assert.equal(sql(`select jsonb_agg(jsonb_build_object('id', id, 'amount_minor', amount_minor,
  'amount_paid_minor', amount_paid_minor, 'processing_fee_minor', processing_fee_minor) order by id)
  from public.annual_conference_ticket_orders`), before, 'existing order accounting is unchanged');
assert.equal(sql("select count(*) from public.annual_conference_ticket_orders where quoted_processing_fee_policy is not null"), '0');

const setMode = (mode) => sql(`select public.configure_managed_conference_payment_mode(
  '${edition}', '${mode}', ${settings().settings_version}, 'owner@example.test',
  array['tester@example.test', 'gift@example.test', 'community@example.test']::text[])`);
const hold = (mode) => sql(`select id from public.create_managed_conference_checkout_hold(
  '${edition}', 'Tester', 'tester@example.test', 1, '${cart}'::jsonb, '${uuid()}',
  '${mode}', ${settings().settings_version}, '${origin}')`);
const reference = (order, mode) => `devcon26-managed-${mode}-${order.replaceAll('-', '')}`;
const prepare = (order, mode) => sql(`select * from public.claim_managed_conference_checkout_initialization(
  '${order}', '${reference(order, mode)}', '${uuid()}')`);
const confirm = (order, mode, eventId, amount = 15299, paymentReference = reference(order, mode)) =>
  `select status from public.confirm_annual_conference_ticket_payment(
    '${order}', 'paystack', '${eventId}', 'charge.success', '${paymentReference}',
    ${amount}, 'GHS', 'fixture-${eventId}',
    '{"domain":"${mode}","fee_mode":"buyer_pays_processing"}'::jsonb)`;

setMode('test');
const testOrder = hold('test');

assert.equal(sql(`select amount_minor || '|' || quoted_processing_fee_minor || '|' || quoted_gross_amount_minor
  from public.annual_conference_ticket_orders where id='${testOrder}'`), '15000|299|15299');
assert.throws(() => sql(`update public.annual_conference_ticket_orders set quoted_gross_amount_minor=15300
  where id='${testOrder}'`), /flexible_ticket_order_snapshot_immutable/);
prepare(testOrder, 'test');
assert.throws(() => sql(confirm(testOrder, 'test', 'buyer-fee-test-wrong', 15000)), /ticket_payment_amount_mismatch/);
assert.equal(sql(confirm(testOrder, 'test', 'buyer-fee-test')), 'paid');
assert.equal(sql(confirm(testOrder, 'test', 'buyer-fee-test')), 'paid', 'matching replay is idempotent');
assert.throws(() => sql(confirm(testOrder, 'test', 'buyer-fee-test-other-ref', 15299, 'bad-reference')),
  /ticket_payment_reference_mismatch/);
assert.equal(sql(`select amount_minor || '|' || processing_fee_minor || '|' || amount_paid_minor || '|' || payment_fee_mode
  from public.annual_conference_ticket_orders where id='${testOrder}'`), '15000|299|15299|buyer_pays_processing');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id='${testOrder}'`), '1');

setMode('live');
const liveOrder = hold('live');

prepare(liveOrder, 'live');
sql(`update public.annual_conference_ticket_orders set expires_at=now()-interval '1 minute' where id='${liveOrder}'`);
assert.equal(sql(confirm(liveOrder, 'live', 'buyer-fee-live-expired')), 'expired');
assert.equal(sql(`select amount_minor from public.annual_conference_ticket_refunds where order_id='${liveOrder}'`),
  '15299', 'expired live payment refunds the entire charge');
assert.equal(sql(`select amount_paid_minor || '|' || processing_fee_minor || '|' || payment_fee_mode
  from public.annual_conference_ticket_orders where id='${liveOrder}'`), '15299|299|buyer_pays_processing');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id='${liveOrder}'`), '0');
assert.equal(sql(`select has_function_privilege('anon',
  'public.confirm_annual_conference_flexible_ticket_payment(uuid,text,text,text,text,integer,text,text,jsonb)', 'execute')`), 'f');

const contract = JSON.parse(readFileSync('supabase/migration-verification-contract.json', 'utf8'));
const updatedFunctions = new Set([
  'snapshot_managed_conference_checkout_settings', 'get_managed_conference_checkout_settings',
  'create_managed_conference_checkout_hold', 'confirm_annual_conference_flexible_ticket_payment',
]);

for (const probe of contract.verified.flatMap((entry) => entry.checks)
  .filter((check) => check.kind === 'function' && updatedFunctions.has(check.name))) {
  const body = sql(`select prosrc from pg_proc where oid =
    'public.${probe.name}(${probe.argumentTypes})'::regprocedure`);
  const hash = createHash('sha256').update(body.replace(/\r\n/g, '\n').trim()).digest('hex');

  assert.equal(hash, probe.bodySha256, `${probe.name} final-state migration contract`);
}

console.log('Managed buyer-paid fee: migrated legacy records, versioned quotes, immutable order, exact test charge/replay, and full expired live refund passed.');
