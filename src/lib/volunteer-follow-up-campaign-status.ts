export type VolunteerFollowUpCampaignState =
  | "draft"
  | "running"
  | "paused"
  | "closed";

export type VolunteerFollowUpCampaignStatus = {
  message: string;
  detail: string | null;
  lastRunIsHistorical: boolean;
};

type DrainResults = {
  invitations?: string;
  outcomes?: string;
  failureCategory?: "resource_limit" | "internal";
};

const RECENT_DRAIN_WINDOW_MILLISECONDS = 30 * 60_000;

function parseDrainResults(reason: string | null): DrainResults {
  if (!reason) return {};

  const failure = /^failed:(campaign_lookup|reconcile|queue_check|lease_acquire|invitation_drain|outcome_drain|finalize):(resource_limit|internal)$/u.exec(reason);

  if (failure) return { failureCategory: failure[2] as DrainResults["failureCategory"] };

  return reason.split(";").reduce<DrainResults>((results, segment) => {
    const match = /^(invitations|outcomes):([a-z_]+)$/u.exec(segment.trim());

    if (!match) return results;

    const [, queue, result] = match;

    if (queue === "invitations") results.invitations = result;
    if (queue === "outcomes") results.outcomes = result;

    return results;
  }, {});
}

function isRecentDrain(lastDrainAt: string | null, now: Date): boolean {
  if (!lastDrainAt) return false;

  const timestamp = new Date(lastDrainAt).getTime();
  const age = now.getTime() - timestamp;

  return Number.isFinite(timestamp) && age >= 0 && age <= RECENT_DRAIN_WINDOW_MILLISECONDS;
}

function currentDrainStatus(results: DrainResults): Omit<VolunteerFollowUpCampaignStatus, "lastRunIsHistorical"> | null {
  if (results.failureCategory) {
    return {
      message: "The latest scheduler run needs attention.",
      detail: "Review the scheduler diagnostics before relying on its result.",
    };
  }

  const queue = results.invitations === "capacity_unverified"
    ? "Invitation"
    : results.outcomes === "capacity_unverified"
      ? "Outcome email"
      : null;

  if (queue) {
    return {
      message: queue === "Invitation"
        ? "Sending is waiting for a verified quota check."
        : "Outcome email sending is waiting for a verified quota check.",
      detail: "Review Delivery health before changing campaign controls.",
    };
  }

  const capacityQueue = results.invitations === "capacity_reserved"
    ? "Invitation"
    : results.outcomes === "capacity_reserved"
      ? "Outcome email"
      : null;

  if (capacityQueue) {
    return {
      message: capacityQueue === "Invitation"
        ? "Sending is waiting for available quota after the transactional reserve."
        : "Outcome email sending is waiting for available quota after the transactional reserve.",
      detail: "Review Delivery health before changing campaign controls.",
    };
  }

  if (results.invitations === "configuration_missing" || results.outcomes === "configuration_missing") {
    return {
      message: "Sending needs email configuration before it can continue.",
      detail: "Review the email configuration and Delivery health.",
    };
  }

  if (
    results.invitations === "provider_retry_scheduled" ||
    results.outcomes === "outcome_provider_retry_scheduled"
  ) {
    return {
      message: "A provider retry is pending.",
      detail: "The scheduled sender will retain the existing idempotency key.",
    };
  }

  if (
    results.invitations === "provider_result_unconfirmed" ||
    results.outcomes === "outcome_provider_result_unconfirmed"
  ) {
    return {
      message: "A provider result is awaiting confirmation.",
      detail: "Review Delivery health and recipient diagnostics.",
    };
  }

  if (results.invitations === "provider_rejected" || results.outcomes === "outcome_provider_rejected") {
    return {
      message: "The latest provider request was rejected.",
      detail: "Review Delivery health and recipient diagnostics.",
    };
  }

  return null;
}

function historicalDetail(results: DrainResults): string | null {
  const status = currentDrainStatus(results);

  return status ? `Historical scheduler result: ${status.message}` : null;
}

export function volunteerFollowUpCampaignStatus(input: {
  status: VolunteerFollowUpCampaignState;
  lastDrainAt: string | null;
  lastDrainReason: string | null;
  now?: Date;
}): VolunteerFollowUpCampaignStatus {
  const results = parseDrainResults(input.lastDrainReason);
  const recent = isRecentDrain(input.lastDrainAt, input.now ?? new Date());

  if (input.status === "draft") {
    return {
      message: "Campaign is ready to launch.",
      detail: historicalDetail(results),
      lastRunIsHistorical: Boolean(input.lastDrainReason),
    };
  }

  if (input.status === "paused") {
    return {
      message: "Invitation sending is paused by an owner.",
      detail: historicalDetail(results),
      lastRunIsHistorical: Boolean(input.lastDrainReason),
    };
  }

  if (input.status === "closed") {
    return {
      message: "Invitation campaign is closed.",
      detail: historicalDetail(results),
      lastRunIsHistorical: Boolean(input.lastDrainReason),
    };
  }

  const current = recent ? currentDrainStatus(results) : null;

  if (current) return { ...current, lastRunIsHistorical: false };

  return {
    message: "Sending follows the scheduled queue.",
    detail: historicalDetail(results),
    lastRunIsHistorical: Boolean(input.lastDrainReason),
  };
}
