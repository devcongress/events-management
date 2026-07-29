# Luma Attendance

## Status

Legacy attendance compatibility only. Active event creation and registration moved to [Native Event Registration](native-registration.md).

## Overview

Luma Attendance preserves historical post-event CSV imports and readouts for venue planning, no-show analysis, and month-by-month attendance visibility.

Active Luma event preview/import was removed because Luma blocks the Cloudflare Worker extraction path. Native creation is now the only event-creation path. Existing event rows may retain their historical `external_source`, `external_url`, and Luma registration URL so archive records remain readable.

## User Flows

- Organizer opens an event Attendance page.
- Organizer uploads or replaces the Luma CSV export.
- The app parses approved registrations, check-ins, no-shows, source, and ticket information.
- Organizer reviews event-level readouts and the global monthly Attendance Hub.

## Key Files

| File | Purpose |
|---|---|
| `src/views/admin/AdminAttendanceView.vue` | Event-level attendance import and readout |
| `src/views/admin/AdminAttendanceOverviewView.vue` | Monthly attendance ledger |
| `lib/luma-attendance.ts` | CSV parsing and attendance summary logic |
| `lib/mock-db/attendance.ts` | JSON-backed attendance import persistence |
| `server/app.ts` | Attendance API routes |

## Input Policy

- Import one current Luma CSV per event.
- Keep upload size small; current app policy targets lightweight CSV exports.
- Do not upload private data that is not needed for attendance analysis.

## Testing

Manual checks:

- Upload a valid Luma CSV.
- Replace the CSV and verify metrics update.
- Remove the CSV and verify the empty state returns.
- Check the monthly Attendance Hub after event-level changes.
