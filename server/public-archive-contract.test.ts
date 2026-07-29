import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
let tempRoot: string;

const event = {
  id: 'event-july',
  name: 'DevCongress July Meetup',
  description: 'A community meetup.',
  series_type: null,
  event_date: '2026-07-01T18:00:00.000Z',
  end_date: '2026-07-01T21:00:00.000Z',
  status: 'completed',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
  slug: 'july-meetup',
  publish_to_website: true,
};

const productDemo = {
  id: 'demo-1',
  event_id: event.id,
  kind: 'product_demo',
  speaker_name: 'Ama Builder',
  speaker_email: 'private@example.com',
  github_username: 'private-handle',
  title: 'A useful developer product',
  topic: 'Product Engineering',
  abstract: 'A practical product demonstration.',
  bio: 'Community builder.',
  status: 'published',
  slides_url: 'https://example.com/demo',
  slides_type: 'url',
  storage_path: null,
  slides_uploaded_at: '2026-07-01T20:00:00.000Z',
  reminder_sent_count: 2,
  last_reminder_sent_at: '2026-06-30T00:00:00.000Z',
  created_at: '2026-06-20T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
};

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-public-archive-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
  await fs.writeFile(path.join('data', 'events.json'), JSON.stringify([event]), 'utf-8');
  await fs.writeFile(path.join('data', 'talks.json'), JSON.stringify([productDemo]), 'utf-8');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('public event archive contract', () => {
  it('keeps the historical talks route while returning only the narrow public DTO', async () => {
    const { default: app } = await import('./app');
    const response = await app.request(`/api/public/meetups/${event.id}/talks`);
    const payload = await response.json() as { data: Record<string, unknown>[] };

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({
      id: productDemo.id,
      event_id: event.id,
      event_name: event.name,
      kind: 'product_demo',
      title: productDemo.title,
      speaker_name: productDemo.speaker_name,
    });
    expect(payload.data[0]).not.toHaveProperty('speaker_email');
    expect(payload.data[0]).not.toHaveProperty('github_username');
    expect(payload.data[0]).not.toHaveProperty('status');
    expect(payload.data[0]).not.toHaveProperty('reminder_sent_count');
  });

  it('exposes archive_items as an additive alias of published talks', async () => {
    const { default: app } = await import('./app');
    const response = await app.request('/api/public/archive');
    const payload = await response.json() as {
      events: Record<string, unknown>[];
      talks: Record<string, unknown>[];
      archive_items: Record<string, unknown>[];
    };

    expect(response.status).toBe(200);
    expect(payload.events[0]).toMatchObject({ id: event.id, series_type: null });
    expect(payload.archive_items).toEqual(payload.talks);
    expect(payload.archive_items[0]).toMatchObject({
      kind: 'product_demo',
      event_name: event.name,
    });
  });

  it('removes executable URL schemes from every public meetup link field', async () => {
    await fs.writeFile(path.join('data', 'events.json'), JSON.stringify([{
      ...event,
      cover: 'javascript:alert(1)',
      location: { name: 'Accra', url: 'javascript:alert(1)' },
      stream_url: 'data:text/html,unsafe',
      registration_url: 'javascript:alert(1)',
      schedule: [{
        time: '6:00 PM',
        title: 'Security',
        type: 'talk',
        lead: null,
        resources: [{ title: 'Unsafe', url: 'javascript:alert(1)' }],
        shared_links: ['data:text/html,unsafe'],
      }],
      photos: [{ url: 'javascript:alert(1)', type: 'image' }],
      videos: [{ title: 'Unsafe', embed_url: 'javascript:alert(1)' }],
    }]), 'utf-8');
    vi.resetModules();

    const { default: app } = await import('./app');
    const response = await app.request('/api/public/meetups');
    const payload = await response.json() as { data: Array<Record<string, any>> };
    const meetup = payload.data[0]!;

    expect(response.status).toBe(200);
    expect(meetup.cover).not.toContain('javascript:');
    expect(meetup.location.url).toBeNull();
    expect(meetup.stream_url).toBeNull();
    expect(meetup.registration_url).toBeNull();
    expect(meetup.schedule[0].resources).toEqual([]);
    expect(meetup.schedule[0].shared_links).toEqual([]);
    expect(meetup.photos).toEqual([]);
    expect(meetup.videos).toEqual([]);
  });

  it('never exposes attendance identities from the public home response', async () => {
    await fs.writeFile(path.join('data', 'event-attendance-imports.json'), JSON.stringify([{
      id: 'attendance-1',
      event_id: event.id,
      row_count: 1,
      imported_at: '2026-07-02T00:00:00.000Z',
      records: [{
        event_id: event.id,
        name: 'Private Attendee',
        email: 'private-attendee@example.com',
        approval_status: 'approved',
      }],
    }]), 'utf-8');

    const { default: app } = await import('./app');
    const response = await app.request('/api/public/home');
    const payload = await response.json() as { regulars: unknown[] };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload.regulars).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain('private-attendee@example.com');
  });
});
