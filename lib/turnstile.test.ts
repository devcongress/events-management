import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTE_FEEDBACK_TURNSTILE_ACTION, validateTurnstileToken } from '@/lib/turnstile';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('turnstile validation', () => {
  it('accepts a successful response with the expected action and hostname', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      action: ROUTE_FEEDBACK_TURNSTILE_ACTION,
      hostname: 'events-management.pages.dev',
      'error-codes': [],
    })));

    const result = await validateTurnstileToken({
      token: 'token-123',
      secretKey: 'secret-123',
      remoteIp: '127.0.0.1',
      expectedAction: ROUTE_FEEDBACK_TURNSTILE_ACTION,
      expectedHostname: 'events-management.pages.dev',
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns a configuration error when the secret key is missing', async () => {
    const result = await validateTurnstileToken({
      token: 'token-123',
      secretKey: '',
      expectedAction: ROUTE_FEEDBACK_TURNSTILE_ACTION,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Human verification is temporarily unavailable. Please try again later.',
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a token when the verified action does not match', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      action: 'wrong-action',
      hostname: 'events-management.pages.dev',
      'error-codes': [],
    })));

    const result = await validateTurnstileToken({
      token: 'token-123',
      secretKey: 'secret-123',
      expectedAction: ROUTE_FEEDBACK_TURNSTILE_ACTION,
      expectedHostname: 'events-management.pages.dev',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Human verification did not match this form. Please try again.',
      status: 400,
    });
  });
});
