import { describe, expect, it } from "vitest";
import { outcomeDeliveryPresentation, type OutcomeRecipient } from "./outcome-delivery-presentation";

function recipient(status: string | null, sent = false): OutcomeRecipient {
  return {
    id: "fixture", applicant_name: "Fixture applicant", decision: "accepted", decision_version: 1, outcome_sent: sent,
    outcome_delivery: status ? { decision: "accepted", decision_version: 1, status, attempt_count: 1, next_attempt_at: null, last_error: null, provider_email_id: null } : null,
  };
}

describe("outcome delivery presentation", () => {
  it("distinguishes provider acceptance from confirmed delivery for both outcomes", () => {
    for (const decision of ["accepted", "not_selected"] as const) {
      expect(outcomeDeliveryPresentation({ ...recipient("accepted", true), decision, outcome_delivery: { ...recipient("accepted", true).outcome_delivery!, decision } }, false)).toMatchObject({ label: "With email provider", group: "progress" });
      expect(outcomeDeliveryPresentation({ ...recipient("delivered", true), decision, outcome_delivery: { ...recipient("delivered", true).outcome_delivery!, decision } }, false)).toMatchObject({ label: "Delivered", group: "delivered" });
    }
  });

  it("does not hide delivery failures behind the historical sent flag", () => {
    for (const status of ["failed", "bounced", "suppressed", "complained", "needs_attention"])
      expect(outcomeDeliveryPresentation(recipient(status, true), false).group).toBe("attention");
  });

  it("distinguishes unsent decisions from missing evidence for a previous send", () => {
    expect(outcomeDeliveryPresentation(recipient(null), false)).toMatchObject({ label: "Not queued", group: "not_queued" });
    expect(outcomeDeliveryPresentation(recipient(null, true), false)).toMatchObject({ label: "Previously sent", group: "attention" });
  });

  it("pauses queued work without claiming an in-flight email has stopped", () => {
    expect(outcomeDeliveryPresentation(recipient("queued"), true).label).toBe("Queue paused");
    expect(outcomeDeliveryPresentation(recipient("retrying"), true).label).toBe("Retry paused");
    for (const status of ["sending", "accepted", "delivered", "delayed"])
      expect(outcomeDeliveryPresentation(recipient(status), true)).toEqual(outcomeDeliveryPresentation(recipient(status), false));
  });

  it("does not present a previous decision delivery as current", () => {
    const stale = { ...recipient("cancelled"), decision_version: 2 };

    expect(outcomeDeliveryPresentation(stale, false)).toMatchObject({ label: "Not queued", group: "not_queued" });
    expect(outcomeDeliveryPresentation({ ...recipient("delivered", true), decision_version: 2 }, false).group).toBe("attention");
  });

  it("shows held queued and retrying work without hiding terminal provider evidence", () => {
    for (const status of ["queued", "retrying", "failed"]) {
      const row = recipient(status);

      row.outcome_delivery!.held_at = "2026-10-18T20:00:00Z";
      expect(outcomeDeliveryPresentation(row, false).group).toBe("held");
    }
    const row = recipient("delivered");

    row.outcome_delivery!.held_at = "2026-10-18T20:00:00Z";
    expect(outcomeDeliveryPresentation(row, false).group).toBe("delivered");
  });

  it("treats cancellation and unknown states conservatively", () => {
    expect(outcomeDeliveryPresentation(recipient("cancelled"), false).group).toBe("not_queued");
    expect(outcomeDeliveryPresentation(recipient("future_state"), false)).toMatchObject({ label: "Status unavailable", group: "attention" });
  });
});
