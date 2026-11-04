export const CONFERENCE_CHECK_IN_UNAVAILABLE = 'Check-in opens at midnight Accra time on the conference date.';

export function isAnnualConferenceCheckInOpen(date: string | null | undefined, now = new Date()): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(now.getTime())) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Accra', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;

  return today >= date;
}

export function annualConferenceCheckInNotice(date: string | null | undefined): string {
  const parsed = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;

  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return 'Check-in is unavailable until a valid conference date is set.';
  }

  const formatted = new Intl.DateTimeFormat('en-GH', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra',
  }).format(parsed);

  return `Check-in opens at midnight Accra time on ${formatted}.`;
}
