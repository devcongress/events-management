export type VolunteerDeliveryKind = "invitation" | "outcome";

export type VolunteerDeliveryEvidence = {
  status: string;
  attempt_count: number;
  first_attempt_at: string | null;
  next_attempt_at: string | null;
  claimed_until: string | null;
  provider_email_id: string | null;
  provider_event_at: string | null;
  delivery_stage?: string | null;
  provider_http_status?: number | null;
  failure_certainty?: string | null;
  diagnostic_at?: string | null;
};

export type VolunteerDeliveryDiagnostic = {
  source: "queue" | "provider" | "provider_event" | "unknown";
  explanation: string;
  action: string;
  retry_block_reason: string | null;
};

function retryBlockReason(
  delivery: VolunteerDeliveryEvidence,
  now = Date.now(),
): string | null {
  if (delivery.provider_email_id || delivery.provider_event_at)
    return "Resend accepted this delivery or reported an event; it cannot be safely resent.";
  if (delivery.status !== "failed")
    return "Only a definite failed delivery can be queued again.";
  if (delivery.failure_certainty !== "definite")
    return "The previous send result was not definite, so resending could duplicate an email.";
  if (
    delivery.claimed_until &&
    new Date(delivery.claimed_until).getTime() > now
  )
    return "This delivery is currently claimed by the sender.";
  if (delivery.next_attempt_at)
    return "A retry is already scheduled for this delivery.";
  if (delivery.attempt_count >= 4)
    return "The four-attempt safety limit has been reached.";
  if (!delivery.first_attempt_at)
    return "Historical delivery evidence cannot establish a safe retry window.";
  if (now - new Date(delivery.first_attempt_at).getTime() >= 23 * 60 * 60_000)
    return "The 23-hour idempotency window has passed.";

  return null;
}

export function diagnoseVolunteerDelivery(
  delivery: VolunteerDeliveryEvidence,
  now = Date.now(),
): VolunteerDeliveryDiagnostic {
  const retryBlockReasonValue = retryBlockReason(delivery, now);

  if (["accepted", "delivered"].includes(delivery.status)) {
    return {
      source: delivery.provider_event_at ? "provider_event" : "provider",
      explanation:
        delivery.status === "delivered"
          ? "Resend recorded this email as delivered."
          : "Resend accepted this email for delivery.",
      action: "No retry is needed.",
      retry_block_reason: retryBlockReasonValue,
    };
  }

  if (delivery.provider_event_at) {
    const bounced = delivery.status === "bounced";

    return {
      source: "provider_event",
      explanation: bounced
        ? "Resend recorded a bounce. This confirms a delivery event, not whether the cause was the recipient, EMS, or Resend."
        : "Resend recorded a delivery event for this email.",
      action:
        "Do not resend this record; investigate the recorded provider event.",
      retry_block_reason: retryBlockReasonValue,
    };
  }

  if (delivery.failure_certainty === "definite") {
    const status = delivery.provider_http_status;
    const providerAction =
      status === 401 || status === 403
        ? "Check EMS Resend credentials, sender domain verification, and account permissions."
        : status === 400 || status === 422
          ? "Check the frozen email request and recipient data in EMS."
          : status === 429
            ? "Wait for the scheduled queue; Resend capacity is rate-limited."
            : "Review the provider rejection and the frozen EMS email request.";

    return {
      source: "provider",
      explanation: status
        ? `Resend rejected this request before accepting it (HTTP ${status}).`
        : "Resend definitively rejected this request before accepting it.",
      action: retryBlockReasonValue
        ? providerAction
        : `${providerAction} Then queue the same frozen delivery for the scheduled sender.`,
      retry_block_reason: retryBlockReasonValue,
    };
  }

  if (delivery.failure_certainty === "ambiguous") {
    const retryScheduled = Boolean(delivery.next_attempt_at);

    return {
      source: "unknown",
      explanation:
        "The sender could not confirm whether Resend accepted the email.",
      action: retryScheduled
        ? "A same-key scheduled retry is pending. Do not manually queue another retry."
        : "Inspect Resend before taking any further action; manual retry is blocked to avoid a duplicate email.",
      retry_block_reason: retryBlockReasonValue,
    };
  }

  return {
    source: delivery.delivery_stage === "queue" ? "queue" : "unknown",
    explanation: "This delivery has no structured provider evidence yet.",
    action: retryBlockReasonValue
      ? "Review the retry safety checks below."
      : "Queue the same frozen delivery for the scheduled sender.",
    retry_block_reason: retryBlockReasonValue,
  };
}
