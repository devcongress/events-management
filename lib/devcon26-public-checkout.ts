import { z } from 'zod';

export const DEVCON26_PUBLIC_CHECKOUT_PATH = '/api/public/annual-conference/2026/checkout';

export const devcon26PublicCheckoutInitializeSchema = z.object({
  tier_key: z.enum(['regular', 'team_3', 'team_5']),
  checkout_request_key: z.string().uuid(),
  purchaser_name: z.string().trim().min(1).max(160).regex(/^[^\u0000-\u001f\u007f]+$/),
  purchaser_email: z.string().trim().toLowerCase().email().max(254),
}).strict();

export const devcon26PublicCheckoutVerifySchema = z.object({
  reference: z.string().regex(/^devcon26_[a-f0-9]{32}$/),
  buyer_grant: z.string().min(20).max(2_000),
  buyer_verifier: z.string().regex(/^[A-Za-z0-9_-]{40,100}$/),
}).strict();

function validatedOrigin(value: string, development: boolean): string | null {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const protocolAllowed = url.protocol === 'https:' || (development && loopback && url.protocol === 'http:');

    if (!protocolAllowed || (!development && loopback) || url.hostname.includes('*')
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;

    return url.origin;
  } catch {
    return null;
  }
}

export function devcon26PublicCheckoutConfiguration(env: Record<string, string | undefined>) {
  const secretKey = env.PAYSTACK_SECRET_KEY?.trim();

  if (env.DEVCON26_PUBLIC_CHECKOUT_ENABLED?.trim().toLowerCase() !== 'true'
    || env.DEVCON26_PAYMENT_PROVIDER?.trim().toLowerCase() !== 'paystack'
    || env.DEVCON26_PAYMENTS_ENABLED?.trim().toLowerCase() !== 'true'
    || !secretKey?.startsWith('sk_live_') || secretKey.length <= 8) return null;

  const development = env.NODE_ENV === 'development';
  const websiteOrigin = validatedOrigin(env.PUBLIC_WEBSITE_ORIGIN ?? '', development);
  const configuredOrigins = env.DEVCON26_PUBLIC_CHECKOUT_ORIGINS?.trim();
  const allowedOrigins = new Set<string>();

  if (!websiteOrigin) return null;
  allowedOrigins.add(websiteOrigin);

  for (const entry of configuredOrigins ? configuredOrigins.split(',') : []) {
    const value = entry.trim();
    const origin = validatedOrigin(value, development);

    if (!origin || origin !== value) return null;
    allowedOrigins.add(origin);
  }

  return { secretKey, websiteOrigin, allowedOrigins: [...allowedOrigins] };
}

export function devcon26PublicCheckoutOriginConfiguration(
  configuration: NonNullable<ReturnType<typeof devcon26PublicCheckoutConfiguration>>,
  origin: string | undefined,
) {
  if (!origin || !configuration.allowedOrigins.includes(origin)) return null;

  return { ...configuration, websiteOrigin: origin, callbackUrl: new URL('/devcon26/payment-confirmation/', origin).href };
}

export function isDevcon26PublicCheckoutRequest(path: string, method: string): boolean {
  return (method === 'GET' && path === DEVCON26_PUBLIC_CHECKOUT_PATH)
    || (method === 'POST' && [`${DEVCON26_PUBLIC_CHECKOUT_PATH}/quote`, `${DEVCON26_PUBLIC_CHECKOUT_PATH}/initialize`, `${DEVCON26_PUBLIC_CHECKOUT_PATH}/verify`].includes(path));
}
