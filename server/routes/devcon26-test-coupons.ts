import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { createDevcon26TestCouponSchema, validateDevcon26TestCouponDiscount } from '@/lib/devcon26-test-coupons';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { getSupabaseAnnualConferencePublicTicketPrices } from '@/lib/supabase/annual-conference-ticketing';
import { createDevcon26TestCoupon, listDevcon26TestCoupons, toggleDevcon26TestCoupon } from '@/lib/supabase/devcon26-test-coupons';
import type { AppBindings } from '@/server/http/app-bindings';
import { requireAnnualConferenceCapability } from '@/server/annual-conference-request';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';

const path = '/api/annual-conference/:year/ticketing/test-coupons';
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  page_size: z.coerce.number().int().min(1).max(50).default(25),
  checkout_page: z.coerce.number().int().min(1).max(10_000).default(1),
  checkout_page_size: z.coerce.number().int().min(1).max(50).default(25),
}).strict();
const toggleSchema = z.object({ enabled: z.boolean() }).strict();

async function couponOperator(c: Context) {
  if (c.req.param('year') !== '2026') return { error: c.json({ error: 'Test coupons are available for DevCon26 only.' }, 400), actor: null };
  const sessionError = await requireAdmin(c, ['owner', 'organizer', 'volunteer']);

  if (sessionError) return { error: sessionError, actor: null };
  const denied = await requireAnnualConferenceCapability(c, 2026, 'ticketing.manage');

  if (denied) return { error: denied, actor: null };
  const session = c.get('adminSession') ?? await getAdminSession(c);

  if (!session.authenticated || !session.email) return { error: c.json({ error: 'Conference ticketing access required.' }, 403), actor: null };

  return { error: null, actor: session.email };
}

export function registerDevcon26TestCouponRoutes(app: Hono<AppBindings>) {
  app.get(path, async (c) => {
    const owner = await couponOperator(c);

    if (owner.error) return owner.error;
    const query = querySchema.safeParse(c.req.query());

    if (!query.success) return c.json({ error: 'Choose a valid coupon page.' }, 400);

    try {
      return c.json(await listDevcon26TestCoupons(c, query.data));
    } catch {
      return c.json({ error: 'Test coupon storage is not available.' }, 503);
    }
  });

  app.post(path, async (c) => {
    const owner = await couponOperator(c);

    if (owner.error) return owner.error;
    const input = createDevcon26TestCouponSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: input.error.issues[0]?.message ?? 'Check the coupon details.' }, 400);

    try {
      const prices = await getSupabaseAnnualConferencePublicTicketPrices(2026, c, 'sandbox');

      if (!prices) return c.json({ error: 'Current ticket prices are not available.' }, 503);

      const priceError = validateDevcon26TestCouponDiscount(input.data, prices);

      if (priceError) return c.json({ error: priceError }, 400);

      const coupon = await createDevcon26TestCoupon(c, input.data, owner.actor!);

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.test_coupon.create', targetType: 'devcon26_test_coupon', targetId: coupon.id,
        metadata: { edition_year: 2026 },
      });

      return c.json({ coupon }, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'test_coupon_invalid') {
        return c.json({ error: 'The fixed discount must be less than the lowest selected ticket price.' }, 400);
      }

      return c.json({ error: 'The test coupon could not be created.' }, 503);
    }
  });

  app.patch(`${path}/:couponId`, async (c) => {
    const owner = await couponOperator(c);

    if (owner.error) return owner.error;
    const id = z.string().uuid().safeParse(c.req.param('couponId'));
    const input = toggleSchema.safeParse(await c.req.json().catch(() => null));

    if (!id.success || !input.success) return c.json({ error: 'Only coupon availability can be changed.' }, 400);

    try {
      const coupon = await toggleDevcon26TestCoupon(c, id.data, input.data.enabled, owner.actor!);

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.test_coupon.toggle', targetType: 'devcon26_test_coupon', targetId: coupon.id,
        metadata: { edition_year: 2026, enabled: coupon.enabled },
      });

      return c.json({ coupon });
    } catch (error) {
      if (error instanceof Error && error.message === 'test_coupon_not_found') return c.json({ error: 'Test coupon not found.' }, 404);

      return c.json({ error: 'The test coupon could not be updated.' }, 503);
    }
  });
}
