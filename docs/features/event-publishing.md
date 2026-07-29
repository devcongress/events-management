# Event Publishing

## Status

Active.

## Overview

Event publishing lets organizers create meetup records in the app and expose published events through the public community UI and read-only meetup API.

## User Flows

- Organizer creates or edits an event in the organizer console.
- Organizer adds public-facing fields such as location, cover image, external RSVP link, and summary.
- Organizer marks the event publishable.
- Organizer selects **Preview Website Events** to inspect the published collection, then opens a card to inspect the consumer-shaped event detail.
- External sites can consume published events through `/api/public/meetups*`.

## Key Files

| File | Purpose |
|---|---|
| `src/views/admin/AdminEventsView.vue` | Organizer event list and creation flow |
| `src/views/admin/AdminEventView.vue` | Event overview and checklist |
| `src/views/EventsView.vue` | Authenticated public-consumer collection preview |
| `src/views/EventView.vue` | Authenticated public-consumer event-detail preview |
| `src/components/PublicEventPreviewBar.vue` | Preview context, exact endpoint, JSON inspection, and return action |
| `server/app.ts` | Event and public meetup API routes |
| `lib/supabase/community-events.ts` | Supabase community-event repository |
| `lib/supabase/media.ts` | Supabase Storage helpers for event media |
| `supabase/migrations/20260615000000_community_events.sql` | Community events schema |
| `docs/public-meetups-api.md` | Website integration contract |

## Configuration

Supabase community events are used when `APP_DATA_SOURCE=supabase` is set with Supabase credentials. JSON event data is the local/dev default.

## Testing

```bash
pnpm typecheck
pnpm build
pnpm verify:public-api
```

Manual checks:

- Create or edit an organizer event.
- Confirm unpublished drafts do not appear in the website preview or `/api/public/meetups`.
- Confirm published events appear in `/organizer-console/website-preview/events` and `/api/public/meetups`.
- Open a preview card and confirm its detail content matches `/api/public/meetups/:slug`.
