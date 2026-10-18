export type OutcomeControlEvidence = {
  decision: string;
  decision_version: number;
  status: string;
  individually_controlled?: boolean;
  held_at?: string | null;
  failure_certainty?: string | null;
  provider_email_id: string | null;
  provider_event_at: string | null;
  claimed_until: string | null;
  attempt_count: number;
  first_attempt_at: string | null;
  next_attempt_at: string | null;
};

export function volunteerOutcomeRowControl(delivery: OutcomeControlEvidence, recipient: { decision: string; decision_version: number }, now = Date.now()) {
  const held = Boolean(delivery.held_at);
  const blocked = (reason: string) => ({ held, can_hold: false, can_resume: false, reason });

  if (!delivery.individually_controlled) return blocked("Legacy batch: individual hold/resume is unavailable.");
  if (delivery.decision !== recipient.decision || delivery.decision_version !== recipient.decision_version)
    return blocked("This email belongs to a previous decision.");
  if (delivery.status === "sending" || (delivery.claimed_until && Date.parse(delivery.claimed_until) > now))
    return blocked("Already being processed. Wait for the provider result.");
  if (delivery.provider_email_id || delivery.provider_event_at || !["queued", "retrying", "failed"].includes(delivery.status))
    return blocked("This delivery cannot be held or resumed in its current state.");
  if (held) {
    if (delivery.status === "failed" && delivery.failure_certainty !== "definite") return blocked("The previous result is uncertain. Review provider records before resuming.");
    if (delivery.attempt_count >= 4) return blocked("Four-attempt limit reached. Review delivery details.");
    if (delivery.attempt_count > 0 && (!delivery.first_attempt_at || !Number.isFinite(Date.parse(delivery.first_attempt_at)) || Date.parse(delivery.first_attempt_at) <= now - 23 * 60 * 60_000))
      return blocked("Safe retry window expired. This email stays on hold to avoid a duplicate.");

    return { held, can_hold: false, can_resume: true, reason: null };
  }
  if (delivery.status === "failed" && !delivery.next_attempt_at)
    return blocked("Already stopped. Review delivery details for a safe retry.");

  return { held, can_hold: true, can_resume: false, reason: null };
}
