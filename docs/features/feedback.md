# Feedback

## Status

Active.

## Overview

Feedback is event-scoped: organizers prepare post-event forms and review attendee response signals from the Feedback Hub.

## User Flows

- Organizers open the Feedback Hub directly into event reports grouped by year and event period.
- Organizers create or edit an event feedback campaign.
- If an event has an optional program outline, a fresh default feedback campaign is generated from those schedule rows automatically; events without outlines can still use talks or custom activities.
- Attendees complete the public feedback form after an event.
- Monthly meetup forms close 24 hours after the event ends by default; organizers can close them sooner or reopen them for a fresh 24-hour grace period.
- Public event feedback stores a per-event anonymous browser token so the same browser can submit once per event without requiring name or email.
- Organizers see aggregate response patterns in the app: overall rating distribution, return intent, and per-session scores with missed-session context.
- Individual submissions are not rendered in the organizer page. Organizers can download one CSV containing every submission, with one response per row and every configured question represented as a column.

## Key Files

| File | Purpose |
|---|---|
| `src/views/FeedbackView.vue` | Public event feedback form |
| `src/views/admin/AdminFeedbackView.vue` | Event feedback campaign builder and response review |
| `src/views/admin/AdminFeedbackOverviewView.vue` | Event feedback reports grouped by year and event period |
| `lib/event-feedback-export.ts` | Full response-level CSV export and spreadsheet-safety formatting |
| `lib/event-feedback-report.ts` | Pure aggregate model for rating, return-intent, comment, and per-session insights |
| `lib/event-feedback-window.ts` | Monthly auto-open/close and explicit reopen-window policy |
| `lib/supabase/feedback-campaigns.ts` | Supabase-backed event feedback campaigns, questions, and submissions |
| `lib/mock-db/feedback.ts` | Local JSON fallback for event feedback persistence |
| `supabase/migrations/20260613000000_event_feedback_campaigns.sql` | Event feedback schema |
| `server/app.ts` | Feedback API routes |

## Configuration

Event feedback campaigns, questions, and submissions use Supabase in deployed environments, with the JSON mock store kept as the local fallback.

Monthly meetup feedback uses the event `end_date` when available, otherwise `event_date`, as its default window anchor. A form with no explicit close time closes 24 hours after that anchor. Reopening writes an explicit new open/close window from now through the following 24 hours, so late responses are possible without leaving the form open indefinitely. Quarterly and special-event timing remains organizer-controlled.

## Event Feedback Response Guard

- Each `/feedback/:eventId` browser gets a random response token saved locally for that event.
- The server stores only a SHA-256 hash of that event-scoped token.
- Duplicate hashes for the same event return a `409` and the public form shows an already-received state.
- This is a soft anonymous guard: it works across normal desktop and mobile browsers, but private browsing, cleared site data, a different browser, or another device can still submit again.

## Testing

Manual checks:

- Open the Feedback Hub and confirm it goes directly to event reports without a website-feedback choice.
- Create or edit an event feedback campaign.
- Remove an event feedback form when an event needs a fresh setup.
- Preview and submit the public event form.
- Confirm a monthly form auto-closes 24 hours after the event and can be reopened for another 24 hours.
- Confirm `Close now` immediately removes attendee link and QR access.
- Load at least 200 fixture responses and confirm the dashboard uses all submissions without rendering an individual-response inbox.
- Download responses and confirm the CSV contains every submission, one response per row, plus a column for every configured question.
- Confirm rating distribution, return intent, and session bars have accompanying labels and numeric values rather than relying on color alone.
- Reopen the same public event form in the same browser and confirm it shows the already-received state.
- Confirm organizer response counts and aggregate reports update.
