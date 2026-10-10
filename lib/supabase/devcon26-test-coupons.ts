import type { Context } from 'hono';
import type { Devcon26TestCouponInput, Devcon26TestCouponsResponse } from '@/lib/devcon26-test-coupons';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

export async function listDevcon26TestCoupons(c: Context, input: {
  page: number; page_size: number; checkout_page: number; checkout_page_size: number;
}): Promise<Devcon26TestCouponsResponse> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('list_devcon26_test_coupons', {
    p_year: 2026, p_page: input.page, p_page_size: input.page_size,
    p_checkout_page: input.checkout_page, p_checkout_page_size: input.checkout_page_size,
  });

  if (error || !data) throw new Error('test_coupon_storage_unavailable');

  return data as unknown as Devcon26TestCouponsResponse;
}

export async function createDevcon26TestCoupon(c: Context, input: Devcon26TestCouponInput, actorEmail: string) {
  const { data, error } = await getSupabaseAdminClient(c).rpc('create_devcon26_test_coupon', {
    p_year: 2026, p_code: input.code, p_discount_type: input.discount_type, p_discount_value: input.discount_value,
    p_eligible_tiers: input.eligible_tiers, p_expires_at: input.expires_at,
    p_max_completed: input.max_completed, p_actor_email: actorEmail,
  });

  if (error || !data) throw new Error(error?.code === '23505' ? 'test_coupon_duplicate' : 'test_coupon_storage_unavailable');

  return { id: data.id };
}

export async function toggleDevcon26TestCoupon(c: Context, id: string, enabled: boolean, actorEmail: string) {
  const { data, error } = await getSupabaseAdminClient(c).rpc('toggle_devcon26_test_coupon', {
    p_id: id, p_enabled: enabled, p_actor_email: actorEmail,
  });

  if (error || !data) throw new Error(error?.message?.includes('test_coupon_not_found')
    ? 'test_coupon_not_found' : 'test_coupon_storage_unavailable');

  return { id: data.id, enabled: data.enabled };
}
