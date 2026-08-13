import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_EVENT_COLLECTION_LIMIT } from '@/lib/public-api-policy';

const originalCwd = process.cwd();
let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-public-api-policy-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  const events = Array.from({ length: PUBLIC_EVENT_COLLECTION_LIMIT + 25 }, (_, index) => ({
    id: `event-${index}`,
    slug: `event-${index}`,
    name: `Published event ${index}`,
    description: 'A published event.',
    event_date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    end_date: new Date(Date.UTC(2026, 0, 1 + index, 2)).toISOString(),
    status: 'upcoming',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    publish_to_website: true,
    publication_status: 'published',
    ownership: 'devcongress',
    submission_source: 'internal',
  }));
  await fs.writeFile(path.join('data', 'events.json'), JSON.stringify(events), 'utf-8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('public API resource policy', () => {
  it('bounds collection responses and marks them for short edge caching', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('http://localhost/api/public/events');
    const payload = await response.json() as { data: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(PUBLIC_EVENT_COLLECTION_LIMIT);
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
    expect(response.headers.get('cache-control')).toContain('stale-while-revalidate=600');
  });
});
