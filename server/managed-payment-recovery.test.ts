import { beforeEach, expect, it, vi } from 'vitest';
import type { Context } from 'hono';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), order: vi.fn(), confirm: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('./managed-conference-checkout', () => ({ managedCheckoutOrder: mocks.order, confirmManagedCheckout: mocks.confirm }));

import { reconcileManagedPayments } from './managed-payment-recovery';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation(async name => ({ error: null, data: name === 'claim_managed_payment_reconciliation' ? Array.from({ length: 8 }, (_, i) => ({ order_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, payment_reference: String(i) })) : null }));
  mocks.order.mockImplementation(async (_c, ref) => ({ id: `00000000-0000-4000-8000-${ref.padStart(12, '0')}`, payment_mode: 'live' }));
  mocks.confirm.mockResolvedValue({ status: 'verified' });
});

it('bounds a recovery job to eight confirmations and four concurrent provider calls', async () => {
  let active = 0;
  let peak = 0;

  mocks.confirm.mockImplementation(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active -= 1;

    return { status: 'verified' };
  });
  expect(await reconcileManagedPayments({} as Context)).toEqual({ checked: 8, resolved: 8, failed: 0 });
  expect(peak).toBe(4);
  expect(mocks.rpc).toHaveBeenCalledTimes(9);
});

it('retains failed provider checks for retry and resolves refund-required results', async () => {
  mocks.confirm.mockRejectedValueOnce(new Error('provider outage')).mockResolvedValueOnce({ status: 'refund_required' });
  expect(await reconcileManagedPayments({} as Context)).toEqual({ checked: 8, resolved: 7, failed: 1 });
  expect(mocks.rpc).toHaveBeenCalledWith('finish_managed_payment_reconciliation', expect.objectContaining({ p_resolved: false, p_error: true }));
});

it('does not acknowledge a failed lease claim as success', async () => {
  mocks.rpc.mockResolvedValue({ error: { message: 'offline' }, data: null });
  await expect(reconcileManagedPayments({} as Context)).rejects.toThrow('unavailable');
  expect(mocks.confirm).not.toHaveBeenCalled();
});

it('keeps abandoned or failed provider attempts eligible for later reconciliation', async () => {
  mocks.confirm.mockResolvedValue({ status: 'failed' });

  expect(await reconcileManagedPayments({} as Context)).toEqual({ checked: 8, resolved: 0, failed: 0 });
  expect(mocks.rpc).toHaveBeenCalledWith('finish_managed_payment_reconciliation', expect.objectContaining({ p_resolved: false, p_error: false }));
});
