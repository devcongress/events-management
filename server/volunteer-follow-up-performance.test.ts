import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppBindings } from "./http/app-bindings";

const mocks = vi.hoisted(() => ({
  session: { authenticated: true, role: "owner", email: "owner@example.com" },
  campaign: {
    id: "campaign-2026",
    status: "draft",
    application_deadline_at: "2026-09-30T23:59:59.999Z",
    launched_at: null,
    launched_by: null,
    last_drain_at: null,
    last_drain_reason: null,
    outcome_paused: false,
  },
  recipient: {
    id: "recipient-1",
    campaign_id: "campaign-2026",
    application_id: "application-1",
    applicant_name: "Applicant One",
    applicant_email: "applicant@example.com",
    status: "queued",
    submitted_at: null,
    motivation: null,
    can_attend_accra: null,
    review_status: "unreviewed",
    review_note: null,
    decision: "pending",
    decision_version: 0,
    decision_at: null,
    decision_by: null,
    reviewed_at: null,
    reviewed_by: null,
    last_attempt_at: null,
    attempt_count: 2,
    provider_email_id: "provider-private-id",
    next_attempt_at: null,
    last_error: "provider-private-error",
  },
  getAdminSession: vi.fn(),
  requireAdmin: vi.fn(),
  requireAnnualConferenceCapability: vi.fn(),
  getVolunteerFollowUpCampaign: vi.fn(),
  listVolunteerFollowUpRecipients: vi.fn(),
  listVolunteerOutcomeDeliveries: vi.fn(),
  getVolunteerOutcomeSentRecipientIds: vi.fn(),
  hasDueVolunteerOutcomeDelivery: vi.fn(),
  getEmailDeliveryHealth: vi.fn(),
  reconcileVolunteerFollowUpApplicants: vi.fn(),
  setVolunteerFollowUpCampaignStatus: vi.fn(),
  acquireVolunteerFollowUpDrainLease: vi.fn(),
  releaseVolunteerFollowUpDrainLease: vi.fn(),
  recordVolunteerFollowUpDrain: vi.fn(),
  readResendEmailQuota: vi.fn(),
  sendResendEmailBatch: vi.fn(),
  envValue: vi.fn(),
}));

vi.mock("@/lib/supabase/admin-auth", () => ({
  getAdminSession: mocks.getAdminSession,
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/server/annual-conference-request", () => ({
  requireAnnualConferenceCapability: mocks.requireAnnualConferenceCapability,
}));
vi.mock("@/lib/supabase/volunteer-follow-up", () => ({
  getVolunteerFollowUpCampaign: mocks.getVolunteerFollowUpCampaign,
  listVolunteerFollowUpRecipients: mocks.listVolunteerFollowUpRecipients,
  listVolunteerOutcomeDeliveries: mocks.listVolunteerOutcomeDeliveries,
  getVolunteerOutcomeSentRecipientIds: mocks.getVolunteerOutcomeSentRecipientIds,
  hasDueVolunteerOutcomeDelivery: mocks.hasDueVolunteerOutcomeDelivery,
  reconcileVolunteerFollowUpApplicants:
    mocks.reconcileVolunteerFollowUpApplicants,
  setVolunteerFollowUpCampaignStatus: mocks.setVolunteerFollowUpCampaignStatus,
  acquireVolunteerFollowUpDrainLease: mocks.acquireVolunteerFollowUpDrainLease,
  releaseVolunteerFollowUpDrainLease: mocks.releaseVolunteerFollowUpDrainLease,
  recordVolunteerFollowUpDrain: mocks.recordVolunteerFollowUpDrain,
}));
vi.mock("@/lib/email/delivery-health", () => ({
  getEmailDeliveryHealth: mocks.getEmailDeliveryHealth,
  getEmailOutboxSummary: vi.fn(async () => ({ pending: 0 })),
  recordResendEmailHealth: vi.fn(),
}));
vi.mock("@/lib/email/resend", () => ({
  readResendEmailQuota: mocks.readResendEmailQuota,
  ResendBatchError: class ResendBatchError extends Error {},
  sendResendEmailBatch: mocks.sendResendEmailBatch,
}));
vi.mock("@/server/env", () => ({
  envValue: mocks.envValue,
}));

import { registerVolunteerFollowUpRoutes } from "./routes/volunteer-follow-up";

function createApp() {
  const app = new Hono<AppBindings>();

  registerVolunteerFollowUpRoutes(app);

  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.authenticated = true;
  mocks.session.role = "owner";
  mocks.session.email = "owner@example.com";
  mocks.campaign.status = "draft";
  mocks.getAdminSession.mockImplementation(async () => mocks.session);
  mocks.requireAdmin.mockResolvedValue(null);
  mocks.requireAnnualConferenceCapability.mockImplementation(async (c) => {
    c.set("adminSession", mocks.session);

    return null;
  });
  mocks.getVolunteerFollowUpCampaign.mockImplementation(async () => ({
    ...mocks.campaign,
  }));
  mocks.listVolunteerFollowUpRecipients.mockResolvedValue([
    { ...mocks.recipient },
  ]);
  mocks.listVolunteerOutcomeDeliveries.mockResolvedValue([]);
  mocks.getVolunteerOutcomeSentRecipientIds.mockResolvedValue(new Set());
  mocks.hasDueVolunteerOutcomeDelivery.mockResolvedValue(false);
  mocks.getEmailDeliveryHealth.mockResolvedValue({ daily_quota_limit: 100 });
  mocks.reconcileVolunteerFollowUpApplicants.mockResolvedValue(1);
  mocks.setVolunteerFollowUpCampaignStatus.mockImplementation(
    async (_campaign, status) => ({
      ...mocks.campaign,
      status,
    }),
  );
  mocks.acquireVolunteerFollowUpDrainLease.mockResolvedValue(false);
  mocks.releaseVolunteerFollowUpDrainLease.mockResolvedValue(undefined);
  mocks.recordVolunteerFollowUpDrain.mockResolvedValue(undefined);
  mocks.readResendEmailQuota.mockResolvedValue({
    dailyUsed: null,
    monthlyUsed: 4,
  });
  mocks.envValue.mockImplementation((key: string) => {
    if (key === "SLACK_EVENTS_RETRY_SECRET")
      return "scheduled-secret-for-test-value-with-at-least-32-bytes";
    if (key === "RESEND_API_KEY") return "resend-secret";
    if (key === "PUBLIC_APP_URL") return "https://events.example.com";

    return undefined;
  });
});

describe("volunteer follow-up read and recovery", () => {
  it("serves the dedicated safe reviewer read without campaign diagnostics, reconciling, or sending", async () => {
    mocks.session.role = "organizer";

    const response = await createApp().request(
      "/api/annual-conference/2026/volunteer-follow-up/reviews",
    );
    const payload = (await response.json()) as {
      recipients: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(Object.keys(payload.recipients[0]!).sort()).toEqual([
      "can_attend_accra",
      "decision",
      "decision_version",
      "email",
      "id",
      "invitation_sent",
      "motivation",
      "name",
      "outcome_sent",
      "review_note",
      "review_status",
      "submitted_at",
    ]);
    expect(payload.recipients[0]?.invitation_sent).toBe(true);
    expect(mocks.reconcileVolunteerFollowUpApplicants).not.toHaveBeenCalled();
    expect(mocks.listVolunteerFollowUpRecipients).toHaveBeenCalledOnce();
    expect(mocks.getVolunteerFollowUpCampaign).not.toHaveBeenCalled();
    expect(mocks.getEmailDeliveryHealth).not.toHaveBeenCalled();
    expect(mocks.readResendEmailQuota).not.toHaveBeenCalled();
  });

  it("includes Owner diagnostics on the same side-effect-free queue read", async () => {
    const deliveryHistory = Array.from({ length: 13 }, (_, index) => ({
      recipient_id: `recipient-${index + 1}`,
      decision: "accepted",
      status: "retrying",
      attempt_count: index + 1,
      last_attempt_at: "2026-09-23T10:00:00.000Z",
      next_attempt_at: "2026-09-23T10:15:00.000Z",
      last_error: `provider detail ${index + 1}`,
      provider_email_id: index === 12 ? "provider-email-13" : null,
    }));

    mocks.listVolunteerFollowUpRecipients.mockResolvedValue(
      deliveryHistory.map((delivery, index) => ({
        ...mocks.recipient,
        id: delivery.recipient_id,
        applicant_name: `Applicant ${index + 1}`,
      })),
    );
    mocks.listVolunteerOutcomeDeliveries.mockResolvedValue(deliveryHistory);

    const response = await createApp().request(
      "/api/annual-conference/2026/volunteer-follow-up",
    );
    const payload = (await response.json()) as {
      recipients: Array<Record<string, unknown>>;
      can_manage: boolean;
      email_health: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(payload.recipients[0]).toMatchObject({
      attempt_count: 2,
      provider_email_id: "provider-private-id",
      last_error: "provider-private-error",
    });
    expect(payload.recipients).toHaveLength(13);
    expect(payload.recipients[12]).toMatchObject({
      id: "recipient-13",
      applicant_name: "Applicant 13",
      outcome_sent: true,
      outcome_delivery: {
        attempt_count: 13,
        last_error: "provider detail 13",
      },
    });
    expect(mocks.getVolunteerOutcomeSentRecipientIds).not.toHaveBeenCalled();
    expect(payload.can_manage).toBe(true);
    expect(payload.email_health).toEqual({ daily_quota_limit: 100 });
    expect(mocks.reconcileVolunteerFollowUpApplicants).not.toHaveBeenCalled();
    expect(mocks.readResendEmailQuota).not.toHaveBeenCalled();
    expect(mocks.sendResendEmailBatch).not.toHaveBeenCalled();
  });

  it("starts recipient and health reads in parallel", async () => {
    let resolveRecipients!: (value: unknown) => void;
    let resolveHealth!: (value: unknown) => void;

    mocks.listVolunteerFollowUpRecipients.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRecipients = resolve;
      }),
    );
    mocks.getEmailDeliveryHealth.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveHealth = resolve;
      }),
    );

    const responsePromise = createApp().request(
      "/api/annual-conference/2026/volunteer-follow-up",
    );

    await vi.waitFor(() => {
      expect(mocks.listVolunteerFollowUpRecipients).toHaveBeenCalledOnce();
      expect(mocks.getEmailDeliveryHealth).toHaveBeenCalledOnce();
    });
    resolveRecipients([{ ...mocks.recipient }]);
    resolveHealth({ daily_quota_limit: 100 });

    expect((await responsePromise).status).toBe(200);
  });

  it("denies a missing conference capability before reading reviewer recipients", async () => {
    mocks.requireAnnualConferenceCapability.mockImplementationOnce(async (c) =>
      c.json({ error: "Conference access required." }, 401),
    );

    const response = await createApp().request(
      "/api/annual-conference/2026/volunteer-follow-up/reviews",
    );

    expect(response.status).toBe(401);
    expect(mocks.listVolunteerFollowUpRecipients).not.toHaveBeenCalled();
    expect(mocks.getEmailDeliveryHealth).not.toHaveBeenCalled();
    expect(mocks.reconcileVolunteerFollowUpApplicants).not.toHaveBeenCalled();
  });

  it.each(["draft", "paused"] as const)(
    "repairs %s recipients in scheduled recovery without requiring quota or sending",
    async (status) => {
      mocks.campaign.status = status;

      const response = await createApp().request(
        "/api/internal/volunteer-follow-up/drain",
        {
          method: "POST",
          headers: {
            "x-scheduled-job-secret":
              "scheduled-secret-for-test-value-with-at-least-32-bytes",
          },
        },
      );

      expect(response.status).toBe(200);
      expect(mocks.reconcileVolunteerFollowUpApplicants).toHaveBeenCalledOnce();
      expect(mocks.readResendEmailQuota).not.toHaveBeenCalled();
      expect(mocks.acquireVolunteerFollowUpDrainLease).not.toHaveBeenCalled();
    },
  );

  it("repairs a running queue before stopping for incomplete quota observations", async () => {
    mocks.campaign.status = "running";
    mocks.acquireVolunteerFollowUpDrainLease.mockResolvedValue(true);
    mocks.envValue.mockImplementation((key: string) => {
      if (key === "SLACK_EVENTS_RETRY_SECRET")
        return "scheduled-secret-for-test-value-with-at-least-32-bytes";
      if (key === "RESEND_API_KEY") return "resend-secret";
      if (key === "PUBLIC_APP_URL") return "https://events.example.com";
      if (key === "VOLUNTEER_FOLLOW_UP_TOKEN_SECRET")
        return "token-secret-for-test-value-with-at-least-32-bytes";

      return undefined;
    });

    const response = await createApp().request(
      "/api/internal/volunteer-follow-up/drain",
      {
        method: "POST",
        headers: {
          "x-scheduled-job-secret":
            "scheduled-secret-for-test-value-with-at-least-32-bytes",
        },
      },
    );
    const payload = (await response.json()) as { reason: string };

    expect(response.status).toBe(200);
    expect(mocks.reconcileVolunteerFollowUpApplicants).toHaveBeenCalledOnce();
    expect(mocks.readResendEmailQuota).toHaveBeenCalledOnce();
    expect(payload.reason).toContain("invitations:capacity_unverified");
    expect(payload.reason).toContain("outcomes:skipped_after_capacity_unverified");
    expect(mocks.sendResendEmailBatch).not.toHaveBeenCalled();
    expect(mocks.releaseVolunteerFollowUpDrainLease).toHaveBeenCalledOnce();
  });

  it("does not launch when backfill fails, leaving the draft state unchanged", async () => {
    mocks.reconcileVolunteerFollowUpApplicants.mockRejectedValueOnce(
      new Error("storage unavailable"),
    );

    const response = await createApp().request(
      "/api/annual-conference/2026/volunteer-follow-up/control",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "owner",
        },
        body: JSON.stringify({ action: "launch" }),
      },
    );

    expect(response.status).toBe(500);
    expect(mocks.reconcileVolunteerFollowUpApplicants).toHaveBeenCalledOnce();
    expect(mocks.setVolunteerFollowUpCampaignStatus).not.toHaveBeenCalled();
  });
});
