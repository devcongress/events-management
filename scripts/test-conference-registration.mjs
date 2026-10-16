// Disposable local PostgreSQL only; never connect this fixture to shared Supabase.
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';

assert.equal(process.env.PGDATABASE, 'conference_registration_test');
assert.match(process.env.PGHOST ?? '', /^\/private\/tmp\/devcon26-postgres\./);
const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = (query) => execFileSync('psql', args, { input: query, encoding: 'utf8' }).trim();
const concurrent = (query) => promisify(execFile)('psql', [...args, '-c', query]);
const read = (name) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
// Match Supabase's extension namespace for the free-registration regression.
const freeOnly = process.argv.includes('--free-only');

sql(`do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema extensions;
create extension pgcrypto with schema ${freeOnly ? 'extensions' : 'public'};
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create table annual_conference_editions(id uuid primary key default gen_random_uuid(), year integer unique);
create table annual_conference_sessions(id uuid primary key, edition_id uuid, speaker_name text, speaker_email text, status text, speaker_submission_id uuid);
create table annual_conference_speaker_submissions(id uuid primary key, status text);
create table admin_memberships(id uuid primary key, status text, role text);
create table annual_conference_access_grants(membership_id uuid, capability text);
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit integer, allowed_mime_types text[]);`);

for (const migration of [
  '20261006110000_annual_conference_ticketing_foundation',
  '20261006120000_atomic_sponsor_ticket_allocations',
  '20261006130000_annual_conference_checkout_holds',
  '20261006140000_annual_conference_ticket_payment_processing',
  '20261006150000_annual_conference_ticket_assignment_delivery',
  '20261006160000_annual_conference_ticket_prices',
  '20261006170000_annual_conference_ticket_email_delivery_operations',
  '20261011100000_annual_conference_social_cards',
  '20261011110000_annual_conference_social_card_delivery',
  '20261011130000_annual_conference_bearer_ticket_issuance',
  '20261011140000_annual_conference_ticket_payment_fee_breakdown',
  '20261012160000_annual_conference_social_card_collections',
  '20261016100000_annual_conference_free_registration',
  '20261016110000_annual_conference_volunteer_check_in',
  '20261016120000_annual_conference_attendee_updates',
  '20261016130000_annual_conference_registration_payment_capacity',
]) sql(read(migration));

if (freeOnly) {
  assert.throws(() => sql('select issue_annual_conference_registration_ticket(null::uuid)'), /gen_random_bytes/);
  sql(read('20261016150000_conference_registration_crypto_resolution'));
  assert.throws(() => sql('select issue_annual_conference_registration_ticket(null::uuid)'), /conference_registration_not_confirmed/);
}

const edition = sql('insert into annual_conference_editions(year) values (2026) returning id');

sql(`insert into annual_conference_ticketing_settings(edition_id, public_capacity) values ('${edition}', 1)`);
assert.equal(sql(`select public_mode from annual_conference_ticketing_settings`), 'paid');
sql(`select configure_annual_conference_registration('${edition}', 'free', 'open', 'owner@example.test')`);
await Promise.all([
  concurrent(`select register_for_annual_conference('${edition}', 'First', 'first@example.test')`),
  concurrent(`select register_for_annual_conference('${edition}', 'Second', 'second@example.test')`),
]);
assert.equal(sql("select count(*) from annual_conference_registrations where status='confirmed'"), '1');
assert.equal(sql("select count(*) from annual_conference_registrations where status='waitlisted'"), '1');
assert.equal(sql('select count(*) from annual_conference_tickets'), '1');
assert.equal(sql('select count(*) from annual_conference_ticket_orders'), '0');
assert.equal(sql('select count(*) from annual_conference_social_card_email_outbox'), '1');
sql(`select register_for_annual_conference('${edition}', 'Changed name', ' FIRST@example.test ')`);
assert.equal(sql('select count(*) from annual_conference_registrations'), '2');
assert.throws(() => sql(`select configure_annual_conference_registration('${edition}', 'paid', 'open', 'owner@example.test')`));
const confirmed = sql("select id from annual_conference_registrations where status='confirmed'");

sql(`select cancel_annual_conference_registration('${edition}', '${confirmed}')`);
assert.equal(sql("select count(*) from annual_conference_registrations where status='confirmed'"), '1');
assert.equal(sql("select count(*) from annual_conference_registrations where status='waitlisted'"), '0');
const token = sql("select payload->>'qr_token' from annual_conference_ticket_email_outbox where kind='ticket_delivery' and payload ? 'qr_token'");
const scans = await Promise.all([
  concurrent(`select outcome from check_in_annual_conference_bearer_ticket('${edition}', '${token}', 'volunteer1@example.test')`),
  concurrent(`select outcome from check_in_annual_conference_bearer_ticket('${edition}', '${token}', 'volunteer2@example.test')`),
]);

assert.deepEqual(scans.map((result) => result.stdout.trim()).sort(), ['already_checked_in', 'checked_in']);
assert.equal(sql("select count(*) from annual_conference_tickets where status='checked_in'"), '1');
assert.equal(sql("select has_function_privilege('anon', 'register_for_annual_conference(uuid,text,text)', 'execute')"), 'f');
assert.equal(sql("select has_table_privilege('authenticated', 'annual_conference_registrations', 'select')"), 'f');
console.log('Conference registration: capacity race, duplicate privacy, promotion, separate social card, QR race, and privileges passed.');

const blast = sql(`select create_annual_conference_attendee_blast('${edition}', 'Arrival', 'Bring your QR', 'owner@example.test')`);

assert.equal(sql(`select count(*) from annual_conference_attendee_blast_deliveries where blast_id='${blast}'`), '1');
sql(`select queue_annual_conference_attendee_blast('${edition}', '${blast}')`);
const claim = '30000000-0000-4000-8000-000000000001';
const batch = JSON.parse(sql(`select claim_annual_conference_attendee_updates('${claim}', 10)`));

assert.equal(batch.length, 1);
assert.equal(sql(`select jsonb_array_length(claim_annual_conference_attendee_updates(gen_random_uuid(), 10))`), '0');
const delivery = batch[0];

assert.equal(sql(`select freeze_annual_conference_attendee_update('${delivery.id}', '${claim}', '{"test":1}')`), '{"test": 1}');
assert.equal(sql(`select freeze_annual_conference_attendee_update('${delivery.id}', '${claim}', '{"test":2}')`), '{"test": 1}');
sql(`select finish_annual_conference_attendee_update('${delivery.id}', '${claim}', 'provider-fixture')`);
assert.equal(sql(`select apply_annual_conference_admission_email_event('provider-fixture', 'email.complained')`), 't');
assert.equal(sql(`select count(*) from annual_conference_update_audience('${edition}')`), '0');
assert.equal(sql(`select status from annual_conference_attendee_blasts where id='${blast}'`), 'complete');
assert.throws(() => sql(`select cancel_annual_conference_registration('${edition}', (select id from annual_conference_registrations where status='confirmed'))`));
console.log('Attendee updates: isolated snapshot, serialized claims, immutable retries, suppression, and checked-in cancellation guard passed.');

if (!freeOnly) {
const paidEdition = sql('insert into annual_conference_editions(year) values (2027) returning id');

sql(`insert into annual_conference_ticketing_settings(edition_id, public_capacity, sales_status) values ('${paidEdition}', 10, 'open')`);
const lateOrder = sql(`insert into annual_conference_ticket_orders(edition_id, purchaser_name, purchaser_email, tier_key, quantity, amount_minor, ticket_amount_minor, expires_at)
  values ('${paidEdition}', 'Late fixture', 'late@example.test', 'regular', 1, 19999, 19999, now() - interval '1 minute') returning id`);

sql(`insert into annual_conference_ticket_payment_attempts(order_id, provider, payment_reference) values ('${lateOrder}', 'paystack', 'fixture-late')`);
sql(`select configure_annual_conference_registration('${paidEdition}', 'free', 'open', 'owner@example.test')`);
sql(`update annual_conference_ticket_orders set status='expired' where id='${lateOrder}'`);
sql(`select confirm_annual_conference_ticket_payment('${lateOrder}', 'paystack', 'fixture-event', 'charge.success', 'fixture-late', 19999, 'GHS', 'fixture-hash')`);
assert.equal(sql(`select status from annual_conference_ticket_payment_attempts where order_id='${lateOrder}'`), 'refund_pending');
assert.equal(sql(`select count(*) from annual_conference_tickets where order_id='${lateOrder}'`), '0');
assert.equal(sql(`select count(*) from annual_conference_ticket_refunds where order_id='${lateOrder}'`), '1');
console.log('Late payment after free-mode switch is durably marked refund-required without admission.');

sql(`select configure_annual_conference_registration('${paidEdition}', 'paid', 'open', 'owner@example.test')`);
for (const [suffix, expiry, expected] of [['unswept', "now() - interval '1 minute'", 'refund_pending'], ['current', "now() + interval '10 minutes'", 'confirmed']]) {
  const order = sql(`insert into annual_conference_ticket_orders(edition_id, purchaser_name, purchaser_email, tier_key, quantity, amount_minor, ticket_amount_minor, expires_at)
    values ('${paidEdition}', 'Paid fixture', '${suffix}@example.test', 'regular', 1, 19999, 19999, ${expiry}) returning id`);

  sql(`insert into annual_conference_ticket_payment_attempts(order_id, provider, payment_reference) values ('${order}', 'paystack', 'fixture-${suffix}')`);
  sql(`select confirm_annual_conference_ticket_payment('${order}', 'paystack', 'fixture-${suffix}', 'charge.success', 'fixture-${suffix}', 19999, 'GHS', 'fixture-hash')`);
  assert.equal(sql(`select status from annual_conference_ticket_payment_attempts where order_id='${order}'`), expected);
  assert.equal(sql(`select count(*) from annual_conference_tickets where order_id='${order}'`), expected === 'confirmed' ? '1' : '0');
}
console.log('Unswept expiry refunds consistently; an in-time Regular payment still issues one admission.');
}

sql(read('20261016140000_annual_conference_registration_testing'));
sql(`select configure_annual_conference_registration_testing('${edition}', true, array[' Alice@example.test ', 'alice@example.test', 'bob@example.test'], 'owner@example.test')`);
assert.deepEqual(JSON.parse(sql(`select get_annual_conference_registration_testing('${edition}')`)), { enabled: true, tester_emails: ['alice@example.test', 'bob@example.test'] });
assert.throws(() => sql(`select register_for_annual_conference('${edition}', 'Other', 'other@example.test')`));
sql(`select register_for_annual_conference_test('${edition}', 'Alice', 'alice@example.test')`);
assert.equal(sql(`select is_test from annual_conference_registrations where normalized_email='alice@example.test'`), 't');
assert.equal(sql(`select status from annual_conference_registrations where normalized_email='alice@example.test'`), 'waitlisted');
sql(`update annual_conference_ticketing_settings set public_capacity=10 where edition_id='${edition}'`);
assert.equal(sql(`select status from annual_conference_registrations where normalized_email='alice@example.test'`), 'confirmed');
const aliceAdmission = sql(`select id from annual_conference_ticket_email_outbox where recipient_email='alice@example.test' and kind='ticket_delivery'`);
const aliceSocial = sql(`select id from annual_conference_social_card_email_outbox where recipient_email='alice@example.test'`);
const testingBlast = sql(`select create_annual_conference_attendee_blast('${edition}', 'Rehearsal update', 'Arrival details', 'owner@example.test')`);
const aliceUpdate = sql(`select id from annual_conference_attendee_blast_deliveries where blast_id='${testingBlast}' and recipient_email='alice@example.test'`);

for (const [kind, id] of [['admission', aliceAdmission], ['social', aliceSocial], ['update', aliceUpdate]]) {
  assert.equal(sql(`select annual_conference_email_allowed('${kind}', '${id}', 'alice@example.test')`), 't');
  assert.equal(sql(`select annual_conference_email_allowed('${kind}', '${id}', 'other@example.test')`), 'f');
}
sql(`select configure_annual_conference_registration_testing('${edition}', true, array[]::text[], 'owner@example.test')`);
assert.equal(sql(`select annual_conference_email_allowed('admission', '${aliceAdmission}', 'alice@example.test')`), 'f');
assert.equal(sql(`select count(*) from claim_annual_conference_social_card_email_outbox(gen_random_uuid(), 20) where recipient_email='alice@example.test'`), '0');
sql(`select configure_annual_conference_registration_testing('${edition}', false, array[]::text[], 'owner@example.test')`);
assert.equal(sql(`select annual_conference_email_allowed('social', '${aliceSocial}', 'alice@example.test')`), 'f');
assert.throws(() => sql(`select register_for_annual_conference_test('${edition}', 'Bob', 'bob@example.test')`));
sql(`select configure_annual_conference_registration_testing('${edition}', false, array['alice@example.test'], 'owner@example.test')`);
assert.equal(sql(`select annual_conference_email_allowed('social', '${aliceSocial}', 'alice@example.test')`), 't');
assert.equal(sql(`select annual_conference_email_allowed('social', '${aliceSocial}', 'alice@example.test', true)`), 'f');
assert.equal(sql(`select is_test from annual_conference_registrations where normalized_email='alice@example.test'`), 't');
assert.equal(sql(`select has_function_privilege('anon', 'configure_annual_conference_registration_testing(uuid,boolean,text[],text)', 'execute')`), 'f');
assert.equal(sql(`select has_table_privilege('authenticated', 'annual_conference_registration_test_settings', 'select')`), 'f');
console.log('Shared-database testing: normalized dynamic list, DB intake guard, real waitlist/promotion, sender policy matrix, revoked claims, persistent marking, local-mode gate and privileges passed.');
