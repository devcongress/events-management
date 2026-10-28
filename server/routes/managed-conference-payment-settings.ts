import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { managedCheckoutSettingsSchema, managedPaymentModeSchema } from '@/lib/managed-conference-checkout';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { registrationTesting } from '@/server/annual-conference-registration-testing';
import { managedCheckoutReadiness, managedCheckoutRpc, managedCheckoutSettings } from '@/server/managed-conference-checkout';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import type { AppBindings } from '@/server/http/app-bindings';

const paymentSettingsPath = '/api/annual-conference/:year/registrations/payment-mode';
const paymentSettingsSchema = z.object({
  payment_mode: managedPaymentModeSchema,
  settings_version: z.number().int().positive().safe(),
  tester_emails: z.array(z.string().trim().toLowerCase().email().max(254)
    .refine((email) => !email.includes('*'))).max(200)
    .transform((emails) => [...new Set(emails)].sort()),
  confirmed: z.literal(true),
}).strict();

function paymentSettingsFailure(c: Context<AppBindings>, error: unknown) {
  if (error instanceof Error && error.message.includes('checkout_settings_changed')) {
    return c.json({ error: 'Payment settings changed. Reload them before saving again.', code: 'checkout_settings_changed' }, 409);
  }

  return c.json({ error: 'Payment settings are temporarily unavailable.' }, 503);
}

export function registerManagedConferencePaymentSettings(app: Hono<AppBindings>): void {
  app.get(paymentSettingsPath, async (c) => {
    const denied = await requireAdmin(c, ['owner']);

    if (denied) return denied;
    if (c.req.param('year') !== '2026') return c.json({ error: 'Payment settings are unavailable for this conference.' }, 404);

    c.header('Cache-Control', 'private, no-store');

    try {
      const settings = await managedCheckoutSettings(c, 2026);

      if (!settings) return c.json({ error: 'Payment settings are temporarily unavailable.' }, 503);
      const testing = await registrationTesting(c, settings.edition_id);

      return c.json({
        ...settings,
        tester_emails: testing.tester_emails,
        readiness: {
          test: managedCheckoutReadiness(c, 'test'),
          live: managedCheckoutReadiness(c, 'live'),
        },
      });
    } catch (error) {
      return paymentSettingsFailure(c, error);
    }
  });

  app.patch(paymentSettingsPath, async (c) => {
    const denied = await requireAdmin(c, ['owner']);

    if (denied) return denied;
    if (c.req.param('year') !== '2026') return c.json({ error: 'Payment settings are unavailable for this conference.' }, 404);

    c.header('Cache-Control', 'private, no-store');

    if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return c.json({ error: 'Use a JSON payment settings request.' }, 415);
    }
    const input = paymentSettingsSchema.safeParse(await c.req.json().catch(() => null));

    if (!input.success) return c.json({ error: 'Confirm the payment mode and use up to 200 valid approved email addresses.' }, 400);

    try {
      const settings = await managedCheckoutSettings(c, 2026);
      const session = await getAdminSession(c);

      if (!settings || !session.authenticated) return c.json({ error: 'Payment settings are temporarily unavailable.' }, 503);
      if (input.data.settings_version !== settings.settings_version) {
        return c.json({ error: 'Payment settings changed. Reload them before saving again.', code: 'checkout_settings_changed' }, 409);
      }
      if (settings.payment_mode === 'test' && input.data.payment_mode === 'live') {
        const readiness = managedCheckoutReadiness(c, 'live');

        if (!readiness.ready) return c.json({ error: 'This payment mode is not ready.', code: 'payment_mode_not_ready', readiness }, 409);
      }
      const result = await managedCheckoutRpc(c, 'configure_managed_conference_payment_mode', {
        p_edition_id: settings.edition_id,
        p_mode: input.data.payment_mode,
        p_settings_version: input.data.settings_version,
        p_actor: session.email,
        p_tester_emails: input.data.tester_emails,
      });
      const updated = managedCheckoutSettingsSchema.parse(result);

      await recordProtectedMutationAudit(c, {
        action: 'annual_conference.payment_mode',
        targetType: 'annual_conference_edition',
        targetId: settings.edition_id,
        metadata: {
          from: settings.payment_mode,
          to: updated.payment_mode,
          settings_version: updated.settings_version,
          tester_count: input.data.tester_emails.length,
        },
      });

      return c.json(updated);
    } catch (error) {
      return paymentSettingsFailure(c, error);
    }
  });
}
