import fs from 'fs/promises';
import path from 'path';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from '@/lib/supabase/server';
import type { Json } from '@/types/supabase';
import { envValue } from '@/server/env';

const DATA_DIR = path.join(process.cwd(), 'data');
const SHARED_DOCUMENT_FILES = new Set([
  'event-attendance-imports',
  'event-checklists',
  'speakers',
  'talks',
  'users',
  'volunteer-applications',
]);

// Serializes writes inside this process; file-level atomic rename handles partial-write safety.
const writeQueues: Map<string, Promise<void>> = new Map();

async function enqueueWrite<T>(filename: string, fn: () => Promise<T>): Promise<T> {
  const queue = writeQueues.get(filename) || Promise.resolve();

  const nextPromise = queue.then(fn, fn);
  writeQueues.set(filename, nextPromise.then(() => {}, () => {}));

  return nextPromise;
}

export async function readData<T>(filename: string): Promise<T[]> {
  const remote = await readRemoteData<T>(filename);
  if (remote) return remote.data;

  return readDataFile<T>(filename);
}

export async function writeData<T>(filename: string, data: T[]): Promise<void> {
  return enqueueWrite(filename, async () => {
    const remote = await readRemoteData<T>(filename);
    if (remote && await writeRemoteData(filename, data, remote.version)) return;
    await writeDataFile(filename, data);
  });
}

export async function updateData<T, R>(
  filename: string,
  fn: (data: T[]) => Promise<{ data: T[]; result: R }> | { data: T[]; result: R },
): Promise<R> {
  return enqueueWrite(filename, async () => {
    const remote = await readRemoteData<T>(filename);
    const current = remote?.data ?? await readDataFile<T>(filename);
    const { data, result } = await fn(current);
    if (!await writeRemoteData(filename, data, remote?.version)) {
      await writeDataFile(filename, data);
    }
    return result;
  });
}

interface SharedDocument<T> {
  data: T[];
  version: number;
}

export class SharedDocumentConflictError extends Error {
  constructor(filename: string) {
    super(`Shared ${filename} data changed before this update could be saved. Refresh and retry.`);
    this.name = 'SharedDocumentConflictError';
  }
}

async function readRemoteData<T>(filename: string): Promise<SharedDocument<T> | null> {
  if (!canUseRemoteDocument(filename)) return null;

  const { data, error } = await getSupabaseAdminClient()
    .from('app_json_documents')
    .select('data, version')
    .eq('key', filename)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to read shared ${filename} data`);
  }
  if (!data) {
    if (envValue('NODE_ENV') === 'production') return { data: [], version: 0 };

    const localData = await readDataFile<T>(filename);
    if (localData.length > 0) {
      await writeRemoteData(filename, localData, 0);
    }
    return { data: localData, version: localData.length > 0 ? 1 : 0 };
  }

  if (!Array.isArray(data.data)) {
    throw new Error(`Shared ${filename} data must contain an array`);
  }

  return { data: data.data as T[], version: data.version };
}

async function writeRemoteData<T>(filename: string, data: T[], expectedVersion?: number): Promise<boolean> {
  if (!canUseRemoteDocument(filename)) return false;

  if (expectedVersion === undefined) {
    throw new Error(`Shared ${filename} writes require a document version. Use updateData for read-modify-write operations.`);
  }

  const { error } = await getSupabaseAdminClient().rpc('replace_app_json_document', {
    p_key: filename,
    p_expected_version: expectedVersion,
    p_data: data as Json[],
  });

  if (error) {
    if (error.message.includes('shared_document_conflict')) throw new SharedDocumentConflictError(filename);
    throw new Error(`Unable to write shared ${filename} data`);
  }

  return true;
}

function canUseRemoteDocument(filename: string): boolean {
  return SHARED_DOCUMENT_FILES.has(filename) && isSupabaseRuntimeEnabled();
}

async function readDataFile<T>(filename: string): Promise<T[]> {
  const filePath = path.join(DATA_DIR, `${filename}.json`);

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error(`Data file ${filePath} must contain a JSON array`);
    }

    return parsed as T[];
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }

    throw error instanceof Error
      ? new Error(`Unable to read data file ${filePath}: ${error.message}`)
      : new Error(`Unable to read data file ${filePath}`);
  }
}

async function writeDataFile<T>(filename: string, data: T[]): Promise<void> {
  const filePath = path.join(DATA_DIR, `${filename}.json`);
  const tempPath = `${filePath}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
