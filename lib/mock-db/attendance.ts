import { parseLumaAttendanceCsv, summarizeAttendance } from '@/lib/luma-attendance';
import { attendanceUploadWindowForMonth } from '@/lib/attendance-upload-window';
import { generateId, now } from '@/lib/utils';
import type { AttendanceLedgerEvent, AttendanceMonthlyInsights, AttendanceSourceInsight, Event, EventAttendanceImport, EventAttendanceSummary, LumaAttendanceRecord } from '@/types';
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

export function buildAttendanceLedger(events: Event[], imports: EventAttendanceImport[]): AttendanceLedgerEvent[] {
  const importsByEvent = latestImportByEvent(imports);

  return [...events]
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
    .map((event) => {
      const attendanceImport = importsByEvent.get(event.id) ?? null;
      const attendanceMonth = attendanceImport?.attendance_month ?? attendanceMonthForEvent(event);
      const uploadWindow = attendanceUploadWindowForMonth(attendanceMonth);

      return {
        event,
        attendance_month: attendanceMonth,
        month_label: attendanceMonthLabel(attendanceMonth),
        import: attendanceImport,
        summary: buildAttendanceSummary(attendanceImport),
        upload_status: attendanceImport ? 'uploaded' : 'missing',
        upload_available: uploadWindow.available,
        upload_unavailable_reason: uploadWindow.reason,
        upload_unlocks_at: uploadWindow.unlocks_at,
      };
    });
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

export function buildAttendanceInsights(ledger: AttendanceLedgerEvent[]): AttendanceMonthlyInsights {
  const imported = ledger.filter((item) => item.import);
  const checkedInCounts = imported.map((item) => item.summary.checked_in);
  const allRecords = imported.flatMap((item) => item.import?.records ?? []);
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
    missing_completed_months: ledger.filter((item) => item.event.status === 'completed' && !item.import).length,
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
