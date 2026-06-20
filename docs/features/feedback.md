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
- Public event feedback stores a per-event anonymous browser token so the same browser can submit once per event without requiring name or email.
- Organizers review responses in the event Feedback page or global Feedback Hub.

## Key Files

| File | Purpose |
|---|---|
| `src/components/FeedbackBot.vue` | Route-level app feedback launcher |
| `src/views/FeedbackView.vue` | Public event feedback form |
| `src/views/admin/AdminFeedbackView.vue` | Event feedback campaign builder and response review |
| `src/views/admin/AdminFeedbackOverviewView.vue` | Feedback hub and app feedback inbox |
| `lib/mock-db/feedback.ts` | JSON-backed event feedback persistence |
| `supabase/migrations/20260613000000_event_feedback_campaigns.sql` | Event feedback schema |
| `server/app.ts` | Feedback API routes |

## Configuration

Route-level app feedback uses Supabase helpers when configured. Event feedback currently has JSON persistence plus Supabase schema work for migration.

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
- Reopen the same public event form in the same browser and confirm it shows the already-received state.
- Confirm organizer response counts and response lists update.
