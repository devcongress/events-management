import { describe, expect, it } from "vitest";
import { diagnoseVolunteerDelivery } from "./volunteer-follow-up-delivery-diagnostics";

const now = Date.parse("2026-09-28T12:00:00.000Z");

describe("volunteer delivery diagnostics", () => {
  it("permits only a recent definite rejection with no provider acceptance or scheduled retry", () => {
    const diagnostic = diagnoseVolunteerDelivery(
      {
        status: "failed",
        attempt_count: 2,
        first_attempt_at: "2026-09-28T11:00:00.000Z",
        next_attempt_at: null,
        claimed_until: null,
        provider_email_id: null,
        provider_event_at: null,
        delivery_stage: "provider_response",
        provider_http_status: 422,
        failure_certainty: "definite",
      },
      now,
    );

    expect(diagnostic).toMatchObject({
      source: "provider",
      retry_block_reason: null,
    });
    expect(diagnostic.action).toContain("queue the same frozen delivery");
  });

  it("blocks ambiguous idempotency results, accepted records, and bounced records", () => {
    const ambiguous = diagnoseVolunteerDelivery(
      {
        status: "needs_attention",
        attempt_count: 1,
        first_attempt_at: "2026-09-28T11:00:00.000Z",
        next_attempt_at: null,
        claimed_until: null,
        provider_email_id: null,
        provider_event_at: null,
        delivery_stage: "provider_response",
        provider_http_status: 409,
        failure_certainty: "ambiguous",
      },
      now,
    );
    const bounced = diagnoseVolunteerDelivery(
      {
        status: "bounced",
        attempt_count: 1,
        first_attempt_at: "2026-09-28T11:00:00.000Z",
        next_attempt_at: null,
        claimed_until: null,
        provider_email_id: "provider-1",
        provider_event_at: "2026-09-28T11:01:00.000Z",
        delivery_stage: "provider_event",
        provider_http_status: 200,
        failure_certainty: null,
      },
      now,
    );

    expect(ambiguous.retry_block_reason).toContain("Only a definite failed");
    expect(bounced.explanation).toContain("not whether the cause");
    expect(bounced.retry_block_reason).toContain("cannot be safely resent");
  });

  it("explains that an ambiguous result can continue through its existing same-key schedule", () => {
    const diagnostic = diagnoseVolunteerDelivery(
      {
        status: "retrying",
        attempt_count: 1,
        first_attempt_at: "2026-09-28T11:00:00.000Z",
        next_attempt_at: "2026-09-28T12:15:00.000Z",
        claimed_until: null,
        provider_email_id: null,
        provider_event_at: null,
        delivery_stage: "provider_request",
        provider_http_status: null,
        failure_certainty: "ambiguous",
      },
      now,
    );

    expect(diagnostic.action).toContain("same-key scheduled retry is pending");
    expect(diagnostic.action).not.toContain("cannot be resent automatically");
  });
});
