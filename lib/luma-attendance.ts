import type { EventAttendanceSummary, LumaAttendanceApprovalStatus, LumaAttendanceRecord } from '@/types';

const REQUIRED_LUMA_COLUMNS = ['guest_id', 'name', 'email', 'approval_status', 'checked_in_at'];

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(value);
      value = '';
      continue;
    }

    value += character;
  }

  values.push(value);
  return values;
}

function parseCsv(csv: string): Record<string, string>[] {
  const normalized = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const [headerLine, ...lines] = normalized.split('\n').filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(headerLine).map((header) => header.trim());

  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
  });
}

function normalizeStatus(value: string): LumaAttendanceApprovalStatus {
  const status = value.trim().toLowerCase();

  if (status === 'approved' || status === 'pending' || status === 'declined') {
    return status;
  }

  return 'unknown';
}

function optionalValue(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function parseDateValue(value: string | undefined): string | null {
  const trimmed = optionalValue(value);
  if (!trimmed) return null;

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
}

export function parseLumaAttendanceCsv(eventId: string, csv: string): LumaAttendanceRecord[] {
  const rows = parseCsv(csv);
  if (rows.length === 0) return [];

  const columns = new Set(Object.keys(rows[0]));
  const missingColumns = REQUIRED_LUMA_COLUMNS.filter((column) => !columns.has(column));

  if (missingColumns.length > 0) {
    throw new Error(`Missing Luma columns: ${missingColumns.join(', ')}`);
  }

  return rows.map((row, index) => ({
    guest_id: optionalValue(row.guest_id) ?? `row-${index + 1}`,
    event_id: eventId,
    name: optionalValue(row.name) ?? `${optionalValue(row.first_name) ?? 'Guest'} ${optionalValue(row.last_name) ?? ''}`.trim(),
    first_name: optionalValue(row.first_name),
    last_name: optionalValue(row.last_name),
    email: optionalValue(row.email),
    phone_number: optionalValue(row.phone_number),
    registered_at: parseDateValue(row.created_at),
    approval_status: normalizeStatus(row.approval_status ?? ''),
    checked_in_at: parseDateValue(row.checked_in_at),
    utm_source: optionalValue(row.utm_source),
    ticket_type_id: optionalValue(row.ticket_type_id),
    ticket_name: optionalValue(row.ticket_name),
    raw_row: row,
  }));
}

function summarizeBreakdown(records: LumaAttendanceRecord[], getLabel: (record: LumaAttendanceRecord) => string | null): { label: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const record of records) {
    const label = getLabel(record) ?? 'Unspecified';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function summarizeAttendance(records: LumaAttendanceRecord[]): EventAttendanceSummary {
  const approvedRecords = records.filter((record) => record.approval_status === 'approved');
  const checkedInRecords = records.filter((record) => Boolean(record.checked_in_at));
  const approvedCheckedInRecords = approvedRecords.filter((record) => Boolean(record.checked_in_at));
  const approvedNoShows = approvedRecords.filter((record) => !record.checked_in_at);

  return {
    total_registrations: records.length,
    approved_registrations: approvedRecords.length,
    checked_in: checkedInRecords.length,
    approved_checked_in: approvedCheckedInRecords.length,
    approved_no_shows: approvedNoShows.length,
    pending_registrations: records.filter((record) => record.approval_status === 'pending').length,
    declined_registrations: records.filter((record) => record.approval_status === 'declined').length,
    check_in_rate: approvedRecords.length === 0 ? 0 : approvedCheckedInRecords.length / approvedRecords.length,
    registration_to_attendance_gap: Math.max(approvedRecords.length - approvedCheckedInRecords.length, 0),
    source_breakdown: summarizeBreakdown(records, (record) => record.utm_source ?? 'Direct / unknown'),
    ticket_breakdown: summarizeBreakdown(records, (record) => record.ticket_name),
  };
}
