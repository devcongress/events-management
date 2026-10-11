import { describe, expect, it, vi } from 'vitest';
import { createAdminAuthCallbackDeadline } from './admin-auth-callback-timeout';
import { exchangeAdminToken } from './admin-auth-callback-exchange';

describe('admin auth callback token exchange', () => {
  it('keeps a successful response body readable after exchange headers arrive', async () => {
    let signal: AbortSignal | undefined;
    const fetchRequest = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;

      return new Response(JSON.stringify({ outcome: 'authenticated' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await exchangeAdminToken(
      'temporary-token',
      createAdminAuthCallbackDeadline(),
      fetchRequest,
    );

    await expect(response.json()).resolves.toEqual({ outcome: 'authenticated' });
    expect(signal?.aborted).toBe(false);
  });
});
