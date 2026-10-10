import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { contractSchema, validateInventory, type MigrationSource } from './migrations/contract';
import { databaseEnvironment, evaluateCatalog, readCatalog } from './migrations/catalog';
import { MigrationGateError } from './migrations/errors';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = 'supabase/migration-verification-contract.json';

export function verificationArguments(args: string[]) {
  let offline = false;
  let revision: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--offline') offline = true;
    else if (args[index] === '--revision' && /^[a-f0-9]{40}$/.test(args[index + 1] ?? '')) revision = args[++index];
    else throw new MigrationGateError('Usage: verify-supabase-migrations [--offline] [--revision <commit SHA>]');
  }

  return { offline, revision };
}

export function verificationInputs(revision?: string, root = ROOT) {
  const read = (path: string) => revision
    ? execFileSync('git', ['show', `${revision}:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    : readFileSync(resolve(root, path), 'utf8');
  const files = revision
    ? execFileSync('git', ['ls-tree', '-r', '--name-only', revision, '--', 'supabase/migrations'], { cwd: root, encoding: 'utf8' })
      .trim().split('\n').filter((path) => path.endsWith('.sql')).map((path) => path.slice('supabase/migrations/'.length))
    : readdirSync(resolve(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql'));
  const contract = contractSchema.parse(JSON.parse(read(CONTRACT)));
  const sources: MigrationSource[] = files.sort().map((file) => ({ file, sql: read(`supabase/migrations/${file}`) }));

  return { contract, sources };
}

function loadEnvironment() {
  if (process.env.CI) return;

  for (const filename of ['.env.local', '.env.schema-audit.local']) {
    const path = resolve(ROOT, filename);

    if (!existsSync(path)) continue;
    if ((statSync(path).mode & 0o077) !== 0) throw new MigrationGateError(`${filename} must use file mode 600.`);

    loadEnvFile(path);
  }
}

export function verifyMigrations(args: string[]): number {
  const { offline, revision } = verificationArguments(args);
  const { contract, sources } = verificationInputs(revision);
  const problems = validateInventory(contract, sources);

  if (problems.length) {
    problems.forEach((problem) => console.error(problem));

    return 1;
  }

  console.log(`Migration inventory: ${sources.length} files; ${contract.verified.length} explicitly verified contracts.`);
  console.log(`Legacy coverage: ${Object.keys(contract.legacyInventory).length} historical files are hash-inventoried, NOT fully verified.`);
  if (offline) {
    console.log('Offline contract check passed. Target database was NOT checked.');

    return 0;
  }

  loadEnvironment();

  const database = process.env.SUPABASE_SCHEMA_AUDIT_DB_URL || (!process.env.CI ? process.env.SUPABASE_DB_URL : undefined);
  const api = process.env.VITE_SUPABASE_URL;

  if (!database || !api) throw new MigrationGateError('Set SUPABASE_SCHEMA_AUDIT_DB_URL and VITE_SUPABASE_URL. Missing configuration blocks delivery.');

  const catalog = readCatalog(databaseEnvironment(database, api));
  const results = evaluateCatalog(contract, catalog);

  console.log(`Migration history: ${catalog.historyPresent ? 'present' : 'absent; catalog verification only'}. No execution/backfill history is inferred.`);

  for (const result of results) {
    console.log(`${result.status}: ${result.file}`);
    result.missing.forEach((missing) => console.log(`  ${missing}`));
  }

  const failed = results.some((result) => result.status !== 'verified');

  console.log(failed ? 'Delivery blocked. Reconcile the listed schema changes manually, then retry.' : 'Required schema contracts verified; no migrations executed.');

  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = verifyMigrations(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof MigrationGateError ? error.message : 'Migration verification could not complete. Check contract/configuration and database connectivity; raw errors and credentials are not printed.');
    process.exitCode = 1;
  }
}
