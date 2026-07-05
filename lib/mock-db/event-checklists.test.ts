import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '@/types';

const originalCwd = process.cwd();
let tempRoot: string;

async function importChecklistStore() {
  vi.resetModules();
  return import('./event-checklists');
}

function eventFixture(overrides: Partial<Event>): Event {
  return {
    id: 'event-july',
    name: 'DevCongress Meetup',
    description: null,
    event_date: '2026-07-04T19:00:00.000Z',
    series_type: 'monthly',
    status: 'draft',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'devcon-event-checklists-'));
  process.chdir(tempRoot);
  await fs.mkdir('data');
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('event checklists', () => {
  it('uses the two-item quarterly checklist for fresh quarterly meetups', async () => {
    const { getEventChecklist } = await importChecklistStore();
    const event = eventFixture({
      name: 'DevCongress Quarterly Meetup [online]',
      series_type: 'quarterly',
      status: 'upcoming',
    });

    const items = await getEventChecklist(event.id, event.status, event);

    expect(items.map((item) => item.label)).toEqual([
      'Create event shell',
      'Update with g-meet link from Edem',
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.phase === 'setup')).toBe(true);
    expect(items.every((item) => item.completed)).toBe(true);
  });

  it('hides old monthly checklist rows when an existing event is quarterly', async () => {
    const { getEventChecklist } = await importChecklistStore();
    const monthlyEvent = eventFixture({ status: 'completed' });
    await getEventChecklist(monthlyEvent.id, monthlyEvent.status, monthlyEvent);

    const quarterlyEvent = eventFixture({
      name: 'DevCongress Quarterly Meetup [online]',
      series_type: 'quarterly',
      status: 'completed',
    });
    const items = await getEventChecklist(quarterlyEvent.id, quarterlyEvent.status, quarterlyEvent);

    expect(items.map((item) => item.label)).toEqual([
      'Create event shell',
      'Update with g-meet link from Edem',
    ]);
    expect(items[0].description).toContain('quarterly meetup');
    expect(items.every((item) => item.completed)).toBe(true);
  });
});
