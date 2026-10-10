import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogSchema, CATALOG_SQL, databaseEnvironment, evaluateCatalog, probePasses, readCatalog, type Catalog } from './migrations/catalog';
import { contractSchema, functionDigest, sha256, validateInventory, type Probe } from './migrations/contract';
import { assertCleanGateInputs, previousHook, pushedCommits } from './git-hooks';
import { installHooks } from './install-git-hooks';
import { verificationArguments, verificationInputs } from './verify-supabase-migrations';

const { contract, sources } = verificationInputs();

function fixtureCatalog(): Catalog {
  return {
    readOnly: 'on', historyPresent: false,
    objects: contract.verified.flatMap((migration) => migration.checks.map((check) => {
      if (check.kind === 'function') {
        const sql = sources.find((source) => source.file === migration.file)!.sql;
        const expression = new RegExp(`function\\s+public\\.${check.name}\\s*\\([\\s\\S]*?\\)\\s*returns\\b[\\s\\S]*?\\bas\\s*(\\$\\w*\\$)([\\s\\S]*?)\\1\\s*;`, 'i');
        const body = sql.match(expression)![2];

        return { ...check, body };
      }

      return { ...check, definition: 'contains' in check ? check.contains.join(' ') : undefined, valid: true };
    })),
  };
}

describe('migration contract inventory', () => {
  it('covers the current files with an honest legacy exemption and six reviewed contracts', () => {
    expect(validateInventory(contract, sources)).toEqual([]);
    expect(Object.keys(contract.legacyInventory)).toHaveLength(92);
    expect(contract.verified).toHaveLength(6);
  });

  it('rejects unregistered SQL, changed legacy SQL, missing files and new version collisions', () => {
    expect(validateInventory(contract, [...sources, { file: '20261011120000_new_feature.sql', sql: 'select 1;' }])).toContainEqual(expect.stringContaining('add reviewed verification'));
    expect(validateInventory(contract, sources.map((source, index) => index === 0 ? { ...source, sql: `${source.sql}\n-- changed` } : source)))
      .toContainEqual(expect.stringContaining('SQL changed'));
    expect(validateInventory(contract, sources.slice(1))).toContainEqual(expect.stringContaining('missing migration'));
    expect(validateInventory(contract, [...sources, { file: '20261010120000_collision.sql', sql: 'select 1;' }]))
      .toContainEqual(expect.stringContaining('duplicate migration version'));
  });

  it('cannot hide a new migration in the legacy exemption', () => {
    const amended = structuredClone(contract);

    amended.legacyInventory['20261011120000_hidden.sql'] = sha256('select 1;');
    expect(validateInventory(amended, [...sources, { file: '20261011120000_hidden.sql', sql: 'select 1;' }]))
      .toContainEqual(expect.stringContaining('Legacy baseline changed'));
  });

  it('rejects empty, unsupported, malformed, and duplicated verification entries', () => {
    const empty = structuredClone(contract);

    empty.verified[0].checks = [];
    expect(() => contractSchema.parse(empty)).toThrow();
    expect(() => contractSchema.parse({ ...contract, arbitrarySQL: 'update public.events;' })).toThrow();
    expect(() => contractSchema.parse({ ...contract, verified: [{ ...contract.verified[0], checks: [{ kind: 'sql', sql: 'select 1' }] }] })).toThrow();
    expect(() => contractSchema.parse({ ...contract, verified: [{ ...contract.verified[0], file: '../private.sql' }] })).toThrow();
    expect(validateInventory({ ...contract, verified: [...contract.verified, contract.verified[0]] }, sources))
      .toContainEqual(expect.stringContaining('duplicate contract'));
  });

  it('never accepts arbitrary command-line refs or unsupported flags', () => {
    expect(verificationArguments(['--offline', '--revision', 'a'.repeat(40)])).toEqual({ offline: true, revision: 'a'.repeat(40) });
    expect(() => verificationArguments(['--revision', 'main:secrets'])).toThrow();
    expect(() => verificationArguments(['--execute'])).toThrow();
  });
});

describe('read-only schema verification', () => {
  it('passes a complete synthetic catalog without requiring or inventing ledger history', () => {
    expect(evaluateCatalog(contract, fixtureCatalog()).every((result) => result.status === 'verified')).toBe(true);
    expect(() => catalogSchema.parse({ ...fixtureCatalog(), readOnly: 'off' })).toThrow();
    expect(CATALOG_SQL).toContain('BEGIN READ ONLY;');
    expect(CATALOG_SQL).toContain('ROLLBACK;');
    expect(CATALOG_SQL).toContain("statement_timeout = '15s'");
    expect(CATALOG_SQL).not.toMatch(/INSERT INTO|UPDATE public|DELETE FROM|CREATE FUNCTION|CALL /i);
  });

  it.each(contract.verified.map((migration) => [migration.file]))('blocks a partial or missing %s', (file) => {
    const catalog = fixtureCatalog();
    const migration = contract.verified.find((entry) => entry.file === file)!;
    const probe = migration.checks[0];

    catalog.objects = catalog.objects.filter((object) => !(object.kind === probe.kind && object.name === probe.name && object.schema === probe.schema));
    expect(evaluateCatalog(contract, catalog).find((entry) => entry.file === file)?.status).not.toBe('verified');
  });

  it('catches unchanged object names with wrong types, definitions, security, function bodies or disabled triggers', () => {
    for (const probe of contract.verified.flatMap((migration) => migration.checks)) {
      const catalog = fixtureCatalog();
      const item = catalog.objects.find((object) => object.kind === probe.kind && object.name === probe.name && object.schema === probe.schema
        && (!('table' in probe) || object.table === probe.table))!;

      switch (probe.kind) {
        case 'table': item.private = !probe.private; break;
        case 'column': item.type = 'wrong'; break;
        case 'constraint':
        case 'index': item.definition = 'wrong'; break;
        case 'trigger': item.valid = false; break;
        case 'function': item.body = '-- not the deployed implementation'; break;
      }

      expect(probePasses(probe, catalog), JSON.stringify(probe)).toBe(false);
    }
  });

  it('requires the intended overload, RLS, validated constraints, and correct privilege state', () => {
    const probe = contract.verified.flatMap((entry) => entry.checks).find((check) => check.kind === 'function')!;

    for (const mutation of [{ argumentTypes: 'text' }, { private: false }, { searchPath: 'unsafe' }, { securityDefiner: false }, { serviceExecute: false }, { result: 'text' }, { language: 'sql' }]) {
      const catalog = fixtureCatalog();
      const object = catalog.objects.find((entry) => entry.kind === 'function' && entry.name === probe.name)!;

      Object.assign(object, mutation);
      expect(probePasses(probe, catalog)).toBe(false);
    }

    expect(functionDigest('\r\n begin\r\n end; \r\n')).toBe(functionDigest('begin\n end;'));
  });

  it('rejects missing behavior-critical defaults and same-named trigger functions in another schema', () => {
    const probes = contract.verified.flatMap((entry) => entry.checks);

    for (const probe of probes.filter((check) => check.kind === 'column' && check.defaultExpression !== null)) {
      const catalog = fixtureCatalog();
      const object = catalog.objects.find((item) => item.kind === probe.kind && item.name === probe.name
        && 'table' in probe && item.table === probe.table)!;

      object.defaultExpression = null;
      expect(probePasses(probe, catalog)).toBe(false);
    }

    for (const probe of probes.filter((check) => check.kind === 'trigger')) {
      const catalog = fixtureCatalog();
      const object = catalog.objects.find((item) => item.kind === 'trigger' && item.name === probe.name)!;

      object.functionSchema = 'unrelated';
      expect(probePasses(probe, catalog)).toBe(false);
    }
  });

  it('matches a Supabase project, forces encryption, and does not pass credentials as command arguments', () => {
    const env = databaseEnvironment('postgresql://audit.projectone:password@aws-0-region.pooler.supabase.com/postgres', 'https://projectone.supabase.co');

    expect(env.PGSSLMODE).toBe('require');
    expect(env.PGPASSWORD).toBe('password');
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(() => databaseEnvironment('postgresql://audit.projecttwo:password@aws-0-region.pooler.supabase.com/postgres', 'https://projectone.supabase.co')).toThrow('same Supabase project');
    expect(() => databaseEnvironment('postgresql://audit.projectone:password@evil.example/postgres', 'https://projectone.supabase.co')).toThrow();
    expect(() => databaseEnvironment('postgresql://audit.projectone:password@aws-0-region.pooler.supabase.com/postgres?sslmode=disable', 'https://projectone.supabase.co')).toThrow();
  });

  it('does not expose subprocess connection errors', () => {
    expect(() => readCatalog({ PATH: '/nonexistent', PGPASSWORD: 'never-print-this' })).toThrow('Catalog verification failed');
  });
});

const temporary: string[] = [];

afterEach(() => {
  temporary.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }));
  vi.unstubAllEnvs();
});

function temporaryRepository() {
  const root = mkdtempSync(join(tmpdir(), 'ems-migration-hook-test-'));

  temporary.push(root);
  execFileSync('git', ['init', '--quiet', root]);
  mkdirSync(join(root, '.githooks'));
  writeFileSync(join(root, '.githooks/pre-commit'), '#!/bin/sh\nexit 0\n');
  writeFileSync(join(root, '.githooks/pre-push'), '#!/bin/sh\nexit 0\n');

  return root;
}

describe('migration push hook safeguards', () => {
  it('skips deletions but blocks non-HEAD and malformed pushes', () => {
    const head = 'a'.repeat(40);

    expect(pushedCommits(`refs/heads/test ${head} refs/heads/test ${'b'.repeat(40)}`, head)).toEqual([head]);
    expect(pushedCommits(`(delete) ${'0'.repeat(40)} refs/heads/test ${head}`, head)).toEqual([]);
    expect(() => pushedCommits(`refs/heads/test ${'b'.repeat(40)} refs/heads/test ${head}`, head)).toThrow('checked-out HEAD');
    expect(() => pushedCommits('malformed', head)).toThrow('Invalid pre-push');
  });

  it('composes the inherited hook without overwriting its files and safely uninstalls', () => {
    const root = temporaryRepository();
    const prior = join(root, 'prior');
    const global = join(root, 'global-config');

    mkdirSync(prior);
    writeFileSync(join(prior, 'pre-commit'), '#!/bin/sh\nexit 7\n');
    chmodSync(join(prior, 'pre-commit'), 0o755);
    writeFileSync(global, `[core]\n  hooksPath = ${prior}\n`);
    vi.stubEnv('GIT_CONFIG_GLOBAL', global);
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
    installHooks(root);

    expect(previousHook(root, 'pre-commit')).toBe(join(prior, 'pre-commit'));
    expect(readFileSync(join(prior, 'pre-commit'), 'utf8')).toContain('exit 7');

    // Delegated identity failures still block the operation.
    expect(() => execFileSync(previousHook(root, 'pre-commit')!, ['example'], { cwd: root })).toThrow();

    expect(execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' }).trim()).toBe(join(root, '.githooks'));
    installHooks(root, true);
    expect(execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' }).trim()).toBe(prior);
  });

  it('refuses another local hook override or unsupported inherited hooks', () => {
    const root = temporaryRepository();

    execFileSync('git', ['config', '--local', 'core.hooksPath', 'custom'], { cwd: root });
    expect(() => installHooks(root)).toThrow('refusing to replace');
    execFileSync('git', ['config', '--local', '--unset', 'core.hooksPath'], { cwd: root });

    const prior = join(root, 'prior');
    const global = join(root, 'global-config');

    mkdirSync(prior);
    writeFileSync(join(prior, 'post-checkout'), '#!/bin/sh\n');
    writeFileSync(global, `[core]\n  hooksPath = ${prior}\n`);
    vi.stubEnv('GIT_CONFIG_GLOBAL', global);
    expect(() => installHooks(root)).toThrow('explicit integration');
  });

  it('permits unrelated dirty files but refuses dirty migration-gate inputs', () => {
    const root = temporaryRepository();

    writeFileSync(join(root, 'presentation.txt'), 'unrelated');
    expect(() => assertCleanGateInputs(root)).toThrow(); // Uncommitted hook files are gate inputs.
    execFileSync('git', ['add', '.githooks'], { cwd: root });
    execFileSync('git', ['-c', 'core.hooksPath=/nonexistent', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd: root });
    expect(() => assertCleanGateInputs(root)).not.toThrow();
    writeFileSync(join(root, 'package.json'), '{}');
    expect(() => assertCleanGateInputs(root)).toThrow('Commit migration-gate inputs');
  });

  it('reads migration blobs from the pushed commit, not replacement worktree files', () => {
    const root = temporaryRepository();
    const migration = sources[0];

    mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
    writeFileSync(join(root, 'supabase/migration-verification-contract.json'), JSON.stringify(contract));
    writeFileSync(join(root, 'supabase/migrations', migration.file), migration.sql);
    execFileSync('git', ['add', 'supabase'], { cwd: root });
    execFileSync('git', ['-c', 'core.hooksPath=/nonexistent', '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd: root });

    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

    writeFileSync(join(root, 'supabase/migrations', migration.file), '-- unrelated replacement');
    expect(verificationInputs(revision, root).sources).toEqual([migration]);
    expect(verificationInputs(undefined, root).sources[0].sql).toBe('-- unrelated replacement');
  });

  it('keeps live credentials out of PR CI and guards manual deployment', () => {
    const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const live = readFileSync(new URL('../.github/workflows/supabase-schema-verification.yml', import.meta.url), 'utf8');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

    expect(ci).toContain('pnpm verify:migrations:offline');
    expect(ci).not.toContain('SUPABASE_SCHEMA_AUDIT_DB_URL');
    expect(live).toContain("github.ref == 'refs/heads/main'");
    expect(live).not.toMatch(/pull_request_target|workflow_run|pull_request:/);
    expect(pkg.scripts['deploy:worker']).toBe('pnpm verify:migrations && wrangler deploy');
  });
});
