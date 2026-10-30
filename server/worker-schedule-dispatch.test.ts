import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from 'hono';

const appFetch = vi.hoisted(() => vi.fn(async (_request: Request) => (
  new Response(null, { status: 204 })
)));

vi.mock('./app', () => ({
  default: { fetch: appFetch },
}));

import worker from './worker';

const scheduledSecret = 'worker-schedule-dispatch-secret-at-least-32-bytes';
const volunteerDrainPath = '/api/internal/volunteer-follow-up/drain';
const scheduledPathsBySlot = [
  volunteerDrainPath,
  '/api/internal/project-night/advance',
  '/api/internal/slack-announcements/retry',
  '/api/internal/event-page-monitors/check-due',
  '/api/internal/event-blasts/reconcile',
  '/api/internal/speaker-rejection-emails/retry',
  '/api/internal/selected-speaker-emails/retry',
  '/api/internal/annual-conference-speaker-emails/retry',
  '/api/internal/annual-conference/phases/rollover',
  volunteerDrainPath,
  '/api/internal/annual-conference-social-card-emails/retry',
  volunteerDrainPath,
  '/api/internal/devcon26-test-checkout-emails/retry',
  volunteerDrainPath,
  '/api/internal/annual-conference-attendee-updates/retry',
];

const env = { SLACK_EVENTS_RETRY_SECRET: scheduledSecret };
const context = {} as ExecutionContext;

describe('scheduled worker cycle dispatch', () => {
  beforeEach(() => {
    appFetch.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches exactly one route in each scheduled slot, including conference admission delivery', async () => {
    const cycleStart = 60 * 60_000;

    for (let slot = 0; slot < 15; slot += 1) {
      const callsBefore = appFetch.mock.calls.length;

      await worker.scheduled(
        { scheduledTime: cycleStart + slot * 60_000 },
        env,
        context,
      );

      const expectedPath = scheduledPathsBySlot[slot];

      expect(appFetch).toHaveBeenCalledTimes(callsBefore + (expectedPath ? 1 : 0));

      if (expectedPath) {
        expect(new URL(appFetch.mock.calls.at(-1)![0].url).pathname)
          .toBe(expectedPath);
      }
    }

    const dispatchedPaths = appFetch.mock.calls.map(([request]) => new URL(request.url).pathname);

    expect(dispatchedPaths).toEqual(scheduledPathsBySlot.filter(Boolean));
    expect(dispatchedPaths.filter((path) => path === volunteerDrainPath)).toHaveLength(4);
    expect(dispatchedPaths.filter((path) => path !== volunteerDrainPath)).toHaveLength(11);
    expect(scheduledPathsBySlot.filter((path) => path === null)).toHaveLength(0);
  });

  it('keeps the exact cadence through multiple cycles and an hour rollover', async () => {
    const cycleStartMinute = 45;
    const cycleCount = 3;

    for (let cycle = 0; cycle < cycleCount; cycle += 1) {
      for (let slot = 0; slot < 15; slot += 1) {
        await worker.scheduled(
          { scheduledTime: (cycleStartMinute + cycle * 15 + slot) * 60_000 },
          env,
          context,
        );
      }
    }

    expect(appFetch.mock.calls.map(([request]) => new URL(request.url).pathname))
      .toEqual(Array.from({ length: cycleCount }, () => scheduledPathsBySlot).flat().filter(Boolean));
  });

  it('uses the controller scheduled time rather than delayed wall-clock time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2040-01-01T00:00:00.000Z'));

    await worker.scheduled(
      { scheduledTime: 5 * 60_000 },
      env,
      context,
    );

    expect(appFetch).toHaveBeenCalledTimes(1);
    expect(new URL(appFetch.mock.calls[0][0].url).pathname)
      .toBe('/api/internal/speaker-rejection-emails/retry');
  });

  it('fails closed when Cloudflare does not provide a valid scheduled time', async () => {
    await worker.scheduled({}, env, context);
    await worker.scheduled({ scheduledTime: Number.NaN }, env, context);

    expect(appFetch).not.toHaveBeenCalled();
  });

  it('fails closed when the scheduled-job secret is unavailable', async () => {
    await worker.scheduled(
      { scheduledTime: 0 },
      {},
      context,
    );

    expect(appFetch).not.toHaveBeenCalled();
  });

  it('routes volunteer queue messages to the volunteer Broadcast preparation endpoint', async () => {
    await worker.queue({
      messages: [
        { body: { event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', blast_id: '11111111-1111-4111-8111-111111111111', offset: 0 } },
        { body: { kind: 'volunteer', campaign_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', blast_id: '22222222-2222-4222-8222-222222222222', offset: 0 } },
      ],
    }, env, context);

    expect(appFetch.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual([
      '/api/internal/event-blasts/prepare',
      '/api/internal/volunteer-broadcasts/prepare',
    ]);
  });
});

it('enqueues admission and three bounded payment checks each minute', async () => {
  const send = vi.fn().mockResolvedValue(undefined);

  await worker.scheduled({ scheduledTime: 0 }, { ...env, EVENT_BLAST_PREPARATION_QUEUE: { send } }, context);
  expect(send.mock.calls.map(([body]) => body.kind)).toEqual(['admission-recovery', 'payment-recovery', 'payment-recovery', 'payment-recovery']);
});

it('continues admission draining only after productive work', async () => {
  const send = vi.fn().mockResolvedValue(undefined);

  appFetch.mockResolvedValueOnce(Response.json({ admissions: { accepted: 3 } }));
  await worker.queue({ messages: [{ body: { kind: 'admission-recovery' } }] }, { ...env, EVENT_BLAST_PREPARATION_QUEUE: { send } }, context);
  expect(send).toHaveBeenCalledWith({ kind: 'admission-recovery' }, { delaySeconds: 1 });
  send.mockClear();
  appFetch.mockResolvedValueOnce(Response.json({ admissions: { accepted: 0 } }));
  await worker.queue({ messages: [{ body: { kind: 'admission-recovery' } }] }, { ...env, EVENT_BLAST_PREPARATION_QUEUE: { send } }, context);
  expect(send).not.toHaveBeenCalled();
});
