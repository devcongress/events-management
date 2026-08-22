import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event } from '@/types';

function externalEvent(id: string): Event {
  return {
    id,
    name: 'Systems Night',
    description: 'A community event.',
    event_date: '2099-09-10T18:00:00.000Z',
    end_date: '2099-09-10T20:00:00.000Z',
    status: 'upcoming',
    created_at: '2099-01-01T00:00:00.000Z',
    updated_at: '2099-01-01T00:00:00.000Z',
    location: { name: 'Impact Hub', label: 'Impact Hub', url: null },
    venue_address: 'Accra',
    registration_url: 'https://events.example/systems-night',
    ownership: 'external',
    submission_source: 'public_submission',
    moderation_status: 'approved',
    publication_status: 'published',
    publish_to_website: true,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('event page monitor persistence', () => {
  it('schedules a new monitor according to event cadence instead of making it immediately due', async () => {
    vi.stubEnv('APP_DATA_SOURCE', 'local-json');
    vi.resetModules();
    const { ensureEventPageMonitor } = await import('./event-page-monitors');

    const before = Date.now();
    const monitor = await ensureEventPageMonitor(externalEvent('event-cadence'));

    expect(monitor).toMatchObject({ status: 'pending', last_checked_at: null, differences: [] });
    expect(Date.parse(monitor?.next_check_at ?? '')).toBeGreaterThan(before + 13 * 24 * 60 * 60 * 1000);
  });

  it('clears reviewed differences and schedules the next cadence when an approved amendment is rebaselined', async () => {
    vi.stubEnv('APP_DATA_SOURCE', 'local-json');
    const pageFetch = vi.fn();
    vi.stubGlobal('fetch', pageFetch);
    vi.resetModules();
    const { ensureEventPageMonitor, rebaselineEventPageMonitor, saveEventPageMonitor } = await import('./event-page-monitors');
    const event = externalEvent('event-approved-amendment');
    await ensureEventPageMonitor(event);
    const lastCheckedAt = '2026-08-22T09:31:47.310Z';
    await saveEventPageMonitor(event.id, {
      status: 'changed',
      last_checked_at: lastCheckedAt,
      differences: [{ field: 'starts_at', expected: event.event_date, observed: '2099-09-11T18:00:00.000Z' }],
      last_change_fingerprint: 'change-1',
      last_alerted_fingerprint: 'change-1',
    });

    const amendedEvent = {
      ...event,
      event_date: '2099-09-11T18:00:00.000Z',
      end_date: '2099-09-11T20:00:00.000Z',
    };
    const reset = await rebaselineEventPageMonitor(amendedEvent);

    expect(reset).toMatchObject({
      status: 'pending',
      baseline: { starts_at: amendedEvent.event_date },
      last_checked_at: lastCheckedAt,
      last_observed: null,
      differences: [],
      consecutive_failures: 0,
      last_http_status: null,
      last_error: null,
      last_change_fingerprint: null,
      last_alerted_fingerprint: null,
    });
    expect(Date.parse(reset?.next_check_at ?? '')).toBeGreaterThan(Date.now());
    expect(pageFetch).not.toHaveBeenCalled();
  });
});
