import crypto from 'node:crypto';
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

function validatedTestOrigin(value: string, development: boolean): string | null {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const allowedProtocol = url.protocol === 'https:' || (development && loopback && url.protocol === 'http:');

    if (!allowedProtocol || (!development && loopback) || url.hostname.includes('*')
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;

    return url.origin;
  } catch {
    return null;
  }
}

export function devcon26TestCheckoutConfiguration(env: Record<string, string | undefined>) {
  const secretKey = env.PAYSTACK_SECRET_KEY?.trim();
  const buyerEmail = z.string().email().max(254).safeParse(env.DEVCON26_TEST_BUYER_EMAIL?.trim());

  if (env.DEVCON26_TEST_CHECKOUT_ENABLED?.trim().toLowerCase() !== 'true'
    || env.DEVCON26_PAYMENT_PROVIDER?.trim().toLowerCase() !== 'paystack'
    || !secretKey?.startsWith('sk_test_') || secretKey.length <= 8 || !buyerEmail.success) return null;

  const development = env.NODE_ENV === 'development';
  const websiteOrigin = validatedTestOrigin(env.PUBLIC_WEBSITE_ORIGIN ?? '', development);
  const configuredOrigins = env.DEVCON26_TEST_CHECKOUT_ORIGINS?.trim();
  const allowedOrigins = new Set<string>();

  if (!websiteOrigin) return null;
  allowedOrigins.add(websiteOrigin);

  for (const entry of configuredOrigins ? configuredOrigins.split(',') : []) {
    const value = entry.trim();
    const origin = validatedTestOrigin(value, development);

    // Configuration accepts exact canonical origins, never wildcard or URL patterns.
    if (!origin || origin !== value) return null;
    allowedOrigins.add(origin);
  }

  const callback = new URL('/devcon26/', websiteOrigin);

  callback.searchParams.set('test_checkout', 'return');

  return { secretKey, buyerEmail: buyerEmail.data, websiteOrigin, callbackUrl: callback.href, allowedOrigins: [...allowedOrigins] };
}

export function devcon26TestCheckoutOriginConfiguration(
  configuration: NonNullable<ReturnType<typeof devcon26TestCheckoutConfiguration>>,
  origin: string | undefined,
) {
  if (!origin || !configuration.allowedOrigins.includes(origin)) return null;
  const callback = new URL('/devcon26/', origin);

  callback.searchParams.set('test_checkout', 'return');

  return { ...configuration, websiteOrigin: origin, callbackUrl: callback.href };
}

export function devcon26TestCheckoutRequestKey(origin: string, requestKey: string): string {
  const digest = crypto.createHash('sha256').update(`${origin}\0${requestKey}`).digest();

  // UUIDv8 namespaces the opaque retry key by origin without changing the sandbox schema.
  digest[6] = (digest[6] & 0x0f) | 0x80;
  digest[8] = (digest[8] & 0x3f) | 0x80;

  const hex = digest.subarray(0, 16).toString('hex');

  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
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
