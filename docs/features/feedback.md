# Feedback

## Status

Active.

## Overview

Feedback has two related flows:

- Route-level app feedback from testers.
- Event-scoped post-event feedback forms for attendees.

## User Flows

- Testers open the feedback launcher, enter a name or choose Anonymous, and submit route-aware feedback.
- Organizers create or edit an event feedback campaign.
- If an event has an optional program outline, a fresh default feedback campaign is generated from those schedule rows automatically; events without outlines can still use talks or custom activities.
- Attendees complete the public feedback form after an event.
- Monthly meetup forms close 24 hours after the event ends by default; organizers can close them sooner or reopen them for a fresh 24-hour grace period.
- Public event feedback stores a per-event anonymous browser token so the same browser can submit once per event without requiring name or email.
- Organizers see aggregate response patterns before opening individual submissions: overall rating distribution, return intent, and per-session scores with missed-session context.
- Organizers can search answer text, filter by comments, low ratings, or missed sessions, sort the results, page through 25 responses at a time, and export the current result set as CSV.
- Long response lists scroll inside their own contained inbox instead of extending the whole organizer page, and only the current response page is rendered even when an event has hundreds of submissions.

## Key Files

| File | Purpose |
|---|---|
| `src/components/FeedbackBot.vue` | Route-level app feedback launcher |
| `src/views/FeedbackView.vue` | Public event feedback form |
| `src/views/admin/AdminFeedbackView.vue` | Event feedback campaign builder and response review |
| `src/views/admin/AdminFeedbackOverviewView.vue` | Feedback hub and app feedback inbox |
| `lib/event-feedback-report.ts` | Pure aggregate model for rating, return-intent, comment, and per-session insights |
| `lib/event-feedback-window.ts` | Monthly auto-open/close and explicit reopen-window policy |
| `lib/supabase/feedback-campaigns.ts` | Supabase-backed event feedback campaigns, questions, and submissions |
| `lib/mock-db/feedback.ts` | Local JSON fallback for event feedback persistence |
| `supabase/migrations/20260613000000_event_feedback_campaigns.sql` | Event feedback schema |
| `server/app.ts` | Feedback API routes |

## Configuration

Route-level app feedback uses Supabase helpers when configured. Event feedback campaigns, questions, and submissions use Supabase in deployed environments, with the JSON mock store kept as the local fallback.

Monthly meetup feedback uses the event `end_date` when available, otherwise `event_date`, as its default window anchor. A form with no explicit close time closes 24 hours after that anchor. Reopening writes an explicit new open/close window from now through the following 24 hours, so late responses are possible without leaving the form open indefinitely. Quarterly and special-event timing remains organizer-controlled.

## Event Feedback Response Guard

- Each `/feedback/:eventId` browser gets a random response token saved locally for that event.
- The server stores only a SHA-256 hash of that event-scoped token.
- Duplicate hashes for the same event return a `409` and the public form shows an already-received state.
- This is a soft anonymous guard: it works across normal desktop and mobile browsers, but private browsing, cleared site data, a different browser, or another device can still submit again.

## Testing

Manual checks:

- Submit route-level feedback from a public route.
- Create or edit an event feedback campaign.
- Remove an event feedback form when an event needs a fresh setup.
- Preview and submit the public event form.
- Confirm a monthly form auto-closes 24 hours after the event and can be reopened for another 24 hours.
- Confirm `Close now` immediately removes attendee link and QR access.
- Confirm a long response list scrolls inside the response inbox while its heading and the surrounding page remain stable.
- Load at least 200 fixture responses and confirm the dashboard uses all submissions while the explorer renders 25 rows per page.
- Search answer text, apply each response filter and sort order, move between result pages, and export both the complete and a filtered CSV.
- Confirm rating distribution, return intent, and session bars have accompanying labels and numeric values rather than relying on color alone.
- Reopen the same public event form in the same browser and confirm it shows the already-received state.
- Confirm organizer response counts and response lists update.
