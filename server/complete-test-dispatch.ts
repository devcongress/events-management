import type { Context } from 'hono';
import { completeTestConfiguration } from '@/lib/devcon26-complete-test-checkout';
import { envValue } from '@/server/env';

export function completeTestDispatchOrigin(c?: Context, options: Readonly<{ managed?: boolean }> = {}): string | undefined {
  // Managed orders share the ordinary scheduler and carry their own mode.
  // Historical preview workers retain their deliberately isolated queue.
  if (options.managed) return undefined;
  if (envValue('DEVCON26_COMPLETE_TEST_ENABLED', c) !== 'true') return undefined;

  const configuration = completeTestConfiguration(Object.fromEntries([
    'DEVCON26_COMPLETE_TEST_ENABLED', 'DEVCON26_COMPLETE_TEST_ORIGIN', 'PAYSTACK_TEST_SECRET_KEY', 'PAYSTACK_SECRET_KEY',
  ].map((key) => [key, envValue(key, c)])));

  // An incorrectly configured preview must never fall back to the live queue.
  if (!configuration) throw new Error('Preview email configuration unavailable.');

  return configuration.origin;
}
