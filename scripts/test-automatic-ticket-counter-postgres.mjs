import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'ticket-counter-postgres.'));
const data = join(dir, 'data');
const port = '55483';
const run = (name, args) => execFileSync(join(bin, name), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sql = (statement) => run('psql', ['-h', dir, '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', statement]).trim();
let started = false;

try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-locale']);
  run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -p ${port} -c listen_addresses=''`, 'start']);
  started = true;
  sql(`
    create table public.annual_conference_editions (id uuid primary key, year integer unique);
    create table public.annual_conference_ticket_orders (id uuid primary key, edition_id uuid, status text, payment_mode text, quantity integer);
    create table public.annual_conference_flexible_ticket_refunds (order_id uuid, allocation_id uuid unique, status text);
    insert into public.annual_conference_editions values
      ('00000000-0000-0000-0000-000000000026', 2026),
      ('00000000-0000-0000-0000-000000000027', 2027);
  `);
  sql(readFileSync(new URL('../supabase/migrations/20261109130000_automatic_ticket_counter.sql', import.meta.url), 'utf8'));
  const read = () => JSON.parse(sql('select public.read_annual_conference_attendance_counter(2026)'));

  assert.deepEqual(read(), { count: 20, source: 'ticket_count', baseline: 20, purchases: 0 });
  sql(`
    insert into public.annual_conference_ticket_orders values
      ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000026','paid','live',5),
      ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000026','paid','live',3),
      ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000026','paid','test',5),
      ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000026','pending_payment','live',5),
      ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000026','expired','live',5),
      ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000026','refunded','live',5),
      ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000027','paid','live',5);
    insert into public.annual_conference_flexible_ticket_refunds values
      ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','refunded'),
      ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','refunded'),
      ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003','requested');
  `);
  assert.equal(read().count, 26);
  assert.equal(read().count, 26, 'repeated reads must not increment the count');
  sql("update public.annual_conference_flexible_ticket_refunds set status = 'refunded' where status = 'requested'");
  assert.equal(read().count, 25);
  sql("update public.annual_conference_ticket_orders set status = 'paid' where id = '10000000-0000-0000-0000-000000000004'");
  assert.equal(read().count, 30, 'recovered payment appears once when fulfilled');
  assert.equal(sql('select public.read_annual_conference_attendance_counter(2099) is null'), 't');
  assert.throws(() => sql("select public.configure_annual_conference_attendance_counter(2026, 'actual', 1)"), /attendance_counter_automatic/);
  console.log('Automatic ticket counter PostgreSQL checks passed');
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
