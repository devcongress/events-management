import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
let tempRoot: string;

async function importTalksStore() {
  vi.resetModules();
  return import('./talks');
}

function talkFields() {
  return {
    event_id: 'event-july',
    speaker_name: 'Ama Builder',
    speaker_email: 'ama@example.com',
    github_username: null,
    title: 'A useful archive item',
    topic: 'Product Engineering',
    abstract: 'A concise description.',
    bio: 'Community builder.',
    slides_url: null,
    slides_type: null,
    storage_path: null,
    slides_uploaded_at: null,
  } as const;
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-talks-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('talk archive-item compatibility', () => {
  it('defaults legacy records without a discriminator to talk', async () => {
    const legacyTalk = {
      ...talkFields(),
      id: 'legacy-talk',
      status: 'published',
      reminder_sent_count: 0,
      last_reminder_sent_at: null,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };
    await fs.writeFile(
      path.join(tempRoot, 'data', 'talks.json'),
      JSON.stringify([legacyTalk]),
      'utf-8',
    );

    const { getAllTalks, getTalkById } = await importTalksStore();

    await expect(getAllTalks()).resolves.toEqual([
      expect.objectContaining({ id: 'legacy-talk', kind: 'talk' }),
    ]);
    await expect(getTalkById('legacy-talk')).resolves.toEqual(
      expect.objectContaining({ kind: 'talk' }),
    );
  });

  it('persists an explicit product demo discriminator on new records', async () => {
    const { createTalk } = await importTalksStore();

    const created = await createTalk({
      ...talkFields(),
      kind: 'product_demo',
    });

    expect(created.kind).toBe('product_demo');
    await expect(fs.readFile(path.join(tempRoot, 'data', 'talks.json'), 'utf-8'))
      .resolves.toContain('"kind": "product_demo"');
  });

  it('serializes duplicate archive creation so concurrent retries cannot create two records', async () => {
    const { createTalk, getAllTalks } = await importTalksStore();
    const input = {
      ...talkFields(),
      kind: 'product_demo' as const,
    };

    const results = await Promise.allSettled([
      createTalk(input),
      createTalk(input),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(getAllTalks()).resolves.toHaveLength(1);
  });
});
