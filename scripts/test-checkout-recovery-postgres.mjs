// The imported fixture refuses shared/remote databases and uses a disposable Unix socket only.
import './test-managed-buyer-processing-fee-postgres.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';

const args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'];
const sql = query => execFileSync('psql', args, { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const uuid = () => sql('select gen_random_uuid()');
const migration = '20261030210000_checkout_delivery_recovery.sql';

sql(readFileSync(new URL('../supabase/migrations/' + migration, import.meta.url), 'utf8'));
const edition = sql("insert into public.annual_conference_editions(year) values(2999) returning id");

sql(`insert into public.annual_conference_ticketing_settings(edition_id,public_capacity,sales_status,public_mode,regular_price_minor,team_3_price_minor,team_5_price_minor,flexible_checkout_max_amount_minor,flexible_checkout_state) values('${edition}',900,'open','paid',15000,45000,75000,10000000,'internal')`);
const hold = () => sql(`select id from public.create_managed_conference_checkout_hold('${edition}','Recovery','recovery@example.test',1,'[{"seat_index":1,"kind":"self","recipient_name":"Recovery","recipient_email":"recovery@example.test"}]',gen_random_uuid(),'live',1,'https://recovery.invalid')`);
const reference = id => 'devcon26-managed-live-' + id.replaceAll('-', '');
const initialize = (id, claim) => sql(`select initialization_claim from public.claim_managed_conference_checkout_initialization('${id}','${reference(id)}','${claim}')`);
const order = hold();
const claim = uuid();

initialize(order, claim);
sql(`select public.record_managed_initialization_failure('${order}','${claim}',false)`);
sql(`update public.annual_conference_ticket_payment_attempts set initialization_claimed_until=now()-interval '1 second' where order_id='${order}'`);
assert.throws(() => initialize(order, uuid()), /checkout_initialization_uncertain/);
sql(`select public.record_managed_initialization_failure('${order}','${uuid()}',true)`);
assert.equal(sql(`select initialization_claim from public.annual_conference_ticket_payment_attempts where order_id='${order}'`), claim);
sql(`select public.record_managed_initialization_failure('${order}','${claim}',true)`);
const newClaim = uuid();

assert.equal(initialize(order, newClaim), newClaim);
sql(`select public.finalize_managed_conference_checkout_initialization('${order}','${newClaim}','https://checkout.paystack.com/synthetic')`);
sql(`select public.record_managed_initialization_failure('${order}','${newClaim}',true)`);
assert.equal(sql(`select initialization_claim from public.annual_conference_ticket_payment_attempts where order_id='${order}'`), newClaim);
sql(`select public.confirm_annual_conference_ticket_payment('${order}','paystack','recovery-charge','charge.success','${reference(order)}',15299,'GHS','synthetic','{"domain":"live","fee_mode":"buyer_pays_processing"}')`);
const delivery = sql(`select id from public.annual_conference_ticket_email_outbox where order_id='${order}' limit 1`);
const payload = '{"subject":"frozen","to":["recovery@example.test"]}';

sql(`update public.annual_conference_ticket_email_outbox set status='failed', attempt_count=8, first_attempt_at=now()-interval '61 minutes', next_attempt_at=now(), provider_payload='${payload}' where id='${delivery}'`);
const mailClaim = uuid();

sql(`select count(*) from public.claim_annual_conference_ticket_email_outbox('${mailClaim}',100)`);
assert.equal(sql(`select status from public.annual_conference_ticket_email_outbox where id='${delivery}'`), 'sending');
assert.equal(JSON.parse(sql(`select public.freeze_annual_conference_admission_email('${delivery}','${mailClaim}','{"subject":"different"}')`)).subject, 'frozen');
sql(`select public.defer_admission_delivery('${delivery}','${mailClaim}','throttled',60)`);
assert.equal(sql(`select failure_kind from public.annual_conference_ticket_email_outbox where id='${delivery}'`), 'throttled');
assert.equal(sql(`select provider_payload->>'subject' from public.annual_conference_ticket_email_outbox where id='${delivery}'`), 'frozen');
sql(`select public.retry_annual_conference_ticket_email_outbox('${edition}','${delivery}')`);
assert.equal(sql(`select status from public.annual_conference_ticket_email_outbox where id='${delivery}'`), 'queued');
sql(`update public.annual_conference_ticket_email_outbox set first_attempt_at=now()-interval '24 hours' where id='${delivery}'`);
sql(`select count(*) from public.claim_annual_conference_ticket_email_outbox('${uuid()}',100)`);
assert.equal(sql(`select failure_kind || ':' || (provider_payload->>'subject') from public.annual_conference_ticket_email_outbox where id='${delivery}'`).includes('frozen'), true);
assert.throws(() => sql(`select public.retry_annual_conference_ticket_email_outbox('${edition}','${delivery}')`), /ticket_email_retry_terminal/);
const tokens = Array.from({ length: 20 }, uuid);
const run = promisify(execFile);
const raced = await Promise.all(tokens.map(token => run('psql', [...args, '-c', `select public.lease_admission_dispatch('${token}',30)`])));

assert.equal(raced.filter(result => result.stdout.trim() === 't').length, 1);
const owner = tokens[raced.findIndex(result => result.stdout.trim() === 't')];

assert.equal(sql(`select public.admission_send_slot('${owner}')`), 't');
assert.equal(sql(`select public.admission_send_slot('${owner}')`), 'f');
sql(`select public.admission_send_slot('${owner}',60); select public.release_admission_dispatch('${owner}')`);
assert.equal(sql(`select public.lease_admission_dispatch('${uuid()}',30)`), 'f');
for (let i = 0; i < 30; i += 1) initialize(hold(), uuid());
const [a,b] = await Promise.all([uuid(),uuid()].map(token => run('psql', [...args, '-c', `select order_id from public.claim_managed_payment_reconciliation('${token}')`])));
const left = new Set(a.stdout.trim().split('\n'));

assert.equal(b.stdout.trim().split('\n').some(id => left.has(id)), false);
const names = [...readFileSync(new URL('../supabase/migrations/' + migration, import.meta.url), 'utf8').matchAll(/create (?:or replace )?function public\.(\w+)/g)].map(match => match[1]);
const catalog = JSON.parse(sql(`select json_agg(json_build_object('kind','function','schema','public','name',p.proname,'argumentTypes',oidvectortypes(p.proargtypes),'result',pg_get_function_result(p.oid),'language',l.lanname,'body',p.prosrc,'securityDefiner',p.prosecdef,'searchPath','public','private',true,'serviceExecute',has_function_privilege('service_role',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' and p.proname in (${names.map(n=>`'${n}'`).join(',')})`));

for (const probe of catalog.filter(p => p.securityDefiner)) {
  assert.equal(sql(`select has_function_privilege('anon','public.${probe.name}(${probe.argumentTypes})','execute')`), 'f');
}
for (const probe of catalog) {
  probe.bodySha256 = createHash('sha256').update(probe.body.replace(/\r\n/g, '\n').trim()).digest('hex');
  delete probe.body;
}
if (process.env.RECOVERY_CATALOG_OUTPUT) writeFileSync(process.env.RECOVERY_CATALOG_OUTPUT, JSON.stringify(catalog,null,2));
console.log('PASS recovery: 61-minute outage, frozen payload, 24-hour review, concurrent leases/cooldown, fenced initialization, concurrent payment reconciliation and private RPCs.');

execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { readCatalog, evaluateCatalog } from './scripts/migrations/catalog.ts';
  const contract = JSON.parse(readFileSync('supabase/migration-verification-contract.json', 'utf8'));
  contract.verified = contract.verified.filter(entry => entry.file === '20261030210000_checkout_delivery_recovery.sql');
  const results = evaluateCatalog(contract, readCatalog(process.env));
  assert.equal(results[0].status, 'verified', JSON.stringify(results));
`], { stdio: 'inherit' });
console.log('PASS final recovery migration catalog contract.');
