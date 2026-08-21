import { describe, expect, it, vi } from 'vitest';
import {
  baselineForEvent,
  compareEventPageSnapshots,
  inspectEventPage,
  nextEventPageCheckAt,
} from './event-page-monitor';

describe('event page monitoring', () => {
  it('uses the agreed date-aware cadence and stops after the event', () => {
    const now = new Date('2026-08-21T00:00:00.000Z');
    expect(nextEventPageCheckAt('2026-10-21T00:00:00.000Z', null, now)).toBe('2026-09-04T00:00:00.000Z');
    expect(nextEventPageCheckAt('2026-09-10T00:00:00.000Z', null, now)).toBe('2026-08-24T00:00:00.000Z');
    expect(nextEventPageCheckAt('2026-08-25T00:00:00.000Z', null, now)).toBe('2026-08-21T12:00:00.000Z');
    expect(nextEventPageCheckAt('2026-08-21T20:00:00.000Z', null, now)).toBe('2026-08-21T02:00:00.000Z');
    expect(nextEventPageCheckAt('2026-08-20T20:00:00.000Z', null, now)).toBeNull();
  });

  it('extracts JSON-LD and follows only validated public redirects', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === 'https://tickets.example/events/one') {
        return new Response(null, { status: 302, headers: { location: 'https://events.example/one' } });
      }
      return new Response(`<html><head><script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'Event', name: 'Systems Night',
        startDate: '2026-09-10T18:00:00Z', endDate: '2026-09-10T20:00:00Z',
        location: { '@type': 'Place', name: 'Impact Hub', address: 'Accra' },
        offers: { url: 'https://tickets.example/new-registration' },
      })}</script></head></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
    });
    const result = await inspectEventPage('https://tickets.example/events/one', fetcher as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: true, http_status: 200, snapshot: { final_url: 'https://events.example/one', name: 'Systems Night', location: 'Impact Hub, Accra', registration_url: 'https://tickets.example/new-registration' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('blocks redirects to local or private destinations', async () => {
    const result = await inspectEventPage('https://events.example/one', vi.fn(async () => new Response(null, {
      status: 302, headers: { location: 'http://127.0.0.1/admin' },
    })) as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, kind: 'unmonitorable', error: 'The registration page redirects to an unsafe or invalid URL.' });
  });

  it('reports only observed differences and structured cancellation signals', () => {
    const baseline = baselineForEvent({
      name: 'Systems Night', event_date: '2026-09-10T18:00:00Z', end_date: '2026-09-10T20:00:00Z',
      registration_url: 'https://events.example/one', location: { name: 'Impact Hub' }, venue_address: 'Accra',
    });
    expect(baseline).not.toBeNull();
    expect(compareEventPageSnapshots(baseline!, {
      ...baseline!, name: null, starts_at: '2026-09-10T19:00:00.000Z', event_status: 'https://schema.org/EventCancelled',
    })).toEqual([
      { field: 'starts_at', expected: '2026-09-10T18:00:00.000Z', observed: '2026-09-10T19:00:00.000Z' },
      { field: 'event_status', expected: null, observed: 'https://schema.org/EventCancelled' },
    ]);
  });
});
