import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './api';
import { ADMIN_SESSION_REQUIRED_EVENT, protectedFetch, setCurrentAdminSessionInstanceId } from './admin-session-signal';

describe('protected request session signal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leaves a direct caller response body available after signalling', async () => {
    const dispatchEvent = vi.fn();

    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Expired', code: 'ADMIN_SESSION_REQUIRED' }),
      { status: 401 },
    )));

    const response = await protectedFetch('/api/events/fixture');

    await expect(response.json()).resolves.toEqual({ error: 'Expired', code: 'ADMIN_SESSION_REQUIRED' });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('identifies the session at request start even if the session changes in flight', async () => {
    const dispatchEvent = vi.fn();
    let finish!: (value: Response) => void;

    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    setCurrentAdminSessionInstanceId('old');
    const pending = protectedFetch('/api/events');

    setCurrentAdminSessionInstanceId('new');
    finish(new Response(JSON.stringify({ code: 'ADMIN_SESSION_REQUIRED' }), { status: 401 }));
    await pending;

    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({ sessionInstanceId: 'old' });
    setCurrentAdminSessionInstanceId(null);
  });

  it('signals only the explicit protected-session 401', async () => {
    const dispatchEvent = vi.fn();

    vi.stubGlobal('window', { setTimeout, clearTimeout, dispatchEvent });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Expired', code: 'ADMIN_SESSION_REQUIRED' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Other authentication' }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503 })));

    for (let i = 0; i < 4; i += 1) {
      await expect(fetchJson('/api/test')).rejects.toThrow();
    }

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(ADMIN_SESSION_REQUIRED_EVENT);
  });
});
