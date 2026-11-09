import type { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '@/lib/supabase/admin-auth';
import { managedCheckoutRpc } from '@/server/managed-conference-checkout';
import type { AppBindings } from '@/server/http/app-bindings';

const publicPath = '/api/public/annual-conference/2026/attendance-counter';
const ownerPath = '/api/annual-conference/2026/attendance-counter';
const resultSchema = z.object({
  count: z.number().int().nonnegative(),
  source: z.literal('ticket_count'),
  baseline: z.literal(20),
  purchases: z.number().int().nonnegative(),
});

export function registerAnnualConferenceAttendanceCounter(app: Hono<AppBindings>): void {
  app.get(publicPath, async (c) => {
    c.header('Cache-Control', 'no-store');

    try {
      const result = resultSchema.parse(await managedCheckoutRpc(c, 'read_annual_conference_attendance_counter', { p_year: 2026 }));

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
      return c.json(resultSchema.parse(await managedCheckoutRpc(c, 'read_annual_conference_attendance_counter', { p_year: 2026 })));
    } catch {
      return c.json({ error: 'Ticket counter is temporarily unavailable.' }, 503);
    }
  });
}
