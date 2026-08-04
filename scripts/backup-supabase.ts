import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants, existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFile } from 'node:process';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BUCKETS = ['meetup-media'];
const DATABASE_DUMPS = [
  { name: 'roles.sql', args: ['--role-only'], optionalSchema: false },
  { name: 'schema.sql', args: [], optionalSchema: false },
  {
    name: 'data.sql',
    args: [
      '--data-only',
      '--use-copy',
      '--exclude',
      'storage.buckets_vectors',
      '--exclude',
      'storage.vector_indexes',
    ],
    optionalSchema: false,
  },
  {
    name: 'migration-history-schema.sql',
    args: ['--schema', 'supabase_migrations'],
    optionalSchema: true,
  },
  {
    name: 'migration-history-data.sql',
    args: ['--data-only', '--use-copy', '--schema', 'supabase_migrations'],
    optionalSchema: true,
  },
] as const;

type BackupArguments = {
  help: boolean;
  preflight: boolean;
};

type BackupConfig = {
  ageRecipient: string;
  buckets: string[];
  databaseUrl: string;
  outputDirectory: string;
  serviceRoleKey: string;
  storageConcurrency: number;
  supabaseUrl: string;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

type ManifestFile = {
  path: string;
  sha256: string;
  size: number;
};

type DatabaseSummary = {
  dumps: string[];
  migrationHistory: 'included' | 'not-present';
};

type StorageSummary = {
  bucket: string;
  bytes: number;
  objects: number;
};

export function parseBackupArguments(args: string[]): BackupArguments {
  let help = false;
  let preflight = false;

  for (const argument of args) {
    if (argument === '--') continue;
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (argument === '--preflight') {
      preflight = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { help, preflight };
}

export function parseBucketNames(value: string | undefined): string[] {
  const buckets = value
    ?.split(',')
    .map((bucket) => bucket.trim())
    .filter(Boolean) ?? DEFAULT_BUCKETS;

  if (buckets.length === 0) throw new Error('SUPABASE_BACKUP_BUCKETS must include at least one bucket.');

  const uniqueBuckets = [...new Set(buckets)];
  for (const bucket of uniqueBuckets) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(bucket)) {
      throw new Error(`Invalid Supabase Storage bucket name: ${bucket}`);
    }
  }
  return uniqueBuckets;
}

export function isPathInside(parent: string, candidate: string): boolean {
  const pathFromParent = relative(resolve(parent), resolve(candidate));
  return pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..' && !isAbsolute(pathFromParent));
}

export function safeStorageDestination(bucketRoot: string, objectPath: string): string {
  const segments = objectPath.split('/');
  if (
    segments.length === 0
    || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\0'))
  ) {
    throw new Error(`Unsafe Storage object path: ${objectPath}`);
  }

  const destination = resolve(bucketRoot, ...segments);
  if (!isPathInside(bucketRoot, destination) || destination === resolve(bucketRoot)) {
    throw new Error(`Storage object escapes its bucket directory: ${objectPath}`);
  }
  return destination;
}

export function isMissingSchemaDumpError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('pg_dump: error: no matching schemas were found');
}

export function assertMatchingSupabaseProject(supabaseUrl: URL, databaseUrl: URL): void {
  const apiMatch = supabaseUrl.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
  const poolerUserMatch = decodeURIComponent(databaseUrl.username).match(/^postgres\.([a-z0-9]+)$/i);
  const directHostMatch = databaseUrl.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  const apiProjectRef = apiMatch?.[1];
  const databaseProjectRef = poolerUserMatch?.[1] ?? directHostMatch?.[1];

  if (!apiProjectRef || !databaseProjectRef) {
    throw new Error('Unable to derive matching Supabase project references from VITE_SUPABASE_URL and SUPABASE_DB_URL.');
  }
  if (apiProjectRef !== databaseProjectRef) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_DB_URL point to different Supabase projects.');
  }
}

function printHelp() {
  console.log(`Create an encrypted Supabase database and Storage backup.

Usage:
  pnpm backup:supabase:check
  pnpm backup:supabase

The command loads .env.local and .env.backup.local when present. Existing shell
environment variables take precedence.

Required environment variables:
  SUPABASE_DB_URL                    Percent-encoded Session Pooler database URL
  VITE_SUPABASE_URL                 Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY         Server-only key used to download Storage files
  SUPABASE_BACKUP_DIR               Absolute destination outside this repository
  SUPABASE_BACKUP_AGE_RECIPIENT     Public age recipient used for encryption

Optional environment variables:
  SUPABASE_BACKUP_BUCKETS           Comma-separated buckets (default: meetup-media)
  SUPABASE_BACKUP_STORAGE_CONCURRENCY  Parallel Storage downloads, 1-16 (default: 4)

The final artifact is a .tar.gz.age archive. Plaintext staging files are removed
after success and also cleaned up when a backup step fails.`);
}

function loadLocalEnvironment() {
  for (const filename of ['.env.local', '.env.backup.local']) {
    const environmentPath = resolve(REPO_ROOT, filename);
    if (existsSync(environmentPath) && (statSync(environmentPath).mode & 0o077) !== 0) {
      throw new Error(`${filename} contains secrets and must use file mode 600.`);
    }
    try {
      loadEnvFile(environmentPath);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 'ENOENT') throw error;
    }
  }
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function loadConfig(): BackupConfig {
  const databaseUrl = requireEnvironment('SUPABASE_DB_URL');
  const supabaseUrl = requireEnvironment('VITE_SUPABASE_URL');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const outputDirectory = requireEnvironment('SUPABASE_BACKUP_DIR');
  const ageRecipient = requireEnvironment('SUPABASE_BACKUP_AGE_RECIPIENT');
  const storageConcurrencyValue = process.env.SUPABASE_BACKUP_STORAGE_CONCURRENCY?.trim() || '4';
  const storageConcurrency = Number(storageConcurrencyValue);

  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('SUPABASE_DB_URL must be a valid, percent-encoded PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error('SUPABASE_DB_URL must use the postgres:// or postgresql:// protocol.');
  }
  if (!parsedDatabaseUrl.username || !parsedDatabaseUrl.password || !parsedDatabaseUrl.hostname) {
    throw new Error('SUPABASE_DB_URL must include the database user, password, and hostname.');
  }

  let parsedSupabaseUrl: URL;
  try {
    parsedSupabaseUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('VITE_SUPABASE_URL must be a valid URL.');
  }
  if (parsedSupabaseUrl.protocol !== 'https:') {
    throw new Error('VITE_SUPABASE_URL must use HTTPS for a production backup.');
  }
  assertMatchingSupabaseProject(parsedSupabaseUrl, parsedDatabaseUrl);
  if (!isAbsolute(outputDirectory)) {
    throw new Error('SUPABASE_BACKUP_DIR must be an absolute path outside this repository.');
  }
  if (isPathInside(REPO_ROOT, outputDirectory)) {
    throw new Error('SUPABASE_BACKUP_DIR must not be this repository or one of its subdirectories.');
  }
  if (!/^(age1|age1pq1|ssh-)/.test(ageRecipient)) {
    throw new Error('SUPABASE_BACKUP_AGE_RECIPIENT must be an age or SSH public recipient.');
  }
  if (!Number.isInteger(storageConcurrency) || storageConcurrency < 1 || storageConcurrency > 16) {
    throw new Error('SUPABASE_BACKUP_STORAGE_CONCURRENCY must be an integer from 1 to 16.');
  }

  return {
    ageRecipient,
    buckets: parseBucketNames(process.env.SUPABASE_BACKUP_BUCKETS),
    databaseUrl,
    outputDirectory,
    serviceRoleKey,
    storageConcurrency,
    supabaseUrl: parsedSupabaseUrl.toString().replace(/\/$/, ''),
  };
}

function redact(value: string, secrets: string[]): string {
  return secrets.reduce((result, secret) => secret ? result.split(secret).join('[REDACTED]') : result, value);
}

async function runCommand(command: string, args: string[], secrets: string[] = []): Promise<CommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', rejectCommand);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolveCommand({ stdout, stderr });
        return;
      }
      const details = redact([stderr, stdout].filter(Boolean).join('\n').trim(), secrets);
      rejectCommand(new Error(`${command} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}${details ? `:\n${details}` : '.'}`));
    });
  });
}

async function checkDependencies(config: BackupConfig) {
  const secrets = [config.databaseUrl, new URL(config.databaseUrl).password, config.serviceRoleKey];
  const supabase = await runCommand('supabase', ['--version'], secrets);
  const docker = await runCommand('docker', ['version', '--format', '{{.Server.Version}}'], secrets);
  const age = await runCommand('age', ['--version'], secrets);
  await runCommand('tar', ['--version'], secrets);

  if (!docker.stdout.trim()) throw new Error('Docker/OrbStack is installed but its container runtime is not available.');

  console.log(`Supabase CLI: ${supabase.stdout.trim()}`);
  console.log(`Container runtime: ${docker.stdout.trim()}`);
  console.log(`age: ${age.stdout.trim()}`);
  console.log(`Project: ${new URL(config.supabaseUrl).host}`);
  console.log(`Database host: ${new URL(config.databaseUrl).hostname}`);
  console.log(`Storage buckets: ${config.buckets.join(', ')}`);
  console.log(`Encrypted output: ${config.outputDirectory}`);
}

async function dumpDatabase(config: BackupConfig, databaseDirectory: string): Promise<DatabaseSummary> {
  await mkdir(databaseDirectory, { recursive: true, mode: 0o700 });
  const databasePassword = new URL(config.databaseUrl).password;
  const completedDumps: string[] = [];
  let migrationHistory: DatabaseSummary['migrationHistory'] = 'included';

  for (const dump of DATABASE_DUMPS) {
    if (dump.optionalSchema && migrationHistory === 'not-present') continue;
    console.log(`Database: creating ${dump.name}`);
    try {
      await runCommand('supabase', [
        'db',
        'dump',
        '--db-url',
        config.databaseUrl,
        '--file',
        join(databaseDirectory, dump.name),
        ...dump.args,
      ], [config.databaseUrl, databasePassword, config.serviceRoleKey]);
      completedDumps.push(`database/${dump.name}`);
    } catch (error) {
      if (!dump.optionalSchema || !isMissingSchemaDumpError(error)) throw error;
      migrationHistory = 'not-present';
      console.log('Database: supabase_migrations is not present; recording that state and continuing');
      const markerName = 'migration-history.json';
      await writeFile(join(databaseDirectory, markerName), `${JSON.stringify({
        status: 'not-present',
        schema: 'supabase_migrations',
        explanation: 'The source database does not contain Supabase CLI migration history.',
      }, null, 2)}\n`, { mode: 0o600 });
      completedDumps.push(`database/${markerName}`);
    }
  }

  return { dumps: completedDumps, migrationHistory };
}

async function listStorageObjects(client: SupabaseClient, bucket: string): Promise<string[]> {
  const objects: string[] = [];
  const pageSize = 100;

  async function visit(prefix: string): Promise<void> {
    for (let offset = 0; ; offset += pageSize) {
      const result = await client.storage.from(bucket).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (result.error) {
        throw new Error(`Unable to list Storage bucket ${bucket}${prefix ? ` at ${prefix}` : ''}: ${result.error.message}`);
      }

      for (const entry of result.data) {
        const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.id === null) await visit(objectPath);
        else objects.push(objectPath);
      }

      if (result.data.length < pageSize) break;
    }
  }

  await visit('');
  return objects.sort();
}

async function downloadStorageBucket(
  client: SupabaseClient,
  bucket: string,
  storageDirectory: string,
  concurrency: number,
): Promise<StorageSummary> {
  const bucketRoot = join(storageDirectory, bucket);
  await mkdir(bucketRoot, { recursive: true, mode: 0o700 });
  const objectPaths = await listStorageObjects(client, bucket);
  let nextIndex = 0;
  let downloadedBytes = 0;

  async function worker() {
    while (nextIndex < objectPaths.length) {
      const objectPath = objectPaths[nextIndex];
      nextIndex += 1;
      const result = await client.storage.from(bucket).download(objectPath);
      if (result.error) throw new Error(`Unable to download ${bucket}/${objectPath}: ${result.error.message}`);

      const destination = safeStorageDestination(bucketRoot, objectPath);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      const bytes = Buffer.from(await result.data.arrayBuffer());
      await writeFile(destination, bytes, { mode: 0o600 });
      downloadedBytes += bytes.byteLength;
    }
  }

  const workerResults = await Promise.allSettled(Array.from(
    { length: Math.min(concurrency, Math.max(objectPaths.length, 1)) },
    () => worker(),
  ));
  const failedWorker = workerResults.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failedWorker) throw failedWorker.reason;

  return { bucket, bytes: downloadedBytes, objects: objectPaths.length };
}

async function downloadStorage(config: BackupConfig, storageDirectory: string): Promise<StorageSummary[]> {
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const summaries: StorageSummary[] = [];

  for (const bucket of config.buckets) {
    console.log(`Storage: downloading ${bucket}`);
    const summary = await downloadStorageBucket(
      client,
      bucket,
      storageDirectory,
      config.storageConcurrency,
    );
    summaries.push(summary);
    console.log(`Storage: ${bucket} — ${summary.objects} objects, ${summary.bytes} bytes`);
  }
  return summaries;
}

async function sha256File(filename: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectHash);
    stream.on('end', resolveHash);
  });
  return hash.digest('hex');
}

async function inventoryFiles(root: string): Promise<ManifestFile[]> {
  const files: ManifestFile[] = [];

  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const filename = join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) {
        const details = await stat(filename);
        files.push({
          path: relative(root, filename).split(sep).join('/'),
          sha256: await sha256File(filename),
          size: details.size,
        });
      }
    }
  }

  await visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function createManifest(
  config: BackupConfig,
  stagingDirectory: string,
  createdAt: string,
  database: DatabaseSummary,
  storage: StorageSummary[],
) {
  const gitResult = await runCommand('git', ['rev-parse', 'HEAD']);
  const supabaseResult = await runCommand('supabase', ['--version']);
  const files = await inventoryFiles(stagingDirectory);
  const manifest = {
    formatVersion: 1,
    createdAt,
    projectHost: new URL(config.supabaseUrl).host,
    databaseHost: new URL(config.databaseUrl).hostname,
    gitCommit: gitResult.stdout.trim(),
    supabaseCliVersion: supabaseResult.stdout.trim(),
    consistency: 'Logical backup; database dump components and Storage objects are captured sequentially.',
    database,
    storage,
    files,
  };
  await writeFile(
    join(stagingDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function backupTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function executeBackup(config: BackupConfig) {
  await mkdir(config.outputDirectory, { recursive: true, mode: 0o700 });
  const outputRoot = await realpath(config.outputDirectory);
  await chmod(outputRoot, 0o700);
  const repositoryRoot = await realpath(REPO_ROOT);
  if (isPathInside(repositoryRoot, outputRoot)) {
    throw new Error('The resolved backup destination is inside the repository. Choose a private external directory.');
  }

  const createdAt = new Date().toISOString();
  const timestamp = backupTimestamp(new Date(createdAt));
  const stagingDirectory = await mkdtemp(join(outputRoot, `.supabase-${timestamp}-`));
  const temporaryArchive = join(outputRoot, `.supabase-${timestamp}-${randomUUID()}.tar.gz`);
  const temporaryEncryptedArchive = `${temporaryArchive}.age`;
  const finalArchive = join(outputRoot, `events-management-supabase-${timestamp}.tar.gz.age`);
  let completed = false;

  try {
    await chmod(stagingDirectory, 0o700);
    const database = await dumpDatabase(config, join(stagingDirectory, 'database'));
    const storage = await downloadStorage(config, join(stagingDirectory, 'storage'));
    await createManifest(config, stagingDirectory, createdAt, database, storage);

    console.log('Archive: packaging plaintext staging data');
    await runCommand('tar', ['-czf', temporaryArchive, '-C', stagingDirectory, '.']);
    await chmod(temporaryArchive, 0o600);

    console.log('Archive: encrypting with age');
    await runCommand('age', [
      '--recipient',
      config.ageRecipient,
      '--output',
      temporaryEncryptedArchive,
      temporaryArchive,
    ]);
    await chmod(temporaryEncryptedArchive, 0o600);
    await access(finalArchive, constants.F_OK)
      .then(() => { throw new Error(`Backup archive already exists: ${finalArchive}`); })
      .catch((error) => {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code !== 'ENOENT') throw error;
      });
    await rename(temporaryEncryptedArchive, finalArchive);
    completed = true;
    console.log(`Backup complete: ${finalArchive}`);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
    await rm(temporaryArchive, { force: true });
    if (!completed) await rm(temporaryEncryptedArchive, { force: true });
  }
}

async function main() {
  const args = parseBackupArguments(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  loadLocalEnvironment();
  const config = loadConfig();
  await checkDependencies(config);
  if (args.preflight) {
    console.log('Preflight passed. No backup data was read or written.');
    return;
  }

  await executeBackup(config);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? `Backup failed: ${error.message}` : 'Backup failed.');
    process.exitCode = 1;
  });
}
