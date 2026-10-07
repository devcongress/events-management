import { z } from 'zod';
import { DEVCON26_TICKET_TIERS } from '@/lib/annual-conference-ticketing';

export const DEVCON26_TEST_CHECKOUT_PATH = '/api/public/annual-conference/2026/test-checkout';
export const DEVCON26_TEST_WEBHOOK_PATH = '/api/webhooks/paystack/devcon26-test';
export const devcon26TestInitializeSchema = z.object({
  tier_key: z.enum(['regular', 'team_3', 'team_5']),
  checkout_request_key: z.string().uuid(),
}).strict();
export const devcon26TestVerifySchema = z.object({
  reference: z.string().regex(/^devcon26-test-[a-f0-9]{32}$/),
}).strict();

export function devcon26TestCheckoutConfiguration(env: Record<string, string | undefined>) {
  const secretKey = env.PAYSTACK_SECRET_KEY?.trim();
  const buyerEmail = z.string().email().max(254).safeParse(env.DEVCON26_TEST_BUYER_EMAIL?.trim());

  if (env.DEVCON26_TEST_CHECKOUT_ENABLED?.trim().toLowerCase() !== 'true'
    || env.DEVCON26_PAYMENT_PROVIDER?.trim().toLowerCase() !== 'paystack'
    || !secretKey?.startsWith('sk_test_') || secretKey.length <= 8 || !buyerEmail.success) return null;

  try {
    const website = new URL(env.PUBLIC_WEBSITE_ORIGIN ?? '');
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(website.hostname);
    const allowedProtocol = website.protocol === 'https:'
      || (env.NODE_ENV === 'development' && loopback && website.protocol === 'http:');

    if (!allowedProtocol || (env.NODE_ENV !== 'development' && loopback)
      || website.username || website.password || website.pathname !== '/'
      || website.search || website.hash) return null;
    const callback = new URL('/devcon26/', website.origin);

    callback.searchParams.set('test_checkout', 'return');

    return { secretKey, buyerEmail: buyerEmail.data, websiteOrigin: website.origin, callbackUrl: callback.href };
  } catch {
    return null;
  }
}

export function isDevcon26TestCheckoutRequest(path: string, method: string): boolean {
  return (method === 'GET' && path === DEVCON26_TEST_CHECKOUT_PATH)
    || (method === 'POST' && [
      `${DEVCON26_TEST_CHECKOUT_PATH}/initialize`,
      `${DEVCON26_TEST_CHECKOUT_PATH}/verify`,
      DEVCON26_TEST_WEBHOOK_PATH,
    ].includes(path));
}

export function devcon26TestCheckoutCatalog() {
  return DEVCON26_TICKET_TIERS.map(({ key, quantity, price_minor }) => ({
    tier_key: key, quantity, amount_minor: price_minor, currency: 'GHS' as const,
  }));
}
