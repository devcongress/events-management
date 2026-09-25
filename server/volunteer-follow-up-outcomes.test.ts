import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppBindings } from "./http/app-bindings";

const mocks = vi.hoisted(() => ({
  campaign: vi.fn(),
  acquireLease: vi.fn(),
  renewLease: vi.fn(),
  releaseLease: vi.fn(),
  hasDue: vi.fn(),
  claimOutcome: vi.fn(),
  validateSend: vi.fn(),
  finalizeSend: vi.fn(),
  replayEvents: vi.fn(),
  readQuota: vi.fn(),
  emailHealth: vi.fn(),
  outbox: vi.fn(),
  recordHealth: vi.fn(),
  sendBatch: vi.fn(),
  recordDrain: vi.fn(),
  env: vi.fn(),
}));

vi.mock("../lib/supabase/admin-auth", () => ({
  getAdminSession: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("../server/annual-conference-request", () => ({
  requireAnnualConferenceCapability: vi.fn(),
}));
vi.mock("../lib/supabase/volunteer-follow-up", () => ({
  getVolunteerFollowUpCampaign: mocks.campaign,
  acquireVolunteerFollowUpDrainLease: mocks.acquireLease,
  renewVolunteerFollowUpDrainLease: mocks.renewLease,
  releaseVolunteerFollowUpDrainLease: mocks.releaseLease,
  hasDueVolunteerOutcomeDelivery: mocks.hasDue,
  claimVolunteerOutcome: mocks.claimOutcome,
  validateVolunteerOutcomeSend: mocks.validateSend,
  finalizeVolunteerOutcomeSend: mocks.finalizeSend,
  replayVolunteerFollowUpProviderEvents: mocks.replayEvents,
  recordVolunteerFollowUpDrain: mocks.recordDrain,
  reconcileVolunteerFollowUpApplicants: vi.fn(),
}));
vi.mock("../lib/email/delivery-health", () => ({
  getEmailDeliveryHealth: mocks.emailHealth,
  getEmailOutboxSummary: mocks.outbox,
  recordResendEmailHealth: mocks.recordHealth,
}));
vi.mock("../lib/email/resend", () => ({
  readResendEmailQuota: mocks.readQuota,
  ResendBatchError: class ResendBatchError extends Error {
    status: number | null;

    constructor(message: string, status: number | null = null) {
      super(message);
      this.status = status;
    }
  },
  sendResendEmailBatch: mocks.sendBatch,
}));
vi.mock("../server/env", () => ({ envValue: mocks.env }));

describe("volunteer outcome email drain", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.campaign.mockResolvedValue({
      id: "campaign-2026",
      edition_year: 2026,
      status: "closed",
      application_deadline_at: "2026-09-30T23:59:59.999Z",
      launched_at: null,
      launched_by: null,
      last_drain_at: null,
      last_drain_reason: null,
      outcome_paused: false,
      drain_lease_token: null,
      drain_lease_until: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    mocks.acquireLease.mockResolvedValue(true);
    mocks.renewLease.mockResolvedValue(true);
    mocks.releaseLease.mockResolvedValue(undefined);
    mocks.hasDue.mockResolvedValue(true);
    mocks.claimOutcome.mockResolvedValue({
      id: "delivery-1",
      idempotency_key: "volunteer-outcome/recipient-1/4",
      attempt_count: 1,
      first_attempt_at: new Date().toISOString(),
      payload: {
        from: "DevCongress <volunteers@devcongress.org>",
        to: ["ama@example.test"],
        subject: "Your application",
        html: "<p>Accepted</p>",
        text: "Accepted",
      },
    });
    mocks.validateSend.mockResolvedValue(true);
    mocks.finalizeSend.mockResolvedValue(true);
    mocks.replayEvents.mockResolvedValue(undefined);
    mocks.readQuota.mockResolvedValue({ dailyUsed: 5, monthlyUsed: 40 });
    mocks.emailHealth.mockResolvedValue({ daily_quota_limit: 100, monthly_quota_limit: 3000 });
    mocks.outbox.mockResolvedValue({ pending: 0 });
    mocks.sendBatch.mockRejectedValue(new (class extends Error {
      status = 200;
    })());
    mocks.recordDrain.mockResolvedValue(undefined);
    mocks.env.mockImplementation((key: string) => {
      if (key === "SLACK_EVENTS_RETRY_SECRET") return "scheduled-secret-for-test-value-with-at-least-32-bytes";
      if (key === "RESEND_API_KEY") return "resend-test-key";
      if (key === "RESEND_BROADCASTS_API_KEY") return "quota-test-key";

      return undefined;
    });
  });

  async function drain() {
    const { registerVolunteerFollowUpRoutes } = await import("./routes/volunteer-follow-up");
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);

    return app.request("/api/internal/volunteer-follow-up/drain", {
      method: "POST",
      headers: { "x-scheduled-job-secret": "scheduled-secret-for-test-value-with-at-least-32-bytes" },
    });
  }

  it("sends a frozen outcome after invitation campaign closure and retries ambiguous 2xx with the same key", async () => {
    const { ResendBatchError } = await import("../lib/email/resend");
    const ambiguous = new ResendBatchError("unexpected provider response", 200);

    mocks.sendBatch.mockRejectedValueOnce(ambiguous);
    const response = await drain();
    const payload = await response.json() as { reason: string };

    expect(response.status).toBe(200);
    expect(mocks.sendBatch).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "volunteer-outcome/recipient-1/4",
      emails: [{
        from: "DevCongress <volunteers@devcongress.org>",
        to: ["ama@example.test"],
        subject: "Your application",
        html: "<p>Accepted</p>",
        text: "Accepted",
      }],
    }));
    expect(mocks.finalizeSend).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "delivery-1",
      status: "retrying",
      nextAttemptAt: expect.any(String),
    }), expect.anything());
    expect(payload.reason).toContain("outcomes:outcome_provider_retry_scheduled");
    expect(mocks.releaseLease).toHaveBeenCalledOnce();
  });

  it("reaches a lone expired sending outcome after the invitation campaign is closed", async () => {
    mocks.claimOutcome.mockResolvedValueOnce({
      id: "delivery-1",
      status: "sending",
      idempotency_key: "volunteer-outcome/recipient-1/4",
      attempt_count: 2,
      first_attempt_at: new Date(Date.now() - 60_000).toISOString(),
      payload: {
        from: "DevCongress <volunteers@devcongress.org>",
        to: ["ama@example.test"],
        subject: "Your application",
        html: "<p>Accepted</p>",
        text: "Accepted",
      },
    });
    mocks.claimOutcome.mockResolvedValueOnce(null);
    mocks.sendBatch.mockResolvedValueOnce({
      ids: ["provider-email-recovered"],
      quota: { dailyUsed: 6, monthlyUsed: 41 },
    });

    const response = await drain();

    expect(response.status).toBe(200);
    expect(mocks.hasDue).toHaveBeenCalled();
    expect(mocks.claimOutcome).toHaveBeenCalledTimes(2);
    expect(mocks.sendBatch).toHaveBeenCalledOnce();
    expect(mocks.finalizeSend).toHaveBeenCalledWith(expect.objectContaining({
      status: "accepted",
      providerEmailId: "provider-email-recovered",
    }), expect.anything());
  });

  it("finalizes a confirmed provider acceptance with its ID and replays early webhooks", async () => {
    mocks.sendBatch.mockResolvedValueOnce({
      ids: ["provider-email-1"],
      quota: { dailyUsed: 6, monthlyUsed: 41 },
    });

    const response = await drain();

    expect(response.status).toBe(200);
    expect(mocks.sendBatch).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "volunteer-outcome/recipient-1/4",
      emails: [{
        from: "DevCongress <volunteers@devcongress.org>",
        to: ["ama@example.test"],
        subject: "Your application",
        html: "<p>Accepted</p>",
        text: "Accepted",
      }],
    }));
    expect(mocks.finalizeSend).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: "delivery-1",
      status: "accepted",
      providerEmailId: "provider-email-1",
      claimToken: expect.any(String),
    }), expect.anything());
    expect(mocks.replayEvents).toHaveBeenCalledWith("provider-email-1", expect.anything());
  });

  it("records definite provider rate limits as retryable failures without changing the decision", async () => {
    const { ResendBatchError } = await import("../lib/email/resend");

    mocks.sendBatch.mockRejectedValueOnce(new ResendBatchError("rate limited", 429));
    await drain();

    expect(mocks.finalizeSend).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      nextAttemptAt: expect.any(String),
    }), expect.anything());
    expect(mocks.sendBatch).toHaveBeenCalledOnce();
  });

  it("does not claim or send when the provider quota is incomplete", async () => {
    mocks.readQuota.mockResolvedValue({ dailyUsed: null, monthlyUsed: 40 });

    const response = await drain();
    const payload = await response.json() as { reason: string };

    expect(response.status).toBe(200);
    expect(payload.reason).toContain("capacity_unverified");
    expect(mocks.claimOutcome).not.toHaveBeenCalled();
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("does not send when the shared transactional claim has no remaining daily capacity", async () => {
    mocks.claimOutcome.mockResolvedValueOnce(null);

    const response = await drain();

    expect(response.status).toBe(200);
    expect(mocks.claimOutcome).toHaveBeenCalledOnce();
    expect(mocks.sendBatch).not.toHaveBeenCalled();
  });

  it("keeps network failures locked for a same-key retry inside the provider window", async () => {
    mocks.sendBatch.mockRejectedValueOnce(new Error("socket reset"));

    await drain();

    expect(mocks.sendBatch).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "volunteer-outcome/recipient-1/4",
    }));
    expect(mocks.finalizeSend).toHaveBeenCalledWith(expect.objectContaining({
      status: "retrying",
      nextAttemptAt: expect.any(String),
    }), expect.anything());
  });
});
