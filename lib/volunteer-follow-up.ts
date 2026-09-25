export const VOLUNTEER_FOLLOW_UP_YEAR = 2026;
export const VOLUNTEER_FOLLOW_UP_DAILY_MAX = 54;

export function volunteerFollowUpQuotaIsComplete(
  usage: { dailyUsed: number | null; monthlyUsed: number | null } | null,
): usage is { dailyUsed: number; monthlyUsed: number } {
  return (
    usage !== null &&
    typeof usage.dailyUsed === "number" &&
    Number.isFinite(usage.dailyUsed) &&
    usage.dailyUsed >= 0 &&
    typeof usage.monthlyUsed === "number" &&
    Number.isFinite(usage.monthlyUsed) &&
    usage.monthlyUsed >= 0
  );
}

export function canEditVolunteerFollowUpDeadline(
  status: "draft" | "running" | "paused" | "closed",
): boolean {
  return status === "draft";
}

export function volunteerFollowUpApplicationIsEligible(
  createdAt: string,
  deadline: string | null,
): boolean {
  return (
    !deadline || new Date(createdAt).getTime() <= new Date(deadline).getTime()
  );
}

export const VOLUNTEER_FOLLOW_UP_WORD_LIMIT = 120;
export const VOLUNTEER_FOLLOW_UP_RESPONSE_DAYS = 14;

export function canSubmitVolunteerFollowUpForm(
  previewMode: boolean,
  fieldsAreValid: boolean,
): boolean {
  return !previewMode && fieldsAreValid;
}

export function volunteerFollowUpResponseDeadline(
  applicationDeadline: string | null,
): string | null {
  if (!applicationDeadline) return null;

  const deadline = new Date(applicationDeadline).getTime();

  return Number.isFinite(deadline)
    ? new Date(
        deadline + VOLUNTEER_FOLLOW_UP_RESPONSE_DAYS * 86_400_000,
      ).toISOString()
    : null;
}

export function volunteerFollowUpWordCount(value: string): number {
  const words = value.trim().match(/\S+/gu);

  return words?.length ?? 0;
}

export function volunteerFollowUpApplicationDeadline(
  date: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;

  const timestamp = new Date(`${date}T23:59:59.999Z`);

  return Number.isFinite(timestamp.getTime()) &&
    timestamp.toISOString().startsWith(date)
    ? timestamp.toISOString()
    : null;
}
