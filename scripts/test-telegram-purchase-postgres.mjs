import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'telegram-purchase-postgres.'));
const data = join(dir, 'data');
const port = '55485';
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sql = (statement) => run('psql', ['-h', dir, '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', statement]).trim();
let started = false;

try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -p ${port} -c listen_addresses=''`, 'start']);
  started = true;
  sql(`create role anon; create role authenticated; create role service_role;
    create table public.annual_conference_editions (id uuid primary key, year integer);
    create table public.annual_conference_ticket_orders (id uuid primary key, edition_id uuid, status text, payment_mode text, provider text,
      amount_minor integer, amount_paid_minor integer, tier_key text, quantity integer,
      quoted_processing_fee_policy text, quoted_gross_amount_minor integer, paid_at timestamptz, expires_at timestamptz);
    create table public.annual_conference_ticket_payment_attempts (id uuid primary key, order_id uuid, provider text, paystack_status text, paystack_checked_at timestamptz, paystack_reason text);
    create table public.annual_conference_ticket_refunds (id uuid primary key, order_id uuid, amount_minor integer, status text);
    create table public.annual_conference_flexible_ticket_refunds (id uuid primary key, order_id uuid, amount_minor integer, status text);
    insert into public.annual_conference_editions values ('00000000-0000-4000-8000-000000000001', 2026);
    insert into public.annual_conference_ticket_orders values
      ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'pending_payment', 'live', null, 30000, null, 'regular_flexible', 2, null, null, null, null),
      ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'pending_payment', 'test', null, 30000, null, 'regular_flexible', 2, null, null, null, null);
  `);
  sql(readFileSync(new URL('../supabase/migrations/20261113120000_telegram_purchase_notifications.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('../supabase/migrations/20261113130000_telegram_activation.sql', import.meta.url), 'utf8'));
  const contract = JSON.parse(readFileSync(new URL('../supabase/migration-verification-contract.json', import.meta.url), 'utf8'));
  const probes = contract.verified.filter((entry) => ['20261113120000_telegram_purchase_notifications.sql', '20261113130000_telegram_activation.sql'].includes(entry.file)).flatMap((entry) => entry.checks);

  for (const probe of probes.filter((check) => check.kind === 'function')) {
    const signature = `public.${probe.name}(${probe.argumentTypes})`;
    const body = sql(`select prosrc from pg_proc where oid='${signature}'::regprocedure`);

    assert.equal(createHash('sha256').update(body.replace(/\r\n/g, '\n').trim()).digest('hex'), probe.bodySha256);
    assert.equal(sql(`select prosecdef from pg_proc where oid='${signature}'::regprocedure`), 't');
    assert.equal(sql(`select has_function_privilege('anon', '${signature}', 'execute') or has_function_privilege('authenticated', '${signature}', 'execute')`), 'f');
    assert.equal(sql(`select has_function_privilege('service_role', '${signature}', 'execute')`), probe.serviceExecute ? 't' : 'f');
  }
  const activationClaim = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  assert.equal(sql(`select count(*) from public.claim_devcon26_telegram_purchases('${activationClaim}', '2026-01-01')`), '0');
  assert.equal(sql(`select public.claim_devcon26_telegram_activation('${activationClaim}', '${activationClaim}', '2026-01-01')`), 'claimed');
  assert.equal(sql(`select public.begin_devcon26_telegram_activation('${activationClaim}')`), 't');
  assert.equal(sql(`select public.finish_devcon26_telegram_activation('${activationClaim}', 'retry', 30)`), 't');
  assert.equal(sql("select state from public.devcon26_telegram_activation"), 'pending');
  assert.equal(sql(`select count(*) from public.claim_devcon26_telegram_purchases('${activationClaim}', '2020-01-01')`), '0');
  sql("update public.devcon26_telegram_activation set next_attempt_at=now()-interval '1 second'");
  assert.equal(sql(`select public.claim_devcon26_telegram_activation('${activationClaim}', '${activationClaim}', '2026-02-01')`), 'claimed');
  assert.equal(sql(`select public.begin_devcon26_telegram_activation('${activationClaim}')`), 't');
  assert.equal(sql(`select public.finish_devcon26_telegram_activation('${activationClaim}', 'sent', null)`), 't');
  assert.equal(sql(`select public.claim_devcon26_telegram_activation('${activationClaim}', '${activationClaim}', '2026-02-01')`), 'sent');
  assert.equal(sql("select activation_at::date from public.devcon26_telegram_activation"), '2026-01-01');
  sql("update public.annual_conference_ticket_orders set status='paid', provider='paystack', amount_paid_minor=31000");
  assert.equal(sql('select count(*) from public.devcon26_telegram_purchase_outbox'), '1');
  assert.equal(sql("select paid_ticket_count from public.devcon26_telegram_purchase_outbox where event_type='payment_succeeded'"), '2');
  assert.equal(sql("select has_function_privilege('anon', 'public.claim_devcon26_telegram_purchases(uuid,timestamptz)', 'execute')"), 'f');
  const claim = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const order = sql("select id from public.devcon26_telegram_purchase_outbox where event_type='payment_succeeded'");

  assert.equal(sql(`select count(*) from public.claim_devcon26_telegram_purchases('${claim}', '2026-01-01')`), '1');
  assert.equal(sql(`select count(*) from public.claim_devcon26_telegram_purchases('${other}', '2026-01-01')`), '0');
  assert.equal(sql(`select public.begin_devcon26_telegram_purchase('${order}', '${claim}')`), 't');
  sql(`update public.devcon26_telegram_purchase_outbox set lease_until=now()-interval '1 second'`);
  assert.equal(sql(`select count(*) from public.claim_devcon26_telegram_purchases('${other}', '2026-01-01')`), '0');
  assert.equal(sql('select state from public.devcon26_telegram_purchase_outbox'), 'needs_review');
  sql(`update public.devcon26_telegram_purchase_outbox set state='pending', claim_id=null, lease_until=null, request_started_at=null, attempts=4;`);
  assert.equal(sql(`select count(*) from public.claim_devcon26_telegram_purchases('${claim}', '2026-01-01')`), '1');
  assert.equal(sql(`select public.begin_devcon26_telegram_purchase('${order}', '${claim}')`), 't');
  assert.equal(sql(`select public.finish_devcon26_telegram_purchase('${order}', '${claim}', 'retry', 30)`), 't');
  assert.equal(sql('select state from public.devcon26_telegram_purchase_outbox'), 'needs_review', 'fifth 429 is not retried');
  sql(`update public.devcon26_telegram_purchase_outbox set state='claimed', claim_id='${claim}', lease_until=now()-interval '1 second', request_started_at=null, attempts=0, next_attempt_at=now();`);
  assert.equal(sql(`select count(*) from public.claim_devcon26_telegram_purchases('${other}', '2026-01-01')`), '1', 'an expired claim before provider start can be reclaimed');
  assert.equal(sql(`select public.begin_devcon26_telegram_purchase('${order}', '${other}')`), 't');
  assert.equal(sql(`select public.finish_devcon26_telegram_purchase('${order}', '${other}', 'sent', null)`), 't');
  assert.equal(sql('select state from public.devcon26_telegram_purchase_outbox'), 'sent');
  sql(`update public.devcon26_telegram_purchase_outbox set state='sent';
    insert into public.annual_conference_ticket_orders values
      ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','pending_payment','live',null,30000,null,'regular_flexible',2,null,null,null,now()-interval '1 minute'),
      ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','pending_payment','live',null,30000,null,'regular_flexible',2,null,null,null,'2025-12-31'),
      ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','pending_payment','test',null,30000,null,'regular_flexible',2,null,null,null,now()-interval '1 minute'),
      ('00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','pending_payment','live',null,30000,null,'regular_flexible',2,null,null,null,now()-interval '1 minute');
    insert into public.annual_conference_ticket_payment_attempts values
      ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005','paystack',null,null,null),
      ('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000006','paystack',null,null,null),
      ('10000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000007','paystack',null,null,null),
      ('10000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000008','paystack',null,null,null);
    update public.annual_conference_ticket_payment_attempts set paystack_status='failed', paystack_checked_at=now(), paystack_reason='Customer cancelled payment'
      where id='10000000-0000-4000-8000-000000000005';
    select count(*) from public.claim_devcon26_telegram_purchases('${claim}', now()-interval '1 hour');`);
  assert.equal(sql("select count(*) from public.devcon26_telegram_purchase_outbox where event_type='checkout_incomplete'"), '2', 'observation and expiry deduplicate; old and test holds do not enqueue');
  assert.equal(sql("select detail_code from public.devcon26_telegram_purchase_outbox where order_id='00000000-0000-4000-8000-000000000005'"), 'customer_cancelled');
  assert.equal(sql("select detail_code from public.devcon26_telegram_purchase_outbox where order_id='00000000-0000-4000-8000-000000000008'"), 'expired');
  sql(`insert into public.annual_conference_ticket_refunds values
    ('20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005',31000,'required');
    update public.annual_conference_ticket_refunds set status='needs_attention' where id='20000000-0000-4000-8000-000000000005';
    update public.annual_conference_ticket_refunds set status='refunded' where id='20000000-0000-4000-8000-000000000005';
    insert into public.annual_conference_flexible_ticket_refunds values
      ('30000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000005',15000,'requested');
    update public.annual_conference_flexible_ticket_refunds set status='refunded' where id='30000000-0000-4000-8000-000000000005';`);
  assert.equal(sql("select count(*) from public.devcon26_telegram_purchase_outbox where event_type like 'refund_%'"), '4');
  assert.equal(sql("select quantity || '|' || total_minor from public.devcon26_telegram_purchase_outbox where detail_code='seat_refund'"), '1|15000');
  sql(`insert into public.annual_conference_flexible_ticket_refunds values
    ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',15000,'refunded');
    insert into public.annual_conference_ticket_orders values
    ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','pending_payment','live',null,15000,null,'regular_flexible',1,null,null,null,null);
    update public.annual_conference_ticket_orders set status='paid',provider='paystack',amount_paid_minor=15000
    where id='00000000-0000-4000-8000-000000000010';`);
  assert.equal(sql("select paid_ticket_count from public.devcon26_telegram_purchase_outbox where order_id='00000000-0000-4000-8000-000000000010' and event_type='payment_succeeded'"), '2', 'new purchase subtracts the completed partial seat refund');
  assert.equal(sql("select paid_ticket_count from public.devcon26_telegram_purchase_outbox where order_id='00000000-0000-4000-8000-000000000002' and event_type='payment_succeeded'"), '2', 'earlier snapshot stays unchanged');
  const racingOrder = '00000000-0000-4000-8000-000000000009';

  sql(`insert into public.annual_conference_ticket_orders values
    ('${racingOrder}','00000000-0000-4000-8000-000000000001','pending_payment','live',null,30000,null,'regular_flexible',2,null,null,null,clock_timestamp()+interval '1 second');
    insert into public.annual_conference_ticket_payment_attempts values
    ('10000000-0000-4000-8000-000000000009','${racingOrder}','paystack',null,null,null);`);
  const payment = spawn(join(bin, 'psql'), ['-h', dir, '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c',
    `begin; update public.annual_conference_ticket_orders set status='paid', provider='paystack', amount_paid_minor=30000, paid_at=now() where id='${racingOrder}'; select pg_sleep(3); commit;`],
  { env: { ...process.env, PGAPPNAME: 'telegram_racing_payment' }, stdio: ['ignore', 'ignore', 'pipe'] });
  const paymentDone = new Promise((resolve, reject) => {
    let error = '';

    payment.stderr.on('data', (chunk) => { error += chunk; });
    payment.on('error', reject);
    payment.on('close', (code) => code === 0 ? resolve() : reject(new Error(error)));
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (sql("select count(*) from pg_stat_activity where application_name='telegram_racing_payment' and wait_event='PgSleep'") === '1') break;
    if (attempt === 99) throw new Error('Payment transaction did not acquire its lock.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await new Promise((resolve) => setTimeout(resolve, 1100));
  sql(`select count(*) from public.claim_devcon26_telegram_purchases('${other}', now()-interval '1 hour')`);
  assert.equal(sql(`select count(*) from public.devcon26_telegram_purchase_outbox where order_id='${racingOrder}' and event_type='checkout_incomplete'`), '0', 'sweep skips an in-flight paid transition');
  await paymentDone;
  sql(`select count(*) from public.claim_devcon26_telegram_purchases('${other}', now()-interval '1 hour')`);
  assert.equal(sql(`select string_agg(event_type, ',') from public.devcon26_telegram_purchase_outbox where order_id='${racingOrder}'`), 'payment_succeeded', 'committed payment does not later produce incomplete checkout');
  sql(`insert into public.annual_conference_ticket_orders values
    ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'pending_payment', 'live', null, 30000, null, 'regular_flexible', 2, null, null, null, null);
    alter table public.devcon26_telegram_purchase_outbox rename to unavailable_outbox;
    update public.annual_conference_ticket_orders set status='paid', provider='paystack', amount_paid_minor=30000
    where id='00000000-0000-4000-8000-000000000004';`);
  assert.equal(sql("select status from public.annual_conference_ticket_orders where id='00000000-0000-4000-8000-000000000004'"), 'paid', 'outbox failure does not block payment');
  console.log('PASS Telegram purchase outbox eligibility, privileges, leases, and ambiguous delivery.');
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
