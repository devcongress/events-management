import type { Context } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumePublicRateLimit, resetLocalPublicRateLimits } from './public-rate-limit';

const context = { env: {}, req: { url: 'https://events.example.com' } } as unknown as Context;

afterEach(() => {
  vi.unstubAllEnvs();
  resetLocalPublicRateLimits();
});

describe('public rate limit availability', () => {
  it('fails closed in production when the distributed store is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_DATA_SOURCE', 'supabase');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    await expect(consumePublicRateLimit(context, {
      action: 'event_registration:test',
      clientKey: 'client',
      maxAttempts: 5,
      windowSeconds: 600,
    })).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60,
      unavailable: true,
    });
  });

  it('retains the in-process fallback only for local and test environments', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_DATA_SOURCE', 'local-json');

    await expect(consumePublicRateLimit(context, {
      action: 'event_registration:test',
      clientKey: 'client',
      maxAttempts: 1,
      windowSeconds: 600,
    })).resolves.toEqual({ allowed: true });
  });
});
