import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ARCHIVE_PATTERN = /^events-management-supabase-(\d{8}T\d{6}Z)\.tar\.gz\.age$/;
const DEFAULT_PREFIX = 'events-management/supabase';

type UploadArguments = {
  archivePath: string;
  prune: boolean;
};

type R2Config = {
  accessKeyId: string;
  accountId: string;
  bucket: string;
  endpoint: string;
  prefix: string;
  secretAccessKey: string;
};

export type BackupObject = {
  key: string;
  timestamp: Date;
};

export type RetentionPlan = {
  deleteKeys: string[];
  keepKeys: string[];
  unrecognizedKeys: string[];
};

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) throw new Error(`${name} is required.`);

  return value;
}

export function parseUploadArguments(args: string[]): UploadArguments {
  const positional: string[] = [];
  let prune = false;

  for (const argument of args) {
    if (argument === '--') continue;
    if (argument === '--prune') {
      prune = true;
      continue;
    }
    if (argument.startsWith('-')) throw new Error(`Unknown argument: ${argument}`);

    positional.push(argument);
  }
  if (positional.length !== 1) {
    throw new Error('Provide exactly one encrypted .tar.gz.age backup archive.');
  }

  return { archivePath: resolve(positional[0]), prune };
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function parseArchiveTimestamp(filename: string): Date | null {
  const match = basename(filename).match(ARCHIVE_PATTERN);

  if (!match) return null;

  const compact = match[1];
  const iso = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}Z`;
  const timestamp = new Date(iso);

  if (Number.isNaN(timestamp.getTime()) || compactTimestamp(timestamp) !== compact) return null;

  return timestamp;
}

export function normalizePrefix(value: string | undefined): string {
  const prefix = value?.trim() || DEFAULT_PREFIX;
  const segments = prefix.split('/');

  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..')
    || prefix.startsWith('/')
    || prefix.endsWith('/')
    || prefix.includes('\\')
    || /[\r\n\0]/.test(prefix)
  ) {
    throw new Error('R2_BACKUP_PREFIX must contain safe, non-empty path segments.');
  }

  return prefix;
}

export function buildObjectKey(prefix: string, archiveName: string): string {
  const timestamp = parseArchiveTimestamp(archiveName);

  if (!timestamp) throw new Error(`Unexpected backup archive name: ${archiveName}`);

  return `${normalizePrefix(prefix)}/${timestamp.getUTCFullYear()}/${String(timestamp.getUTCMonth() + 1).padStart(2, '0')}/${archiveName}`;
}

function isoWeek(date: Date): string {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = thursday.getUTCDay() || 7;

  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);

  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function selectNewestPerPeriod(
  objects: BackupObject[],
  limit: number,
  period: (date: Date) => string,
): string[] {
  const selected = new Map<string, string>();

  for (const object of objects) {
    const periodKey = period(object.timestamp);

    if (!selected.has(periodKey)) selected.set(periodKey, object.key);
    if (selected.size === limit) break;
  }

  return [...selected.values()];
}

export function buildRetentionPlan(keys: string[]): RetentionPlan {
  const recognized: BackupObject[] = [];
  const unrecognizedKeys: string[] = [];

  for (const key of keys) {
    const timestamp = parseArchiveTimestamp(key);

    if (timestamp) recognized.push({ key, timestamp });
    else unrecognizedKeys.push(key);
  }

  recognized.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

  const keep = new Set<string>([
    ...selectNewestPerPeriod(recognized, 7, (date) => date.toISOString().slice(0, 10)),
    ...selectNewestPerPeriod(recognized, 4, isoWeek),
    ...selectNewestPerPeriod(recognized, 12, (date) => date.toISOString().slice(0, 7)),
  ]);

  return {
    deleteKeys: recognized.map((object) => object.key).filter((key) => !keep.has(key)),
    keepKeys: [...keep].sort(),
    unrecognizedKeys: unrecognizedKeys.sort(),
  };
}

function loadConfig(): R2Config {
  const accountId = requireEnvironment('R2_ACCOUNT_ID');
  const bucket = requireEnvironment('R2_BACKUP_BUCKET');
  const accessKeyId = requireEnvironment('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnvironment('R2_SECRET_ACCESS_KEY');

  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('R2_ACCOUNT_ID must be a 32-character hexadecimal account ID.');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('R2_BACKUP_BUCKET must be a valid private R2 bucket name.');

  return {
    accessKeyId,
    accountId,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    prefix: normalizePrefix(process.env.R2_BACKUP_PREFIX),
    secretAccessKey,
  };
}

async function sha256File(filename: string): Promise<{ base64: string; hex: string }> {
  const hash = createHash('sha256');

  await new Promise<void>((resolveHash, rejectHash) => {
    const stream = createReadStream(filename);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectHash);
    stream.on('end', resolveHash);
  });

  const digest = hash.digest();

  return { base64: digest.toString('base64'), hex: digest.toString('hex') };
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { $metadata?: { httpStatusCode?: number }; name?: string };

  return candidate.$metadata?.httpStatusCode === 404 || candidate.name === 'NotFound';
}

async function listBackupKeys(client: S3Client, config: R2Config): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      ContinuationToken: continuationToken,
      Prefix: `${config.prefix}/`,
    }));

    for (const object of result.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function deleteKeys(client: S3Client, bucket: string, keys: string[]): Promise<void> {
  for (let offset = 0; offset < keys.length; offset += 1000) {
    const batch = keys.slice(offset, offset + 1000);
    const result = await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }));

    if (result.Errors?.length) {
      throw new Error(`R2 rejected ${result.Errors.length} retention deletion(s).`);
    }
  }
}

async function uploadArchive(client: S3Client, config: R2Config, archivePath: string): Promise<string> {
  const details = await lstat(archivePath);

  if (!details.isFile() || details.isSymbolicLink()) throw new Error('Backup archive must be a regular file, not a symbolic link.');
  if (details.size === 0) throw new Error('Backup archive is empty.');

  const archiveName = basename(archivePath);
  const timestamp = parseArchiveTimestamp(archiveName);

  if (!timestamp) throw new Error(`Unexpected backup archive name: ${archiveName}`);

  const key = buildObjectKey(config.prefix, archiveName);
  const sha256 = await sha256File(archivePath);

  try {
    const existing = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));

    if (existing.ContentLength === details.size && existing.Metadata?.sha256 === sha256.hex) {
      console.log(`R2 upload already verified: ${key}`);

      return key;
    }

    throw new Error(`R2 object already exists with different content: ${key}`);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  console.log(`R2: uploading ${archiveName} (${details.size} bytes)`);
  await client.send(new PutObjectCommand({
    Body: createReadStream(archivePath),
    Bucket: config.bucket,
    ChecksumSHA256: sha256.base64,
    ContentLength: details.size,
    ContentType: 'application/octet-stream',
    Key: key,
    Metadata: {
      'archive-created-at': timestamp.toISOString(),
      sha256: sha256.hex,
    },
  }));

  const uploaded = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));

  if (uploaded.ContentLength !== details.size || uploaded.Metadata?.sha256 !== sha256.hex) {
    throw new Error(`R2 verification failed for ${key}.`);
  }

  console.log(`R2 upload verified: ${key}`);

  return key;
}

async function main() {
  const args = parseUploadArguments(process.argv.slice(2));
  const config = loadConfig();
  const client = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    region: 'auto',
  });
  const uploadedKey = await uploadArchive(client, config, args.archivePath);

  if (!args.prune) return;

  const keys = await listBackupKeys(client, config);
  const retention = buildRetentionPlan(keys);

  if (!retention.keepKeys.includes(uploadedKey)) {
    throw new Error('Retention plan did not preserve the newly uploaded backup.');
  }
  if (retention.unrecognizedKeys.length > 0) {
    console.log(`R2 retention: leaving ${retention.unrecognizedKeys.length} unrecognized object(s) untouched`);
  }
  if (retention.deleteKeys.length === 0) {
    console.log(`R2 retention: keeping ${retention.keepKeys.length} backup(s); nothing to delete`);

    return;
  }

  await deleteKeys(client, config.bucket, retention.deleteKeys);
  console.log(`R2 retention: kept ${retention.keepKeys.length} backup(s), deleted ${retention.deleteKeys.length}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';

if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? `R2 backup upload failed: ${error.message}` : 'R2 backup upload failed.');
    process.exitCode = 1;
  });
}
