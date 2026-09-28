import { describe, expect, it } from "vitest";
import { volunteerFollowUpCampaignStatus } from "./volunteer-follow-up-campaign-status";

const now = new Date("2026-09-28T10:00:00.000Z");

describe("volunteer follow-up campaign status", () => {
  it("shows a current invitation quota blocker with the independent outcome result ignored", () => {
    expect(volunteerFollowUpCampaignStatus({
      status: "running",
      lastDrainAt: "2026-09-28T09:45:00.000Z",
      lastDrainReason: "invitations:capacity_unverified;outcomes:not_due",
      now,
    })).toEqual({
      message: "Sending is waiting for a verified quota check.",
      detail: "Review Delivery health before changing campaign controls.",
      lastRunIsHistorical: false,
    });
  });

  it("shows an outcome-only capacity result without treating invitations as blocked", () => {
    expect(volunteerFollowUpCampaignStatus({
      status: "running",
      lastDrainAt: "2026-09-28T09:45:00.000Z",
      lastDrainReason: "invitations:skipped_for_outcome_turn;outcomes:capacity_reserved",
      now,
    }).message).toBe("Outcome email sending is waiting for available quota after the transactional reserve.");
  });

  it.each(["draft", "paused", "closed"] as const)("gives %s precedence over the prior drain result", (status) => {
    const result = volunteerFollowUpCampaignStatus({
      status,
      lastDrainAt: "2026-09-28T09:45:00.000Z",
      lastDrainReason: "invitations:capacity_unverified;outcomes:not_due",
      now,
    });

    expect(result.lastRunIsHistorical).toBe(true);
    expect(result.message).not.toContain("waiting for a verified quota check");
    expect(result.detail).toContain("Historical scheduler result");
  });

  it("treats an old capacity result as historical instead of a current blocker", () => {
    const result = volunteerFollowUpCampaignStatus({
      status: "running",
      lastDrainAt: "2026-09-28T09:00:00.000Z",
      lastDrainReason: "invitations:capacity_unverified;outcomes:not_due",
      now,
    });

    expect(result.message).toBe("Sending follows the scheduled queue.");
    expect(result.detail).toContain("Historical scheduler result");
    expect(result.lastRunIsHistorical).toBe(true);
  });

  it("reclassifies an unchanged running campaign as historical after the freshness window", () => {
    const campaign = {
      status: "running" as const,
      lastDrainAt: "2026-09-28T09:45:00.000Z",
      lastDrainReason: "invitations:capacity_unverified;outcomes:not_due",
    };

    expect(volunteerFollowUpCampaignStatus({
      ...campaign,
      now: new Date("2026-09-28T10:00:00.000Z"),
    }).message).toBe("Sending is waiting for a verified quota check.");
    expect(volunteerFollowUpCampaignStatus({
      ...campaign,
      now: new Date("2026-09-28T10:16:00.000Z"),
    })).toMatchObject({
      message: "Sending follows the scheduled queue.",
      lastRunIsHistorical: true,
    });
  });

  it("maps a recognized unprefixed scheduler-stage failure without exposing its raw reason", () => {
    expect(volunteerFollowUpCampaignStatus({
      status: "running",
      lastDrainAt: "2026-09-28T09:45:00.000Z",
      lastDrainReason: "failed:invitation_drain:resource_limit",
      now,
    })).toEqual({
      message: "The latest scheduler run needs attention.",
      detail: "Review the scheduler diagnostics before relying on its result.",
      lastRunIsHistorical: false,
    });
  });

  it("reports a scheduled provider retry without claiming the queue is manually blocked", () => {
    expect(volunteerFollowUpCampaignStatus({
      status: "running",
      lastDrainAt: "2026-09-28T09:45:00.000Z",
      lastDrainReason: "invitations:provider_retry_scheduled;outcomes:not_due",
      now,
    }).message).toBe("A provider retry is pending.");
  });

  it("uses a safe generic status for missing timestamps and unknown reasons", () => {
    expect(volunteerFollowUpCampaignStatus({
      status: "running",
      lastDrainAt: null,
      lastDrainReason: "provider said use this raw string",
      now,
    })).toEqual({
      message: "Sending follows the scheduled queue.",
      detail: null,
      lastRunIsHistorical: true,
    });
    expect(volunteerFollowUpCampaignStatus({
      status: "running",
      lastDrainAt: "2026-09-28T09:45:00.000Z",
      lastDrainReason: "failed:unknown_stage:provider_message",
      now,
    }).detail).toBeNull();
  });
});
