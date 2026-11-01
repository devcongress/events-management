import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

// Disposable socket-only database; no external database URL is accepted.
const run = promisify(execFile);
const bindir = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
const directory = mkdtempSync(join(tmpdir(), 'programme-test-'));
const args = ['-h', directory, '-p', '55481', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'];
let started = false;
const sql = async (statement) => (await run(join(bindir, 'psql'), [...args, '-c', statement])).stdout.trim();

try {
  await run(join(bindir, 'initdb'), ['-D', join(directory, 'data'), '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8']);
  await run(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -p 55481 -c listen_addresses=''`, 'start']);
  started = true;
  await sql('create role anon; create role authenticated; create role service_role bypassrls; create table public.annual_conference_editions (id uuid primary key);');
  await run(join(bindir, 'psql'), [...args, '-f', join(process.cwd(), 'supabase/migrations/20261101200000_annual_conference_programme.sql')]);
  const edition = randomUUID();
  const other = randomUUID();

  await sql(`insert into public.annual_conference_editions values ('${edition}'), ('${other}')`);
  const save = (id, revision, rows) => sql(`set role service_role; select public.save_annual_conference_programme('${id}',${revision},'${JSON.stringify(rows)}'::jsonb,'organizer@example.com')`);
  const first = await Promise.all([save(edition, 0, [{ title: 'A' }]), save(edition, 0, [{ title: 'B' }])]);

  assert.equal(first.filter(Boolean).length, 1, 'one concurrent first save wins');
  const second = await Promise.all([save(edition, 1, [{ title: 'C' }]), save(edition, 1, [{ title: 'D' }])]);

  assert.equal(second.filter(Boolean).length, 1, 'one concurrent revision save wins');
  assert.equal(JSON.parse(await save(edition, 2, [])).revision, 3);
  assert.equal(await save(edition, 0, [{ title: 'stale' }]), '');
  assert.equal(await sql(`select revision || ':' || jsonb_array_length(rows) from public.annual_conference_programmes where edition_id='${edition}'`), '3:0');
  assert.equal(JSON.parse(await save(other, 0, [{ title: 'other edition' }])).revision, 1);
  assert.equal(await sql('select count(*) from public.annual_conference_programmes'), '2');
  await assert.rejects(() => sql('set role anon; select * from public.annual_conference_programmes'));
  console.log('PASS programme concurrency, clearing, edition isolation and privileges.');
} finally {
  if (started) await run(join(bindir, 'pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
