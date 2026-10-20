import { describe, expect, it, vi } from 'vitest';
import { inspectPaystackLiveRefund } from './annual-conference-paystack-refunds';

const base = {
  secretKey: 'sk_live_test-only',
  refundId: '8342',
  paymentReference: 'devcon26_order1',
  providerTransactionId: '7381',
};

function mockFetch(refund: Record<string, unknown>, transaction: Record<string, unknown>) {
  const fetcher = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.method).toBe('GET');
    expect(url).toMatch(/^https:\/\/api\.paystack\.co\/(refund\/8342|transaction\/verify\/devcon26_order1)$/);

    return Response.json({ status: true, data: url.includes('/refund/') ? refund : transaction });
  });

  return fetcher as unknown as typeof fetch;
}

const refund = {
  id: 8342,
  domain: 'live',
  transaction: 7381,
  amount: 15_000,
  currency: 'GHS',
  status: 'processed',
};
const transaction = {
  id: 7381,
  reference: 'devcon26_order1',
  domain: 'live',
  currency: 'GHS',
  amount: 30_000,
  status: 'reversed',
};

describe('Paystack refund reconciliation', () => {
  it('accepts a processed GHS 150 refund tied to the original live transaction', async () => {
    const fetcher = mockFetch(refund, transaction);
    const result = await inspectPaystackLiveRefund({ ...base, fetcher });

    expect(result).toMatchObject({ status: 'processed', refundId: '8342' });
    expect(result.status === 'processed' && result.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    [{ ...refund, amount: 14_999 }, transaction],
    [{ ...refund, currency: 'NGN' }, transaction],
    [{ ...refund, domain: 'test' }, transaction],
    [{ ...refund, transaction: 9999 }, transaction],
    [refund, { ...transaction, reference: 'another_order' }],
    [refund, { ...transaction, id: 9999 }],
    [refund, { ...transaction, status: 'success' }],
  ])('rejects mismatched refund evidence', async (refundData, transactionData) => {
    await expect(inspectPaystackLiveRefund({
      ...base,
      fetcher: mockFetch(refundData, transactionData),
    })).rejects.toThrow();
  });

  it('treats processing as suspended and verifies a failed refund before restoration', async () => {
    expect(await inspectPaystackLiveRefund({
      ...base,
      fetcher: mockFetch({ ...refund, status: 'processing' }, { ...transaction, status: 'reversal pending' }),
    })).toEqual({ status: 'pending' });
    const failed = await inspectPaystackLiveRefund({
      ...base,
      fetcher: mockFetch({ ...refund, status: 'failed' }, { ...transaction, status: 'success' }),
    });

    expect(failed).toMatchObject({ status: 'failed', refundId: '8342' });
    expect(failed.status === 'failed' && failed.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(inspectPaystackLiveRefund({
      ...base,
      fetcher: mockFetch({ ...refund, status: 'failed', transaction: 222 }, { ...transaction, status: 'success' }),
    })).rejects.toThrow();
  });
});
