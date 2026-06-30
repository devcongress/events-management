import type { Event } from '@/types';
import { resolveEventStatus } from '@/lib/event-status';

export interface AttendanceUploadWindow {
  available: boolean;
  reason: string | null;
  unlocks_at: string | null;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function attendanceMonthForDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return monthKey(date);
}

export function lastSaturdayOfMonth(date: Date): Date {
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const daysSinceSaturday = (lastDay.getUTCDay() - 6 + 7) % 7;
  lastDay.setUTCDate(lastDay.getUTCDate() - daysSinceSaturday);
  lastDay.setUTCHours(0, 0, 0, 0);
  return lastDay;
}

export function attendanceUploadWindowForMonth(attendanceMonth: string, now = new Date()): AttendanceUploadWindow {
  const currentMonth = monthKey(now);
  const nextMonth = monthKey(addMonths(now, 1));
  const unlockDate = lastSaturdayOfMonth(now);

  if (attendanceMonth < currentMonth) {
    return { available: true, reason: null, unlocks_at: null };
  }

  if (attendanceMonth === currentMonth) {
    return {
      available: false,
      reason: 'Attendance CSV upload is not open for the current meetup month.',
      unlocks_at: null,
    };
  }

  if (attendanceMonth === nextMonth) {
    if (now.getTime() >= unlockDate.getTime()) {
      return { available: true, reason: null, unlocks_at: unlockDate.toISOString() };
    }

    return {
      available: false,
      reason: 'Next month attendance CSV upload opens on the last Saturday of this month.',
      unlocks_at: unlockDate.toISOString(),
    };
  }

  return {
    available: false,
    reason: 'Attendance CSV upload is only open for past meetup months or next month after this month’s last Saturday.',
    unlocks_at: unlockDate.toISOString(),
  };
}

export function attendanceUploadWindowForEvent(event: Pick<Event, 'event_date' | 'end_date' | 'status'>, now = new Date()): AttendanceUploadWindow {
  if (resolveEventStatus(event, now.getTime()) === 'completed') {
    return { available: true, reason: null, unlocks_at: null };
  }

  return {
    available: false,
    reason: 'Attendance CSV upload opens after this event ends.',
    unlocks_at: event.end_date ?? null,
  };
}
