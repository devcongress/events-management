import { beforeEach, expect, it, vi } from 'vitest';
import type { Context } from 'hono';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), inspect: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/paystack-diagnostics', () => ({ inspectStoredPaystackAttempt: mocks.inspect }));

import { checkUnresolvedPayments } from './unresolved-payment-diagnostics';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation(async (name) => ({ error: null, data: name === 'claim_unresolved_payment_diagnostics' ? Array.from({ length: 8 }, (_, index) => ({
    order_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, payment_reference: `reference-${index}`, payment_mode: index % 2 ? 'test' : 'live',
  })) : null }));
  mocks.inspect.mockResolvedValue({ status: 'pending', reason: null });
});

it('bounds a diagnostic batch to eight attempts and four concurrent inspections', async () => {
  let active = 0;
  let peak = 0;

  mocks.inspect.mockImplementation(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active -= 1;

    return { status: 'pending', reason: null };
  });
  expect(await checkUnresolvedPayments({} as Context)).toEqual({ checked: 8, failed: 0 });
  expect(peak).toBe(4);
  expect(mocks.inspect).toHaveBeenCalledWith(expect.anything(), { reference: 'reference-1', mode: 'test' });
  expect(mocks.rpc).toHaveBeenCalledTimes(9);
  const claim = mocks.rpc.mock.calls[0][1].p_claim;

  for (const [, args] of mocks.rpc.mock.calls.slice(1)) expect(args.p_claim).toBe(claim);
});

it('acknowledges errors for retry without invoking fulfillment', async () => {
  mocks.inspect.mockRejectedValueOnce(new Error('unavailable'));
  expect(await checkUnresolvedPayments({} as Context)).toEqual({ checked: 8, failed: 1 });
  expect(mocks.rpc.mock.calls.slice(1).every(([name]) => name === 'finish_unresolved_payment_diagnostic')).toBe(true);
});

it('fails closed when claim or acknowledgement fails', async () => {
  mocks.rpc.mockResolvedValueOnce({ error: {}, data: null });
  await expect(checkUnresolvedPayments({} as Context)).rejects.toThrow('unavailable');
  expect(mocks.inspect).not.toHaveBeenCalled();
});
