import type { Context } from 'hono';
import { z } from 'zod';
import type { Devcon26TestCouponCreated, Devcon26TestCouponInput, Devcon26TestCouponsResponse } from '@/lib/devcon26-test-coupons';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

const couponAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const maxCodeAttempts = 4;
const createdCouponSchema = z.object({
  id: z.uuid(),
  code: z.string().regex(/^[A-Z0-9-]{3,48}$/),
});

function generateCouponCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // A 32-character alphabet keeps each masked byte uniform, with 80 random bits.
  const characters = Array.from(bytes, (byte) => couponAlphabet[byte & 31]).join('');
  const groups = characters.match(/.{4}/g)!;

  return `TEST-${groups.join('-')}`;
}

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

export async function createDevcon26TestCoupon(
  c: Context, input: Devcon26TestCouponInput, actorEmail: string,
): Promise<Devcon26TestCouponCreated> {
  const client = getSupabaseAdminClient(c);

  for (let attempt = 0; attempt < maxCodeAttempts; attempt++) {
    const { data, error } = await client.rpc('create_devcon26_test_coupon', {
      p_year: 2026,
      p_code: generateCouponCode(),
      p_discount_type: input.discount_type,
      p_discount_value: input.discount_value,
      p_eligible_tiers: input.eligible_tiers,
      p_expires_at: input.expires_at,
      p_max_completed: input.max_completed,
      p_actor_email: actorEmail,
    });

    if (error?.code === '23505') continue;
    if (error) throw new Error('test_coupon_storage_unavailable');

    const coupon = createdCouponSchema.safeParse(data);

    if (!coupon.success) throw new Error('test_coupon_storage_unavailable');

    return coupon.data;
  }

  throw new Error('test_coupon_storage_unavailable');
}

export async function toggleDevcon26TestCoupon(c: Context, id: string, enabled: boolean, actorEmail: string) {
  const { data, error } = await getSupabaseAdminClient(c).rpc('toggle_devcon26_test_coupon', {
    p_id: id, p_enabled: enabled, p_actor_email: actorEmail,
  });

  if (error || !data) throw new Error(error?.message?.includes('test_coupon_not_found')
    ? 'test_coupon_not_found' : 'test_coupon_storage_unavailable');

  return { id: data.id, enabled: data.enabled };
}
