import crypto from 'node:crypto';
import type { Context, Hono } from 'hono';
import {
  createPaystackHostedCheckout, isPaystackCheckoutUrl, parseVerifiedPaystackCharge,
  readPaystackTestTransaction, verifyPaystackWebhookSignature,
} from '@/lib/annual-conference-ticket-payments';
import {
  DEVCON26_TEST_CHECKOUT_PATH, DEVCON26_TEST_WEBHOOK_PATH,
  devcon26TestCheckoutCatalog, devcon26TestCheckoutConfiguration,
  devcon26TestInitializeSchema, devcon26TestVerifySchema,
} from '@/lib/devcon26-test-checkout';
import {
  confirmDevcon26TestSession, devcon26TestStorageReady, findDevcon26TestSession,
  initializeDevcon26TestSession, prepareDevcon26TestSession, type Devcon26TestSession,
} from '@/lib/supabase/devcon26-test-checkout';
import { envValue } from '@/server/env';
import type { AppBindings } from '@/server/http/app-bindings';
import { enforcePublicRateLimit, publicClientKey } from '@/server/http/public-intake-protection';

function configurationForRequest(c: Context) {
  const keys = ['DEVCON26_TEST_CHECKOUT_ENABLED', 'DEVCON26_PAYMENT_PROVIDER', 'PAYSTACK_SECRET_KEY',
    'DEVCON26_TEST_BUYER_EMAIL', 'PUBLIC_WEBSITE_ORIGIN', 'NODE_ENV'];

  return devcon26TestCheckoutConfiguration(Object.fromEntries(keys.map((key) => [key, envValue(key, c)])));
}

function publicSession(session: Devcon26TestSession, status: 'verified' | 'pending' | 'failed') {
  return {
    mode: 'test', status, tier_key: session.tier_key, quantity: session.quantity,
    amount_minor: session.amount_minor, currency: session.currency,
  };
}

async function verifySession(c: Context, reference: string, secretKey: string, fingerprint?: string) {
  const session = await findDevcon26TestSession(c, reference);

  // Unknown references never cause provider requests; query params cannot mint sessions.
  if (!session) return null;
  if (session.status === 'verified') return publicSession(session, 'verified');
  if (session.status === 'rejected') return publicSession(session, 'failed');
  const transaction = await readPaystackTestTransaction({ secretKey, paymentReference: session.payment_reference });

  if (transaction.status !== 'verified') return publicSession(session, transaction.status);
  const confirmed = await confirmDevcon26TestSession(c, {
    reference: transaction.paymentReference,
    eventId: transaction.providerEventId,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    payloadSha256: fingerprint ?? crypto.createHash('sha256').update(JSON.stringify(transaction)).digest('hex'),
  });

  return publicSession(confirmed, confirmed.status === 'verified' ? 'verified' : 'failed');
}

export function registerDevcon26TestCheckoutRoutes(app: Hono<AppBindings>): void {
  app.get(DEVCON26_TEST_CHECKOUT_PATH, async (c) => {
    const configuration = configurationForRequest(c);

    if (!configuration) return c.json({ mode: 'unavailable' });
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-test-status', clientKey: publicClientKey(c), maxAttempts: 30, windowSeconds: 60,
    }, 'Please wait before checking checkout again.');

    if (limited) return limited;
    const ready = await devcon26TestStorageReady(c).catch(() => false);

    return c.json(ready ? { mode: 'test', tiers: devcon26TestCheckoutCatalog() } : { mode: 'unavailable' });
  });

  for (const operation of ['initialize', 'verify']) {
    app.use(`${DEVCON26_TEST_CHECKOUT_PATH}/${operation}`, async (c, next) => {
      const configuration = configurationForRequest(c);

      if (!configuration) return c.json({ error: 'Test checkout is not available yet.' }, 503);
      if (c.req.header('Origin') !== configuration.websiteOrigin) return c.json({ error: 'This checkout origin is not allowed.' }, 403);
      if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return c.json({ error: 'Use a JSON checkout request.' }, 415);
      }

      await next();
    });
  }

  app.post(`${DEVCON26_TEST_CHECKOUT_PATH}/initialize`, async (c) => {
    const configuration = configurationForRequest(c)!;
    const input = devcon26TestInitializeSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Choose a valid test ticket.' }, 400);
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-test-initialize', clientKey: publicClientKey(c), maxAttempts: 5, windowSeconds: 300,
    }, 'Please wait before starting another test checkout.');

    if (limited) return limited;

    try {
      const session = await prepareDevcon26TestSession(c, input.data.checkout_request_key, input.data.tier_key);

      if (session.authorization_url) {
        if (!isPaystackCheckoutUrl(session.authorization_url)) throw new Error('test_checkout_invalid_url');

        return c.json({ mode: 'test', authorization_url: session.authorization_url, reference: session.payment_reference });
      }

      const checkout = await createPaystackHostedCheckout({
        secretKey: configuration.secretKey,
        orderId: session.id,
        purchaserEmail: configuration.buyerEmail,
        amountMinor: session.amount_minor,
        callbackUrl: configuration.callbackUrl,
        paymentReference: session.payment_reference,
      });

      await initializeDevcon26TestSession(c, session, checkout.authorizationUrl);

      return c.json({ mode: 'test', authorization_url: checkout.authorizationUrl, reference: session.payment_reference });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const conflict = ['test_checkout_cart_conflict', 'test_checkout_in_progress', 'test_checkout_finished'].some((code) => message.includes(code));

      return c.json({ error: conflict ? 'This test checkout is already in progress or finished. Please try again shortly.'
        : 'Test checkout could not start. Please try again shortly.' }, conflict ? 409 : 503);
    }
  });

  app.post(`${DEVCON26_TEST_CHECKOUT_PATH}/verify`, async (c) => {
    const configuration = configurationForRequest(c)!;
    const input = devcon26TestVerifySchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'The test payment reference is invalid.' }, 400);
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-test-verify', clientKey: publicClientKey(c), maxAttempts: 15, windowSeconds: 60,
    }, 'Please wait before checking this test payment again.');

    if (limited) return limited;

    try {
      const result = await verifySession(c, input.data.reference, configuration.secretKey);

      return result ? c.json(result) : c.json({ error: 'This test checkout was not found.' }, 404);
    } catch {
      return c.json({ error: 'We could not verify this test payment yet. Please check again.' }, 503);
    }
  });

  app.post(DEVCON26_TEST_WEBHOOK_PATH, async (c) => {
    const configuration = configurationForRequest(c);

    if (!configuration) return c.json({ error: 'Not found.' }, 404);
    const rawBody = await c.req.text();

    if (!verifyPaystackWebhookSignature(rawBody, c.req.header('x-paystack-signature') ?? null, configuration.secretKey)) {
      return c.json({ error: 'Invalid webhook signature.' }, 401);
    }
    const charge = parseVerifiedPaystackCharge(rawBody);

    if (!charge || !devcon26TestVerifySchema.safeParse({ reference: charge.paymentReference }).success) return c.body(null, 204);

    try {
      await verifySession(c, charge.paymentReference, configuration.secretKey, crypto.createHash('sha256').update(rawBody).digest('hex'));

      return c.body(null, 204);
    } catch {
      return c.json({ error: 'Unable to confirm this test payment.' }, 500);
    }
  });
}
