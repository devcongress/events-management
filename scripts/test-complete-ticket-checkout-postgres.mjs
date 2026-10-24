// Reuses the disposable local fixture; never run against a shared database.
import './test-flexible-ticket-allocation-postgres.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sql = (query) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8' }).trim();
const migration = (file) => readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');

sql(migration('20261016140000_annual_conference_registration_testing.sql'));
sql(migration('20261021150000_complete_test_ticket_checkout.sql'));
const edition = sql('select id from public.annual_conference_editions where year = 2026');
const origin = 'https://preview-site.account.workers.dev';

sql(`update public.annual_conference_ticketing_settings set public_capacity = 1000, sales_status = 'open', public_mode = 'paid', flexible_checkout_state = 'internal' where edition_id = '${edition}';
select public.configure_annual_conference_registration_testing('${edition}', true, array['tester@example.test', 'gift@example.test'], 'owner@example.test');`);
const cart = JSON.stringify([{ seat_index: 1, kind: 'self', recipient_name: 'Tester', recipient_email: 'tester@example.test' }]);
const key = '00000000-0000-4000-8000-999999999001';
const hold = (email = 'tester@example.test', request = key) => `select id from public.create_annual_conference_complete_test_hold('${edition}', 'Tester', '${email}', 1, '${cart}'::jsonb, '${request}', '${origin}')`;

sql(`update public.annual_conference_ticketing_settings set flexible_checkout_state='public' where edition_id='${edition}'`);
assert.throws(() => sql(hold()), /complete_test_checkout_not_available/);
sql(`update public.annual_conference_ticketing_settings set flexible_checkout_state='internal' where edition_id='${edition}'`);
const order = sql(hold());
const launch = `update public.annual_conference_ticketing_settings set flexible_checkout_state='public' where edition_id='${edition}'`;

assert.throws(() => sql(launch), /complete_test_cleanup_required_before_live_launch/);
assert.throws(() => sql(`begin; update public.annual_conference_ticket_orders set status='expired' where id='${order}'; ${launch}; rollback;`), /complete_test_cleanup_required_before_live_launch/);

assert.equal(sql(hold()), order);
assert.equal(sql(`select payment_mode || '|' || checkout_origin from public.annual_conference_ticket_orders where id = '${order}'`), `test|${origin}`);
assert.throws(() => sql(hold('stranger@example.test', '00000000-0000-4000-8000-999999999002')), /complete_test_checkout_not_available/);
const reference = `devcon26-complete-test-${order.replaceAll('-', '')}`;

sql(`select public.prepare_annual_conference_ticket_payment_attempt('${order}', 'paystack', '${reference}')`);
assert.throws(() => sql(`update public.annual_conference_ticket_orders set payment_mode='live' where id='${order}'`), /ticket_payment_mode_immutable/);
const confirm = (domain) => `select status from public.confirm_annual_conference_ticket_payment('${order}', 'paystack', 'complete-test:event', 'charge.success', '${reference}', 15000, 'GHS', 'fixture', '{"domain":"${domain}","fee_mode":"merchant_absorbs"}'::jsonb)`;

assert.throws(() => sql(confirm('live')), /ticket_payment_domain_mismatch/);
assert.equal(sql(confirm('test')), 'paid');
assert.throws(() => sql(launch), /complete_test_cleanup_required_before_live_launch/);
assert.equal(sql(confirm('test')), 'paid');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where order_id='${order}'`), '1');
assert.equal(sql(`select count(*) from public.annual_conference_social_cards c join public.annual_conference_tickets t on t.id=c.ticket_id where t.order_id='${order}' and c.is_test`), '1');
assert.throws(() => sql(`update public.annual_conference_tickets set status='checked_in', checked_in_at=now() where order_id='${order}'`), /test_ticket_not_valid_for_admission/);
assert.throws(() => sql(`update public.annual_conference_tickets set attendee_email='stranger@example.test' where order_id='${order}'`), /complete_test_recipient_not_allowed/);
const delivery = sql(`select id from public.annual_conference_ticket_email_outbox where order_id='${order}' and kind='flexible_order_management'`);

assert.equal(JSON.parse(sql(`select public.complete_test_email_context('admission', '${delivery}')`)).origin, origin);
sql(`select public.configure_annual_conference_registration_testing('${edition}', false, array['tester@example.test'], 'owner@example.test')`);
assert.equal(JSON.parse(sql(`select public.complete_test_email_context('admission', '${delivery}')`)).allowed, false);
console.log('Complete test checkout: provenance, replay, tester restrictions, domain mismatch, idempotent issuance, badge marking, disabled delivery and admission rejection passed.');

// Apply inventory isolation after issuing a legacy test ticket. Preserve its QR,
// badge and order rows byte-for-byte on the first application, not only a replay.
const inventoryRecordSnapshot = () => sql(`select jsonb_build_object(
  'orders', (select jsonb_agg(to_jsonb(o) order by id) from public.annual_conference_ticket_orders o),
  'tickets', (select jsonb_agg(to_jsonb(t) order by id) from public.annual_conference_tickets t),
  'badges', (select jsonb_agg(to_jsonb(c) order by id) from public.annual_conference_social_cards c))`);
const legacyInventoryRecords = inventoryRecordSnapshot();

sql(migration('20261024140000_test_orders_outside_venue_inventory.sql'));
assert.equal(inventoryRecordSnapshot(), legacyInventoryRecords);

// Verify the new contract against the actual local catalog, not only SQL text.
execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { readCatalog, evaluateCatalog } from './scripts/migrations/catalog.ts';
  const contract = JSON.parse(readFileSync('supabase/migration-verification-contract.json', 'utf8'));
  contract.verified = contract.verified.filter(entry => entry.file === '20261021150000_complete_test_ticket_checkout.sql');
  const results = evaluateCatalog(contract, readCatalog(process.env));
  assert.equal(results[0].status, 'verified', JSON.stringify(results));
  console.log('Complete-test local catalog contract verified.');
`], { stdio: 'inherit' });

// Restore delivery columns omitted by the minimal allocation fixture, matching
// the real social-card delivery migration before exercising actual claim SQL.
sql(`alter table public.annual_conference_social_card_email_outbox
  add column attempt_count integer not null default 0 check (attempt_count <= 5),
  add column provider_email_id text, add column last_error text,
  add column next_attempt_at timestamptz not null default now(),
  add column claim_token uuid, add column claimed_until timestamptz,
  add column accepted_at timestamptz, add column delivered_at timestamptz,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
insert into public.annual_conference_social_card_email_outbox
  (edition_id, social_card_id, recipient_name, recipient_email, capability, idempotency_key)
  select c.edition_id, c.id, 'Tester', 'tester@example.test', repeat('b',64), 'new-test-badge'
  from public.annual_conference_social_cards c
  join public.annual_conference_tickets t on t.id=c.ticket_id where t.order_id='${order}' limit 1;`);
sql(migration('20261021160000_preview_only_ticket_email_leasing.sql'));
sql(`select public.configure_annual_conference_registration_testing('${edition}', true, array['tester@example.test', 'gift@example.test'], 'owner@example.test')`);
const snapshotOtherMail = (table, kind) => sql(`select coalesce(jsonb_agg(to_jsonb(o) order by id), '[]'::jsonb) from public.${table} o where not (public.complete_test_email_context('${kind}', id)->>'is_test')::boolean`);

sql(`insert into public.annual_conference_social_card_email_outbox
  (edition_id, social_card_id, recipient_name, recipient_email, capability, idempotency_key)
  select c.edition_id, c.id, 'Older tester', 'tester@example.test', repeat('a',64), 'older-unrelated-test-badge'
  from public.annual_conference_social_cards c
  join public.annual_conference_tickets t on t.id=c.ticket_id
  join public.annual_conference_ticket_orders o on o.id=t.order_id
  where o.payment_mode='live' limit 1`);
const admissionBefore = snapshotOtherMail('annual_conference_ticket_email_outbox', 'admission');
const socialBefore = snapshotOtherMail('annual_conference_social_card_email_outbox', 'social');

assert.notEqual(admissionBefore, '[]', 'fixture must include unrelated admission mail');
assert.notEqual(socialBefore, '[]', 'fixture must include unrelated social mail');
sql(`select public.configure_annual_conference_registration_testing('${edition}', false, array['tester@example.test'], 'owner@example.test')`);
for (const kind of ['admission', 'social']) {
  const table = kind === 'admission' ? 'annual_conference_ticket_email_outbox' : 'annual_conference_social_card_email_outbox';
  const before = sql(`select jsonb_agg(to_jsonb(o) order by id) from public.${table} o`);

  assert.equal(sql(`select count(*) from public.claim_complete_test_only_${kind}_emails(gen_random_uuid(), 20, '${origin}')`), '0');
  assert.equal(sql(`select jsonb_agg(to_jsonb(o) order by id) from public.${table} o`), before);
}
sql(`select public.configure_annual_conference_registration_testing('${edition}', true, array['tester@example.test', 'gift@example.test'], 'owner@example.test')`);
for (const kind of ['admission', 'social']) {
  const fn = `claim_complete_test_only_${kind}_emails`;
  const claim = `select count(*) from public.${fn}(gen_random_uuid(), 20, '${origin}')`;

  assert.equal(sql(`select count(*) from public.${fn}(gen_random_uuid(), 20, 'https://another.account.workers.dev')`), '0');
  assert.ok(Number(sql(claim)) > 0, `${kind} preview mail should be leased`);
  assert.equal(sql(claim), '0', 'active leases cannot be claimed twice');
}
assert.equal(snapshotOtherMail('annual_conference_ticket_email_outbox', 'admission'), admissionBefore);
assert.equal(snapshotOtherMail('annual_conference_social_card_email_outbox', 'social'), socialBefore);
execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { readCatalog, evaluateCatalog } from './scripts/migrations/catalog.ts';
  const contract = JSON.parse(readFileSync('supabase/migration-verification-contract.json', 'utf8'));
  contract.verified = contract.verified.filter(entry => entry.file === '20261021160000_preview_only_ticket_email_leasing.sql');
  const results = evaluateCatalog(contract, readCatalog(process.env));
  assert.equal(results[0].status, 'verified', JSON.stringify(results));
`], { stdio: 'inherit' });
console.log('Preview-only leases preserve unrelated mail byte-for-byte, isolate preview origin, and prevent double claims.');

sql(migration('20261023001000_preview_admission_email_finalization.sql'));
const previewReceipt = sql(`select id from public.annual_conference_ticket_email_outbox where order_id='${order}' and kind='payment_receipt'`);
const receiptClaim = sql(`select claim_token from public.annual_conference_ticket_email_outbox where id='${previewReceipt}'`);
const finalize = (status, site = origin, claim = receiptClaim) => `select status from public.finalize_complete_test_only_admission_email('${previewReceipt}', '${claim}', '${status}', '${site}', ${status === 'accepted' ? "'fixture-provider'" : 'null'})`;

assert.throws(() => sql(finalize('failed', 'https://other.account.workers.dev')), /complete_test_email_unavailable/);
assert.throws(() => sql(finalize('failed', origin, '00000000-0000-4000-8000-000000000099')), /ticket_email_claim_lost/);
assert.equal(sql(finalize('failed')), 'failed');
assert.equal(sql(`select (next_attempt_at > now()) from public.annual_conference_ticket_email_outbox where id='${previewReceipt}'`), 't');
assert.equal(snapshotOtherMail('annual_conference_ticket_email_outbox', 'admission'), admissionBefore);
assert.equal(snapshotOtherMail('annual_conference_social_card_email_outbox', 'social'), socialBefore);
console.log('Preview-only finalization: retry backoff works, wrong origin/token blocked, unrelated mail unchanged.');

sql(`update public.annual_conference_ticket_email_outbox set next_attempt_at=now() where id='${previewReceipt}';
select count(*) from public.claim_complete_test_only_admission_emails('${receiptClaim}', 20, '${origin}');
update public.annual_conference_ticket_email_outbox set claimed_until=now()-interval '1 second' where id='${previewReceipt}';
select public.configure_annual_conference_registration_testing('${edition}', false, array['tester@example.test'], 'owner@example.test');`);
assert.equal(sql(finalize('accepted')), 'accepted');
assert.equal(snapshotOtherMail('annual_conference_ticket_email_outbox', 'admission'), admissionBefore);
assert.equal(snapshotOtherMail('annual_conference_social_card_email_outbox', 'social'), socialBefore);
console.log('Accepted preview sends remain acknowledgeable after testing disablement and lease timeout.');

// Combined delivery is opt-in for newly created preview orders, never a backfill.
const oldAdmission = sql('select jsonb_agg(to_jsonb(d) order by id) from public.annual_conference_ticket_email_outbox d');
const oldSocial = sql('select jsonb_agg(to_jsonb(d) order by id) from public.annual_conference_social_card_email_outbox d');

sql(migration('20261023010000_preview_combined_ticket_email.sql'));
assert.equal(sql('select jsonb_agg(to_jsonb(d) order by id) from public.annual_conference_ticket_email_outbox d'), oldAdmission);
assert.equal(sql('select jsonb_agg(to_jsonb(d) order by id) from public.annual_conference_social_card_email_outbox d'), oldSocial);
sql(`select public.configure_annual_conference_registration_testing('${edition}', true, array['tester@example.test', 'gift@example.test'], 'owner@example.test')`);
assert.throws(() => sql(hold().replace('create_annual_conference_complete_test_hold', 'create_complete_test_hold_v2')), /flexible_ticket_checkout_request_conflict/);

// Restore the real social-card issuance command after the minimal legacy fixture.
const issueSql = migration('20261016150000_conference_registration_crypto_resolution.sql').match(/create or replace function public\.issue_annual_conference_social_card_delivery\([\s\S]*?\n\$\$;/)[0];

sql('drop function public.issue_annual_conference_social_card_delivery(uuid, public.annual_conference_social_card_subject, uuid)');
sql(issueSql);
const makeOrder = (allocations) => {
  const request = sql('select gen_random_uuid()');
  const create = `select id from public.create_complete_test_hold_v2('${edition}', 'Tester', 'tester@example.test', ${allocations.length}, '${JSON.stringify(allocations)}'::jsonb, '${request}', '${origin}')`;
  const id = sql(create);

  assert.equal(sql(create), id);
  const ref = `devcon26-complete-test-${id.replaceAll('-', '')}`;

  sql(`select public.prepare_annual_conference_ticket_payment_attempt('${id}', 'paystack', '${ref}')`);
  const confirmV2 = `select status from public.confirm_annual_conference_ticket_payment('${id}', 'paystack', '${id}', 'charge.success', '${ref}', ${allocations.length * 15000}, 'GHS', 'fixture', '{"domain":"test"}'::jsonb)`;

  assert.equal(sql(confirmV2), 'paid');
  assert.equal(sql(confirmV2), 'paid');
  assert.throws(() => sql(`update public.annual_conference_ticket_orders set preview_combined_email=false where id='${id}'`), /preview_email_policy_immutable/);

  return id;
};
const self = { seat_index: 1, kind: 'self', recipient_name: 'Tester', recipient_email: 'tester@example.test' };
const gift = { seat_index: 2, kind: 'gift', recipient_email: 'gift@example.test' };
const combinedOrder = makeOrder([self]);
const rowsFor = (id) => JSON.parse(sql(`select jsonb_agg(to_jsonb(d)) from public.annual_conference_ticket_email_outbox d where order_id='${id}'`));
const combinedRows = rowsFor(combinedOrder);

assert.equal(combinedRows.length, 1);
assert.equal(combinedRows[0].kind, 'flexible_admission_delivery');
assert.equal(combinedRows[0].payload.badge_included, true);
assert.equal(combinedRows[0].payload.seat_number, 1);
assert.match(combinedRows[0].payload.capability, /^[a-f0-9]{64}$/);
assert.equal(sql(`select count(*) from public.annual_conference_social_card_email_outbox d join public.annual_conference_social_cards c on c.id=d.social_card_id join public.annual_conference_tickets t on t.id=c.ticket_id where t.order_id='${combinedOrder}'`), '0');
const mixed = makeOrder([self, gift]);

assert.deepEqual(rowsFor(mixed).map((row) => row.kind).sort(), ['flexible_admission_delivery', 'flexible_gift_claim']);
const giftOnly = makeOrder([{ ...gift, seat_index: 1 }]);

assert.deepEqual(rowsFor(giftOnly).map((row) => row.kind).sort(), ['flexible_gift_claim', 'flexible_order_management']);
const claimCapability = rowsFor(mixed).find((row) => row.kind === 'flexible_gift_claim').payload.capability;

sql(`select * from public.claim_annual_conference_flexible_ticket('${claimCapability}', 'Friend', 'gift@example.test')`);
const recipientTicket = rowsFor(mixed).find((row) => row.kind === 'flexible_admission_delivery' && row.recipient_email === 'gift@example.test');

assert.equal(recipientTicket.payload.badge_included, true);
assert.equal(sql(`select count(*) from public.annual_conference_social_card_email_outbox d join public.annual_conference_social_cards c on c.id=d.social_card_id where c.ticket_id='${recipientTicket.payload.ticket_id}'`), '0');
assert.equal(recipientTicket.payload.capability, undefined, 'gift recipient must never receive purchaser management capability');
// An explicit later badge resend remains available.
sql(`insert into public.annual_conference_social_card_email_outbox (edition_id,social_card_id,recipient_name,recipient_email,capability,idempotency_key) select '${edition}', id, 'Tester', 'tester@example.test', repeat('c',43), 'explicit-v2-reissue' from public.annual_conference_social_cards where ticket_id='${combinedRows[0].payload.ticket_id}'`);
assert.equal(sql(`select count(*) from public.annual_conference_social_card_email_outbox d join public.annual_conference_social_cards c on c.id=d.social_card_id where c.ticket_id='${combinedRows[0].payload.ticket_id}'`), '1');
assert.equal(snapshotOtherMail('annual_conference_ticket_email_outbox', 'admission'), admissionBefore);
assert.equal(snapshotOtherMail('annual_conference_social_card_email_outbox', 'social'), socialBefore);
execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { readCatalog, evaluateCatalog } from './scripts/migrations/catalog.ts';
  const contract = JSON.parse(readFileSync('supabase/migration-verification-contract.json', 'utf8'));
  contract.verified = contract.verified.filter(entry => entry.file === '20261023010000_preview_combined_ticket_email.sql');
  const results = evaluateCatalog(contract, readCatalog(process.env));
  assert.equal(results[0].status, 'verified', JSON.stringify(results));
`], { stdio: 'inherit' });
console.log('Combined preview emails: self, mixed, gift claim, no duplicate receipt/badge, explicit reissue, replay, production isolation and catalog contract passed.');
