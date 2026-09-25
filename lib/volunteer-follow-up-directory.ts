export type VolunteerFollowUpDirectoryFilter =
  | "all"
  | "not_sent"
  | "sent"
  | "responded"
  | "to_review"
  | "failed";

export type VolunteerFollowUpDirectoryRecipient = {
  applicant_name: string;
  applicant_email: string;
  status: string;
  submitted_at: string | null;
  review_status: "unreviewed" | "reviewed" | "needs_follow_up";
};

export type VolunteerFollowUpDirectorySummary = {
  total: number;
  notSent: number;
  sent: number;
  responded: number;
  toReview: number;
  failed: number;
};

const acceptedDeliveryStatuses = new Set(["accepted", "delivered", "delayed"]);
const failedDeliveryStatuses = new Set([
  "failed",
  "bounced",
  "suppressed",
  "complained",
]);
const notSentDeliveryStatuses = new Set(["queued", "sending"]);

export function summarizeVolunteerFollowUpRecipients(
  recipients: readonly VolunteerFollowUpDirectoryRecipient[],
): VolunteerFollowUpDirectorySummary {
  return {
    total: recipients.length,
    notSent: recipients.filter((recipient) =>
      notSentDeliveryStatuses.has(recipient.status),
    ).length,
    sent: recipients.filter((recipient) =>
      acceptedDeliveryStatuses.has(recipient.status),
    ).length,
    responded: recipients.filter((recipient) => Boolean(recipient.submitted_at))
      .length,
    toReview: recipients.filter(
      (recipient) =>
        recipient.submitted_at && recipient.review_status === "unreviewed",
    ).length,
    failed: recipients.filter((recipient) =>
      failedDeliveryStatuses.has(recipient.status),
    ).length,
  };
}

export function filterVolunteerFollowUpRecipients<
  T extends VolunteerFollowUpDirectoryRecipient,
>(
  recipients: readonly T[],
  filter: VolunteerFollowUpDirectoryFilter,
  search: string,
): T[] {
  const needle = search.trim().toLocaleLowerCase();

  return recipients.filter((recipient) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "not_sent" &&
        notSentDeliveryStatuses.has(recipient.status)) ||
      (filter === "sent" && acceptedDeliveryStatuses.has(recipient.status)) ||
      (filter === "responded" && Boolean(recipient.submitted_at)) ||
      (filter === "to_review" &&
        Boolean(recipient.submitted_at) &&
        recipient.review_status === "unreviewed") ||
      (filter === "failed" && failedDeliveryStatuses.has(recipient.status));
    const matchesSearch =
      !needle ||
      recipient.applicant_name.toLocaleLowerCase().includes(needle) ||
      recipient.applicant_email.toLocaleLowerCase().includes(needle);

    return matchesFilter && matchesSearch;
  });
}

export function paginateVolunteerFollowUpRecipients<T>(
  recipients: readonly T[],
  requestedPage: number,
  pageSize: number,
) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(recipients.length / safePageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage)));
  const start = (page - 1) * safePageSize;

  return {
    page,
    pageCount,
    first: recipients.length ? start + 1 : 0,
    last: Math.min(start + safePageSize, recipients.length),
    items: recipients.slice(start, start + safePageSize),
  };
}
