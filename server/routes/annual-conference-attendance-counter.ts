import type { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { managedCheckoutRpc } from '@/server/managed-conference-checkout';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import type { AppBindings } from '@/server/http/app-bindings';

const publicPath = '/api/public/annual-conference/2026/attendance-counter';
const ownerPath = '/api/annual-conference/2026/attendance-counter';
const resultSchema = z.object({
  count: z.number().int().nonnegative(),
  source: z.literal('ticket_count'),
  baseline: z.number().int().nonnegative(),
  purchases: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});
const updateSchema = z.object({
  baseline: z.number().int().min(0).max(2147483647),
  version: z.number().int().min(0).max(2147483647),
}).strict();

export function registerAnnualConferenceAttendanceCounter(app: Hono<AppBindings>): void {
  app.get(publicPath, async (c) => {
    c.header('Cache-Control', 'no-store');

    try {
      const result = resultSchema.parse(await managedCheckoutRpc(c, 'read_annual_conference_ticket_counter', { p_year: 2026 }));

      return c.json({ count: result.count, source: result.source });
    } catch {
      return c.json({ error: 'Ticket counter is temporarily unavailable.' }, 503);
    }
  });

  app.get(ownerPath, async (c) => {
    const denied = await requireAdmin(c, ['owner']);

    if (denied) return denied;
    c.header('Cache-Control', 'private, no-store');

    try {
      return c.json(resultSchema.parse(await managedCheckoutRpc(c, 'read_annual_conference_ticket_counter', { p_year: 2026 })));
    } catch {
      return c.json({ error: 'Ticket counter is temporarily unavailable.' }, 503);
    }
  });

  app.patch(ownerPath, async (c) => {
    const denied = await requireAdmin(c, ['owner']);

    if (denied) return denied;
    c.header('Cache-Control', 'private, no-store');

    const body = await c.req.json().catch(() => null);
    const input = updateSchema.safeParse(body);

    if (!input.success) return c.json({ error: 'Provide a valid baseline and version.' }, 400);

    try {
      const result = resultSchema.parse(await managedCheckoutRpc(c, 'set_annual_conference_attendance_baseline', {
        p_year: 2026,
        p_baseline: input.data.baseline,
        p_version: input.data.version,
      }));

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.attendance_baseline.update',
        targetType: 'annual_conference',
        targetId: '2026',
        metadata: { baseline: result.baseline, version: result.version },
      }).catch(() => undefined);

      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'attendance_baseline_conflict') {
        return c.json({ error: 'The ticket counter changed. Refresh and try again.' }, 409);
      }

      return c.json({ error: 'Ticket counter is temporarily unavailable.' }, 503);
    }
  });
}
