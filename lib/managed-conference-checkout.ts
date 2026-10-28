import { z } from 'zod';
import { devcon26FlexibleCheckoutInitializeSchema } from './devcon26-public-checkout';

export const MANAGED_CHECKOUT_PATH = '/api/public/annual-conference/2026/checkout/managed';
export const MANAGED_PAYMENT_WEBHOOK_PATH = '/api/webhooks/paystack/devcon26-managed';
export const managedPaymentModeSchema = z.enum(['test', 'live']);
export type ManagedPaymentMode = z.infer<typeof managedPaymentModeSchema>;

export const managedCheckoutSettingsSchema = z.object({
  edition_id: z.string().uuid(),
  payment_mode: managedPaymentModeSchema,
  settings_version: z.number().int().positive().safe(),
  public_mode: z.enum(['free', 'paid']),
  sales_status: z.enum(['draft', 'open', 'closed']),
  flexible_checkout_state: z.enum(['foundation', 'internal', 'public']),
  regular_price_minor: z.number().int().positive().safe(),
  flexible_checkout_max_amount_minor: z.number().int().positive().safe(),
});

export const managedCheckoutInitializeSchema = devcon26FlexibleCheckoutInitializeSchema.extend({
  expected_mode: managedPaymentModeSchema,
  settings_version: z.number().int().positive().safe(),
  turnstile_token: z.string().trim().min(1).max(2048),
  turnstile_action: z.literal('devcon26_checkout'),
}).strict();

export const managedCheckoutVerifySchema = z.object({
  reference: z.string().regex(/^devcon26-managed-(?:test|live)-[a-f0-9]{32}$/),
  checkout_grant: z.string().min(20).max(2000),
  checkout_verifier: z.string().regex(/^[A-Za-z0-9_-]{40,100}$/),
}).strict();

export function managedPaymentSecret(env: Record<string, string | undefined>, mode: ManagedPaymentMode): string | null {
  const key = (mode === 'test' ? env.PAYSTACK_TEST_SECRET_KEY : env.PAYSTACK_SECRET_KEY)?.trim();

  return key?.startsWith(mode === 'test' ? 'sk_test_' : 'sk_live_') && key.length > 8 ? key : null;
}

export function managedCheckoutOrigin(env: Record<string, string | undefined>, requestOrigin?: string): string | null {
  if (!requestOrigin) return null;

  try {
    const url = new URL(requestOrigin);
    const loopback = env.NODE_ENV === 'development' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const configured = [env.PUBLIC_WEBSITE_ORIGIN, ...(env.DEVCON26_PUBLIC_CHECKOUT_ORIGINS?.split(',') ?? [])]
      .map((value) => value?.trim()).filter(Boolean);

    return (url.protocol === 'https:' || (loopback && url.protocol === 'http:'))
      && url.origin === requestOrigin && !url.username && !url.password
      && configured.includes(requestOrigin) ? requestOrigin : null;
  } catch {
    return null;
  }
}

export function managedPaymentReference(orderId: string, mode: ManagedPaymentMode): string {
  return `devcon26-managed-${mode}-${orderId.replaceAll('-', '')}`;
}

export function isManagedCheckoutRequest(path: string, method: string): boolean {
  return (method === 'GET' && path === MANAGED_CHECKOUT_PATH)
    || (method === 'POST' && [`${MANAGED_CHECKOUT_PATH}/initialize`, `${MANAGED_CHECKOUT_PATH}/verify`, MANAGED_PAYMENT_WEBHOOK_PATH].includes(path));
}
