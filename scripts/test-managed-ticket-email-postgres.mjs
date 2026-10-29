// The imported fixture permits only disposable local PostgreSQL sockets.
import './test-managed-checkout-postgres.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const relevanceMigration = readFileSync(new URL('../supabase/migrations/20261029100000_flexible_order_management_email_relevance.sql', import.meta.url), 'utf8');
const sql = (query) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], {
  input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
}).trim();
const uuid = () => sql('select gen_random_uuid()');
const edition = sql('select id from public.annual_conference_editions where year = 2026');
const origin = 'https://devcongress.org';
const emails = ['tester@example.test', 'gift@example.test', 'community@example.test'];
const settings = () => JSON.parse(sql('select public.get_managed_conference_checkout_settings(2026)'));
const testers = (list = emails) => sql(`select public.configure_managed_conference_payment_mode(
  '${edition}', 'live', ${settings().settings_version}, 'owner@example.test',
  array[${list.map((email) => `'${email}'`).join(',')}]::text[])`);
const setMode = (mode) => sql(`select public.configure_managed_conference_payment_mode(
  '${edition}', '${mode}', ${settings().settings_version}, 'owner@example.test')`);
const snapshot = () => sql(`select jsonb_build_object(
  'admission', (select jsonb_agg(to_jsonb(d) order by id) from public.annual_conference_ticket_email_outbox d),
  'social', (select jsonb_agg(to_jsonb(d) order by id) from public.annual_conference_social_card_email_outbox d))`);
const existing = snapshot();

// Match the production social-card delivery migration omitted by the fixture.
sql('alter table public.annual_conference_social_card_email_outbox enable row level security');
sql(readFileSync(new URL('../supabase/migrations/20261028110000_managed_ticket_email_fulfillment.sql', import.meta.url), 'utf8'));
assert.equal(snapshot(), existing, 'migration never rewrites existing or frozen payloads');
const preRelevanceMigration = snapshot();

sql(relevanceMigration);
assert.equal(snapshot(), preRelevanceMigration, 'management-email relevance migration preserves existing queued and frozen payloads');
testers();

function paidOrder(mode, allocations = [
  { seat_index: 1, kind: 'self', recipient_name: 'Tester', recipient_email: emails[0] },
  { seat_index: 2, kind: 'gift', recipient_email: emails[1] },
  { seat_index: 3, kind: 'community_managed' },
  { seat_index: 4, kind: 'community_shareable' },
]) {
  setMode(mode);
  const order = sql(`select id from public.create_managed_conference_checkout_hold(
    '${edition}', 'Tester', '${emails[0]}', ${allocations.length}, '${JSON.stringify(allocations)}'::jsonb,
    '${uuid()}', '${mode}', ${settings().settings_version}, '${origin}')`);
  const reference = `devcon26-managed-${mode}-${order.replaceAll('-', '')}`;

  sql(`select * from public.claim_managed_conference_checkout_initialization('${order}', '${reference}', '${uuid()}')`);
  assert.equal(sql(`select status from public.confirm_annual_conference_ticket_payment(
    '${order}', 'paystack', '${reference}', 'charge.success', '${reference}',
    (select amount_minor from public.annual_conference_ticket_orders where id = '${order}'), 'GHS', 'fixture',
    '{"domain":"${mode}","fee_mode":"merchant_absorbs"}'::jsonb)`), 'paid');

  return order;
}

const orders = Object.fromEntries(['test', 'live'].map((mode) => [mode, paidOrder(mode)]));
const selfOnlyOrder = paidOrder('test', [{
  seat_index: 1,
  kind: 'self',
  recipient_name: 'Tester',
  recipient_email: emails[0],
}]);
const selfOnlyRows = JSON.parse(sql(`select jsonb_agg(to_jsonb(d))
  from public.annual_conference_ticket_email_outbox d where order_id = '${selfOnlyOrder}'`));

assert.equal(selfOnlyRows.length, 1, 'self-only flexible orders do not queue management mail');
assert.equal(selfOnlyRows[0].kind, 'flexible_admission_delivery');
assert.equal(Object.hasOwn(selfOnlyRows[0].payload, 'capability'), false, 'self-only delivery does not acquire management access');

const buyerManagedOrder = paidOrder('test', [
  { seat_index: 1, kind: 'self', recipient_name: 'Tester', recipient_email: emails[0] },
  { seat_index: 2, kind: 'buyer_managed' },
]);
const buyerManagedRows = JSON.parse(sql(`select jsonb_agg(to_jsonb(d))
  from public.annual_conference_ticket_email_outbox d where order_id = '${buyerManagedOrder}'`));
const buyerManagedDelivery = buyerManagedRows.find((row) => row.kind === 'flexible_admission_delivery');

assert.equal(buyerManagedRows.length, 2, 'buyer-managed orders retain their scoped purchaser deliveries');
assert.match(buyerManagedDelivery.payload.capability, /^[0-9a-f]{64}$/);

for (const [mode, order] of Object.entries(orders)) {
  const rows = JSON.parse(sql(`select jsonb_agg(to_jsonb(d)) from public.annual_conference_ticket_email_outbox d where order_id = '${order}'`));
  const self = rows.find((row) => row.kind === 'flexible_admission_delivery');
  const gift = rows.find((row) => row.kind === 'flexible_gift_claim');

  assert.equal(rows.length, 2, `${mode}: first admission merges management; no duplicate receipt or badge`);
  assert.equal(self.payload.email_version, 2);
  assert.equal(self.payload.badge_included, true);
  assert.equal(self.payload.seat_number, 1);
  assert.match(self.payload.capability, /^[0-9a-f]{64}$/);
  assert.equal(gift.payload.email_version, 2);
  assert.equal(sql(`select count(*) from public.annual_conference_social_card_email_outbox d
    join public.annual_conference_social_cards c on c.id = d.social_card_id
    join public.annual_conference_tickets t on t.id = c.ticket_id where t.order_id = '${order}'`), '0');
  assert.equal(sql(`select outcome from public.claim_annual_conference_flexible_ticket('${gift.payload.capability}', 'Gift', '${emails[1]}')`), 'claimed');
  const assigned = sql(`select id from public.annual_conference_flexible_ticket_allocations
    where order_id = '${order}' and allocation_kind = 'community_managed'`);

  assert.equal(sql(`select outcome from public.assign_annual_conference_community_managed_ticket(
    '${edition}', '${assigned}', 'Community', '${emails[2]}', 'owner@example.test', '${uuid()}')`), 'assigned');
  const shareable = sql(`select id from public.annual_conference_flexible_ticket_allocations
    where order_id = '${order}' and allocation_kind = 'community_shareable'`);
  const capability = sql(`select claim_capability from public.rotate_annual_conference_flexible_ticket_claim(
    '${self.payload.capability}', '${shareable}', 'admission')`);

  assert.equal(sql(`select outcome from public.claim_annual_conference_flexible_ticket('${capability}', 'Shared', '${emails[2]}')`), 'claimed');
  const admissions = JSON.parse(sql(`select jsonb_agg(payload) from public.annual_conference_ticket_email_outbox
    where order_id = '${order}' and kind = 'flexible_admission_delivery'`));

  assert.equal(admissions.length, 4);
  assert.ok(admissions.every((payload) => payload.email_version === 2 && payload.badge_included));
  assert.equal(admissions.filter((payload) => payload.capability).length, 1, 'only self mail carries purchaser management');
}

const legacyTests = () => sql(`select jsonb_agg(to_jsonb(d) order by d.id)
  from public.annual_conference_ticket_email_outbox d
  join public.annual_conference_ticket_orders o on o.id = d.order_id
  where o.payment_mode = 'test' and o.checkout_settings_version is null`);
const historical = legacyTests();
const legacySocial = () => sql(`select jsonb_agg(to_jsonb(d) order by d.id)
  from public.annual_conference_social_card_email_outbox d
  join public.annual_conference_social_cards c on c.id = d.social_card_id
  join public.annual_conference_tickets t on t.id = c.ticket_id
  join public.annual_conference_ticket_orders o on o.id = t.order_id
  where o.payment_mode = 'test' and o.checkout_settings_version is null`);
const historicalSocial = legacySocial();

for (const [mode, order] of Object.entries(orders)) {
  sql(`insert into public.annual_conference_social_card_email_outbox
    (edition_id, social_card_id, recipient_name, recipient_email, capability, idempotency_key)
    select c.edition_id, c.id, 'Tester', '${emails[0]}', repeat('d', 43), 'managed-explicit-${mode}'
    from public.annual_conference_social_cards c
    join public.annual_conference_tickets t on t.id = c.ticket_id
    where t.order_id = '${order}' and t.order_seat_number = 1`);
}

const testDelivery = sql(`select id from public.annual_conference_ticket_email_outbox
  where order_id = '${orders.test}' and kind = 'flexible_admission_delivery' and recipient_email = '${emails[0]}'`);
const liveDelivery = sql(`select id from public.annual_conference_ticket_email_outbox
  where order_id = '${orders.live}' and kind = 'flexible_admission_delivery' and recipient_email = '${emails[0]}'`);

setMode('live');
testers([]);
assert.equal(JSON.parse(sql(`select public.complete_test_email_context('admission', '${testDelivery}')`)).allowed, false);
assert.equal(sql(`select public.annual_conference_email_allowed('admission', '${liveDelivery}', '${emails[0]}')`), 't');
const liveClaim = uuid();

sql(`select count(*) from public.claim_annual_conference_ticket_email_outbox('${liveClaim}', 100)`);
sql(`select count(*) from public.claim_annual_conference_social_card_email_outbox('${liveClaim}', 100)`);
assert.equal(sql(`select status from public.annual_conference_ticket_email_outbox where id = '${testDelivery}'`), 'queued');
assert.equal(sql(`select claim_token from public.annual_conference_ticket_email_outbox where id = '${liveDelivery}'`), liveClaim);
assert.equal(sql(`select status from public.annual_conference_social_card_email_outbox where idempotency_key = 'managed-explicit-test'`), 'queued');
assert.equal(sql(`select claim_token from public.annual_conference_social_card_email_outbox where idempotency_key = 'managed-explicit-live'`), liveClaim);
testers();
setMode('test');
const testClaim = uuid();

sql(`select count(*) from public.claim_annual_conference_ticket_email_outbox('${testClaim}', 100)`);
sql(`select count(*) from public.claim_annual_conference_social_card_email_outbox('${testClaim}', 100)`);
assert.equal(sql(`select claim_token from public.annual_conference_ticket_email_outbox where id = '${testDelivery}'`), testClaim);
assert.equal(sql(`select claim_token from public.annual_conference_social_card_email_outbox where idempotency_key = 'managed-explicit-test'`), testClaim);
assert.equal(legacyTests(), historical, 'ordinary scheduler never leases or expires legacy preview test mail');
assert.equal(legacySocial(), historicalSocial, 'social-card scheduler preserves historical preview isolation');
assert.throws(() => sql(`select public.finalize_annual_conference_ticket_email_outbox('${liveDelivery}', '${uuid()}', 'accepted', 'provider-live')`), /ticket_email_claim_lost/);
assert.equal(sql(`select status from public.finalize_annual_conference_ticket_email_outbox('${liveDelivery}', '${liveClaim}', 'accepted', 'provider-live')`), 'accepted');
assert.equal(sql(`select status from public.finalize_annual_conference_ticket_email_outbox('${testDelivery}', '${testClaim}', 'failed')`), 'failed');
assert.equal(sql(`select next_attempt_at > now() from public.annual_conference_ticket_email_outbox where id = '${testDelivery}'`), 't');
assert.equal(sql(`select payload ? 'qr_token' or payload ? 'capability' from public.annual_conference_ticket_email_outbox where id = '${liveDelivery}'`), 'f');
assert.equal(sql(`select has_function_privilege('anon', 'public.managed_conference_email_dispatch_allowed(text,uuid)', 'execute')`), 'f');
console.log('Managed ticket fulfillment: unchanged legacy payloads, unified live/test email opt-in, self/gift/shared/community scope, allowlist checks across mode changes, isolated legacy queues and accepted/failed production finalization passed.');
