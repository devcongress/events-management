import { parseLumaAttendanceCsv, summarizeAttendance } from '@/lib/luma-attendance';
import { attendanceUploadWindowForMonth } from '@/lib/attendance-upload-window';
import { generateId, now } from '@/lib/utils';
import type { AttendanceBreakdownItem, AttendanceLedgerMonth, AttendanceLedgerMonthEvent, AttendanceMonthlyInsights, AttendanceSourceInsight, Event, EventAttendanceImport, EventAttendanceSummary, LumaAttendanceRecord } from '@/types';
import { readData, writeData } from './index';

const FILE = 'event-attendance-imports';

export async function getAttendanceImports(): Promise<EventAttendanceImport[]> {
  return readData<EventAttendanceImport>(FILE);
}

export async function getLatestAttendanceImport(eventId: string): Promise<EventAttendanceImport | null> {
  const imports = await getAttendanceImports();

  return imports
    .filter((attendanceImport) => attendanceImport.event_id === eventId)
    .sort((a, b) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime())[0] ?? null;
}

export async function replaceAttendanceImportFromCsv(
  eventId: string,
  csv: string,
  sourceFilename: string | null,
  attendanceMonth?: string,
): Promise<EventAttendanceImport> {
  const imports = await getAttendanceImports();
  const records = parseLumaAttendanceCsv(eventId, csv);
  const attendanceImport: EventAttendanceImport = {
    id: generateId(),
    event_id: eventId,
    attendance_month: attendanceMonth,
    source_filename: sourceFilename,
    row_count: records.length,
    imported_at: now(),
    records,
  };

  await writeData(FILE, [
    ...imports.filter((existingImport) => existingImport.event_id !== eventId),
    attendanceImport,
  ]);

  return attendanceImport;
}

export async function removeAttendanceImport(eventId: string): Promise<void> {
  const imports = await getAttendanceImports();
  await writeData(FILE, imports.filter((attendanceImport) => attendanceImport.event_id !== eventId));
}

export function buildAttendanceSummary(attendanceImport: EventAttendanceImport | null): EventAttendanceSummary {
  return summarizeAttendance(attendanceImport?.records ?? []);
}

export function attendanceMonthForEvent(event: Pick<Event, 'event_date'>): string {
  return new Date(event.event_date).toISOString().slice(0, 7);
}

export function attendanceMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function isMonthlyMeetupEvent(event: Event): boolean {
  return !event.name.toLowerCase().includes('quarterly');
}

function monthRange(startMonth: string, endMonth: string): string[] {
  const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number);
  const cursor = new Date(Date.UTC(startYear, startMonthNumber - 1, 1));
  const limit = new Date(Date.UTC(endYear, endMonthNumber - 1, 1));
  const months: string[] = [];

  while (cursor.getTime() <= limit.getTime()) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function mergeBreakdowns(items: AttendanceBreakdownItem[][]): AttendanceBreakdownItem[] {
  const counts = new Map<string, number>();

  for (const breakdown of items) {
    for (const item of breakdown) {
      counts.set(item.label, (counts.get(item.label) ?? 0) + item.count);
    }
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function combineAttendanceSummaries(summaries: EventAttendanceSummary[]): EventAttendanceSummary {
  const total_registrations = summaries.reduce((total, summary) => total + summary.total_registrations, 0);
  const approved_registrations = summaries.reduce((total, summary) => total + summary.approved_registrations, 0);
  const checked_in = summaries.reduce((total, summary) => total + summary.checked_in, 0);
  const approved_checked_in = summaries.reduce((total, summary) => total + summary.approved_checked_in, 0);
  const approved_no_shows = summaries.reduce((total, summary) => total + summary.approved_no_shows, 0);
  const pending_registrations = summaries.reduce((total, summary) => total + summary.pending_registrations, 0);
  const declined_registrations = summaries.reduce((total, summary) => total + summary.declined_registrations, 0);

  return {
    total_registrations,
    approved_registrations,
    checked_in,
    approved_checked_in,
    approved_no_shows,
    pending_registrations,
    declined_registrations,
    check_in_rate: approved_registrations === 0 ? 0 : approved_checked_in / approved_registrations,
    registration_to_attendance_gap: approved_registrations - approved_checked_in,
    source_breakdown: mergeBreakdowns(summaries.map((summary) => summary.source_breakdown)),
    ticket_breakdown: mergeBreakdowns(summaries.map((summary) => summary.ticket_breakdown)),
  };
}

function latestImportByEvent(imports: EventAttendanceImport[]): Map<string, EventAttendanceImport> {
  const map = new Map<string, EventAttendanceImport>();

  for (const attendanceImport of imports) {
    const existing = map.get(attendanceImport.event_id);
    if (!existing || new Date(attendanceImport.imported_at).getTime() > new Date(existing.imported_at).getTime()) {
      map.set(attendanceImport.event_id, attendanceImport);
    }
  }

  return map;
}

export function buildAttendanceLedger(events: Event[], imports: EventAttendanceImport[]): AttendanceLedgerMonth[] {
  const monthlyEvents = events.filter(isMonthlyMeetupEvent);
  const monthlyEventIds = new Set(monthlyEvents.map((event) => event.id));
  const monthlyImports = imports.filter((attendanceImport) => monthlyEventIds.has(attendanceImport.event_id));
  const importsByEvent = latestImportByEvent(monthlyImports);
  const eventRows: AttendanceLedgerMonthEvent[] = [...monthlyEvents]
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
    .map((event) => {
      const attendanceImport = importsByEvent.get(event.id) ?? null;
      const attendanceMonth = attendanceImport?.attendance_month ?? attendanceMonthForEvent(event);
      const uploadWindow = attendanceUploadWindowForMonth(attendanceMonth);

      return {
        event,
        import: attendanceImport,
        summary: buildAttendanceSummary(attendanceImport),
        upload_status: attendanceImport ? 'uploaded' : 'missing',
        upload_available: uploadWindow.available,
        upload_unavailable_reason: uploadWindow.reason,
        upload_unlocks_at: uploadWindow.unlocks_at,
      };
    });
  const monthKeys = new Set<string>();

  for (const event of monthlyEvents) {
    monthKeys.add(attendanceMonthForEvent(event));
  }
  for (const attendanceImport of monthlyImports) {
    if (attendanceImport.attendance_month) {
      monthKeys.add(attendanceImport.attendance_month);
    }
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const earliestMonth = Array.from(monthKeys).sort()[0] ?? currentMonth;
  const months = monthRange(earliestMonth, currentMonth);

  return months
    .map((month) => {
      const monthEvents = eventRows.filter((item) => (item.import?.attendance_month ?? attendanceMonthForEvent(item.event)) === month);
      const monthSummary = combineAttendanceSummaries(monthEvents.map((item) => item.summary));
      const completedEventCount = monthEvents.filter((item) => item.event.status === 'completed').length;
      const uploadedEventCount = monthEvents.filter((item) => item.import).length;
      const uploadAvailableRow = monthEvents.find((item) => !item.import && item.upload_available) ?? null;
      const lockedRow = monthEvents.find((item) => !item.import && !item.upload_available) ?? null;

      return {
        attendance_month: month,
        month_label: attendanceMonthLabel(month),
        events: monthEvents,
        event_count: monthEvents.length,
        uploaded_event_count: uploadedEventCount,
        completed_event_count: completedEventCount,
        has_import: uploadedEventCount > 0,
        upload_status: uploadedEventCount > 0 ? 'uploaded' : 'missing',
        upload_available: Boolean(uploadAvailableRow),
        upload_unavailable_reason: uploadAvailableRow ? null : lockedRow?.upload_unavailable_reason ?? null,
        upload_unlocks_at: uploadAvailableRow?.upload_unlocks_at ?? lockedRow?.upload_unlocks_at ?? null,
        summary: monthSummary,
      } satisfies AttendanceLedgerMonth;
    })
    .sort((a, b) => b.attendance_month.localeCompare(a.attendance_month));
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function sourceQuality(records: LumaAttendanceRecord[]): AttendanceSourceInsight[] {
  const sources = new Map<string, { registrations: number; checked_in: number }>();

  for (const record of records) {
    const label = record.utm_source ?? 'Direct / unknown';
    const source = sources.get(label) ?? { registrations: 0, checked_in: 0 };
    source.registrations += 1;
    if (record.checked_in_at) source.checked_in += 1;
    sources.set(label, source);
  }

  return Array.from(sources.entries())
    .map(([label, source]) => ({
      label,
      registrations: source.registrations,
      checked_in: source.checked_in,
      check_in_rate: source.registrations === 0 ? 0 : source.checked_in / source.registrations,
    }))
    .sort((a, b) => b.checked_in - a.checked_in || b.check_in_rate - a.check_in_rate || a.label.localeCompare(b.label));
}

export function buildAttendanceInsights(ledger: AttendanceLedgerMonth[]): AttendanceMonthlyInsights {
  const imported = ledger.filter((item) => item.has_import);
  const checkedInCounts = imported.map((item) => item.summary.checked_in);
  const allRecords = imported.flatMap((item) => item.events.flatMap((event) => event.import?.records ?? []));
  const attendeeEmails = allRecords
    .map((record) => record.email?.toLowerCase().trim())
    .filter((email): email is string => Boolean(email));
  const emailCounts = attendeeEmails.reduce((counts, email) => {
    counts.set(email, (counts.get(email) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const averageCheckInRate = imported.length === 0
    ? 0
    : imported.reduce((total, item) => total + item.summary.check_in_rate, 0) / imported.length;

  const sortedByRate = imported
    .filter((item) => item.summary.approved_registrations > 0)
    .sort((a, b) => b.summary.check_in_rate - a.summary.check_in_rate);

  return {
    total_months: ledger.length,
    imported_months: imported.length,
    missing_completed_months: ledger.filter((item) => item.completed_event_count > 0 && !item.has_import).length,
    total_registrations: imported.reduce((total, item) => total + item.summary.total_registrations, 0),
    total_checked_in: imported.reduce((total, item) => total + item.summary.checked_in, 0),
    total_no_shows: imported.reduce((total, item) => total + item.summary.approved_no_shows, 0),
    average_check_in_rate: averageCheckInRate,
    median_checked_in: percentile(checkedInCounts, 50),
    p80_checked_in: percentile(checkedInCounts, 80),
    repeat_attendees: Array.from(emailCounts.values()).filter((count) => count > 1).length,
    unique_attendees: emailCounts.size,
    source_quality: sourceQuality(allRecords),
    best_month: sortedByRate[0] ?? null,
    weakest_month: sortedByRate[sortedByRate.length - 1] ?? null,
  };
}
