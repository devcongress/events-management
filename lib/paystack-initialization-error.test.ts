import { expect, it, vi } from 'vitest';
import { createPaystackHostedCheckout } from './annual-conference-ticket-payments';

const input = { secretKey: 'sk_live_synthetic', orderId: '10000000-0000-4000-8000-000000000001', purchaserEmail: 'test@example.test', amountMinor: 15299, callbackUrl: 'https://example.test/callback' };

it('allows retry only for explicit structured validation rejection', async () => {
  await expect(createPaystackHostedCheckout({ ...input, fetcher: vi.fn().mockResolvedValue(Response.json({ status: false, code: 'invalid_amount' }, { status: 400 })) as unknown as typeof fetch })).rejects.toMatchObject({ definitelyRejected: true });
  for (const status of [400, 409, 429, 500]) {
    await expect(createPaystackHostedCheckout({ ...input, fetcher: vi.fn().mockResolvedValue(Response.json({ status: false, message: 'unknown outcome' }, { status })) as unknown as typeof fetch })).rejects.toMatchObject({ definitelyRejected: false });
  }
  await expect(createPaystackHostedCheckout({ ...input, fetcher: vi.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch })).rejects.toMatchObject({ definitelyRejected: false });
});
