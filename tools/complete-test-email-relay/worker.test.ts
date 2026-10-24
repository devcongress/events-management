import { afterEach, describe, expect, it, vi } from 'vitest';
import relay from './worker';

const secret = 'test-relay-secret-with-at-least-32-characters';

afterEach(() => vi.unstubAllGlobals());

describe('preview-only email relay', () => {
  it('does not expose a public trigger or drain a closed/live catalog', async () => {
    expect(relay.fetch().status).toBe(404);
    const fetcher = vi.fn().mockResolvedValue(Response.json({ mode: 'live' }));

    vi.stubGlobal('fetch', fetcher);
    await relay.scheduled({}, { SLACK_EVENTS_RETRY_SECRET: secret });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('x-scheduled-job-secret');
  });

  it('drains only fixed preview endpoints once the test catalog is ready', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ mode: 'test' }))
      .mockResolvedValueOnce(Response.json({ admissions: { configured: true, accepted: 1, failed: 0 } })).mockResolvedValueOnce(Response.json({ configured: true, accepted: 1, failed: 0 }));

    vi.stubGlobal('fetch', fetcher);
    await relay.scheduled({}, { SLACK_EVENTS_RETRY_SECRET: secret });
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetcher.mock.calls.slice(1)) {
      expect(url).toMatch(/^https:\/\/devcon26-full-test-events-management\.admins-a7d\.workers\.dev\/api\/internal\/annual-conference-(admission|social-card)-emails\/retry$/);
      expect(options).toMatchObject({ method: 'POST', redirect: 'manual', headers: { 'x-scheduled-job-secret': secret } });
    }
  });

  it('runs both queues and reports failure without exposing provider text', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ mode: 'test' }))
      .mockResolvedValueOnce(new Response('private error', { status: 503 })).mockResolvedValueOnce(Response.json({}));

    vi.stubGlobal('fetch', fetcher);
    await expect(relay.scheduled({}, { SLACK_EVENTS_RETRY_SECRET: secret })).rejects.toThrow('A preview email delivery job failed.');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

 it('reports a disabled dispatcher even when HTTP succeeded', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ mode: 'test' }))
    .mockResolvedValueOnce(Response.json({ admissions: { configured: false, accepted: 0, failed: 0 } }))
    .mockResolvedValueOnce(Response.json({ configured: true, accepted: 0, failed: 0 })));
  await expect(relay.scheduled({}, { SLACK_EVENTS_RETRY_SECRET: secret })).rejects.toThrow('A preview email delivery job failed.');
 });

it('rejects catalog redirects before sending dispatcher credentials', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'https://untrusted.example' } }));

  vi.stubGlobal('fetch', fetcher);
  await expect(relay.scheduled({}, { SLACK_EVENTS_RETRY_SECRET: secret })).rejects.toThrow('Preview catalog returned 302.');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
});
