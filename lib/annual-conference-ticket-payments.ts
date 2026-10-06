import crypto from 'node:crypto';
import { z } from 'zod';

export type AnnualConferencePaymentProvider = 'paystack';

export type AnnualConferencePaymentConfiguration = {
  enabled: boolean;
  provider: AnnualConferencePaymentProvider | null;
  secretKey: string | null;
};

const paystackWebhookSchema = z.object({
  event: z.string().trim().min(1).max(120),
  data: z.object({
    id: z.union([z.string(), z.number().int().nonnegative()]),
    reference: z.string().trim().min(1).max(200),
    amount: z.number().int().nonnegative(),
    currency: z.string().trim().length(3),
    status: z.string().trim().min(1).max(80),
    metadata: z.object({ order_id: z.string().uuid().optional() }).passthrough().optional(),
  }).passthrough(),
}).passthrough();

const paystackInitializationSchema = z.object({
  status: z.literal(true),
  data: z.object({ authorization_url: z.string().url() }),
});

function enabledFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function annualConferencePaymentConfiguration(env: Record<string, string | undefined>): AnnualConferencePaymentConfiguration {
  const provider = env.DEVCON26_PAYMENT_PROVIDER?.trim().toLowerCase();
  const secretKey = env.PAYSTACK_SECRET_KEY?.trim() || null;

  if (provider !== 'paystack' || !enabledFlag(env.DEVCON26_PAYMENTS_ENABLED) || !secretKey) {
    return { enabled: false, provider: null, secretKey: null };
  }

  return { enabled: true, provider: 'paystack', secretKey };
}

function signatureMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;

  const providedBytes = Buffer.from(provided.trim(), 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');

  return providedBytes.length === expectedBytes.length && crypto.timingSafeEqual(providedBytes, expectedBytes);
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string | null, secretKey: string): boolean {
  const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

  return signatureMatches(signature, expected);
}

export type VerifiedPaystackCharge = {
  provider: 'paystack';
  paymentReference: string;
};

export type VerifiedPaystackTransaction = {
  provider: 'paystack';
  providerEventId: string;
  eventType: 'charge.success';
  paymentReference: string;
  amountMinor: number;
  currency: string;
  facts: Record<string, string | number>;
};

export function parseVerifiedPaystackCharge(rawBody: string): VerifiedPaystackCharge | null {
  const parsed = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  })();
  const payload = paystackWebhookSchema.safeParse(parsed);

  if (!payload.success || payload.data.event !== 'charge.success' || payload.data.data.status !== 'success') return null;

  return {
    provider: 'paystack',
    paymentReference: payload.data.data.reference,
  };
}

export async function verifyPaystackTransaction(input: {
  secretKey: string;
  paymentReference: string;
  fetcher?: typeof fetch;
}): Promise<VerifiedPaystackTransaction> {
  const response = await (input.fetcher ?? fetch)(`https://api.paystack.co/transaction/verify/${encodeURIComponent(input.paymentReference)}`, {
    headers: { Authorization: `Bearer ${input.secretKey}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const responsePayload = response ? await response.json().catch(() => null) : null;
  const parsed = paystackWebhookSchema.safeParse({ event: 'charge.success', data: responsePayload?.data });

  if (!response?.ok || !parsed.success || parsed.data.data.status !== 'success' || parsed.data.data.reference !== input.paymentReference) {
    throw new Error('Paystack could not verify payment.');
  }

  return {
    provider: 'paystack',
    providerEventId: `charge:${parsed.data.data.id}`,
    eventType: 'charge.success',
    paymentReference: parsed.data.data.reference,
    amountMinor: parsed.data.data.amount,
    currency: parsed.data.data.currency.toUpperCase(),
    facts: {
      id: String(parsed.data.data.id),
      amount: parsed.data.data.amount,
      currency: parsed.data.data.currency.toUpperCase(),
      status: parsed.data.data.status,
    },
  };
}

export function paystackReferenceForTicketOrder(orderId: string): string {
  return `devcon26_${orderId.replaceAll('-', '')}`;
}

export async function createPaystackHostedCheckout(input: {
  secretKey: string;
  orderId: string;
  purchaserEmail: string;
  amountMinor: number;
  callbackUrl: string;
  fetcher?: typeof fetch;
}): Promise<{ authorizationUrl: string; paymentReference: string }> {
  const reference = paystackReferenceForTicketOrder(input.orderId);
  const response = await (input.fetcher ?? fetch)('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.purchaserEmail,
      amount: input.amountMinor,
      currency: 'GHS',
      reference,
      callback_url: input.callbackUrl,
      metadata: { order_id: input.orderId },
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  const parsed = response ? paystackInitializationSchema.safeParse(await response.json().catch(() => null)) : null;

  if (!response?.ok || !parsed?.success) throw new Error('Paystack could not initialize checkout.');

  return { authorizationUrl: parsed.data.data.authorization_url, paymentReference: reference };
}
