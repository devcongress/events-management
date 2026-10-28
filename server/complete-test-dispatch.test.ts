import { describe, expect, it } from 'vitest';
import type { Context } from 'hono';
import { completeTestDispatchOrigin } from './complete-test-dispatch';

const context = (env: Record<string, string>) => ({ env } as unknown as Context);

describe('preview dispatcher selection', () => {
  it('keeps ordinary delivery unchanged and validates the full preview configuration', () => {
    expect(completeTestDispatchOrigin(context({ DEVCON26_COMPLETE_TEST_ENABLED: 'false' }))).toBeUndefined();
    expect(completeTestDispatchOrigin(context({ DEVCON26_COMPLETE_TEST_ENABLED: 'true',
      DEVCON26_COMPLETE_TEST_ORIGIN: 'https://preview.account.workers.dev', PAYSTACK_TEST_SECRET_KEY: 'sk_test_fixture',
    }))).toBe('https://preview.account.workers.dev');
  });

  it('fails closed instead of falling back to generic queues for a broken preview', () => {
    expect(() => completeTestDispatchOrigin(context({ DEVCON26_COMPLETE_TEST_ENABLED: 'true',
      DEVCON26_COMPLETE_TEST_ORIGIN: 'https://devcongress.org', PAYSTACK_TEST_SECRET_KEY: 'sk_live_fixture',
    }))).toThrow('Preview email configuration unavailable');
  });

  it('uses shared queues for an explicit managed dispatch even with historical preview flags', () => {
    expect(completeTestDispatchOrigin(context({ DEVCON26_COMPLETE_TEST_ENABLED: 'true' }), { managed: true })).toBeUndefined();
  });
});
