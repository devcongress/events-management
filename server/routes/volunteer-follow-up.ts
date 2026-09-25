import crypto from "crypto";
import type { Context } from "hono";
import type { Hono } from "hono";
import { z } from "zod";
import {
  getEmailDeliveryHealth,
  getEmailOutboxSummary,
  recordResendEmailHealth,
} from "@/lib/email/delivery-health";
import {
  readResendEmailQuota,
  ResendBatchError,
  sendResendEmailBatch,
} from "@/lib/email/resend";
import { volunteerFollowUpEmail } from "@/lib/email/templates/volunteer-follow-up";
import { volunteerOutcomeEmailPreview } from "@/lib/email/templates/volunteer-follow-up";
import { getAdminSession, requireAdmin } from "@/lib/supabase/admin-auth";
import {
  applyVolunteerFollowUpProviderEvent,
  acquireVolunteerFollowUpDrainLease,
  claimVolunteerOutcome,
  claimVolunteerFollowUpRecipient,
  confirmVolunteerOutcomePreview,
  createVolunteerOutcomePreview,
  getVolunteerFollowUpCampaign,
  getVolunteerFollowUpRecipient,
  listVolunteerFollowUpRecipients,
  listVolunteerOutcomeDeliveries,
  recordVolunteerFollowUpDrain,
  reconcileVolunteerFollowUpApplicants,
  releaseVolunteerFollowUpDrainLease,
  replayVolunteerFollowUpProviderEvents,
  readVolunteerOutcomePreview,
  reviewVolunteerFollowUpResponse,
  saveVolunteerFollowUpCampaign,
  saveVolunteerOutcomePreviewPayloads,
  setVolunteerOutcomePaused,
  setVolunteerFollowUpCampaignStatus,
  submitVolunteerFollowUpResponse,
  renewVolunteerFollowUpDrainLease,
  updateVolunteerFollowUpDelivery,
  validateVolunteerOutcomeSend,
  finalizeVolunteerOutcomeSend,
  getVolunteerOutcomeSentRecipientIds,
  hasDueVolunteerOutcomeDelivery,
} from "@/lib/supabase/volunteer-follow-up";
import { secureSharedSecret } from "@/lib/security/shared-secret";
import { VOLUNTEER_FOLLOW_UP_TURNSTILE_ACTION } from "@/lib/turnstile";
import {
  VOLUNTEER_FOLLOW_UP_DAILY_MAX,
  canEditVolunteerFollowUpDeadline,
  volunteerFollowUpQuotaIsComplete,
  volunteerFollowUpApplicationDeadline,
  volunteerFollowUpResponseDeadline,
  volunteerFollowUpWordCount,
} from "@/lib/volunteer-follow-up";
import {
  volunteerFollowUpToken,
  volunteerFollowUpTokenMatches,
} from "@/lib/volunteer-follow-up-token";
import { envValue } from "@/server/env";
import type { AppBindings } from "@/server/http/app-bindings";
import { internalErrorResponse } from "@/server/http/internal-error-response";
import {
  enforcePublicRateLimit,
  publicClientKey,
  requirePublicTurnstile,
} from "@/server/http/public-intake-protection";
import { requireAnnualConferenceCapability } from "@/server/annual-conference-request";
import type {
  VolunteerFollowUpCampaignRow,
  VolunteerFollowUpRecipientRow,
} from "@/types/supabase";

const answerSchema = z
  .object({
    motivation: z
      .string()
      .trim()
      .min(1, "Tell us why you would like to volunteer.")
      .max(2000)
      .refine(
        (value) => volunteerFollowUpWordCount(value) <= 120,
        "Use 120 words or fewer.",
      ),
    can_attend_accra: z.boolean(),
    turnstile_action: z.string().trim().max(80).optional(),
    turnstile_token: z.string().trim().max(4096).optional(),
  })
  .strict();

const reviewSchema = z
  .object({
    status: z.enum(["unreviewed", "reviewed", "needs_follow_up"]),
    note: z.string().trim().max(1000).default(""),
    expected_version: z.number().int().nonnegative(),
    decision: z.enum(["pending", "accepted", "not_selected"]),
  })
  .strict();

const outcomePreviewSchema = z.object({
  decision: z.enum(["accepted", "not_selected"]),
}).strict();

const outcomeConfirmSchema = z.object({
  preview_id: z.string().uuid(),
}).strict();

const outcomeControlSchema = z.object({
  action: z.enum(["pause", "resume"]),
}).strict();

function tokenSecret(c: Context): string | null {
  return secureSharedSecret(envValue("VOLUNTEER_FOLLOW_UP_TOKEN_SECRET", c));
}

function scheduledJobAuthorized(c: Context): boolean {
  const expected = secureSharedSecret(envValue("SLACK_EVENTS_RETRY_SECRET", c));
  const received = c.req.header("x-scheduled-job-secret")?.trim();

  if (!expected || !received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function publicOrigin(c: Context): string | null {
  const configured = envValue("PUBLIC_APP_URL", c);

  if (!configured) return null;

  try {
    const url = new URL(configured);

    return url.protocol === "https:" && !url.username && !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function privateUrl(
  recipient: VolunteerFollowUpRecipientRow,
  secret: string,
  origin: string,
): string {
  const token = volunteerFollowUpToken({
    recipientId: recipient.id,
    campaignId: recipient.campaign_id,
    secret,
  });

  return `${origin}/volunteer/follow-up/${recipient.id}#${token}`;
}

async function publicRecipient(c: Context, id: string, token: string) {
  const secret = tokenSecret(c);

  if (!secret || !z.string().uuid().safeParse(id).success) return null;

  const recipient = await getVolunteerFollowUpRecipient(id, c);

  if (
    !recipient ||
    !volunteerFollowUpTokenMatches({
      recipientId: recipient.id,
      campaignId: recipient.campaign_id,
      secret,
      token,
    })
  )
    return null;

  const campaign = await getVolunteerFollowUpCampaign(c);

  return campaign?.id === recipient.campaign_id
    ? { campaign, recipient }
    : null;
}

function publicResponseState(
  campaign: VolunteerFollowUpCampaignRow,
  recipient: VolunteerFollowUpRecipientRow,
) {
  const deadline = volunteerFollowUpResponseDeadline(
    campaign.application_deadline_at,
  );

  return {
    name: recipient.applicant_name,
    submitted: Boolean(recipient.submitted_at),
    expired: !deadline || Date.now() > new Date(deadline).getTime(),
    response_deadline: deadline,
  };
}

function reviewerRecipient(
  recipient: VolunteerFollowUpRecipientRow,
  outcomeSent = false,
) {
  return {
    id: recipient.id,
    name: recipient.applicant_name,
    email: recipient.applicant_email,
    submitted_at: recipient.submitted_at,
    motivation: recipient.motivation,
    can_attend_accra: recipient.can_attend_accra,
    review_status: recipient.review_status,
    review_note: recipient.review_note,
    decision: recipient.decision,
    decision_version: recipient.decision_version,
    outcome_sent: outcomeSent,
    invitation_sent:
      Boolean(recipient.provider_email_id) ||
      ["accepted", "delivered", "delayed", "bounced", "complained"].includes(
        recipient.status,
      ),
  };
}

function campaignOwnerResponse(campaign: VolunteerFollowUpCampaignRow) {
  return {
    id: campaign.id,
    status: campaign.status,
    application_deadline_at: campaign.application_deadline_at,
    launched_at: campaign.launched_at,
    launched_by: campaign.launched_by,
    last_drain_at: campaign.last_drain_at,
    last_drain_reason: campaign.last_drain_reason,
    outcome_paused: campaign.outcome_paused,
  };
}

async function drainVolunteerFollowUps(
  c: Context,
  campaign: VolunteerFollowUpCampaignRow,
  leaseToken: string,
) {
  const finish = async (sent: number, reason: string) => {
    await recordVolunteerFollowUpDrain(campaign.id, reason, c);

    return { sent, reason };
  };
  const secret = tokenSecret(c);
  const apiKey = envValue("RESEND_API_KEY", c)?.trim();
  const origin = publicOrigin(c);

  if (!secret || !apiKey || !origin) return finish(0, "configuration_missing");
  const quotaReadKey =
    envValue("RESEND_BROADCASTS_API_KEY", c)?.trim() || apiKey;
  let observed = await readResendEmailQuota({ apiKey: quotaReadKey });

  if (!volunteerFollowUpQuotaIsComplete(observed)) {
    return finish(0, "capacity_unverified");
  }
  await recordResendEmailHealth(c, observed);

  let sent = 0;

  for (let i = 0; i < 10; i += 1) {
    if (!(await renewVolunteerFollowUpDrainLease(campaign.id, leaseToken, c)))
      return finish(sent, "drain_lease_lost");
    const [health, outbox] = await Promise.all([
      getEmailDeliveryHealth(c),
      getEmailOutboxSummary(c),
    ]);

    if (!health || !outbox || !volunteerFollowUpQuotaIsComplete(observed)) {
      return finish(sent, "capacity_unverified");
    }

    const safeDaily = Math.max(
      0,
      health.daily_quota_limit - observed.dailyUsed - outbox.pending - 35,
    );
    const safeMonthly = Math.max(
      0,
      health.monthly_quota_limit - observed.monthlyUsed - outbox.pending - 35,
    );
    const safeSlots = Math.min(
      safeDaily,
      safeMonthly,
      VOLUNTEER_FOLLOW_UP_DAILY_MAX,
    );

    if (safeSlots < 1) return finish(sent, "capacity_reserved");

    const recipient = await claimVolunteerFollowUpRecipient(
      campaign.id,
      safeSlots,
      leaseToken,
      c,
    );

    if (!recipient) return finish(sent, "queue_empty_or_daily_limit");
    if (!(await renewVolunteerFollowUpDrainLease(campaign.id, leaseToken, c))) {
      return finish(sent, "drain_lease_lost");
    }

    const responseDeadline = volunteerFollowUpResponseDeadline(
      campaign.application_deadline_at,
    )!;
    const email = volunteerFollowUpEmail({
      name: recipient.applicant_name,
      privateUrl: privateUrl(recipient, secret, origin),
      responseDeadline,
    });

    let result: Awaited<ReturnType<typeof sendResendEmailBatch>>;

    try {
      result = await sendResendEmailBatch({
        apiKey,
        idempotencyKey: recipient.idempotency_key,
        emails: [{ ...email, to: [recipient.applicant_email] }],
      });
    } catch (error) {
      const providerError = error instanceof ResendBatchError ? error : null;
      const retryable =
        !providerError ||
        providerError.status === null ||
        providerError.status === 429 ||
        providerError.status >= 500;
      const retryDelayMinutes =
        providerError?.status === 429
          ? 60
          : [15, 60, 240][Math.min(recipient.attempt_count - 1, 2)];

      if (!providerError || providerError.status === null) {
        return finish(sent, "provider_result_unconfirmed");
      }

      await updateVolunteerFollowUpDelivery(
        recipient.id,
        {
          status: "failed",
          claimed_until: null,
          next_attempt_at:
            retryable && recipient.attempt_count < 4
              ? new Date(Date.now() + retryDelayMinutes * 60_000).toISOString()
              : null,
          last_error:
            providerError.providerMessage ??
            `Provider HTTP ${providerError.status}`,
        },
        c,
      );

      if (providerError?.status === 429)
        return finish(sent, "provider_rate_limited");
      if (!retryable) return finish(sent, "provider_rejected");

      return finish(sent, "provider_retry_scheduled");
    }

    await updateVolunteerFollowUpDelivery(
      recipient.id,
      {
        status: "accepted",
        provider_email_id: result.ids[0],
        claimed_until: null,
        next_attempt_at: null,
      },
      c,
    );
    await replayVolunteerFollowUpProviderEvents(result.ids[0], c);
    await recordResendEmailHealth(c, result.quota);
    sent += 1;
    if (!volunteerFollowUpQuotaIsComplete(result.quota)) {
      return finish(sent, "capacity_unverified");
    }
    observed = result.quota;
  }

  return finish(sent, "run_limit");
}

async function drainVolunteerOutcomeEmails(
  c: Context,
  campaign: VolunteerFollowUpCampaignRow,
  leaseToken: string,
): Promise<{ sent: number; reason: string }> {
  const finish = (sent: number, reason: string) => ({ sent, reason });

  if (!(await hasDueVolunteerOutcomeDelivery(campaign.id, c)))
    return finish(0, "outcome_queue_empty");

  const apiKey = envValue("RESEND_API_KEY", c)?.trim();

  if (!apiKey) return finish(0, "configuration_missing");

  const quotaReadKey = envValue("RESEND_BROADCASTS_API_KEY", c)?.trim() || apiKey;
  let observed = await readResendEmailQuota({ apiKey: quotaReadKey });

  if (!volunteerFollowUpQuotaIsComplete(observed))
    return finish(0, "capacity_unverified");

  await recordResendEmailHealth(c, observed);
  let sent = 0;

  for (let i = 0; i < 10; i += 1) {
    if (!(await renewVolunteerFollowUpDrainLease(campaign.id, leaseToken, c)))
      return finish(sent, "drain_lease_lost");

    const [health, outbox] = await Promise.all([
      getEmailDeliveryHealth(c),
      getEmailOutboxSummary(c),
    ]);

    if (!health || !outbox || !volunteerFollowUpQuotaIsComplete(observed))
      return finish(sent, "capacity_unverified");

    const safeSlots = Math.min(
      Math.max(0, health.daily_quota_limit - observed.dailyUsed - outbox.pending - 35),
      Math.max(0, health.monthly_quota_limit - observed.monthlyUsed - outbox.pending - 35),
      VOLUNTEER_FOLLOW_UP_DAILY_MAX,
    );

    if (safeSlots < 1) return finish(sent, "capacity_reserved");

    const claimToken = crypto.randomUUID();
    const delivery = await claimVolunteerOutcome(
      campaign.id,
      safeSlots,
      claimToken,
      leaseToken,
      c,
    );

    if (!delivery) return finish(sent, "outcome_queue_empty_or_daily_limit");

    const deliveryId = String(delivery.id);
    const valid = await validateVolunteerOutcomeSend(
      deliveryId,
      claimToken,
      leaseToken,
      c,
    );

    if (!valid) {
      await finalizeVolunteerOutcomeSend(
        {
          deliveryId,
          claimToken,
          status: "needs_attention",
          providerEmailId: null,
          lastError: "The decision or drain lease changed before the provider call.",
          nextAttemptAt: null,
        },
        c,
      );

      return finish(sent, "outcome_claim_no_longer_valid");
    }

    const email = z
      .object({
        from: z.string().min(1),
        to: z.array(z.string().email()).length(1),
        subject: z.string().min(1),
        html: z.string().min(1),
        text: z.string().min(1),
        reply_to: z.string().email().optional(),
      })
      .strict()
      .safeParse(delivery.payload);

    if (!email.success) {
      await finalizeVolunteerOutcomeSend(
        {
          deliveryId,
          claimToken,
          status: "needs_attention",
          providerEmailId: null,
          lastError: "The frozen outcome email payload could not be validated.",
          nextAttemptAt: null,
        },
        c,
      );

      return finish(sent, "outcome_payload_invalid");
    }

    let result: Awaited<ReturnType<typeof sendResendEmailBatch>>;

    try {
      result = await sendResendEmailBatch({
        apiKey,
        idempotencyKey: String(delivery.idempotency_key),
        emails: [email.data],
      });
    } catch (error) {
      const providerError = error instanceof ResendBatchError ? error : null;
      const status = providerError?.status ?? null;
      const ambiguous = status === null || status >= 500 || status === 200;
      const retryable = ambiguous || status === 429;
      const attempts = Number(delivery.attempt_count);
      const retryDelayMinutes = status === 429
        ? 60
        : [15, 60, 240][Math.min(Math.max(0, attempts - 1), 2)];
      const canRetry = retryable && attempts < 4 &&
        Boolean(delivery.first_attempt_at) &&
        Date.now() - new Date(String(delivery.first_attempt_at)).getTime() < 23 * 60 * 60_000;

      await finalizeVolunteerOutcomeSend(
        {
          deliveryId,
          claimToken,
          status: ambiguous ? (canRetry ? "retrying" : "needs_attention") : "failed",
          providerEmailId: null,
          lastError: providerError?.providerMessage ?? "The provider did not confirm this outcome email.",
          nextAttemptAt: canRetry
            ? new Date(Date.now() + retryDelayMinutes * 60_000).toISOString()
            : null,
        },
        c,
      );

      return finish(sent, canRetry ? "outcome_provider_retry_scheduled" : "outcome_provider_result_unconfirmed");
    }

    const providerEmailId = result.ids[0];

    if (!providerEmailId) {
      await finalizeVolunteerOutcomeSend(
        {
          deliveryId,
          claimToken,
          status: "needs_attention",
          providerEmailId: null,
          lastError: "The provider response did not identify the accepted email.",
          nextAttemptAt: null,
        },
        c,
      );

      return finish(sent, "outcome_provider_result_unconfirmed");
    }

    const finalized = await finalizeVolunteerOutcomeSend(
      {
        deliveryId,
        claimToken,
        status: "accepted",
        providerEmailId,
        lastError: null,
        nextAttemptAt: null,
      },
      c,
    );

    if (!finalized) return finish(sent, "outcome_finalize_claim_lost");

    await replayVolunteerFollowUpProviderEvents(providerEmailId, c);
    await recordResendEmailHealth(c, result.quota);
    sent += 1;

    if (!volunteerFollowUpQuotaIsComplete(result.quota))
      return finish(sent, "capacity_unverified");

    observed = result.quota;
  }

  return finish(sent, "run_limit");
}

async function sendDueVolunteerFollowUps(c: Context) {
  const campaign = await getVolunteerFollowUpCampaign(c);

  if (!campaign) return { sent: 0, reason: "campaign_unavailable" };
  if (campaign.status !== "closed")
    await reconcileVolunteerFollowUpApplicants(campaign, c);
  const outcomesDue = await hasDueVolunteerOutcomeDelivery(campaign.id, c);

  if (campaign.status !== "running" && !outcomesDue) {
    await recordVolunteerFollowUpDrain(campaign.id, "not_running", c);

    return { sent: 0, reason: "not_running" };
  }

  const leaseToken = crypto.randomUUID();
  const acquired = await acquireVolunteerFollowUpDrainLease(
    campaign.id,
    leaseToken,
    c,
  );

  if (!acquired) return { sent: 0, reason: "already_draining" };

  try {
    const currentCampaign = await getVolunteerFollowUpCampaign(c);

    if (!currentCampaign) {
      await recordVolunteerFollowUpDrain(campaign.id, "not_running", c);

      return { sent: 0, reason: "not_running" };
    }
    const invitations = currentCampaign.status === "running"
      ? await drainVolunteerFollowUps(c, currentCampaign, leaseToken)
      : { sent: 0, reason: "invitation_campaign_not_running" };
    const stopAfterInvitation = [
      "provider_rate_limited",
      "provider_result_unconfirmed",
      "drain_lease_lost",
      "capacity_unverified",
      "provider_retry_scheduled",
      "provider_rejected",
    ].includes(invitations.reason);
    const outcomes = stopAfterInvitation
      ? { sent: 0, reason: `skipped_after_${invitations.reason}` }
      : await drainVolunteerOutcomeEmails(c, currentCampaign, leaseToken);
    const totalSent = invitations.sent + outcomes.sent;
    const reason = `invitations:${invitations.reason};outcomes:${outcomes.reason}`;

    await recordVolunteerFollowUpDrain(campaign.id, reason, c);

    return { sent: totalSent, reason };
  } finally {
    await releaseVolunteerFollowUpDrainLease(campaign.id, leaseToken, c);
  }
}

export function registerVolunteerFollowUpRoutes(app: Hono<AppBindings>): void {
  app.get(
    "/api/annual-conference/2026/volunteer-follow-up/preview",
    async (c) => {
      const adminError = await requireAdmin(c, ["owner"]);

      if (adminError) return adminError;

      try {
        const campaign = await getVolunteerFollowUpCampaign(c);
        const responseDeadline = volunteerFollowUpResponseDeadline(
          campaign?.application_deadline_at ?? null,
        );

        if (!responseDeadline)
          return c.json({ error: "Set the application deadline first." }, 409);
        const preview = volunteerFollowUpEmail({
          name: "Applicant",
          privateUrl: "https://example.invalid/private-volunteer-link",
          responseDeadline,
        });

        return c.json({
          from: preview.from,
          subject: preview.subject,
          html: preview.html,
          text: preview.text,
          application_deadline: campaign?.application_deadline_at ?? null,
          response_deadline: responseDeadline,
        });
      } catch (error) {
        return internalErrorResponse(
          c,
          "volunteer_follow_up_preview_failed",
          error,
          "Unable to preview the invitation.",
        );
      }
    },
  );

  app.get("/api/annual-conference/2026/volunteer-follow-up", async (c) => {
    const ownerError = await requireAdmin(c, ["owner"]);

    if (ownerError) return ownerError;

    try {
      const campaign = await getVolunteerFollowUpCampaign(c);

      if (!campaign) return c.json({ campaign: null, recipients: [] });
      const [recipients, health, outcomes] = await Promise.all([
        listVolunteerFollowUpRecipients(c),
        getEmailDeliveryHealth(c),
        listVolunteerOutcomeDeliveries(campaign.id, c),
      ]);
      const outcomeSentIds = new Set(
        outcomes
          .filter((outcome) => outcome.provider_email_id)
          .map((outcome) => outcome.recipient_id),
      );
      const latestOutcomeByRecipient = new Map<string, (typeof outcomes)[number]>();

      for (const outcome of outcomes) {
        if (!latestOutcomeByRecipient.has(outcome.recipient_id))
          latestOutcomeByRecipient.set(outcome.recipient_id, outcome);
      }

      return c.json({
        campaign: campaignOwnerResponse(campaign),
        response_deadline: volunteerFollowUpResponseDeadline(
          campaign.application_deadline_at,
        ),
        recipients: recipients.map((recipient) => ({
          ...reviewerRecipient(recipient, outcomeSentIds.has(recipient.id)),
          applicant_name: recipient.applicant_name,
          applicant_email: recipient.applicant_email,
          status: recipient.status,
          attempt_count: recipient.attempt_count,
          provider_email_id: recipient.provider_email_id,
          last_attempt_at: recipient.last_attempt_at,
          next_attempt_at: recipient.next_attempt_at,
          last_error: recipient.last_error,
          outcome_delivery: latestOutcomeByRecipient.get(recipient.id) ?? null,
        })),
        email_health: health,
        can_manage: true,
      });
    } catch (error) {
      return internalErrorResponse(
        c,
        "volunteer_follow_up_read_failed",
        error,
        "Unable to load volunteer follow-up.",
      );
    }
  });

  app.get(
    "/api/annual-conference/2026/volunteer-follow-up/reviews",
    async (c) => {
      const accessError = await requireAnnualConferenceCapability(
        c,
        2026,
        "volunteers.review_applications",
      );

      if (accessError) return accessError;

      try {
        const recipients = await listVolunteerFollowUpRecipients(c);
        const sentIds = await getVolunteerOutcomeSentRecipientIds(
          recipients.map((recipient) => recipient.id),
          c,
        );

        return c.json({
          recipients: recipients.map((recipient) =>
            reviewerRecipient(recipient, sentIds.has(recipient.id)),
          ),
        });
      } catch (error) {
        return internalErrorResponse(
          c,
          "volunteer_follow_up_review_list_failed",
          error,
          "Unable to load volunteer reviews.",
        );
      }
    },
  );

  app.patch(
    "/api/annual-conference/2026/volunteer-follow-up/settings",
    async (c) => {
      const adminError = await requireAdmin(c, ["owner"]);

      if (adminError) return adminError;
      const parsed = z
        .object({ application_deadline: z.string() })
        .strict()
        .safeParse(await c.req.json().catch(() => null));
      const deadline = parsed.success
        ? volunteerFollowUpApplicationDeadline(parsed.data.application_deadline)
        : null;

      if (!deadline)
        return c.json(
          { error: "Choose a valid application closing date." },
          400,
        );

      try {
        const campaign = await getVolunteerFollowUpCampaign(c);

        if (campaign && !canEditVolunteerFollowUpDeadline(campaign.status)) {
          return c.json(
            {
              error:
                "The application deadline is fixed once the campaign launches.",
            },
            409,
          );
        }
        if (
          new Date(volunteerFollowUpResponseDeadline(deadline)!).getTime() <=
          Date.now()
        ) {
          return c.json(
            { error: "The response deadline must still be in the future." },
            400,
          );
        }

        const saved = await saveVolunteerFollowUpCampaign(
          { applicationDeadlineAt: deadline },
          c,
        );

        return c.json({
          campaign: campaignOwnerResponse(saved),
          response_deadline: volunteerFollowUpResponseDeadline(deadline),
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("campaign has launched")
        ) {
          return c.json(
            {
              error:
                "The application deadline is fixed once the campaign launches.",
            },
            409,
          );
        }

        return internalErrorResponse(
          c,
          "volunteer_follow_up_settings_failed",
          error,
          "Unable to save the application deadline.",
        );
      }
    },
  );

  app.post(
    "/api/annual-conference/2026/volunteer-follow-up/control",
    async (c) => {
      const adminError = await requireAdmin(c, ["owner"]);

      if (adminError) return adminError;
      const parsed = z
        .object({ action: z.enum(["launch", "pause", "resume", "close"]) })
        .strict()
        .safeParse(await c.req.json().catch(() => null));

      if (!parsed.success)
        return c.json({ error: "Choose a valid campaign action." }, 400);

      try {
        const campaign = await getVolunteerFollowUpCampaign(c);

        if (!campaign?.application_deadline_at)
          return c.json({ error: "Set the application deadline first." }, 409);
        if (
          new Date(
            volunteerFollowUpResponseDeadline(
              campaign.application_deadline_at,
            )!,
          ).getTime() <= Date.now()
        ) {
          return c.json({ error: "The response deadline has passed." }, 409);
        }
        const next = {
          launch: "running",
          resume: "running",
          pause: "paused",
          close: "closed",
        } as const;
        const allowed = {
          draft: ["launch"],
          running: ["pause", "close"],
          paused: ["resume", "close"],
          closed: [],
        } as const;

        if (
          !(allowed[campaign.status] as readonly string[]).includes(
            parsed.data.action,
          )
        ) {
          return c.json(
            {
              error:
                "This action is unavailable for the current campaign state.",
            },
            409,
          );
        }

        const session = c.get("adminSession") ?? (await getAdminSession(c));

        if (parsed.data.action === "launch") {
          await reconcileVolunteerFollowUpApplicants(campaign, c);
        }
        const saved = await setVolunteerFollowUpCampaignStatus(
          campaign,
          next[parsed.data.action],
          session.authenticated ? (session.email ?? "") : "",
          c,
        );

        return c.json({
          campaign: campaignOwnerResponse(saved),
          response_deadline: volunteerFollowUpResponseDeadline(
            saved.application_deadline_at,
          ),
        });
      } catch (error) {
        return internalErrorResponse(
          c,
          "volunteer_follow_up_control_failed",
          error,
          "Unable to update the campaign.",
        );
      }
    },
  );

  app.post(
    "/api/annual-conference/2026/volunteer-follow-up/outcomes/preview",
    async (c) => {
      const adminError = await requireAdmin(c, ["owner"]);

      if (adminError) return adminError;
      const parsed = outcomePreviewSchema.safeParse(await c.req.json().catch(() => null));

      if (!parsed.success) return c.json({ error: "Choose an outcome to preview." }, 400);

      try {
        const campaign = await getVolunteerFollowUpCampaign(c);

        if (!campaign) return c.json({ error: "The volunteer campaign is unavailable." }, 404);
        const session = c.get("adminSession") ?? (await getAdminSession(c));
        const actorEmail = session.authenticated ? (session.email ?? "") : "";

        if (!actorEmail) return c.json({ error: "Owner session identity is unavailable." }, 403);

        const snapshot = await createVolunteerOutcomePreview({
          campaignId: campaign.id,
          decision: parsed.data.decision,
          actorEmail,
        }, c);
        const email = volunteerOutcomeEmailPreview({
          name: "Applicant",
          decision: parsed.data.decision,
        });
        const payloads = Object.fromEntries(snapshot.recipients.map((recipient) => {
          const personalized = volunteerOutcomeEmailPreview({
            name: recipient.name,
            decision: parsed.data.decision,
          });

          return [recipient.recipient_id, {
            from: personalized.from,
            to: [recipient.email],
            subject: personalized.subject,
            html: personalized.html,
            text: personalized.text,
          }];
        }));

        await saveVolunteerOutcomePreviewPayloads({
          previewId: snapshot.id,
          actorEmail,
          payloads,
        }, c);

        return c.json({
          preview_id: snapshot.id,
          decision: parsed.data.decision,
          eligible_count: snapshot.eligibleCount,
          excluded_count: snapshot.excludedCount,
          recipients: snapshot.recipients,
          expires_in_seconds: 600,
          from: email.from,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
      } catch (error) {
        return internalErrorResponse(
          c,
          "volunteer_outcome_preview_failed",
          error,
          "Unable to prepare the outcome preview.",
        );
      }
    },
  );

  app.post(
    "/api/annual-conference/2026/volunteer-follow-up/outcomes/confirm",
    async (c) => {
      const adminError = await requireAdmin(c, ["owner"]);

      if (adminError) return adminError;
      const parsed = outcomeConfirmSchema.safeParse(await c.req.json().catch(() => null));

      if (!parsed.success) return c.json({ error: "Preview the outcome audience first." }, 400);

      try {
        const session = c.get("adminSession") ?? (await getAdminSession(c));
        const actorEmail = session.authenticated ? (session.email ?? "") : "";

        if (!actorEmail) return c.json({ error: "Owner session identity is unavailable." }, 403);

        const snapshot = await readVolunteerOutcomePreview({
          previewId: parsed.data.preview_id,
          actorEmail,
        }, c);

        if (!snapshot) return c.json({ error: "This preview is unavailable. Create a new preview." }, 404);
        if (snapshot.expiresAt <= new Date().toISOString())
          return c.json({ error: "This preview expired. Create a new preview." }, 409);

        const queued = await confirmVolunteerOutcomePreview({
          previewId: parsed.data.preview_id,
          actorEmail,
        }, c);

        return c.json({ queued_count: queued.queuedCount });
      } catch (error) {
        if (error instanceof Error && /preview_(stale|conflict|expired)/u.test(error.message))
          return c.json({ error: "The outcome audience changed. Create a new preview." }, 409);

        return internalErrorResponse(
          c,
          "volunteer_outcome_confirm_failed",
          error,
          "Unable to queue the volunteer outcome emails.",
        );
      }
    },
  );

  app.post(
    "/api/annual-conference/2026/volunteer-follow-up/outcomes/control",
    async (c) => {
      const adminError = await requireAdmin(c, ["owner"]);

      if (adminError) return adminError;
      const parsed = outcomeControlSchema.safeParse(await c.req.json().catch(() => null));

      if (!parsed.success) return c.json({ error: "Choose pause or resume." }, 400);

      try {
        const campaign = await getVolunteerFollowUpCampaign(c);

        if (!campaign) return c.json({ error: "The volunteer campaign is unavailable." }, 404);
        const paused = parsed.data.action === "pause";
        const saved = await setVolunteerOutcomePaused(campaign.id, paused, c);

        return saved
          ? c.json({ outcome_paused: paused })
          : c.json({ error: "Campaign state changed. Refresh and try again." }, 409);
      } catch (error) {
        return internalErrorResponse(
          c,
          "volunteer_outcome_control_failed",
          error,
          "Unable to update outcome delivery controls.",
        );
      }
    },
  );

  app.patch(
    "/api/annual-conference/2026/volunteer-follow-up/recipients/:id/review",
    async (c) => {
      const accessError = await requireAnnualConferenceCapability(
        c,
        2026,
        "volunteers.review_applications",
      );

      if (accessError) return accessError;
      const parsed = reviewSchema.safeParse(
        await c.req.json().catch(() => null),
      );

      if (!parsed.success)
        return c.json(
          {
            error:
              parsed.error.issues[0]?.message ?? "Check the review details.",
          },
          400,
        );

      try {
        const session = c.get("adminSession") ?? (await getAdminSession(c));
        const recipient = await reviewVolunteerFollowUpResponse(
          {
            recipientId: c.req.param("id"),
            expectedVersion: parsed.data.expected_version,
            decision: parsed.data.decision,
            status: parsed.data.status,
            note: parsed.data.note,
            actorEmail: session.authenticated ? (session.email ?? "") : "",
          },
          c,
        );
        const sentIds = recipient
          ? await getVolunteerOutcomeSentRecipientIds([recipient.id], c)
          : new Set<string>();

        return recipient
          ? c.json({
              recipient: reviewerRecipient(recipient, sentIds.has(recipient.id)),
            })
          : c.json({ error: "Submitted response not found." }, 404);
      } catch (error) {
        if (error instanceof Error && error.message.includes("decision_version_conflict"))
          return c.json({ error: "This decision changed elsewhere. Refresh the review before saving." }, 409);
        if (error instanceof Error && error.message.includes("outcome_delivery_already_started"))
          return c.json({ error: "An outcome email has been attempted. The selection decision is locked; review the outcome delivery status." }, 409);

        return internalErrorResponse(
          c,
          "volunteer_follow_up_review_failed",
          error,
          "Unable to save this review.",
        );
      }
    },
  );

  app.get("/api/volunteer-follow-up/:id", async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");

    try {
      const found = await publicRecipient(
        c,
        c.req.param("id"),
        c.req.header("x-follow-up-token") ?? "",
      );

      return found
        ? c.json(publicResponseState(found.campaign, found.recipient))
        : c.json({ error: "This private form link is unavailable." }, 404);
    } catch (error) {
      return internalErrorResponse(
        c,
        "volunteer_follow_up_public_read_failed",
        error,
        "Unable to open this form.",
      );
    }
  });

  app.post("/api/volunteer-follow-up/:id", async (c) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    const parsed = answerSchema.safeParse(await c.req.json().catch(() => null));

    if (!parsed.success)
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "Check your answers." },
        400,
      );

    try {
      const found = await publicRecipient(
        c,
        c.req.param("id"),
        c.req.header("x-follow-up-token") ?? "",
      );

      if (!found)
        return c.json({ error: "This private form link is unavailable." }, 404);
      const state = publicResponseState(found.campaign, found.recipient);

      if (state.submitted)
        return c.json(
          { error: "This response has already been submitted." },
          409,
        );
      if (state.expired)
        return c.json({ error: "The response deadline has passed." }, 410);

      const rateLimitError = await enforcePublicRateLimit(
        c,
        {
          action: "volunteer_follow_up_response",
          clientKey: publicClientKey(c),
          maxAttempts: 8,
          windowSeconds: 900,
        },
        "Please wait before trying this form again.",
      );

      if (rateLimitError) return rateLimitError;

      const turnstileError = await requirePublicTurnstile(c, {
        token: parsed.data.turnstile_token,
        submittedAction: parsed.data.turnstile_action,
        expectedAction: VOLUNTEER_FOLLOW_UP_TURNSTILE_ACTION,
      });

      if (turnstileError) return turnstileError;

      const saved = await submitVolunteerFollowUpResponse(
        {
          recipientId: found.recipient.id,
          motivation: parsed.data.motivation,
          canAttendAccra: parsed.data.can_attend_accra,
        },
        c,
      );

      return saved
        ? c.json({ accepted: true }, 202)
        : c.json({ error: "This response has already been submitted." }, 409);
    } catch (error) {
      return internalErrorResponse(
        c,
        "volunteer_follow_up_submit_failed",
        error,
        "Unable to save your answers.",
      );
    }
  });

  app.post("/api/internal/volunteer-follow-up/drain", async (c) => {
    if (!scheduledJobAuthorized(c)) return c.json({ error: "Not found" }, 404);

    try {
      return c.json(await sendDueVolunteerFollowUps(c));
    } catch (error) {
      return internalErrorResponse(
        c,
        "volunteer_follow_up_drain_failed",
        error,
        "Unable to process follow-up invitations.",
      );
    }
  });
}

export { applyVolunteerFollowUpProviderEvent };
