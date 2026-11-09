import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'payment-diagnostics-postgres.'));
const data = join(dir, 'data');
const port = '55484';
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sql = (statement) => run('psql', ['-h', dir, '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', statement]).trim();
let started = false;

try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -p ${port} -c listen_addresses=''`, 'start']);
  started = true;
  sql(`
    create role anon; create role authenticated; create role service_role;
    create table public.annual_conference_ticket_orders (id uuid primary key, status text not null, paid_at timestamptz, payment_mode text not null);
    create table public.annual_conference_ticket_payment_attempts (id uuid primary key, order_id uuid unique references public.annual_conference_ticket_orders(id), provider text, payment_reference text unique);
  `);
  for (const migration of ['20261109120100_managed_paystack_observations.sql', '20261109140000_unresolved_payment_diagnostics.sql']) {
    sql(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  sql(`
    insert into public.annual_conference_ticket_orders values
      ('00000000-0000-4000-8000-000000000001','expired',null,'live'),
      ('00000000-0000-4000-8000-000000000002','pending_payment',null,'test'),
      ('00000000-0000-4000-8000-000000000003','paid',null,'live'),
      ('00000000-0000-4000-8000-000000000004','refunded',null,'live'),
      ('00000000-0000-4000-8000-000000000005','expired',now(),'live'),
      ('00000000-0000-4000-8000-000000000006','expired',null,'live'),
      ('00000000-0000-4000-8000-000000000007','expired',null,'live');
    insert into public.annual_conference_ticket_payment_attempts (id,order_id,provider,payment_reference)
      select id, id, 'paystack', id::text from public.annual_conference_ticket_orders;
    update public.annual_conference_ticket_payment_attempts set paystack_status = 'failed' where id = '00000000-0000-4000-8000-000000000006';
    update public.annual_conference_ticket_payment_attempts set paystack_check_started_at = now() where id = '00000000-0000-4000-8000-000000000007';
  `);
  const first = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const claim = (id) => JSON.parse(sql(`select coalesce(json_agg(row_to_json(q)), '[]') from public.claim_unresolved_payment_diagnostics('${id}') q`));
  const initial = claim(first);

  assert.deepEqual(initial.map((row) => row.order_id).sort(), ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']);
  assert.equal(initial.find((row) => row.order_id.endsWith('2')).payment_mode, 'test');
  assert.equal(claim(second).length, 0, 'active leases and recent observations suppress duplicate work');
  sql(`select public.finish_unresolved_payment_diagnostic('00000000-0000-4000-8000-000000000001','${second}')`);
  assert.equal(sql("select diagnostic_claim is not null from public.annual_conference_ticket_payment_attempts where id='00000000-0000-4000-8000-000000000001'"), 't');
  sql(`select public.finish_unresolved_payment_diagnostic('00000000-0000-4000-8000-000000000001','${first}')`);
  assert.equal(sql("select diagnostic_retries from public.annual_conference_ticket_payment_attempts where id='00000000-0000-4000-8000-000000000001'"), '1');
  assert.equal(sql("select diagnostic_next_at between now() + interval '55 seconds' and now() + interval '1 minute' from public.annual_conference_ticket_payment_attempts where id='00000000-0000-4000-8000-000000000001'"), 't');
  for (const [retry, minutes] of [[1, 5], [2, 15], [3, 60], [4, 1440]]) {
    sql(`update public.annual_conference_ticket_payment_attempts set diagnostic_retries=${retry}, diagnostic_claim='${first}', diagnostic_until=now()+interval '1 minute' where id='00000000-0000-4000-8000-000000000001'; select public.finish_unresolved_payment_diagnostic('00000000-0000-4000-8000-000000000001','${first}')`);
    assert.equal(sql(`select diagnostic_next_at between now() + interval '${minutes} minutes' - interval '5 seconds' and now() + interval '${minutes} minutes' from public.annual_conference_ticket_payment_attempts where id='00000000-0000-4000-8000-000000000001'`), 't');
  }
  sql(`update public.annual_conference_ticket_payment_attempts set diagnostic_until=now()-interval '1 second' where id='00000000-0000-4000-8000-000000000002'`);
  assert.equal(claim(second).some((row) => row.order_id.endsWith('2')), true, 'expired leases are recoverable');
  sql(`select public.record_managed_paystack_observation('00000000-0000-4000-8000-000000000002', now(), 'success', 'Successful'); select public.finish_unresolved_payment_diagnostic('00000000-0000-4000-8000-000000000002','${second}')`);
  assert.equal(sql("select diagnostic_next_at = 'infinity'::timestamptz from public.annual_conference_ticket_payment_attempts where id='00000000-0000-4000-8000-000000000002'"), 't');
  sql("select public.record_managed_paystack_observation('00000000-0000-4000-8000-000000000002', now()+interval '1 second', null, null)");
  assert.equal(sql("select paystack_status || ':' || paystack_reason from public.annual_conference_ticket_payment_attempts where id='00000000-0000-4000-8000-000000000002'"), 'success:Successful');
  sql(`
    insert into public.annual_conference_ticket_orders
      select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'expired', null, 'live'
      from generate_series(1,12) n;
    insert into public.annual_conference_ticket_payment_attempts (id,order_id,provider,payment_reference)
      select id, id, 'paystack', id::text from public.annual_conference_ticket_orders
      where id::text like '10000000-%';
  `);
  const bounded = claim(first);

  assert.equal(bounded.length, 8, 'each claim is bounded');
  for (const row of bounded) {
    sql(`select public.finish_unresolved_payment_diagnostic('${row.order_id}','${first}')`);
  }
  const remaining = claim(second);

  assert.equal(remaining.length, 4, 'unprocessed historical attempts are not starved by retries');
  assert.equal(remaining.some((row) => bounded.some((previous) => previous.order_id === row.order_id)), false);
  console.log('Unresolved payment diagnostics PostgreSQL checks passed');
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
