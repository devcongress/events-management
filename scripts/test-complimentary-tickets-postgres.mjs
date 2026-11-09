// Disposable local PostgreSQL only. The imported fixture rebuilds public.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

assert.equal(process.env.PGDATABASE, 'flexible_ticket_allocation_test');
assert.match(process.env.PGHOST ?? '', /^\/private\/tmp\/(?:devcon26|flexible-ticket)-postgres\./);
await import('./test-flexible-ticket-allocation-postgres.mjs');

const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = query => execFileSync('psql', args, { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const concurrent = promisify(execFile);
const migration = readFileSync(new URL('../supabase/migrations/20261108120000_complimentary_conference_tickets.sql', import.meta.url), 'utf8');

// Later production migrations add these fields; the shared fixture stops earlier.
sql(`alter table public.annual_conference_ticket_email_outbox add column if not exists failure_kind text;
alter table public.annual_conference_ticket_email_outbox add column if not exists provider_payload jsonb;`);
sql(migration);
const edition = sql("insert into public.annual_conference_editions(year) values (2031) returning id;");

sql(`insert into public.annual_conference_ticketing_settings (edition_id, public_capacity, sales_status, public_mode)
values ('${edition}', 2, 'open', 'paid');`);
const guests = `'[{"name":"Ama Example","email":"ama@example.test"}]'::jsonb`;
const issue = (key, input = guests, allocation = 'null', reason = 'Thank you') =>
  `select public.issue_annual_conference_complimentary_tickets('${edition}', ${allocation}, '${reason}', ${input}, 'owner@example.test', '${key}');`;
const key = '00000000-0000-4000-8000-000000000101';
const batch = sql(issue(key));

assert.equal(sql(issue(key)), batch, 'Exact replay must return the original batch.');
assert.throws(() => sql(issue(key, guests, 'null', 'Changed')), /idempotency_mismatch/);
assert.throws(() => sql(issue('00000000-0000-4000-8000-000000000102', 'null')), /request_invalid/);
assert.throws(() => sql(issue('00000000-0000-4000-8000-000000000102', `'[{"name":"","email":"bad"}]'::jsonb`)), /guest_invalid/);
assert.equal(sql(`select count(*) from public.annual_conference_tickets where complimentary_batch_id = '${batch}';`), '1');
assert.equal(sql(`select count(*) from public.annual_conference_social_card_email_outbox;`), '0');
assert.equal(sql(`select count(*) from public.annual_conference_social_cards c join public.annual_conference_tickets t on t.id=c.ticket_id where t.complimentary_batch_id='${batch}' and c.management_token_hash=encode(extensions.digest((select payload->>'social_card_capability' from public.annual_conference_ticket_email_outbox where idempotency_key='complimentary-admission:' || t.id), 'sha256'),'hex');`), '1');
const ticket = sql(`select id from public.annual_conference_tickets where complimentary_batch_id='${batch}';`);
const token = sql(`select payload->>'qr_token' from public.annual_conference_ticket_email_outbox where idempotency_key='complimentary-admission:${ticket}';`);

assert.equal(sql(`select count(*) from public.annual_conference_tickets where id='${ticket}' and qr_token_hash=encode(extensions.digest('${token}', 'sha256'),'hex');`), '1');
const calls = ['103', '104'].map(suffix => issue(`00000000-0000-4000-8000-000000000${suffix}`, `'[{"name":"Guest ${suffix}","email":"g${suffix}@example.test"}]'::jsonb`));
const results = await Promise.allSettled(calls.map(call => concurrent('psql', [...args, '-c', call])));

assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, 'Only one request can reserve the final seat.');
assert.equal(sql(`select public.annual_conference_reserved_seats('${edition}');`), '2');
assert.equal(sql(`select public.cancel_annual_conference_complimentary_ticket('${edition}', '${ticket}');`), 't');
assert.equal(sql(`select public.cancel_annual_conference_complimentary_ticket('${edition}', '${ticket}');`), 'f');
assert.equal(sql(`select public.annual_conference_reserved_seats('${edition}');`), '1');
assert.equal(sql(`select count(*) from public.annual_conference_social_cards where ticket_id='${ticket}' and revoked_at is not null;`), '1');
assert.equal(sql(`select count(*) from public.annual_conference_ticket_email_outbox where idempotency_key='complimentary-admission:${ticket}' and next_attempt_at='infinity' and not (payload ? 'qr_token') and not (payload ? 'social_card_capability');`), '1');
assert.throws(() => sql(`update public.annual_conference_ticket_email_outbox set status='queued' where idempotency_key='complimentary-admission:${ticket}';`), /complimentary_ticket_cancelled/);
const allocation = sql(`insert into public.annual_conference_sponsor_ticket_allocations(edition_id,sponsor_name,contact_name,contact_email,quantity,created_by_email) values ('${edition}','Sponsor','Contact','sponsor@example.test',1,'owner@example.test') returning id;`);
const heldBatch = sql(issue('00000000-0000-4000-8000-000000000105', guests, `'${allocation}'`));

assert.equal(sql(`select public.annual_conference_reserved_seats('${edition}');`), '2', 'Assigning a sponsor-held seat must not add a reservation.');
const heldTicket = sql(`select id from public.annual_conference_tickets where complimentary_batch_id='${heldBatch}';`);

sql(`update public.annual_conference_tickets set status='checked_in', checked_in_at=now() where id='${heldTicket}';`);
assert.throws(() => sql(`select public.cancel_annual_conference_complimentary_ticket('${edition}', '${heldTicket}');`), /not_cancellable/);
console.log('Complimentary issuance: replay, validation, last-seat concurrency, held allocation, independent badge, cancellation and terminal retry passed.');

// Exercise the production QR scanner rather than substituting a status update.
const resolution = readFileSync(new URL('../supabase/migrations/20261016150000_conference_registration_crypto_resolution.sql', import.meta.url), 'utf8');
const checkInFunction = resolution.slice(resolution.indexOf('create or replace function public.check_in_annual_conference_bearer_ticket('), resolution.lastIndexOf('COMMIT;'));

sql(checkInFunction);
const finalTicket = sql(`select t.id from public.annual_conference_tickets t where t.edition_id='${edition}' and t.status='issued' limit 1;`);
const finalToken = sql(`select payload->>'qr_token' from public.annual_conference_ticket_email_outbox where idempotency_key='complimentary-admission:${finalTicket}';`);

assert.equal(sql(`select outcome from public.check_in_annual_conference_bearer_ticket('${edition}','${finalToken}','checker@example.test');`), 'checked_in');
assert.equal(sql(`select outcome from public.check_in_annual_conference_bearer_ticket('${edition}','${finalToken}','checker@example.test');`), 'already_checked_in');
assert.equal(sql(`select outcome from public.check_in_annual_conference_bearer_ticket('${edition}','${token}','checker@example.test');`), 'invalid');

// Fail card creation after the reservation and ticket insert; the entire command rolls back.
const rollbackEdition = sql("insert into public.annual_conference_editions(year) values (2032) returning id;");

sql(`insert into public.annual_conference_ticketing_settings (edition_id,public_capacity,sales_status,public_mode) values ('${rollbackEdition}',1,'open','paid');
create function public.fixture_reject_card() returns trigger language plpgsql as $$ begin raise exception 'fixture_card_failure'; end; $$;
create trigger fixture_reject_card before insert on public.annual_conference_social_cards for each row execute function public.fixture_reject_card();`);
assert.throws(() => sql(`select public.issue_annual_conference_complimentary_tickets('${rollbackEdition}',null,'reason',${guests},'owner@example.test','00000000-0000-4000-8000-000000000106');`), /fixture_card_failure/);
assert.equal(sql(`select count(*) from public.annual_conference_sponsor_ticket_allocations where edition_id='${rollbackEdition}';`), '0');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where edition_id='${rollbackEdition}';`), '0');
assert.equal(sql(`select count(*) from public.annual_conference_ticket_email_outbox where edition_id='${rollbackEdition}';`), '0');
sql('drop trigger fixture_reject_card on public.annual_conference_social_cards;');

// Use the actual production attendance counter, with only unrelated fixture fields added.
sql(`alter table public.annual_conference_editions add column if not exists provisional_date date;
alter table public.annual_conference_registrations add column if not exists is_test boolean not null default false;
alter table public.annual_conference_ticket_orders add column if not exists payment_mode text not null default 'live';
create table if not exists public.annual_conference_sessions (edition_id uuid, status text, speaker_email text);`);
sql(readFileSync(new URL('../supabase/migrations/20261106120000_annual_conference_attendance_counter.sql', import.meta.url), 'utf8'));
sql(`insert into public.annual_conference_attendance_counters(edition_id,source) values ('${edition}','actual');`);
assert.equal(sql(`select public.read_annual_conference_attendance_counter(2031)->>'count';`), '2');
sql(`update public.annual_conference_attendance_counters set source='estimate', published_at=now() where edition_id='${edition}';
update public.annual_conference_editions set provisional_date=current_date + 60 where id='${edition}';`);
assert.equal(sql(`select public.read_annual_conference_attendance_counter(2031)->>'count';`), '20');
assert.equal(sql(`select count(*) from public.annual_conference_ticket_orders where edition_id='${edition}';`), '0');
console.log('Production QR scanner, atomic rollback, actual versus estimate, and no paid orders passed.');

// Install the production registration-test policy dependencies and current
// claim function. The shared fixture otherwise stops before these migrations.
const testingMigration = readFileSync(new URL('../supabase/migrations/20261016140000_annual_conference_registration_testing.sql', import.meta.url), 'utf8');
const managedMigration = readFileSync(new URL('../supabase/migrations/20261028110000_managed_ticket_email_fulfillment.sql', import.meta.url), 'utf8');
const recoveryMigration = readFileSync(new URL('../supabase/migrations/20261030210000_checkout_delivery_recovery.sql', import.meta.url), 'utf8');
const functionSql = (source, name) => {
  const match = source.match(new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'));

  assert.ok(match, `Missing real production function ${name}`);

  return match[0];
};

sql(`alter table public.annual_conference_ticket_orders add column if not exists checkout_origin text;
alter table public.annual_conference_ticket_orders add column if not exists checkout_settings_version integer;
create table public.annual_conference_registration_test_settings (
  edition_id uuid primary key references public.annual_conference_editions(id), enabled boolean not null default false,
  tester_emails text[] not null default '{}', updated_by_email text not null, updated_at timestamptz not null default now()
);`);
sql(functionSql(testingMigration, 'get_annual_conference_registration_testing'));
for (const name of ['complete_test_email_context', 'managed_conference_email_dispatch_allowed', 'guard_complete_test_email_lease']) {
  sql(functionSql(managedMigration, name));
}
sql(`create trigger fixture_guard_complete_test_email before update on public.annual_conference_ticket_email_outbox
for each row execute function public.guard_complete_test_email_lease('admission');`);
sql(functionSql(recoveryMigration, 'claim_annual_conference_ticket_email_outbox'));
const policyEdition = sql("insert into public.annual_conference_editions(year) values (2033) returning id;");

sql(`insert into public.annual_conference_ticketing_settings (edition_id,public_capacity,sales_status,public_mode) values ('${policyEdition}',5,'open','paid');
insert into public.annual_conference_registration_test_settings(edition_id,enabled,tester_emails,updated_by_email) values ('${policyEdition}',true,'{}','owner@example.test');`);
const policyIssue = (email, key) => sql(`select public.issue_annual_conference_complimentary_tickets('${policyEdition}', null, 'Thanks', jsonb_build_array(jsonb_build_object('name','Guest','email','${email}')), 'owner@example.test', '${key}');`);
const policyDelivery = batchId => sql(`select d.id from public.annual_conference_ticket_email_outbox d join public.annual_conference_tickets t on d.idempotency_key='complimentary-admission:' || t.id where t.complimentary_batch_id='${batchId}';`);
const firstPolicyBatch = policyIssue('outside-list@example.test', '00000000-0000-4000-8000-000000000107');
const firstPolicyDelivery = policyDelivery(firstPolicyBatch);

assert.equal(sql(`select public.annual_conference_email_allowed('admission','${firstPolicyDelivery}','outside-list@example.test',false);`), 't', 'Live complimentary mail bypasses the rehearsal allowlist.');
assert.equal(sql(`select public.annual_conference_email_allowed('admission','${firstPolicyDelivery}','outside-list@example.test',true);`), 'f', 'Development-only dispatch cannot send live complimentary mail.');
assert.equal(sql(`select public.annual_conference_email_allowed('admission','${firstPolicyDelivery}','other@example.test',false);`), 'f', 'Recipient equality is still required.');
assert.equal(sql(`select count(*) from public.claim_annual_conference_ticket_email_outbox('00000000-0000-4000-8000-000000000108',100) where id='${firstPolicyDelivery}';`), '1', 'The real production claimer leases the mail while Testing is enabled.');
sql(`update public.annual_conference_registration_test_settings set enabled=false where edition_id='${policyEdition}';
insert into public.annual_conference_registrations(edition_id,name,email,status,is_test) values ('${policyEdition}','Former tester','former@example.test','cancelled',true);`);
const historicalBatch = policyIssue('former@example.test', '00000000-0000-4000-8000-000000000109');
const historicalDelivery = policyDelivery(historicalBatch);

assert.equal(sql(`select public.annual_conference_email_allowed('admission','${historicalDelivery}','former@example.test',false);`), 't', 'A historical test registration cannot block a live complimentary ticket.');
assert.equal(sql(`select public.annual_conference_email_allowed('admission','${historicalDelivery}','former@example.test',true);`), 'f');
assert.equal(sql(`select count(*) from public.claim_annual_conference_ticket_email_outbox('00000000-0000-4000-8000-000000000110',100) where id='${historicalDelivery}';`), '1');
// Ordinary free registration and managed orders retain their previous rules.
const formerRegistration = sql(`select id from public.annual_conference_registrations where edition_id='${policyEdition}' and normalized_email='former@example.test';`);
const freeDelivery = sql(`insert into public.annual_conference_ticket_email_outbox(edition_id,registration_id,kind,recipient_name,recipient_email,payload,idempotency_key)
values ('${policyEdition}','${formerRegistration}','waitlist_notice','Former tester','former@example.test','{}','fixture-free-policy') returning id;`);

assert.equal(sql(`select public.annual_conference_email_allowed('admission','${freeDelivery}','former@example.test',false);`), 'f', 'Legacy rehearsal mail remains restricted.');
sql(`update public.annual_conference_registration_test_settings set enabled=true,tester_emails=ARRAY['former@example.test'] where edition_id='${policyEdition}';`);
assert.equal(sql(`select public.annual_conference_email_allowed('admission','${freeDelivery}','former@example.test',false);`), 't');
console.log('Real production claimer and email policy: live complimentary bypass, development block, recipient equality, historical test isolation and legacy rules passed.');

const managedOrder = (mode, email) => sql(`insert into public.annual_conference_ticket_orders
  (edition_id,purchaser_name,purchaser_email,tier_key,quantity,amount_minor,payment_mode,checkout_origin,checkout_settings_version)
values ('${policyEdition}','Buyer','${email}','regular',1,15000,'${mode}','https://preview.example.test',1) returning id;`);
const managedDelivery = (orderId, email, key) => sql(`insert into public.annual_conference_ticket_email_outbox
  (edition_id,order_id,kind,recipient_name,recipient_email,payload,idempotency_key)
values ('${policyEdition}','${orderId}','payment_receipt','Buyer','${email}','{}','${key}') returning id;`);
const liveOrder = managedOrder('live', 'live@example.test');
const liveDelivery = managedDelivery(liveOrder, 'live@example.test', 'fixture-managed-live-policy');
const testOrder = managedOrder('test', 'test@example.test');
const testDelivery = managedDelivery(testOrder, 'test@example.test', 'fixture-managed-test-policy');

assert.equal(sql(`select public.annual_conference_email_allowed('admission','${liveDelivery}','live@example.test',false);`), 't', 'Managed live mail is still allowed in production during Testing.');
assert.equal(sql(`select public.annual_conference_email_allowed('admission','${liveDelivery}','live@example.test',true);`), 'f', 'Managed live mail remains blocked from local testing.');
assert.equal(sql(`select public.annual_conference_email_allowed('admission','${testDelivery}','test@example.test',false);`), 'f', 'Managed test mail remains restricted to approved recipients.');
sql(`update public.annual_conference_registration_test_settings set tester_emails=ARRAY['test@example.test'] where edition_id='${policyEdition}';`);
assert.equal(sql(`select public.annual_conference_email_allowed('admission','${testDelivery}','test@example.test',false);`), 't', 'Approved managed test recipients remain allowed.');
assert.equal(sql(`select public.annual_conference_email_allowed('admission','${testDelivery}','other@example.test',false);`), 'f');
console.log('Managed live and test recipient policy remains unchanged.');

// Install the forward migration only after the shared fixture has added live/test fields.
sql(readFileSync(new URL('../supabase/migrations/20261109120000_complimentary_community_supporters.sql', import.meta.url), 'utf8'));
const supporterEdition = sql("insert into public.annual_conference_editions(year) values (2034) returning id;");

sql(`insert into public.annual_conference_ticketing_settings (edition_id,public_capacity,sales_status,public_mode,regular_price_minor,team_3_price_minor,team_5_price_minor,flexible_checkout_max_amount_minor) values ('${supporterEdition}',20,'open','paid',15000,45000,75000,1000000);`);
const supportOrder = (name, email, key) => sql(`select id from public.create_annual_conference_flexible_checkout_hold('${supporterEdition}','${name}','${email}',1,'[{"seat_index":1,"kind":"community_managed"}]'::jsonb,'${key}');`);
const source = supportOrder('Supporter', 'supporter@example.test', '00000000-0000-4000-8000-000000000201');
const secondSource = supportOrder('Supporter', 'supporter@example.test', '00000000-0000-4000-8000-000000000202');

sql(`update public.annual_conference_ticket_orders set status='paid', paid_at=now() where id in ('${source}','${secondSource}');`);
const supporterRows = () => JSON.parse(sql(`select coalesce(json_agg(row_to_json(s)), '[]') from public.list_annual_conference_complimentary_supporters('${supporterEdition}',0) s;`));

assert.equal(supporterRows().length, 1, 'Purchases deduplicate before pagination.');
assert.equal(Number(supporterRows()[0].seats), 2);
const sourceGuest = `'[{"name":"Supporter","email":"supporter@example.test","supporter_order_id":"${source}"}]'::jsonb`;
const sourceIssue = (key, input = sourceGuest, allocationId = 'null') => `select public.issue_annual_conference_complimentary_tickets('${supporterEdition}',${allocationId},'Thanks',${input},'owner@example.test','${key}');`;

assert.throws(() => sql(sourceIssue('00000000-0000-4000-8000-000000000203', `'[{"name":"Tampered","email":"supporter@example.test","supporter_order_id":"${source}"}]'::jsonb`)), /supporter_invalid/);
const supporterBatch = sql(sourceIssue('00000000-0000-4000-8000-000000000204'));

assert.equal(sql(sourceIssue('00000000-0000-4000-8000-000000000204')), supporterBatch);
assert.throws(() => sql(sourceIssue('00000000-0000-4000-8000-000000000205')), /existing_admission/);
assert.equal(supporterRows()[0].issued_complimentary, true);
assert.equal(sql(`select count(*) from public.annual_conference_flexible_ticket_allocations where order_id in ('${source}','${secondSource}') and allocation_kind='community_managed';`), '2');
const supporterTicket = sql(`select id from public.annual_conference_tickets where complimentary_batch_id='${supporterBatch}';`);

assert.equal(sql(`select complimentary_supporter_order_id from public.annual_conference_tickets where id='${supporterTicket}';`), source);
sql(`select public.cancel_annual_conference_complimentary_ticket('${supporterEdition}','${supporterTicket}');`);
assert.equal(supporterRows()[0].existing_admission, false);
const duplicateCalls = ['206', '207'].map(n => sourceIssue(`00000000-0000-4000-8000-000000000${n}`));
const duplicateResults = await Promise.allSettled(duplicateCalls.map(call => concurrent('psql', [...args, '-c', call])));

assert.equal(duplicateResults.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent duplicate supporter requests issue only once.');
console.log('Supporter eligibility, deduplication, tampering, replay, cancellation, concurrency and untouched community pool passed.');

const invalidSource = supportOrder('Other', 'other@example.test', '00000000-0000-4000-8000-000000000208');
const invalidGuest = `'[{"name":"Other","email":"other@example.test","supporter_order_id":"${invalidSource}"}]'::jsonb`;

assert.throws(() => sql(sourceIssue('00000000-0000-4000-8000-000000000209', invalidGuest)), /supporter_invalid/, 'Unpaid orders are ineligible.');
sql(`update public.annual_conference_ticket_orders set status='paid', payment_mode='test' where id='${invalidSource}';`);
assert.throws(() => sql(sourceIssue('00000000-0000-4000-8000-000000000210', invalidGuest)), /supporter_invalid/, 'Test orders are ineligible.');
sql(`update public.annual_conference_ticket_orders set status='refunded', payment_mode='live', refunded_at=now() where id='${invalidSource}';`);
assert.throws(() => sql(sourceIssue('00000000-0000-4000-8000-000000000211', invalidGuest)), /supporter_invalid/, 'Refunded orders are ineligible.');
assert.throws(() => sql(`select public.issue_annual_conference_complimentary_tickets('${policyEdition}',null,'Thanks',${sourceGuest},'owner@example.test','00000000-0000-4000-8000-000000000212');`), /supporter_invalid/, 'Orders from another edition are ineligible.');
assert.throws(() => sql(sourceIssue('00000000-0000-4000-8000-000000000204', `'[{"name":"Supporter","email":"supporter@example.test","supporter_order_id":"${secondSource}"}]'::jsonb`)), /idempotency_mismatch/);

const heldSource = supportOrder('Held Supporter', 'held-supporter@example.test', '00000000-0000-4000-8000-000000000213');

sql(`update public.annual_conference_ticket_orders set status='paid' where id='${heldSource}';`);
const heldSupporterGuest = `'[{"name":"Held Supporter","email":"held-supporter@example.test","supporter_order_id":"${heldSource}"}]'::jsonb`;
const heldSupporterAllocation = sql(`insert into public.annual_conference_sponsor_ticket_allocations(edition_id,sponsor_name,contact_name,contact_email,quantity,created_by_email) values ('${supporterEdition}','Held','Contact','held@example.test',1,'owner@example.test') returning id;`);
const reservedBeforeHeld = sql(`select public.annual_conference_reserved_seats('${supporterEdition}');`);
const heldSupporterBatch = sql(sourceIssue('00000000-0000-4000-8000-000000000214', heldSupporterGuest, `'${heldSupporterAllocation}'`));

assert.equal(sql(`select public.annual_conference_reserved_seats('${supporterEdition}');`), reservedBeforeHeld, 'A supporter assigned a sponsor-held seat adds no reservation.');
assert.equal(sql(`select count(*) from public.annual_conference_tickets where complimentary_batch_id='${heldSupporterBatch}' and order_id is null and complimentary_supporter_order_id='${heldSource}';`), '1');
const manualSource = supportOrder('Manual Guest', 'manual@example.test', '00000000-0000-4000-8000-000000000215');

sql(`update public.annual_conference_ticket_orders set status='paid' where id='${manualSource}';`);
sql(sourceIssue('00000000-0000-4000-8000-000000000216', `'[{"name":"Manual Guest","email":"manual@example.test"}]'::jsonb`));
assert.throws(() => sql(sourceIssue('00000000-0000-4000-8000-000000000217', `'[{"name":"Manual Guest","email":"manual@example.test","supporter_order_id":"${manualSource}"}]'::jsonb`)), /existing_admission/, 'Existing manually issued admission prevents supporter issue.');
