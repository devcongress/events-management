import { describe, expect, it } from "vitest";
import {
  filterVolunteerFollowUpRecipients,
  paginateVolunteerFollowUpRecipients,
  summarizeVolunteerFollowUpRecipients,
  type VolunteerFollowUpDirectoryRecipient,
} from "./volunteer-follow-up-directory";
import { canSubmitVolunteerFollowUpForm } from "./volunteer-follow-up";

const recipients: (VolunteerFollowUpDirectoryRecipient & { id: string })[] = [
  {
    id: "queued",
    applicant_name: "Ama Mensah",
    applicant_email: "ama@example.com",
    status: "queued",
    submitted_at: null,
    review_status: "unreviewed",
  },
  {
    id: "answered",
    applicant_name: "Kojo Owusu",
    applicant_email: "kojo@example.com",
    status: "delivered",
    submitted_at: "2026-09-20T12:00:00.000Z",
    review_status: "unreviewed",
  },
  {
    id: "reviewed",
    applicant_name: "Esi Boateng",
    applicant_email: "esi@example.com",
    status: "bounced",
    submitted_at: "2026-09-21T12:00:00.000Z",
    review_status: "reviewed",
  },
];

describe("volunteer follow-up directory", () => {
  it("counts delivery, response, and review states independently", () => {
    expect(summarizeVolunteerFollowUpRecipients(recipients)).toEqual({
      total: 3,
      notSent: 1,
      sent: 1,
      responded: 2,
      toReview: 1,
      failed: 1,
    });
  });

  it("filters answered work for review separately from delivered and failed mail", () => {
    expect(
      filterVolunteerFollowUpRecipients(recipients, "to_review", ""),
    ).toEqual([recipients[1]]);
    expect(filterVolunteerFollowUpRecipients(recipients, "sent", "")).toEqual([
      recipients[1],
    ]);
    expect(filterVolunteerFollowUpRecipients(recipients, "failed", "")).toEqual(
      [recipients[2]],
    );
    expect(
      filterVolunteerFollowUpRecipients(
        recipients,
        "all",
        "  KOJO@EXAMPLE.COM ",
      ),
    ).toEqual([recipients[1]]);
  });

  it("paginates deterministically and clamps out-of-range pages", () => {
    expect(paginateVolunteerFollowUpRecipients(recipients, 2, 2)).toEqual({
      page: 2,
      pageCount: 2,
      first: 3,
      last: 3,
      items: [recipients[2]],
    });
    expect(paginateVolunteerFollowUpRecipients(recipients, 8, 2).page).toBe(2);
  });

  it("never allows a preview form to submit even when its sample fields are valid", () => {
    expect(canSubmitVolunteerFollowUpForm(true, true)).toBe(false);
    expect(canSubmitVolunteerFollowUpForm(false, true)).toBe(true);
  });
});
