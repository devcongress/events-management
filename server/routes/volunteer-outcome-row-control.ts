import type { Context } from "hono";
import { z } from "zod";
import { getAdminSession, requireAdmin } from "@/lib/supabase/admin-auth";
import { controlVolunteerOutcomeDelivery, getVolunteerFollowUpCampaign } from "@/lib/supabase/volunteer-follow-up";
import { recordProtectedMutationAudit } from "@/server/protected-mutation";
import { internalErrorResponse } from "@/server/http/internal-error-response";
import { enforcePublicRateLimit } from "@/server/http/public-intake-protection";

const controlSchema = z.object({ delivery_id: z.string().uuid(), action: z.enum(["hold", "resume"]) }).strict();
const blockMessages: Record<string, string> = {
  already_stopped: "This email has already stopped. Review delivery details to queue a safe retry.",
  legacy_batch: "This email belongs to a legacy batch. Individual hold/resume is available only for newly queued emails.",
  send_in_flight: "This email is already being processed. Wait for its result before changing delivery.",
  not_controllable: "This email cannot be resumed or held in its current state. Review delivery details.",
  not_held: "This email is not on hold. Refresh to see its latest status.",
  attempt_limit_reached: "The four-attempt limit has been reached. Review provider records before taking further action.",
  idempotency_window_expired: "The safe retry window has expired. Resuming could send a duplicate, so this email remains on hold.",
  uncertain_failure: "The previous result is uncertain. Review provider records before taking further action.",
  decision_changed: "The applicant’s decision changed. Refresh and review the current decision.",
  delivery_unavailable: "This delivery is unavailable. Refresh the table.",
};

export async function controlVolunteerOutcomeRow(c: Context) {
  const adminError = await requireAdmin(c, ["owner"]);

  if (adminError) return adminError;
  const session = c.get("adminSession") ?? await getAdminSession(c);

  if (!session.authenticated || session.role !== "owner" || !session.email)
    return c.json({ error: "An Owner session is required." }, 403);

  const parsed = controlSchema.safeParse(await c.req.json().catch(() => null));

  if (!parsed.success) return c.json({ error: "Choose a delivery and Hold or Resume." }, 400);

  const limit = await enforcePublicRateLimit(c, {
    action: "volunteer_outcome_row_control",
    clientKey: session.email,
    maxAttempts: 30,
    windowSeconds: 15 * 60,
  }, "Too many delivery changes. Wait a few minutes and try again.");

  if (limit) return limit;

  try {
    const campaign = await getVolunteerFollowUpCampaign(c);

    if (!campaign) return c.json({ error: "The volunteer campaign is unavailable." }, 404);

    const result = await controlVolunteerOutcomeDelivery({
      campaignId: campaign.id, deliveryId: parsed.data.delivery_id, action: parsed.data.action, actor: session.email,
    }, c);

    if (!result.changed)
      return c.json({ error: blockMessages[result.block_reason ?? ""] ?? "This delivery cannot be changed safely. Refresh and review its details." }, 409);

    try {
      await recordProtectedMutationAudit(c, {
        action: `volunteer_outcome.${parsed.data.action}`,
        targetType: "volunteer_outcome_delivery",
        targetId: parsed.data.delivery_id,
        metadata: { campaign_id: campaign.id },
      });
    } catch {
      console.warn(JSON.stringify({ event: "volunteer_outcome_row_control_audit_failed" }));
    }

    return c.json({
      held: parsed.data.action === "hold",
      message: parsed.data.action === "hold"
        ? "Email on hold. Other applicants are unaffected."
        : campaign.outcome_paused
          ? "Hold removed. This email will wait until queue delivery is enabled."
          : "Hold removed. The existing retry schedule is unchanged. If no retry is scheduled, review delivery details to queue a safe retry.",
    });
  } catch (error) {
    return internalErrorResponse(c, "volunteer_outcome_row_control_failed", error, "Unable to change this delivery. Refresh before trying again.");
  }
}
