import crypto from 'node:crypto';
import { z } from 'zod';

const providerIdSchema = z.union([
  z.number().int().positive().safe(),
  z.string().regex(/^[1-9][0-9]*$/),
]);
const providerTransactionSchema = z.union([
  providerIdSchema,
  z.object({ id: providerIdSchema, reference: z.string().min(1) }).passthrough(),
]);
const refundResponseSchema = z.object({
  status: z.literal(true),
  data: z.object({
    id: providerIdSchema,
    domain: z.literal('live'),
    transaction: providerTransactionSchema,
    amount: z.literal(15_000),
    currency: z.literal('GHS'),
    status: z.string(),
  }).passthrough(),
});
const transactionResponseSchema = z.object({
  status: z.literal(true),
  data: z.object({
    id: providerIdSchema,
    reference: z.string().min(1),
    domain: z.literal('live'),
    currency: z.literal('GHS'),
    amount: z.number().int().min(15_000),
    status: z.string().min(1),
  }).passthrough(),
});

export type PaystackRefundInspection =
  | { status: 'processed'; refundId: string; payloadSha256: string }
  | { status: 'pending' }
  | { status: 'failed'; refundId: string; payloadSha256: string };

async function getPaystackJson(url: string, secretKey: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error('Paystack refund verification unavailable.');

  return response.json();
}

export async function inspectPaystackLiveRefund(input: {
  secretKey: string;
  refundId: string;
  paymentReference: string;
  providerTransactionId?: string | null;
  fetcher?: typeof fetch;
}): Promise<PaystackRefundInspection> {
  if (!input.secretKey.startsWith('sk_live_') || input.secretKey.length <= 8
    || !/^[1-9][0-9]{0,18}$/.test(input.refundId)
    || !input.paymentReference || input.paymentReference.length > 200) {
    throw new Error('Paystack refund verification unavailable.');
  }

  const fetcher = input.fetcher ?? fetch;
  const refundPayload = await getPaystackJson(`https://api.paystack.co/refund/${input.refundId}`, input.secretKey, fetcher);
  const parsedRefund = refundResponseSchema.safeParse(refundPayload);

  if (!parsedRefund.success || String(parsedRefund.data.data.id) !== input.refundId) {
    throw new Error('Paystack refund verification unavailable.');
  }

  const refund = parsedRefund.data.data;

  const transactionPayload = await getPaystackJson(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(input.paymentReference)}`,
    input.secretKey,
    fetcher,
  );
  const parsedTransaction = transactionResponseSchema.safeParse(transactionPayload);

  if (!parsedTransaction.success || parsedTransaction.data.data.reference !== input.paymentReference) {
    throw new Error('Paystack refund transaction does not match the order.');
  }

  const transaction = parsedTransaction.data.data;
  const refundTransactionId = typeof refund.transaction === 'object'
    ? refund.transaction.id : refund.transaction;

  if (String(refundTransactionId) !== String(transaction.id)
    || (input.providerTransactionId && String(transaction.id) !== input.providerTransactionId)
    || (typeof refund.transaction === 'object' && refund.transaction.reference !== input.paymentReference)) {
    throw new Error('Paystack refund transaction does not match the order.');
  }

  const evidence = {
    provider: 'paystack',
    refundId: input.refundId,
    transactionId: String(transaction.id),
    paymentReference: input.paymentReference,
    amountMinor: refund.amount,
    currency: refund.currency,
    status: refund.status,
    domain: refund.domain,
    transactionStatus: transaction.status,
  };
  const payloadSha256 = crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');

  if (refund.status === 'failed') {
    if (transaction.status !== 'success') throw new Error('Paystack refund and transaction states do not match.');

    return { status: 'failed', refundId: input.refundId, payloadSha256 };
  }
  if (refund.status !== 'processed') return { status: 'pending' };
  if (transaction.status !== 'reversed') throw new Error('Paystack refund and transaction states do not match.');

  return {
    status: 'processed',
    refundId: input.refundId,
    payloadSha256,
  };
}
