export type ClockTime = { hour: number; minute: number; period: 'AM' | 'PM' };
export type ProgrammeTimeRange = { start: ClockTime; end: ClockTime | null };

const clockPattern = '(1[0-2]|[1-9]):([0-5][0-9])\\s*(AM|PM)?';
const rangePattern = new RegExp(`^${clockPattern}(?:\\s*[–—-]\\s*${clockPattern})?$`, 'i');

export function clockMinutes(time: ClockTime): number {
  return (time.hour % 12 + (time.period === 'PM' ? 12 : 0)) * 60 + time.minute;
}

export function parseProgrammeTime(value: string): ProgrammeTimeRange | null {
  const match = rangePattern.exec(value.trim());

  if (!match) return null;
  const [, startHour, startMinute, startPeriod, endHour, endMinute, endPeriod] = match;

  if (!startPeriod && !endPeriod) return null;
  const start: ClockTime = { hour: Number(startHour), minute: Number(startMinute), period: (startPeriod || endPeriod).toUpperCase() as 'AM' | 'PM' };

  if (!endHour) return { start, end: null };
  const end: ClockTime = { hour: Number(endHour), minute: Number(endMinute), period: (endPeriod || startPeriod).toUpperCase() as 'AM' | 'PM' };

  if (!startPeriod && clockMinutes(start) > clockMinutes(end)) start.period = end.period === 'PM' ? 'AM' : 'PM';
  if (!endPeriod && clockMinutes(end) < clockMinutes(start)) end.period = start.period === 'AM' ? 'PM' : 'AM';

  return { start, end };
}

export function formatProgrammeTime(range: ProgrammeTimeRange): string {
  const part = (time: ClockTime) => `${time.hour}:${String(time.minute).padStart(2, '0')} ${time.period}`;

  if (!range.end) return part(range.start);
  if (range.start.period === range.end.period) {
    return `${range.start.hour}:${String(range.start.minute).padStart(2, '0')}–${part(range.end)}`;
  }

  return `${part(range.start)}–${part(range.end)}`;
}

export function clockFromMinutes(value: number): ClockTime {
  const normalized = value % 1440;
  const hour = Math.floor(normalized / 60);

  return { hour: hour % 12 || 12, minute: normalized % 60, period: hour < 12 ? 'AM' : 'PM' };
}

export function programmeDuration(range: ProgrammeTimeRange): number | null {
  if (!range.end) return null;
  const end = clockMinutes(range.end);
  const start = clockMinutes(range.start);
  const duration = end === 0 && start > 0 ? 1440 - start : end - start;

  return duration > 0 ? duration : null;
}
