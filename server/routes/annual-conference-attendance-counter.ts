import type { Hono } from 'hono';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { managedCheckoutRpc } from '@/server/managed-conference-checkout';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import type { AppBindings } from '@/server/http/app-bindings';

const publicPath = '/api/public/annual-conference/2026/attendance-counter';
const ownerPath = '/api/annual-conference/2026/attendance-counter';
const resultSchema = z.object({ count: z.number().int().nonnegative().nullable(), source: z.enum(['estimate', 'actual']).nullable(), version: z.number().int().nonnegative() });
const inputSchema = z.object({ source: z.enum(['estimate', 'actual']), version: z.number().int().nonnegative(), confirmed: z.literal(true) }).strict();

export function registerAnnualConferenceAttendanceCounter(app: Hono<AppBindings>): void {
  app.get(publicPath, async (c) => {
    c.header('Cache-Control', 'no-store');

    try {
      const result = resultSchema.parse(await managedCheckoutRpc(c, 'read_annual_conference_attendance_counter', { p_year: 2026 }));

      return c.json({ count: result.count, source: result.source });
    } catch {
      return c.json({ error: 'Attendance counter is temporarily unavailable.' }, 503);
    }
  });

  app.get(ownerPath, async (c) => {
    const denied = await requireAdmin(c, ['owner']);

    if (denied) return denied;
    c.header('Cache-Control', 'private, no-store');

    try {
      return c.json(resultSchema.parse(await managedCheckoutRpc(c, 'read_annual_conference_attendance_counter', { p_year: 2026 })));
    } catch {
      return c.json({ error: 'Attendance counter is temporarily unavailable.' }, 503);
    }
  });

  app.patch(ownerPath, async (c) => {
    const denied = await requireAdmin(c, ['owner']);

    if (denied) return denied;
    c.header('Cache-Control', 'private, no-store');
    if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return c.json({ error: 'Use a JSON request.' }, 415);
    const input = inputSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Confirm the attendance counter change.' }, 400);

    try {
      const session = await getAdminSession(c);

      if (!session.authenticated) return c.json({ error: 'Authentication required.' }, 401);
      const result = resultSchema.parse(await managedCheckoutRpc(c, 'configure_annual_conference_attendance_counter', {
        p_year: 2026, p_source: input.data.source, p_version: input.data.version,
      }));

      await recordProtectedMutationAudit(c, { action: 'annual_conference.attendance_counter', targetType: 'annual_conference_edition', targetId: '2026', metadata: { source: result.source, version: result.version } });

      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('attendance_counter_changed')) return c.json({ error: 'The counter changed. Refresh before trying again.' }, 409);
      if (error instanceof Error && error.message.includes('attendance_counter_date_missing')) return c.json({ error: 'Set a future conference date before publishing an estimate.' }, 409);

      return c.json({ error: 'Attendance counter is temporarily unavailable.' }, 503);
    }
  });
}
