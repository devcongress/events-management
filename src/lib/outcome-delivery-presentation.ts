export type OutcomeDecision = "accepted" | "not_selected";
export type OutcomeDeliveryGroup = "held" | "attention" | "progress" | "delivered" | "not_queued";

export type OutcomeRecipient = {
  id: string;
  applicant_name: string;
  applicant_email?: string;
  decision_version?: number;
  decision: "pending" | OutcomeDecision;
  outcome_sent: boolean;
  outcome_delivery: {
    id?: string;
    individually_controlled?: boolean;
    held_at?: string | null;
    decision?: OutcomeDecision;
    decision_version?: number;
    status: string;
    attempt_count: number;
    next_attempt_at: string | null;
    last_error: string | null;
    provider_email_id: string | null;
  } | null;
  outcome_control?: { held: boolean; can_hold: boolean; can_resume: boolean; reason: string | null } | null;
  outcome_diagnostic?: {
    explanation: string;
    action: string;
    retry_block_reason: string | null;
  } | null;
};

type DeliveryPresentation = { label: string; detail: string; group: OutcomeDeliveryGroup };

export function outcomeDeliveryPresentation(recipient: OutcomeRecipient, paused: boolean): DeliveryPresentation {
  const delivery = recipient.outcome_delivery;

  if (!delivery) {
    return recipient.outcome_sent
      ? { label: "Previously sent", detail: "A previous send was recorded, but its delivery status is unavailable here. Review diagnostics before sending again.", group: "attention" }
      : { label: "Not queued", detail: "This decision has no email queued. Preview the audience to check eligibility before confirming a send.", group: "not_queued" };
  }

  if (delivery.decision !== recipient.decision || delivery.decision_version !== recipient.decision_version || recipient.decision_version === undefined) {
    return delivery.status === "cancelled"
      ? { label: "Not queued", detail: "The previous decision’s email was cancelled. Preview this audience to check eligibility for the current decision.", group: "not_queued" }
      : { label: "Check delivery history", detail: "The latest email record cannot be matched to this decision. Review Owner diagnostics before sending again.", group: "attention" };
  }

  if (delivery.held_at && ["queued", "retrying", "failed"].includes(delivery.status)) {
    return { label: "On hold", detail: "This email will not be picked up by the sender. Resume preserves its original content and retry limits.", group: "held" };
  }

  switch (delivery.status) {
    case "queued":
      return { label: paused ? "Queue paused" : "Queued", detail: paused ? "Waiting for queue delivery to be enabled. No send has started for this queued item." : "Waiting for the scheduled sender and available capacity. No action needed.", group: "progress" };
    case "sending":
      return { label: "Sending", detail: "The sender has claimed this email. Provider acceptance is not confirmed yet. Do not send another copy.", group: "progress" };
    case "retrying":
      return { label: paused ? "Retry paused" : "Retry scheduled", detail: paused ? "The retry will wait while queue delivery is paused. Do not send another copy." : "The queue will retry the same email when eligible. Do not send another copy.", group: "progress" };
    case "accepted":
      return { label: "With email provider", detail: "Resend accepted the email. Delivery has not been confirmed; this is not the applicant’s selection decision.", group: "progress" };
    case "delivered":
      return { label: "Delivered", detail: "The recipient’s mail server accepted the email. This does not confirm that they opened or read it.", group: "delivered" };
    case "delayed":
      return { label: "Delivery delayed", detail: "The provider reported a delay after accepting the email. Do not send another copy; review the provider update in diagnostics.", group: "progress" };
    case "needs_attention":
      return { label: "Delivery uncertain", detail: "The send result needs owner review. Check provider records before taking action to avoid a duplicate email.", group: "attention" };
    case "failed":
      return { label: "Send failed", detail: "The send did not complete successfully. Review the failure and retry safety checks in Owner diagnostics.", group: "attention" };
    case "bounced":
      return { label: "Bounced", detail: "The provider reported that delivery failed. Review the provider event in Owner diagnostics; do not resend this record.", group: "attention" };
    case "suppressed":
      return { label: "Delivery blocked", detail: "The provider suppressed this email. Review the provider event in Owner diagnostics before taking action.", group: "attention" };
    case "complained":
      return { label: "Spam complaint", detail: "The provider recorded a complaint. Do not resend this email.", group: "attention" };
    case "cancelled":
      return { label: "Cancelled", detail: "This queued email was cancelled. Review the current decision and eligibility before starting a new preview.", group: "not_queued" };
    default:
      return { label: "Status unavailable", detail: "This delivery state is not recognized. Review Owner diagnostics before taking action.", group: "attention" };
  }
}
