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
const scheduledPaths = [
  '/api/internal/volunteer-follow-up/drain',
  '/api/internal/project-night/advance',
  '/api/internal/slack-announcements/retry',
  '/api/internal/event-page-monitors/check-due',
  '/api/internal/event-blasts/reconcile',
  '/api/internal/speaker-rejection-emails/retry',
  '/api/internal/selected-speaker-emails/retry',
  '/api/internal/annual-conference-speaker-emails/retry',
  '/api/internal/annual-conference/phases/rollover',
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

  it('dispatches each route once across fifteen scheduled-minute slots and leaves six idle', async () => {
    const cycleStart = 60 * 60_000;

    for (let slot = 0; slot < 15; slot += 1) {
      await worker.scheduled(
        { scheduledTime: cycleStart + slot * 60_000 },
        env,
        context,
      );
    }

    expect(appFetch).toHaveBeenCalledTimes(scheduledPaths.length);
    expect(appFetch.mock.calls.map(([request]) => new URL(request.url).pathname))
      .toEqual(scheduledPaths);
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
});
