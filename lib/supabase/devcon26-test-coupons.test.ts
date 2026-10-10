import type { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Devcon26TestCouponInput } from '@/lib/devcon26-test-coupons';
import { createDevcon26TestCoupon } from './devcon26-test-coupons';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdminClient: () => ({ rpc }),
}));

const context = {} as Context;
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const input: Devcon26TestCouponInput = {
  discount_type: 'fixed_minor',
  discount_value: 1000,
  eligible_tiers: ['regular', 'team_3'],
  expires_at: '2099-12-19T23:00:00Z',
  max_completed: 5,
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (_name: string, parameters: { p_code: string }) => ({
    data: { id, code: parameters.p_code, created_by_email: 'owner@example.test' }, error: null,
  }));
  let sequence = 0;

  vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    (array as Uint8Array).fill(sequence++);

    return array;
  });
});

afterEach(() => vi.restoreAllMocks());

describe('server-generated test coupon codes', () => {
  it('generates 16 uniformly mapped random characters and keeps the existing test-only RPC terms', async () => {
    const coupon = await createDevcon26TestCoupon(context, input, 'owner@example.test');

    expect(crypto.getRandomValues).toHaveBeenCalledOnce();
    expect(vi.mocked(crypto.getRandomValues).mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect(vi.mocked(crypto.getRandomValues).mock.calls[0][0]?.byteLength).toBe(16);
    expect(coupon).toEqual({ id, code: 'TEST-AAAA-AAAA-AAAA-AAAA' });
    expect(coupon.code).toMatch(/^TEST-(?:[A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('create_devcon26_test_coupon', {
      p_year: 2026,
      p_code: coupon.code,
      p_discount_type: input.discount_type,
      p_discount_value: input.discount_value,
      p_eligible_tiers: input.eligible_tiers,
      p_expires_at: input.expires_at,
      p_max_completed: input.max_completed,
      p_actor_email: 'owner@example.test',
    });
  });

  it('returns the stored identity and code without exposing the full service-role row', async () => {
    rpc.mockResolvedValueOnce({
      data: { id, code: 'TEST-STORED', created_by_email: 'owner@example.test' }, error: null,
    });

    expect(await createDevcon26TestCoupon(context, input, 'owner@example.test'))
      .toEqual({ id, code: 'TEST-STORED' });
  });

  it.each([1, 3])('retries %i unique collisions with fresh candidates', async (collisions) => {
    for (let attempt = 0; attempt < collisions; attempt++) {
      rpc.mockResolvedValueOnce({ data: null, error: { code: '23505' } });
    }
    const coupon = await createDevcon26TestCoupon(context, input, 'owner@example.test');
    const codes = rpc.mock.calls.map((call) => call[1].p_code);

    expect(rpc).toHaveBeenCalledTimes(collisions + 1);
    expect(new Set(codes).size).toBe(collisions + 1);
    expect(coupon.code).toBe(codes.at(-1));
  });

  it('stops after four collisions without an unbounded creation loop', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505' } });

    await expect(createDevcon26TestCoupon(context, input, 'owner@example.test'))
      .rejects.toThrow('test_coupon_storage_unavailable');
    expect(rpc).toHaveBeenCalledTimes(4);
  });

  it.each(['42501', 'PGRST202', '57014'])('does not retry non-unique database failure %s', async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'Private database details' } });

    await expect(createDevcon26TestCoupon(context, input, 'owner@example.test'))
      .rejects.toThrow('test_coupon_storage_unavailable');
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each([null, {}, { id }, { id: 'invalid', code: 'TEST-STORED' }, { id, code: '<script>' }])(
    'does not retry missing or malformed success data %j', async (data) => {
      rpc.mockResolvedValue({ data, error: null });

      await expect(createDevcon26TestCoupon(context, input, 'owner@example.test'))
        .rejects.toThrow('test_coupon_storage_unavailable');
      expect(rpc).toHaveBeenCalledOnce();
    },
  );

  it('does not retry an ambiguous transport failure that may have already created a coupon', async () => {
    rpc.mockRejectedValue(new Error('Network unavailable'));

    await expect(createDevcon26TestCoupon(context, input, 'owner@example.test')).rejects.toThrow('Network unavailable');
    expect(rpc).toHaveBeenCalledOnce();
  });
});
