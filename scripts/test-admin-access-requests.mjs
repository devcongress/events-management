import { spawnSync } from 'node:child_process';

const expectedHostPrefix = '/tmp/ems-access-postgres.';
const expectedDatabase = 'admin_access_requests_test';
const psql = '/opt/homebrew/opt/postgresql@18/bin/psql';

if (!process.env.PGHOST?.startsWith(expectedHostPrefix) || process.env.PGDATABASE !== expectedDatabase) {
  throw new Error(`Refusing to run outside ${expectedDatabase} on the isolated EMS access-request socket.`);
}

function sql(source) {
  const result = spawnSync(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', source], {
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status !== 0) throw new Error(result.stderr || result.stdout);

  return result.stdout.trim();
}

function migration(path) {
  const result = spawnSync(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-f', path], {
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

function sqlFails(source) {
  const result = spawnSync(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', source], {
    encoding: 'utf8',
    env: process.env,
  });

  return result.status !== 0;
}

function asyncSql(source) {
  return new Promise((resolve, reject) => {
    // Start a distinct psql process for each competing transaction. spawnSync
    // would serialize the lock test, so use the asynchronous child API here.
    import('node:child_process').then(({ spawn }) => {
      const childProcess = spawn(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', source], {
        env: globalThis.process.env,
      });
      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (chunk) => { stdout += chunk; });
      childProcess.stderr.on('data', (chunk) => { stderr += chunk; });
      childProcess.on('error', reject);
      childProcess.on('close', (status) => {
        if (status === 0) resolve(stdout.trim());
        else reject(new Error(stderr || stdout));
      });
    }).catch(reject);
  });
}

sql("do $$ begin create role service_role bypassrls; exception when duplicate_object then alter role service_role bypassrls; end $$; do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$; drop schema public cascade; drop schema if exists auth cascade; create schema public; create extension if not exists pgcrypto; create schema auth; create table auth.users (id uuid primary key);");
sql('grant usage on schema public to anon, authenticated, service_role;');
sql("create type public.admin_role as enum ('owner', 'organizer', 'volunteer'); create type public.admin_membership_status as enum ('active', 'disabled');");
sql('create table public.admin_memberships (id uuid primary key default gen_random_uuid(), email text unique not null, display_name text, role public.admin_role not null, status public.admin_membership_status not null, added_by uuid, last_login_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());');
sql('create table public.admin_sessions (id uuid primary key default gen_random_uuid(), token_hash text unique not null, user_id uuid not null, membership_id uuid not null references public.admin_memberships(id), email text not null, role public.admin_role not null, expires_at timestamptz not null, last_seen_at timestamptz default now(), revoked_at timestamptz, user_agent text, ip_address text);');
sql("create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_user_id uuid, actor_email text, actor_role public.admin_role, action text not null, target_type text, target_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz default now());");
sql('create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;');
migration('supabase/migrations/20260930090000_admin_access_requests.sql');

const owner = '00000000-0000-0000-0000-000000000001';
const requester = '00000000-0000-0000-0000-000000000002';

sql(`insert into auth.users values ('${owner}'), ('${requester}'); insert into public.admin_memberships (id,email,display_name,role,status) values ('10000000-0000-0000-0000-000000000001','owner@example.com','Owner','owner','active'); insert into public.admin_sessions (token_hash,user_id,membership_id,email,role,expires_at) values ('owner-session','${owner}','10000000-0000-0000-0000-000000000001','owner@example.com','owner',now() + interval '1 hour');`);

const requestId = sql(`select id from public.submit_admin_access_request('${requester}', 'candidate@example.com', 'Candidate', 'Help with events');`);

if (!requestId) throw new Error('request was not created');
if (sql(`select count(*) from public.submit_admin_access_request('${requester}', 'candidate@example.com', 'Candidate changed', null);`) !== '1') throw new Error('pending request was not deduplicated');
if (sql(`select status from public.decide_admin_access_request('${requestId}', '${owner}', 'organizer', true);`) !== 'approved') throw new Error('owner approval failed');
if (sql("select role::text from public.admin_memberships where email = 'candidate@example.com';") !== 'organizer') throw new Error('approval did not create membership');
if (sql("select count(*) from public.admin_audit_log where action = 'admin.access_request_approved';") !== '1') throw new Error('approval was not audited');

sql("insert into public.admin_memberships (email,display_name,role,status) values ('disabled@example.com','Disabled','organizer','disabled');");
let disabledRejected = false;

try { sql(`select * from public.submit_admin_access_request('${requester}', 'disabled@example.com', 'Disabled', null);`); } catch { disabledRejected = true; }
if (!disabledRejected) throw new Error('disabled membership was eligible for a request');

const publicExecute = sql("select has_function_privilege('public', 'public.submit_admin_access_request(uuid,text,text,text)', 'execute');");

if (publicExecute !== 'f') throw new Error('public can execute request RPC');
if (!sqlFails("set role anon; select * from public.admin_access_requests;")) throw new Error('anon can read request rows');
if (!sqlFails("set role authenticated; select public.submit_admin_access_request('00000000-0000-0000-0000-000000000002', 'forged@example.com', 'Forged', null);")) throw new Error('authenticated can execute request RPC');
const nonOwner = '00000000-0000-0000-0000-000000000003';
const rollbackUser = '00000000-0000-0000-0000-000000000004';

sql(`insert into auth.users values ('${nonOwner}'); insert into public.admin_memberships (id,email,display_name,role,status) values ('10000000-0000-0000-0000-000000000003','organizer@example.com','Organizer','organizer','active'); insert into public.admin_sessions (token_hash,user_id,membership_id,email,role,expires_at) values ('organizer-session','${nonOwner}','10000000-0000-0000-0000-000000000003','organizer@example.com','organizer',now() + interval '1 hour');`);
const secondRequest = sql(`select id from public.submit_admin_access_request('${requester}', 'second@example.com', 'Second', null);`);

if (!sqlFails(`select * from public.decide_admin_access_request('${secondRequest}', '${nonOwner}', 'organizer', true);`)) throw new Error('non-owner decided a request');
if (!sqlFails(`select * from public.decide_admin_access_request('${secondRequest}', '${owner}', null, true);`)) throw new Error('null role was accepted');
sql(`insert into auth.users values ('${rollbackUser}');`);
const rollbackRequest = sql(`select id from public.submit_admin_access_request('${rollbackUser}', 'rollback@example.com', 'Rollback', null);`);

sql("create function public.reject_access_request_audit() returns trigger language plpgsql as $$ begin if new.action = 'admin.access_request_approved' then raise exception 'audit unavailable'; end if; return new; end $$; create trigger reject_access_request_audit before insert on public.admin_audit_log for each row execute function public.reject_access_request_audit();");
if (!sqlFails(`select * from public.decide_admin_access_request('${rollbackRequest}', '${owner}', 'volunteer', true);`)) throw new Error('approval unexpectedly survived an audit failure');
if (sql(`select status::text from public.admin_access_requests where id = '${rollbackRequest}';`) !== 'pending') throw new Error('audit failure did not roll back request decision');
if (sql("select count(*) from public.admin_memberships where email = 'rollback@example.com';") !== '0') throw new Error('audit failure did not roll back membership');
sql('drop trigger reject_access_request_audit on public.admin_audit_log;');

const concurrentUser = '00000000-0000-0000-0000-000000000005';

sql(`insert into auth.users values ('${concurrentUser}');`);
const concurrentSubmitSql = `select id from public.submit_admin_access_request('${concurrentUser}', 'concurrent@example.com', 'Concurrent', null);`;
const concurrentRequestIds = await Promise.all([asyncSql(concurrentSubmitSql), asyncSql(concurrentSubmitSql)]);

if (concurrentRequestIds[0] !== concurrentRequestIds[1]) throw new Error('concurrent submits created different requests');
if (sql("select count(*) from public.admin_access_requests where email = 'concurrent@example.com';") !== '1') throw new Error('concurrent submits created duplicate requests');

const concurrentApproveSql = `select status::text from public.decide_admin_access_request('${concurrentRequestIds[0]}', '${owner}', 'organizer', true);`;
const approvalResults = await Promise.allSettled([asyncSql(concurrentApproveSql), asyncSql(concurrentApproveSql)]);

if (approvalResults.filter((result) => result.status === 'fulfilled').length !== 1) throw new Error('concurrent approval did not produce exactly one success');
if (sql("select count(*) from public.admin_memberships where email = 'concurrent@example.com';") !== '1') throw new Error('concurrent approval created wrong membership count');
if (sql("select count(*) from public.admin_audit_log where action = 'admin.access_request_approved' and target_id = '" + concurrentRequestIds[0] + "';") !== '1') throw new Error('concurrent approval created wrong audit count');

const activeConflictUser = '00000000-0000-0000-0000-000000000006';
const disabledConflictUser = '00000000-0000-0000-0000-000000000007';

sql(`insert into auth.users values ('${activeConflictUser}'), ('${disabledConflictUser}');`);
const activeConflictRequest = sql(`select id from public.submit_admin_access_request('${activeConflictUser}', 'active-conflict@example.com', 'Active conflict', null);`);
const disabledConflictRequest = sql(`select id from public.submit_admin_access_request('${disabledConflictUser}', 'disabled-conflict@example.com', 'Disabled conflict', null);`);

sql("insert into public.admin_memberships (email,display_name,role,status) values ('active-conflict@example.com','Active','organizer','active'), ('disabled-conflict@example.com','Disabled','organizer','disabled');");
if (!sqlFails(`select * from public.decide_admin_access_request('${activeConflictRequest}', '${owner}', 'volunteer', true);`)) throw new Error('active membership conflict was approved');
if (!sqlFails(`select * from public.decide_admin_access_request('${disabledConflictRequest}', '${owner}', 'volunteer', true);`)) throw new Error('disabled membership conflict was approved');
if (sql(`select status::text from public.admin_access_requests where id = '${activeConflictRequest}';`) !== 'pending') throw new Error('active conflict changed request');
if (sql(`select status::text from public.admin_access_requests where id = '${disabledConflictRequest}';`) !== 'pending') throw new Error('disabled conflict changed request');
console.log('admin access request migration checks passed');
