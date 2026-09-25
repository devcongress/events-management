import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppBindings } from "./http/app-bindings";

const mocks = vi.hoisted(() => ({
  campaignReads: vi.fn(async () => ({
    id: "campaign-2026",
    edition_year: 2026,
    status: "running",
    application_deadline_at: "2026-09-30T23:59:59.999Z",
    launched_at: "2026-09-01T00:00:00.000Z",
    launched_by: "owner@example.com",
    last_drain_at: null,
    last_drain_reason: null,
    outcome_paused: false,
    drain_lease_token: "private-lease-token",
    drain_lease_until: "2026-09-23T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  })),
  saveCampaign: vi.fn(async () => ({
    id: "campaign-2026",
    edition_year: 2026,
    status: "draft",
    application_deadline_at: "2027-09-30T23:59:59.999Z",
    launched_at: null,
    launched_by: null,
    last_drain_at: null,
    last_drain_reason: null,
    outcome_paused: false,
    drain_lease_token: "private-lease-token",
    drain_lease_until: "2026-09-23T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  })),
  listRecipients: vi.fn(async () => [] as Record<string, unknown>[]),
  listOutcomeDeliveries: vi.fn(async () => [] as Record<string, unknown>[]),
  outcomeSentIds: vi.fn(async () => new Set<string>()),
  reviewResponse: vi.fn(async () => null as Record<string, unknown> | null),
  requireAdmin: vi.fn(async (c: any, roles?: readonly string[]) => {
    const role = c.req.header("x-test-role");

    if (!role) return c.json({ error: "Sign in required." }, 401);
    if (roles && !roles.includes(role))
      return c.json({ error: "Owner access required." }, 403);

    return null;
  }),
  requireCapability: vi.fn(async (c: any, year: number, capability: string) => {
    const role = c.req.header("x-test-role");

    if (!role) return c.json({ error: "Sign in required." }, 401);
    if (c.req.header("x-test-capability") !== "allowed")
      return c.json({ error: "Capability required." }, 403);
    if (year !== 2026 || capability !== "volunteers.review_applications")
      return c.json({ error: "Capability required." }, 403);

    return null;
  }),
}));

vi.mock("../lib/supabase/admin-auth", () => ({
  getAdminSession: vi.fn(async () => ({
    authenticated: true,
    email: "reviewer@example.com",
    role: "organizer",
  })),
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("../server/annual-conference-request", () => ({
  requireAnnualConferenceCapability: mocks.requireCapability,
}));

vi.mock("../lib/supabase/volunteer-follow-up", () => ({
  getVolunteerFollowUpCampaign: mocks.campaignReads,
  saveVolunteerFollowUpCampaign: mocks.saveCampaign,
  listVolunteerFollowUpRecipients: mocks.listRecipients,
  listVolunteerOutcomeDeliveries: mocks.listOutcomeDeliveries,
  getVolunteerOutcomeSentRecipientIds: mocks.outcomeSentIds,
  reviewVolunteerFollowUpResponse: mocks.reviewResponse,
}));

vi.mock("../lib/email/delivery-health", () => ({
  getEmailDeliveryHealth: vi.fn(async () => ({
    daily_quota_used: 2,
    daily_quota_limit: 10,
  })),
  getEmailOutboxSummary: vi.fn(async () => null),
  recordResendEmailHealth: vi.fn(async () => undefined),
}));

const baseRecipient = (
  status: string,
  providerEmailId: string | null = null,
) => ({
  id: "recipient-1",
  campaign_id: "campaign-2026",
  application_id: "application-private",
  application_created_at: "2026-08-20T00:00:00.000Z",
  applicant_name: "Ama Mensah",
  applicant_email: "ama@example.com",
  status,
  idempotency_key: "private-idempotency-key",
  provider_email_id: providerEmailId,
  attempt_count: 4,
  first_attempt_at: "2026-09-01T00:00:00.000Z",
  last_attempt_at: "2026-09-02T00:00:00.000Z",
  next_attempt_at: null,
  claimed_until: null,
  last_error: "provider detail",
  provider_event_at: null,
  submitted_at: "2026-09-04T00:00:00.000Z",
  motivation: "I want to help.",
  can_attend_accra: true,
  review_status: "unreviewed",
  review_note: null,
  decision: "pending",
  decision_version: 0,
  decision_at: null,
  decision_by: null,
  reviewed_at: null,
  reviewed_by: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
});

describe("volunteer follow-up reviews and campaign boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRecipients.mockResolvedValue([]);
    mocks.reviewResponse.mockResolvedValue(null);
  });

  async function createApp() {
    const { registerVolunteerFollowUpRoutes } =
      await import("./routes/volunteer-follow-up");
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);

    return app;
  }

  it("returns only the explicit reviewer DTO and derives invitation sent from acceptance evidence", async () => {
    const statuses = [
      ["queued", null, false],
      ["failed", null, false],
      ["accepted", null, true],
      ["delivered", null, true],
      ["delayed", null, true],
      ["bounced", null, true],
      ["complained", null, true],
      ["suppressed", null, false],
      ["suppressed", "email-1", true],
      ["failed", "email-2", true],
    ] as const;

    mocks.listRecipients.mockResolvedValue(
      statuses.map(([status, emailId]) => baseRecipient(status, emailId)),
    );
    const app = await createApp();
    const response = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/reviews",
      {
        headers: { "x-test-role": "organizer", "x-test-capability": "allowed" },
      },
    );
    const payload = (await response.json()) as {
      recipients: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(
      payload.recipients.map((recipient) => recipient.invitation_sent),
    ).toEqual(statuses.map(([, , sent]) => sent));
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
    expect(JSON.stringify(payload)).not.toMatch(
      /campaign_id|application_id|idempotency|provider_email|attempt_count|last_error|next_attempt|status":"queued/,
    );
  });

  it("denies anonymous and unauthorized sessions before reading recipient data", async () => {
    const app = await createApp();
    const anonymous = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/reviews",
    );
    const unauthorized = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/reviews",
      { headers: { "x-test-role": "owner" } },
    );

    expect(anonymous.status).toBe(401);
    expect(unauthorized.status).toBe(403);
    expect(mocks.listRecipients).not.toHaveBeenCalled();
  });

  it.each(["owner", "organizer", "volunteer"])(
    "allows an authorized %s reviewer and checks the exact capability",
    async (role) => {
      const app = await createApp();
      const response = await app.request(
        "http://localhost/api/annual-conference/2026/volunteer-follow-up/reviews",
        { headers: { "x-test-role": role, "x-test-capability": "allowed" } },
      );

      expect(response.status).toBe(200);
      expect(mocks.requireCapability).toHaveBeenCalledWith(
        expect.anything(),
        2026,
        "volunteers.review_applications",
      );
    },
  );

  it("PATCH returns the same safe reviewer DTO", async () => {
    mocks.reviewResponse.mockResolvedValue(
      baseRecipient("accepted", "email-1"),
    );
    mocks.outcomeSentIds.mockResolvedValue(new Set(["recipient-1"]));
    const app = await createApp();
    const response = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/recipients/recipient-1/review",
      {
        method: "PATCH",
        headers: {
          "x-test-capability": "allowed",
          "x-test-role": "organizer",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "reviewed",
          note: "Ready for scheduling",
          decision: "accepted",
          expected_version: 0,
        }),
      },
    );
    const payload = (await response.json()) as {
      recipient: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(Object.keys(payload.recipient).sort()).toEqual([
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
    expect(payload.recipient.invitation_sent).toBe(true);
    expect(payload.recipient.outcome_sent).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(
      /campaign_id|application_id|idempotency|provider_email|attempt_count|last_error|next_attempt/,
    );
  });

  it("keeps the campaign read owner-only before any campaign database read and excludes lease credentials", async () => {
    const app = await createApp();
    const anonymous = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up",
    );
    const deniedOrganizer = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up",
      {
        headers: { "x-test-role": "organizer" },
      },
    );
    const deniedVolunteer = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up",
      { headers: { "x-test-role": "volunteer" } },
    );

    expect(anonymous.status).toBe(401);
    expect(deniedOrganizer.status).toBe(403);
    expect(deniedVolunteer.status).toBe(403);
    expect(mocks.campaignReads).not.toHaveBeenCalled();

    const allowed = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up",
      {
        headers: { "x-test-role": "owner" },
      },
    );
    const payload = (await allowed.json()) as Record<string, unknown>;

    expect(allowed.status).toBe(200);
    expect(JSON.stringify(payload)).not.toContain("private-lease-token");
    expect(JSON.stringify(payload)).not.toContain("drain_lease");
    expect(Object.keys(payload.campaign as object).sort()).toEqual([
      "application_deadline_at",
      "id",
      "last_drain_at",
      "last_drain_reason",
      "launched_at",
      "launched_by",
      "outcome_paused",
      "status",
    ]);
  });

  it("keeps settings writes on the same owner campaign allowlist", async () => {
    mocks.campaignReads.mockResolvedValue(null as never);
    const app = await createApp();
    const response = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/settings",
      {
        method: "PATCH",
        headers: {
          "x-test-role": "owner",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ application_deadline: "2027-09-30" }),
      },
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(payload.campaign as object).sort()).toEqual([
      "application_deadline_at",
      "id",
      "last_drain_at",
      "last_drain_reason",
      "launched_at",
      "launched_by",
      "outcome_paused",
      "status",
    ]);
    expect(JSON.stringify(payload)).not.toContain("private-lease-token");
    expect(payload.response_deadline).toBe("2027-10-14T23:59:59.999Z");
  });
});
