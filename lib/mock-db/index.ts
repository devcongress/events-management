import fs from 'fs/promises';
import path from 'path';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import type { Json } from '@/types/supabase';

const DATA_DIR = path.join(process.cwd(), 'data');
const SHARED_DOCUMENT_FILES = new Set([
  'event-attendance-imports',
  'event-checklists',
  'questions',
  'quiz-participants',
  'quiz-sessions',
  'responses',
  'speaker-intake-links',
  'speakers',
  'talks',
  'users',
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
  if (remote) return remote;

  return readDataFile<T>(filename);
}

export async function writeData<T>(filename: string, data: T[]): Promise<void> {
  return enqueueWrite(filename, async () => {
    if (await writeRemoteData(filename, data)) return;
    await writeDataFile(filename, data);
  });
}

export async function updateData<T, R>(
  filename: string,
  fn: (data: T[]) => Promise<{ data: T[]; result: R }> | { data: T[]; result: R },
): Promise<R> {
  return enqueueWrite(filename, async () => {
    const current = await readData<T>(filename);
    const { data, result } = await fn(current);
    if (!await writeRemoteData(filename, data)) {
      await writeDataFile(filename, data);
    }
    return result;
  });
}

async function readRemoteData<T>(filename: string): Promise<T[] | null> {
  if (!canUseRemoteDocument(filename)) return null;

  try {
    const { data, error } = await getSupabaseAdminClient()
      .from('app_json_documents')
      .select('data')
      .eq('key', filename)
      .maybeSingle();

    if (error) return null;
    if (!data) {
      const localData = await readDataFile<T>(filename);
      if (localData.length > 0) {
        await writeRemoteData(filename, localData);
      }
      return localData;
    }

    return Array.isArray(data.data) ? data.data as T[] : [];
  } catch {
    return null;
  }
}

async function writeRemoteData<T>(filename: string, data: T[]): Promise<boolean> {
  if (!canUseRemoteDocument(filename)) return false;

  try {
    const { error } = await getSupabaseAdminClient()
      .from('app_json_documents')
      .upsert({
        key: filename,
        data: data as Json[],
      });

    return !error;
  } catch {
    return false;
  }
}

function canUseRemoteDocument(filename: string): boolean {
  return SHARED_DOCUMENT_FILES.has(filename) && isSupabaseServerConfigured();
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
