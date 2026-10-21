export const COMPLETE_TEST_CHECKOUT_PATH = '/api/public/annual-conference/2026/complete-test-checkout';
export const COMPLETE_TEST_REFERENCE = /^devcon26-complete-test-[a-f0-9]{32}$/;

export function completeTestConfiguration(env: Record<string, string | undefined>) {
  const secretKey = (env.PAYSTACK_TEST_SECRET_KEY || env.PAYSTACK_SECRET_KEY)?.trim();
  const origin = env.DEVCON26_COMPLETE_TEST_ORIGIN?.trim();

  if (env.DEVCON26_COMPLETE_TEST_ENABLED !== 'true' || !secretKey?.startsWith('sk_test_')
    || secretKey.length <= 8 || !origin || !/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(origin)) return null;

  return { secretKey, origin };
}
