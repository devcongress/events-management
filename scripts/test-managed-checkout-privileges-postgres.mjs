// The imported fixture permits only disposable local PostgreSQL sockets.
import './test-managed-ticket-email-postgres.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sql = (query) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], {
  input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
}).trim();
const tables = [
  'annual_conference_ticketing_settings',
  'annual_conference_ticket_orders',
  'annual_conference_ticket_payment_attempts',
  'annual_conference_ticket_email_outbox',
];
const functionSignature = 'public.claim_annual_conference_social_card_email_outbox(uuid,integer)';
const migration = readFileSync(new URL('../supabase/migrations/20261028120000_managed_checkout_privileges.sql', import.meta.url), 'utf8');
const relationList = tables.map((table) => `'${table}'`).join(',');
const rows = () => sql(`select jsonb_object_agg(name, records) from (
  ${tables.map((table) => `select '${table}' as name, jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) as records
    from public.${table} t`).join(' union all ')}
) snapshots`);
const version = () => sql('select checkout_settings_version from public.annual_conference_ticketing_settings order by edition_id');
const functionBody = () => sql(`select md5(prosrc) from pg_proc where oid = '${functionSignature}'::regprocedure`);
const aclSnapshot = () => sql(`select jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_object('name', c.relname, 'rls', c.relrowsecurity,
    'acl', (select jsonb_agg(to_jsonb(a) order by a.grantor, a.grantee, a.privilege_type)
      from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a),
    'columns', (select jsonb_agg(jsonb_build_object('name', att.attname,
      'acl', (select jsonb_agg(to_jsonb(a) order by a.grantor, a.grantee, a.privilege_type)
        from aclexplode(att.attacl) a)) order by att.attnum)
      from pg_attribute att where att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped))
    order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (${relationList})),
  'function', (select jsonb_agg(to_jsonb(a) order by a.grantor, a.grantee, a.privilege_type)
    from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = '${functionSignature}'::regprocedure))`);
const originalRows = rows();
const originalVersion = version();
const originalBody = functionBody();

assert.equal(sql(`select has_function_privilege('anon', '${functionSignature}', 'EXECUTE')`), 'f',
  'historical fixture inherits the production private function ACL');

// Reproduce broad default ACLs and explicit column grants independently. The
// latter must survive a table-only REVOKE, so this tests both layers of repair.
for (const table of tables) {
  const column = sql(`select attname from pg_attribute
    where attrelid = 'public.${table}'::regclass and attnum > 0 and not attisdropped order by attnum limit 1`);

  sql(`grant truncate, references, trigger on table public.${table} to public, anon, authenticated;
    grant all privileges (${column}) on table public.${table} to public, anon, authenticated;
    grant delete, trigger on table public.${table} to service_role;
    alter table public.${table} disable row level security;`);

  for (const role of ['anon', 'authenticated']) {
    assert.equal(sql(`select has_table_privilege('${role}', 'public.${table}', 'TRUNCATE')`), 't');
    assert.equal(sql(`select has_column_privilege('${role}', 'public.${table}', '${column}', 'UPDATE')`), 't');
  }
}

sql(`revoke update on table public.annual_conference_ticket_payment_attempts from service_role;
  grant execute on function ${functionSignature} to public, anon, authenticated;`);

// A direct REVOKE must never silently leave inherited client access behind.
// Both inherited table access and inherited function execution abort all ACL,
// service-grant and RLS changes, without editing memberships or unrelated ACLs.
const inheritedRole = `managed_checkout_privilege_fixture_${process.pid}`;

sql(`create role ${inheritedRole}; grant ${inheritedRole} to anon;`);

for (const kind of ['table', 'function']) {
  const grant = kind === 'table'
    ? `select on table public.annual_conference_ticket_orders`
    : `execute on function ${functionSignature}`;

  sql(`grant ${grant} to ${inheritedRole};`);
  const beforeFailure = aclSnapshot();
  const expectedError = kind === 'table'
    ? /managed_checkout_client_privileges_remain/
    : /managed_checkout_client_function_privilege_remains/;

  assert.throws(() => sql(migration), expectedError, `${kind}: inherited privilege aborts migration`);
  assert.equal(aclSnapshot(), beforeFailure, `${kind}: failed migration rolls back every ACL and RLS change`);
  assert.equal(rows(), originalRows);
  assert.equal(version(), originalVersion);
  assert.equal(functionBody(), originalBody);
  assert.equal(sql(`select pg_has_role('anon', '${inheritedRole}', 'MEMBER')`), 't');
  sql(`revoke ${grant} from ${inheritedRole};`);
}

sql(`revoke ${inheritedRole} from anon; drop role ${inheritedRole};`);
sql(migration);

for (const table of tables) {
  assert.equal(sql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`), 't');

  for (const role of ['anon', 'authenticated']) {
    assert.equal(sql(`select has_table_privilege('${role}', 'public.${table}',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`), 'f');
    assert.equal(sql(`select has_any_column_privilege('${role}', 'public.${table}', 'SELECT,INSERT,UPDATE,REFERENCES')`), 'f');
  }

  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRIGGER']) {
    assert.equal(sql(`select has_table_privilege('service_role', 'public.${table}', '${privilege}')`), 't',
      `${table}: required and pre-existing service ${privilege} preserved`);
  }
}

for (const role of ['anon', 'authenticated']) {
  assert.equal(sql(`select has_function_privilege('${role}', '${functionSignature}', 'EXECUTE')`), 'f');
}

assert.equal(sql(`select has_function_privilege('service_role', '${functionSignature}', 'EXECUTE')`), 't');
assert.equal(rows(), originalRows, 'all four tables retain every row byte-for-byte');
assert.equal(version(), originalVersion, 'ACL migration does not alter checkout settings versions');
assert.equal(functionBody(), originalBody, 'function ACL repair preserves the applied function body');
const repairedAcl = aclSnapshot();

sql(migration);
assert.equal(aclSnapshot(), repairedAcl, 'second application is idempotent for effective ACLs and RLS');
assert.equal(rows(), originalRows);
assert.equal(version(), originalVersion);
assert.equal(functionBody(), originalBody);

execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';
  import { readCatalog, evaluateCatalog } from './scripts/migrations/catalog.ts';
  const contract = JSON.parse(readFileSync('supabase/migration-verification-contract.json', 'utf8'));
  contract.verified = contract.verified.filter(entry => entry.file.startsWith('20261028'));
  const results = evaluateCatalog(contract, readCatalog(process.env));
  assert.equal(results.length, 3);
  assert.ok(results.every(result => result.status === 'verified'), JSON.stringify(results));
  console.log('Managed checkout: all three final local catalog contracts verified read-only.');
`], { stdio: 'inherit' });
console.log('Managed checkout privileges: dirty PUBLIC/direct/column grants repaired, inherited table/function access aborts atomically, service access preserved, RLS enabled, rows/versions/function body unchanged and replay idempotent.');
