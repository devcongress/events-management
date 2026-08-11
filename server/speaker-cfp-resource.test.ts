import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
let tempRoot: string;

const event = {
  id: 'event-august',
  name: 'DevCongress August Meetup',
  description: 'A future community meetup.',
  event_date: '2099-08-29T10:00:00.000Z',
  series_type: 'monthly',
  status: 'cfp_open',
  publish_to_website: true,
  created_at: '2099-07-01T00:00:00.000Z',
  updated_at: '2099-07-01T00:00:00.000Z',
};

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-speaker-cfp-resource-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join(tempRoot, 'data', 'events.json'), JSON.stringify([event]), 'utf-8');
  vi.stubEnv('APP_DATA_SOURCE', 'local-json');
  vi.stubEnv('NODE_ENV', 'test');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('public CFP resource links', () => {
  it('stores a validated HTTPS resource on the proposal', async () => {
    vi.resetModules();
    const app = (await import('./app')).default;

    const response = await app.request('http://localhost/api/cfp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: event.id,
        kind: 'product_demo',
        speaker_name: 'Demo Builder',
        speaker_email: 'builder@example.com',
        title: 'Show the community tool',
        abstract: 'A short live product demonstration for the community.',
        resource_url: ' https://Example.com/demo ',
      }),
    });

    expect(response.status).toBe(202);
    const { getSpeakerSubmissionsByEvent } = await import('../lib/mock-db/speaker-submissions');
    await expect(getSpeakerSubmissionsByEvent(event.id)).resolves.toMatchObject([
      expect.objectContaining({
        kind: 'product_demo',
        resource_url: 'https://example.com/demo',
      }),
    ]);
  });

  it.each([
    'javascript:alert(1)',
    'http://example.com/demo',
    'https://localhost/demo',
  ])('rejects unsafe resource links before persistence: %s', async (resource_url) => {
    vi.resetModules();
    const app = (await import('./app')).default;

    const response = await app.request('http://localhost/api/cfp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: event.id,
        speaker_name: 'Unsafe Link Presenter',
        speaker_email: 'unsafe@example.com',
        title: 'A proposal with an unsafe link',
        abstract: 'A proposal which must reject an unsafe resource link.',
        resource_url,
      }),
    });

    expect(response.status).toBe(400);
    const { getSpeakerSubmissionsByEvent } = await import('../lib/mock-db/speaker-submissions');
    await expect(getSpeakerSubmissionsByEvent(event.id)).resolves.toEqual([]);
  });
});
