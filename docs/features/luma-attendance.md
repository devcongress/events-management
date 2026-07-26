# Luma Attendance

## Status

Active.

## Overview

Luma Attendance helps organizers import a post-event Luma guest CSV and understand turnout. It is meant for venue planning, no-show follow-up, and month-by-month attendance visibility.

Luma Event Import lets organizers create the event on Luma first, then pull the event shell into DevCon-Comm from the organizer create-event page. This is import-only: DevCon-Comm does not create, edit, or cancel Luma events.

## User Flows

- Organizer opens an event Attendance page.
- Organizer uploads or replaces the Luma CSV export.
- The app parses approved registrations, check-ins, no-shows, source, and ticket information.
- Organizer reviews event-level readouts and the global monthly Attendance Hub.
- Organizer opens the create-event page.
- Organizer clicks Import from Luma, pastes a public Luma event URL, and imports its title, description, dates, location, cover URL, and registration URL into `community_events`.

## Event Import

- Uses the public Luma event page, so Luma Plus and API keys are not required.
- Requires Supabase-backed `community_events`; imports do not write to the local JSON event fallback.
- Imported rows store `external_source = 'luma'`, the Luma event id, Luma event URL, and the import timestamp when the Luma metadata migration has been applied.
- Existing imports are detected by source/id when available, with a registration URL fallback for databases that have not applied the metadata migration yet.
- Luma stays the source of truth for registration. DevCon-Comm owns the website publishing row, organizer checklist, talks, feedback, media, and attendance readouts.
- Only public `https://luma.com/...` or `https://lu.ma/...` event URLs are fetched server-side.
- When Luma rate-limits the server-side fetch, organizers see a specific temporary-limit message and the API preserves the upstream condition as HTTP 429.

Manual sync can be added later as a separate action. Start with import-only so Luma updates cannot accidentally overwrite organizer work in DevCon-Comm.

## Key Files

| File | Purpose |
|---|---|
| `src/views/admin/AdminAttendanceView.vue` | Event-level attendance import and readout |
| `src/views/admin/AdminAttendanceOverviewView.vue` | Monthly attendance ledger |
| `src/views/admin/AdminEventsView.vue` | Create-event flow and read-only Luma event import |
| `lib/luma/events.ts` | Server-only public Luma page importer and event field mapper |
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
