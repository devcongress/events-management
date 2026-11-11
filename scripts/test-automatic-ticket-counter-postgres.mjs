import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.annual_conference_editions (id uuid primary key, year integer unique);
    create table public.annual_conference_attendance_counters (
      edition_id uuid primary key references public.annual_conference_editions(id),
      source text not null check (source in ('estimate', 'actual')),
      published_at timestamptz not null default now(),
      version integer not null default 1 check (version > 0)
    );
    create table public.annual_conference_ticket_orders (id uuid primary key, edition_id uuid, status text, payment_mode text, quantity integer);
    create table public.annual_conference_flexible_ticket_refunds (order_id uuid, allocation_id uuid unique, status text);
    insert into public.annual_conference_editions values
      ('00000000-0000-0000-0000-000000000026', 2026),
      ('00000000-0000-0000-0000-000000000027', 2027);
    insert into public.annual_conference_attendance_counters (edition_id, source, version) values
      ('00000000-0000-0000-0000-000000000027', 'estimate', 3);
  `);
  sql(readFileSync(new URL('../supabase/migrations/20261109130000_automatic_ticket_counter.sql', import.meta.url), 'utf8'));
  sql(readFileSync(new URL('../supabase/migrations/20261110130000_editable_attendance_baseline.sql', import.meta.url), 'utf8'));
  const contract = JSON.parse(readFileSync(new URL('../supabase/migration-verification-contract.json', import.meta.url), 'utf8'));
  const probes = contract.verified.find((entry) => entry.file === '20261110130000_editable_attendance_baseline.sql').checks;

  for (const probe of probes.filter((check) => check.kind === 'function')) {
    const body = sql(`select prosrc from pg_proc where oid = 'public.${probe.name}(${probe.argumentTypes})'::regprocedure`);
    const digest = createHash('sha256').update(body.trim()).digest('hex');

    assert.equal(digest, probe.bodySha256, `${probe.name} migration contract`);
  }

  assert.equal(sql("select pg_get_constraintdef(oid) from pg_constraint where conname = 'annual_conference_attendance_counters_baseline_nonnegative'"), 'CHECK ((baseline >= 0))');
  assert.equal(sql("select is_nullable || ':' || column_default from information_schema.columns where table_schema = 'public' and table_name = 'annual_conference_attendance_counters' and column_name = 'baseline'"), 'NO:20');
  const readTicket = (year = 2026) => JSON.parse(sql(`select public.read_annual_conference_ticket_counter(${year})`));
  const setBaseline = (year, baseline, version) => JSON.parse(sql(`select public.set_annual_conference_attendance_baseline(${year}, ${baseline}, ${version})`));
  const read = () => JSON.parse(sql('select public.read_annual_conference_attendance_counter(2026)'));

  assert.deepEqual(read(), { count: 20, source: 'ticket_count', baseline: 20, purchases: 0 });
  assert.deepEqual(readTicket(), { count: 20, source: 'ticket_count', baseline: 20, purchases: 0, version: 0 });
  assert.deepEqual(readTicket(2027), { count: 20, source: 'ticket_count', baseline: 20, purchases: 0, version: 3 });
  assert.equal(setBaseline(2027, 9, 3).version, 4);
  assert.equal(sql("select source from public.annual_conference_attendance_counters where edition_id = '00000000-0000-0000-0000-000000000027'"), 'estimate');
  assert.deepEqual(setBaseline(2026, 0, 0), { count: 0, source: 'ticket_count', baseline: 0, purchases: 0, version: 1 });
  assert.equal(sql("select source from public.annual_conference_attendance_counters where edition_id = '00000000-0000-0000-0000-000000000026'"), 'actual');
  assert.throws(() => setBaseline(2026, 8, 0), /attendance_baseline_conflict/);
  assert.throws(() => setBaseline(2026, 8, 2), /attendance_baseline_conflict/);
  assert.throws(() => setBaseline(2026, -1, 1), /attendance_baseline_invalid/);
  assert.throws(() => setBaseline(2026, 'null', 1), /attendance_baseline_invalid/);
  assert.equal(setBaseline(2026, 10, 1).version, 2);
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
  assert.deepEqual(readTicket(), { count: 16, source: 'ticket_count', baseline: 10, purchases: 6, version: 2 });
  assert.equal(read().count, 26, 'repeated reads must not increment the count');
  sql("update public.annual_conference_flexible_ticket_refunds set status = 'refunded' where status = 'requested'");
  assert.equal(read().count, 25);
  assert.equal(readTicket().count, 15);
  sql("update public.annual_conference_ticket_orders set status = 'paid' where id = '10000000-0000-0000-0000-000000000004'");
  assert.equal(read().count, 30, 'recovered payment appears once when fulfilled');
  assert.equal(sql('select public.read_annual_conference_attendance_counter(2099) is null'), 't');
  assert.equal(sql('select public.read_annual_conference_ticket_counter(2099) is null'), 't');
  assert.equal(sql("select has_function_privilege('anon', 'public.read_annual_conference_ticket_counter(integer)', 'execute')"), 'f');
  assert.equal(sql("select has_function_privilege('authenticated', 'public.set_annual_conference_attendance_baseline(integer,integer,integer)', 'execute')"), 'f');
  assert.equal(sql("select has_function_privilege('service_role', 'public.set_annual_conference_attendance_baseline(integer,integer,integer)', 'execute')"), 't');
  assert.throws(() => sql("select public.configure_annual_conference_attendance_counter(2026, 'actual', 1)"), /attendance_counter_automatic/);
  console.log('Automatic ticket counter PostgreSQL checks passed');
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
