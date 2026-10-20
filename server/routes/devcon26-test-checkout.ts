import crypto from 'node:crypto';
import type { Context, Hono } from 'hono';
import {
  createPaystackHostedCheckout, isPaystackCheckoutUrl, parseVerifiedPaystackCharge,
  readPaystackTestTransaction, verifyPaystackWebhookSignature,
} from '@/lib/annual-conference-ticket-payments';
import {
  DEVCON26_TEST_CHECKOUT_PATH, DEVCON26_TEST_WEBHOOK_PATH,
  DEVCON26_TEST_PREVIEW_EMAIL_TURNSTILE_ACTION,
  devcon26TestCheckoutCatalog, devcon26TestCheckoutConfiguration,
  devcon26TestCheckoutOriginConfiguration, devcon26TestCheckoutRequestKey,
  devcon26TestInitializeSchema, devcon26TestQuoteSchema, devcon26TestVerifySchema,
} from '@/lib/devcon26-test-checkout';
import { devcon26CouponError, devcon26TestQuoteForSession } from '@/lib/devcon26-test-coupons';
import {
  confirmDevcon26TestSession, devcon26TestStorageReady, findDevcon26TestSession,
  initializeDevcon26TestSession, prepareDevcon26TestSession, quoteDevcon26TestCheckout, type Devcon26TestSession,
} from '@/lib/supabase/devcon26-test-checkout';
import { getSupabaseAnnualConferencePublicTicketPrices } from '@/lib/supabase/annual-conference-ticketing';
import { envValue } from '@/server/env';
import type { AppBindings } from '@/server/http/app-bindings';
import {
  assessPublicSubmissionEmail, enforcePublicRateLimit, publicClientKey,
  publicEmailErrorPayload, requirePublicTurnstile,
} from '@/server/http/public-intake-protection';
import { secureSharedSecret } from '@/lib/security/shared-secret';
import { retrySandboxCheckoutEmails } from '@/server/devcon26-test-checkout-email-delivery';
import { devcon26AvailablePaymentProviders } from '@/lib/devcon26-ticket-cart';
import { sandboxEmailConfiguration, sandboxPreviewEmailConfiguration } from '@/lib/devcon26-test-checkout-email-delivery';

export function devcon26TestConfigurationForRequest(c: Context) {
  const keys = ['DEVCON26_TEST_CHECKOUT_ENABLED', 'DEVCON26_PAYMENT_PROVIDER', 'PAYSTACK_SECRET_KEY',
    'DEVCON26_TEST_BUYER_EMAIL', 'PUBLIC_WEBSITE_ORIGIN', 'DEVCON26_TEST_CHECKOUT_ORIGINS', 'NODE_ENV'];

  return devcon26TestCheckoutConfiguration(Object.fromEntries(keys.map((key) => [key, envValue(key, c)])));
}

function originConfigurationForRequest(c: Context) {
  const configuration = devcon26TestConfigurationForRequest(c);

  return configuration ? devcon26TestCheckoutOriginConfiguration(configuration, c.req.header('Origin')) : null;
}

function publicSession(session: Devcon26TestSession, status: 'verified' | 'pending' | 'failed' | 'refund_required') {
  return {
    ...devcon26TestQuoteForSession(session), status, amount_minor: session.amount_minor,
  };
}

async function verifySession(c: Context, reference: string, secretKey: string, fingerprint?: string) {
  const session = await findDevcon26TestSession(c, reference);

  // Unknown references never cause provider requests; query params cannot mint sessions.
  if (!session) return null;
  if (session.status === 'verified') return publicSession(session, 'verified');
  if (session.status === 'refund_required') return publicSession(session, 'refund_required');
  const transaction = await readPaystackTestTransaction({ secretKey, paymentReference: session.payment_reference });

  if (transaction.status === 'pending') return publicSession(session, 'pending');
  const confirmed = await confirmDevcon26TestSession(c, {
    reference: transaction.paymentReference,
    eventId: transaction.providerEventId,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    payloadSha256: fingerprint ?? crypto.createHash('sha256').update(JSON.stringify(transaction)).digest('hex'),
    providerStatus: transaction.status === 'verified' ? 'success' : 'failed',
  });

  return publicSession(confirmed, confirmed.status === 'verified' ? 'verified'
    : confirmed.status === 'refund_required' ? 'refund_required' : 'failed');
}

export function registerDevcon26TestCheckoutRoutes(app: Hono<AppBindings>): void {
  app.post('/api/internal/devcon26-test-checkout-emails/retry', async (c) => {
    const expected = secureSharedSecret(envValue('SLACK_EVENTS_RETRY_SECRET', c));
    const received = c.req.header('x-scheduled-job-secret')?.trim();

    if (!expected || !received || Buffer.byteLength(expected) !== Buffer.byteLength(received)
      || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
      return c.json({ error: 'Not found.' }, 404);
    }

    try {
      return c.json(await retrySandboxCheckoutEmails(c));
    } catch {
      return c.json({ error: 'Sandbox email retry could not complete.' }, 500);
    }
  });

  app.get(DEVCON26_TEST_CHECKOUT_PATH, async (c) => {
    const configuration = devcon26TestConfigurationForRequest(c);

    if (!configuration) return c.json({ mode: 'unavailable' });
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-test-status', clientKey: publicClientKey(c), maxAttempts: 30, windowSeconds: 60,
    }, 'Please wait before checking checkout again.');

    if (limited) return limited;
    const [ready, prices] = await Promise.all([
      devcon26TestStorageReady(c).catch(() => false),
      getSupabaseAnnualConferencePublicTicketPrices(2026, c, 'sandbox').catch(() => null),
    ]);
    const requestedOrigin = c.req.header('Origin');
    const previewEnvironment = Object.fromEntries([
      'DEVCON26_TEST_CHECKOUT_PREVIEW_EMAILS_ENABLED', 'DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS',
      'DEVCON26_TEST_CHECKOUT_EMAILS_ENABLED', 'DEVCON26_TEST_CHECKOUT_EMAIL_RECIPIENTS',
      'DEVCON26_TEST_CHECKOUT_EMAIL_FROM', 'DEVCON26_TEST_CHECKOUT_EMAIL_REPLY_TO',
      'DEVCON26_TEST_CHECKOUT_ENABLED', 'DEVCON26_TEST_CHECKOUT_ORIGINS',
      'DEVCON26_TEST_BUYER_EMAIL', 'DEVCON26_PAYMENT_PROVIDER', 'PAYSTACK_SECRET_KEY',
      'RESEND_API_KEY', 'PUBLIC_WEBSITE_ORIGIN', 'NODE_ENV',
    ].map((key) => [key, envValue(key, c)]));
    const previewEmailAvailable = Boolean(requestedOrigin
      && envValue('TURNSTILE_SECRET_KEY', c)?.trim()
      && configuration?.allowedOrigins.includes(requestedOrigin)
      && sandboxPreviewEmailConfiguration(previewEnvironment, requestedOrigin)
      && sandboxEmailConfiguration(previewEnvironment)?.previewOrigins.has(requestedOrigin));

    return c.json(ready && prices
      ? {
        mode: 'test',
        accepts_coupon: true,
        preview_email_available: previewEmailAvailable,
        payment_providers: devcon26AvailablePaymentProviders(),
        tiers: devcon26TestCheckoutCatalog(prices),
      }
      : { mode: 'unavailable' });
  });

  for (const operation of ['quote', 'initialize', 'verify']) {
    app.use(`${DEVCON26_TEST_CHECKOUT_PATH}/${operation}`, async (c, next) => {
      const configuration = devcon26TestConfigurationForRequest(c);

      if (!configuration) return c.json({ error: 'Test checkout is not available yet.' }, 503);
      if (!devcon26TestCheckoutOriginConfiguration(configuration, c.req.header('Origin'))) {
        return c.json({ error: 'This checkout origin is not allowed.' }, 403);
      }
      if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return c.json({ error: 'Use a JSON checkout request.' }, 415);
      }

      await next();
    });
  }

  app.post(`${DEVCON26_TEST_CHECKOUT_PATH}/quote`, async (c) => {
    const input = devcon26TestQuoteSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Choose a valid pass and coupon.', coupon_error: 'invalid' }, 400);
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-test-quote', clientKey: publicClientKey(c), maxAttempts: 15, windowSeconds: 60,
    }, 'Please wait before checking another coupon.');

    if (limited) return limited;

    try {
      return c.json(await quoteDevcon26TestCheckout(c, input.data.tier_key, input.data.coupon_code));
    } catch (error) {
      const couponError = devcon26CouponError(error);

      if (couponError) return c.json(couponError, couponError.coupon_error === 'unavailable' ? 409 : 400);

      return c.json({ error: 'This test quote is not available yet.' }, 503);
    }
  });

  app.post(`${DEVCON26_TEST_CHECKOUT_PATH}/initialize`, async (c) => {
    const configuration = originConfigurationForRequest(c)!;
    const input = devcon26TestInitializeSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Choose a valid test ticket.' }, 400);
    const limited = await enforcePublicRateLimit(c, {
      action: 'devcon26-test-initialize', clientKey: publicClientKey(c), maxAttempts: 5, windowSeconds: 300,
    }, 'Please wait before starting another test checkout.');

    if (limited) return limited;

    const previewEmailAuthorizedOrigin = sandboxPreviewEmailConfiguration({
      DEVCON26_TEST_CHECKOUT_PREVIEW_EMAILS_ENABLED: envValue('DEVCON26_TEST_CHECKOUT_PREVIEW_EMAILS_ENABLED', c),
      DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS: envValue('DEVCON26_TEST_CHECKOUT_PREVIEW_EMAIL_ORIGINS', c),
      NODE_ENV: envValue('NODE_ENV', c),
      PUBLIC_WEBSITE_ORIGIN: envValue('PUBLIC_WEBSITE_ORIGIN', c),
    }, configuration.websiteOrigin);

    if (previewEmailAuthorizedOrigin) {
      if (!envValue('TURNSTILE_SECRET_KEY', c)?.trim()) {
        return c.json({ error: 'Human verification is temporarily unavailable. Please try again later.' }, 503);
      }

      const challenge = await requirePublicTurnstile(c, {
        token: input.data.turnstile_token,
        submittedAction: input.data.turnstile_action,
        expectedAction: DEVCON26_TEST_PREVIEW_EMAIL_TURNSTILE_ACTION,
        expectedHostname: new URL(previewEmailAuthorizedOrigin).hostname,
      });

      if (challenge) return challenge;

      const assessment = await assessPublicSubmissionEmail(c, input.data.purchaser_email);

      if (assessment.status === 'invalid') return c.json(publicEmailErrorPayload(assessment), 422);
      if (assessment.status === 'unknown') {
        return c.json({ error: 'Email validation is temporarily unavailable. Please try again shortly.' }, 503);
      }

      for (const limit of [
        { action: 'devcon26-test-preview-email-ip-day', clientKey: publicClientKey(c), maxAttempts: 12 },
        { action: 'devcon26-test-preview-email-recipient-day', clientKey: input.data.purchaser_email, maxAttempts: 3 },
        { action: 'devcon26-test-preview-email-shared-day', clientKey: 'all', maxAttempts: 60 },
      ]) {
        const previewLimit = await enforcePublicRateLimit(c, {
          ...limit,
          windowSeconds: 86_400,
        }, 'The test email limit has been reached. Please try again tomorrow.');

        if (previewLimit) return previewLimit;
      }
    } else if (input.data.turnstile_token || input.data.turnstile_action) {
      return c.json({ error: 'This test checkout origin is not enabled for preview emails.' }, 403);
    }

    try {
      const requestKey = devcon26TestCheckoutRequestKey(configuration.websiteOrigin, input.data.checkout_request_key);
      const session = await prepareDevcon26TestSession(c, requestKey, input.data.tier_key,
        input.data.purchaser_name, input.data.purchaser_email, input.data.coupon_code,
        previewEmailAuthorizedOrigin ?? undefined);
      const summary = devcon26TestQuoteForSession(session);

      if (session.authorization_url) {
        if (!isPaystackCheckoutUrl(session.authorization_url)) throw new Error('test_checkout_invalid_url');

        return c.json({ ...summary, authorization_url: session.authorization_url, reference: session.payment_reference });
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

      return c.json({ ...summary, authorization_url: checkout.authorizationUrl, reference: session.payment_reference });
    } catch (error) {
      const couponError = devcon26CouponError(error);

      if (couponError) return c.json(couponError, couponError.coupon_error === 'unavailable' ? 409 : 400);
      const message = error instanceof Error ? error.message : '';
      const conflict = (['cart_conflict', 'in_progress', 'finished'] as const).find((code) => message.includes(`test_checkout_${code}`));

      return c.json({ error: conflict ? 'This test checkout is already in progress or finished. Please try again shortly.'
        : 'Test checkout could not start. Please try again shortly.', ...(conflict ? { checkout_error: conflict } : {}) }, conflict ? 409 : 503);
    }
  });

  app.post(`${DEVCON26_TEST_CHECKOUT_PATH}/verify`, async (c) => {
    const configuration = originConfigurationForRequest(c)!;
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
    const configuration = devcon26TestConfigurationForRequest(c);

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
