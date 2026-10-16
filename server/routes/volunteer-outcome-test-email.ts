import crypto from 'node:crypto';
import type { Context } from 'hono';
import { z } from 'zod';
import { recordResendEmailHealth } from '@/lib/email/delivery-health';
import { ResendBatchError, sendResendEmailBatch } from '@/lib/email/resend';
import { emailSubjects } from '@/lib/email/scenarios';
import { volunteerOutcomeEmailPreview } from '@/lib/email/templates/volunteer-follow-up';
import { markTestEventTitle } from '@/lib/event-test-mode';
import { getAdminSession, requireAdmin } from '@/lib/supabase/admin-auth';
import { getVolunteerFollowUpCampaign, listVolunteerFollowUpOutcomeMessages } from '@/lib/supabase/volunteer-follow-up';
import { recordProtectedMutationAudit } from '@/server/protected-mutation';
import { envValue } from '@/server/env';
import { internalErrorResponse } from '@/server/http/internal-error-response';
import { enforcePublicRateLimit } from '@/server/http/public-intake-protection';

const testEmailSchema = z.object({
  decision: z.enum(['accepted', 'not_selected']),
  email: z.string().trim().max(254).email().optional(),
  request_id: z.string().uuid(),
}).strict();

export async function sendVolunteerOutcomeTestEmail(c: Context) {
  const adminError = await requireAdmin(c, ['owner']);

  if (adminError) return adminError;

  const session = c.get('adminSession') ?? await getAdminSession(c);

  if (!session.authenticated || session.role !== 'owner' || !session.email
    || !z.string().email().safeParse(session.email).success) {
    return c.json({ error: 'Owner session email is unavailable.' }, 403);
  }

  const parsed = testEmailSchema.safeParse(await c.req.json().catch(() => null));

  if (!parsed.success) {
    return c.json({ error: 'Choose an outcome and enter one valid test email address.' }, 400);
  }

  const apiKey = envValue('RESEND_API_KEY', c)?.trim();

  if (!apiKey) return c.json({ error: 'Test email sending is not configured.' }, 503);

  const actorId = session.membership_id ?? session.user_id ?? session.email;
  const recipient = (parsed.data.email ?? session.email).trim().toLowerCase();

  try {
    const campaign = await getVolunteerFollowUpCampaign(c);

    if (!campaign) return c.json({ error: 'The volunteer campaign is unavailable.' }, 404);

    const messages = await listVolunteerFollowUpOutcomeMessages(campaign.id, c);
    const message = messages.find((item) => item.decision === parsed.data.decision);

    if (!message) {
      return c.json({ error: 'Save this outcome message in Reviews before sending a test.' }, 409);
    }

    const content = volunteerOutcomeEmailPreview({
      name: 'Applicant',
      decision: parsed.data.decision,
      subject: message.subject,
      message: message.message,
    });
    const subject = emailSubjects.customEventBlast(markTestEventTitle(content.subject, true));
    // Exclude mutable template content so a retry cannot become a second send.
    const digest = crypto.createHash('sha256')
      .update(JSON.stringify([actorId, recipient, parsed.data.decision, parsed.data.request_id]))
      .digest('hex');
    const rateLimitError = await enforcePublicRateLimit(c, {
      action: 'volunteer_outcome_email_test',
      clientKey: actorId,
      maxAttempts: 5,
      windowSeconds: 600,
    }, 'Wait a few minutes before sending another test email.');

    if (rateLimitError) return rateLimitError;

    let result: Awaited<ReturnType<typeof sendResendEmailBatch>>;

    try {
      result = await sendResendEmailBatch({
        apiKey,
        idempotencyKey: `volunteer-outcome-test-${digest}`,
        emails: [{ ...content, subject, to: [recipient] }],
      });
    } catch (error) {
      console.warn(JSON.stringify({
        event: 'volunteer_outcome_test_email_failed',
        provider_status: error instanceof ResendBatchError ? error.status : null,
      }));

      return c.json({ error: 'Test email acceptance could not be confirmed. Check your inbox before retrying; retrying here uses the same send key.' }, 502);
    }

    // Reporting failures must never turn an accepted send into a failed response.
    try {
      await recordResendEmailHealth(c, result.quota);
    } catch {
      console.warn(JSON.stringify({ event: 'volunteer_outcome_test_email_health_record_failed' }));
    }

    try {
      await recordProtectedMutationAudit(c, {
        action: 'volunteer_outcome.test_send',
        targetType: 'volunteer_campaign',
        targetId: campaign.id,
        metadata: {
          decision: parsed.data.decision,
          message_version: message.version,
          provider_id: result.ids[0],
          custom_recipient: recipient !== session.email.toLowerCase(),
        },
      });
    } catch {
      console.warn(JSON.stringify({ event: 'volunteer_outcome_test_email_audit_failed' }));
    }

    return c.json({ accepted: true, recipient, provider_id: result.ids[0], subject });
  } catch (error) {
    return internalErrorResponse(c, 'volunteer_outcome_test_email_failed', error, 'Unable to prepare the test email.');
  }
}
