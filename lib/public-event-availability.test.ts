import { describe, expect, it, vi } from 'vitest';
import { checkPublicEventAvailability } from './public-event-availability';

describe('checkPublicEventAvailability', () => {
  it('accepts a successful public event page', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 200 }));

    await expect(checkPublicEventAvailability('https://devcongress.org/events/example', fetcher))
      .resolves.toEqual({ available: true, status: 200 });
    expect(fetcher).toHaveBeenCalledWith('https://devcongress.org/events/example', expect.objectContaining({ method: 'HEAD' }));
  });

  it('keeps a missing public event unavailable', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 404 }));

    await expect(checkPublicEventAvailability('https://devcongress.org/events/example', fetcher))
      .resolves.toEqual({ available: false, status: 404 });
  });

  it('falls back to GET when the website does not support HEAD', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'HEAD' ? new Response('', { status: 405 }) : new Response('', { status: 200 })
    ));

    await expect(checkPublicEventAvailability('https://devcongress.org/events/example', fetcher))
      .resolves.toEqual({ available: true, status: 200 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the public page cannot be reached', async () => {
    const fetcher = vi.fn(async () => { throw new Error('network down'); });

    await expect(checkPublicEventAvailability('https://devcongress.org/events/example', fetcher))
      .resolves.toEqual({ available: false, status: null });
  });
});
