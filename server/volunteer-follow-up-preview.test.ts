import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppBindings } from "./http/app-bindings";

const mockAdmin = vi.hoisted(() => ({
  createOutcomePreview: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000001",
    eligibleCount: 1,
    excludedCount: 2,
    recipients: [{
      recipient_id: "00000000-0000-4000-8000-000000000002",
      decision_version: 3,
      name: "Ama Mensah",
      email: "ama@example.test",
    }],
  })),
  saveOutcomePayloads: vi.fn(async (_input: {
    actorEmail: string;
    previewId: string;
    payloads: Record<string, {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text: string;
    }>;
  }, _context: unknown) => true),
  readOutcomePreview: vi.fn(async () => ({
    campaignId: "campaign-2026",
    decision: "accepted",
    recipients: [{
      recipient_id: "00000000-0000-4000-8000-000000000002",
      decision_version: 3,
      name: "Ama Mensah",
      email: "ama@example.test",
    }],
    eligibleCount: 1,
    excludedCount: 2,
    expiresAt: "2099-10-01T00:00:00.000Z",
    confirmedAt: null,
  })),
  confirmOutcomePreview: vi.fn(async () => ({ queuedCount: 1, deliveryIds: ["delivery-1"] })),
  requireAdmin: vi.fn(
    async (
      c: {
        req: { header: (name: string) => string | undefined };
        json: (body: unknown, status: number) => Response;
      },
      roles?: readonly string[],
    ) => {
      const role = c.req.header("x-test-role");

      if (!role) return c.json({ error: "Sign in required." }, 401);
      if (roles && !roles.includes(role))
        return c.json({ error: "Owner access required." }, 403);

      return null;
    },
  ),
}));

const mockIntakeProtection = vi.hoisted(() => ({
  publicClientKey: vi.fn(() => "test-client"),
  enforcePublicRateLimit: vi.fn(async () => null),
  requirePublicTurnstile: vi.fn(async () => null),
}));

vi.mock("../lib/supabase/admin-auth", () => ({
  getAdminSession: vi.fn(async () => ({ authenticated: true, email: "owner@example.test" })),
  requireAdmin: mockAdmin.requireAdmin,
}));

vi.mock("../server/http/public-intake-protection", () => mockIntakeProtection);

vi.mock("../lib/supabase/volunteer-follow-up", () => ({
  getVolunteerFollowUpCampaign: vi.fn(async () => ({
    id: "campaign-2026",
    status: "draft",
    application_deadline_at: "2026-09-30T23:59:59.999Z",
    outcome_paused: false,
  })),
  createVolunteerOutcomePreview: mockAdmin.createOutcomePreview,
  saveVolunteerOutcomePreviewPayloads: mockAdmin.saveOutcomePayloads,
  readVolunteerOutcomePreview: mockAdmin.readOutcomePreview,
  confirmVolunteerOutcomePreview: mockAdmin.confirmOutcomePreview,
}));

describe("volunteer follow-up invitation preview route", () => {
  beforeEach(() => {
    mockAdmin.requireAdmin.mockClear();
    mockAdmin.createOutcomePreview.mockClear();
    mockAdmin.saveOutcomePayloads.mockClear();
    mockAdmin.readOutcomePreview.mockClear();
    mockAdmin.confirmOutcomePreview.mockClear();
    mockIntakeProtection.enforcePublicRateLimit.mockClear();
    mockIntakeProtection.requirePublicTurnstile.mockClear();
  });

  it("serves the editable test form publicly without exposing applicant data", async () => {
    const { registerVolunteerFollowUpRoutes } =
      await import("./routes/volunteer-follow-up");
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);

    const path = "http://localhost/api/annual-conference/2026/volunteer-follow-up/test";
    const response = await app.request(path);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      response_deadline: "2026-10-14T23:59:59.999Z",
    });
    expect(mockAdmin.requireAdmin).not.toHaveBeenCalled();
  });

  it("validates and verifies public test answers without persisting them", async () => {
    const { registerVolunteerFollowUpRoutes } =
      await import("./routes/volunteer-follow-up");
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);

    const path = "http://localhost/api/annual-conference/2026/volunteer-follow-up/test";
    const invalid = await app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivation: "", can_attend_accra: "yes" }),
    });
    const valid = await app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        motivation: "I want to help attendees feel welcome.",
        can_attend_accra: true,
        turnstile_action: "volunteer_follow_up_test",
        turnstile_token: "valid-test-token",
      }),
    });

    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ accepted: true, test_mode: true });
    expect(mockIntakeProtection.enforcePublicRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      {
        action: "volunteer_follow_up_public_test",
        clientKey: "test-client",
        maxAttempts: 20,
        windowSeconds: 900,
      },
      expect.any(String),
    );
    expect(mockIntakeProtection.requirePublicTurnstile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        token: "valid-test-token",
        submittedAction: "volunteer_follow_up_test",
        expectedAction: "volunteer_follow_up_test",
      }),
    );
  });

  it("denies anonymous and non-owner requests before exposing campaign email content", async () => {
    const { registerVolunteerFollowUpRoutes } =
      await import("./routes/volunteer-follow-up");
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);

    const anonymous = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/preview",
    );
    const organizer = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/preview",
      {
        headers: { "x-test-role": "organizer" },
      },
    );

    expect(anonymous.status).toBe(401);
    expect(organizer.status).toBe(403);
    expect(mockAdmin.requireAdmin).toHaveBeenCalledTimes(2);
    expect(mockAdmin.requireAdmin.mock.calls).toEqual([
      [expect.anything(), ["owner"]],
      [expect.anything(), ["owner"]],
    ]);
  });

  it("returns a sample production template with inert example links and saved deadlines for the owner", async () => {
    const { registerVolunteerFollowUpRoutes } =
      await import("./routes/volunteer-follow-up");
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);

    const response = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/preview",
      {
        headers: { "x-test-role": "owner" },
      },
    );
    const payload = (await response.json()) as {
      from: string;
      subject: string;
      html: string;
      text: string;
      application_deadline: string;
      response_deadline: string;
    };

    expect(response.status).toBe(200);
    expect(payload.from).toBeTruthy();
    expect(payload.subject).toContain("volunteering");
    expect(payload.html).toContain("example.invalid");
    expect(payload.html).not.toContain("/volunteer/follow-up/");
    expect(payload.text).toContain("example.invalid");
    expect(payload.application_deadline).toBe("2026-09-30T23:59:59.999Z");
    expect(payload.response_deadline).toBe("2026-10-14T23:59:59.999Z");
  });

  it("keeps decision previews and confirmations Owner-only and freezes personalized payloads", async () => {
    const { registerVolunteerFollowUpRoutes } = await import("./routes/volunteer-follow-up");
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);
    const path = "http://localhost/api/annual-conference/2026/volunteer-follow-up/outcomes/preview";
    const denied = await app.request(path, {
      method: "POST",
      headers: { "x-test-role": "organizer", "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accepted" }),
    });
    const allowed = await app.request(path, {
      method: "POST",
      headers: { "x-test-role": "owner", "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "accepted" }),
    });
    const payload = await allowed.json() as Record<string, unknown>;
    const confirmation = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/outcomes/confirm",
      {
        method: "POST",
        headers: { "x-test-role": "owner", "Content-Type": "application/json" },
        body: JSON.stringify({ preview_id: "00000000-0000-4000-8000-000000000001" }),
      },
    );

    expect(denied.status).toBe(403);
    expect(mockAdmin.createOutcomePreview).toHaveBeenCalledOnce();
    expect(allowed.status).toBe(200);
    expect(payload).toMatchObject({
      eligible_count: 1,
      excluded_count: 2,
      recipients: [{
        recipient_id: "00000000-0000-4000-8000-000000000002",
        decision_version: 3,
        name: "Ama Mensah",
        email: "ama@example.test",
      }],
    });
    expect(mockAdmin.saveOutcomePayloads).toHaveBeenCalledOnce();
    expect(mockAdmin.saveOutcomePayloads.mock.calls[0]?.[0]).toMatchObject({
      actorEmail: "owner@example.test",
      payloads: {
        "00000000-0000-4000-8000-000000000002": {
          to: ["ama@example.test"],
          html: expect.stringContaining("Hi Ama,"),
          text: expect.stringContaining("Hi Ama,"),
        },
      },
    });
    expect(confirmation.status).toBe(200);
    expect(await confirmation.json()).toEqual({ queued_count: 1 });
    expect(mockAdmin.confirmOutcomePreview).toHaveBeenCalledOnce();
  });

  it("denies organizer access to preview, confirmation, and pause controls before database reads", async () => {
    const { registerVolunteerFollowUpRoutes } = await import("./routes/volunteer-follow-up");
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);

    const base = "http://localhost/api/annual-conference/2026/volunteer-follow-up/outcomes";
    const requests = [
      app.request(`${base}/preview`, {
        method: "POST",
        headers: { "x-test-role": "organizer", "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "accepted" }),
      }),
      app.request(`${base}/confirm`, {
        method: "POST",
        headers: { "x-test-role": "organizer", "Content-Type": "application/json" },
        body: JSON.stringify({ preview_id: "00000000-0000-4000-8000-000000000001" }),
      }),
      app.request(`${base}/control`, {
        method: "POST",
        headers: { "x-test-role": "organizer", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      }),
    ];
    const responses = await Promise.all(requests);

    expect(responses.map((response) => response.status)).toEqual([403, 403, 403]);
    expect(mockAdmin.requireAdmin).toHaveBeenCalledTimes(3);
    expect(mockAdmin.createOutcomePreview).not.toHaveBeenCalled();
    expect(mockAdmin.readOutcomePreview).not.toHaveBeenCalled();
    expect(mockAdmin.confirmOutcomePreview).not.toHaveBeenCalled();
  });

  it("rejects a stale outcome preview without silently changing the saved audience", async () => {
    mockAdmin.confirmOutcomePreview.mockRejectedValueOnce(new Error("preview_stale"));
    const { registerVolunteerFollowUpRoutes } = await import("./routes/volunteer-follow-up");
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);
    const response = await app.request(
      "http://localhost/api/annual-conference/2026/volunteer-follow-up/outcomes/confirm",
      {
        method: "POST",
        headers: { "x-test-role": "owner", "Content-Type": "application/json" },
        body: JSON.stringify({ preview_id: "00000000-0000-4000-8000-000000000001" }),
      },
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("audience changed");
  });
});
