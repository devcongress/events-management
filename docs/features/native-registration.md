# Native Event Registration

## Status

Free monthly-meetup vertical slice implemented. Paid December registration is deliberately deferred.

## Overview

Events Management now owns event creation and registration. Creating an event writes the native `community_events` record and provisions one private draft registration campaign. The organizer opens that campaign when it is ready, shares the internal registration link, and manages the guest list without relying on Luma.

The public form asks only for name and email. Confirmed guests check in at the event by either value; there are no QR codes or confirmation codes.

## Organizer Flow

1. Open **Events → Create Event**.
2. Enter the event details, including the actual start/end time and optional Ghana venue Google Maps share link; classify it as monthly, quarterly, special, or **None of these**, optionally add a video conference link for an online or hybrid event, and set the free registration capacity/window.
3. Submit once to create both the event and a draft registration campaign.
4. Open the event’s **Registration** tab. Immediately after event creation, the initial settings can be confirmed as-is; on later visits, **Save settings** remains disabled until a value actually changes.
5. Review the confirmation dialog’s exact setting changes, then save. Change the campaign to **Open** before opening or copying the public form; the copy action confirms with **Copied**, while draft and closed campaigns do not expose either public-link action.
6. On event day, select the guest’s first-name initial to narrow a large list, keep name/email search available for spelling uncertainty, then select **Check in**. Only initials represented in the current guest list are shown. Ordinary registered guests do not carry a redundant “Confirmed” badge; the list calls out only waitlisted, cancelled, or checked-in states. Tablet and desktop guest rows scroll inside a bounded region so the search and letter controls remain visible; phones retain one natural page scroll. Tablets use the event’s full Registration tab; on phones, **Check in guests** opens a dedicated event screen with its own back action, event identity, progress, filters, and guest actions. The other event cards remain behind that screen rather than sharing its scroll.
7. In local development only, select **Preview 64 guests** to replace the visible list with a deterministic mix of fictional confirmed, checked-in, and waitlisted attendees. The preview also works for legacy events that do not have a registration campaign, so organizers can evaluate the high-volume interface before configuring live registration. Simulated check-ins stay in browser memory and leaving the preview restores the live list or its original setup error; no registration, email, capacity, or audit record is written.
8. In local development only, use **Remove test guest** to permanently delete test registrations after confirming the attendee and linked-data cleanup. Production builds hide the action, and the production API rejects the delete route.

New events publish a short same-origin `/r/:eventSlug` URL through the existing `registration_url` compatibility field, so the public meetup API can expose the native action without changing its consumer contract. Existing `/register/:eventId` links remain valid.

## Attendee Flow

- Open `/r/:eventSlug` (or a previously shared `/register/:eventId` link).
- Submit name and email.
- Receive the same neutral on-page acknowledgement whether the address is new or already registered. This prevents the form from revealing attendee membership.
- Receive the authoritative confirmed/waitlist outcome by email when the address can be registered. Registration remains saved if delivery is delayed.
- Check in at the venue with name or email.

The public page presents event details and the form as one continuous registration ticket: desktop uses a vertically centred invitation with a perforated RSVP stub, while phones unfold the same ticket vertically with a horizontal tear line. Mobile event titles use the lighter heading weight, date and location stack for legibility, and the form keeps full-size controls, persistent labels, safe-area padding, and natural scrolling when required. Event summaries remain clamped without truncating the stored description.

## Data Model

| Table | Purpose |
|---|---|
| `event_registration_campaigns` | One private capacity, window, waitlist, auto-confirm, and lifecycle record per event |
| `event_registrations` | Private attendee identity and confirmed/waitlisted/cancelled state |
| `event_registration_checkins` | One organizer check-in per registration |
| `registration_email_deliveries` | Durable pending/accepted/failed confirmation-email queue |

All four tables have RLS enabled and no anonymous table policies. Public writes go through the validated Hono endpoint using the server-only Supabase client. In production, the endpoint requires action/hostname-bound Turnstile verification and applies atomic cross-Worker limits by client and normalized email. Each campaign permits one active registration per normalized email. The `register_for_event` database function locks the campaign row while allocating capacity, preventing concurrent submissions from over-confirming the event. Draft campaigns return the same not-found contract as an unknown registration link so unpublished event details are not exposed; scheduled and closed campaigns reject public submissions on the server.

## Email Delivery

Confirmation email uses the existing server-only `RESEND_API_KEY` integration. `REGISTRATION_EMAIL_FROM` and `REGISTRATION_EMAIL_REPLY_TO` may override the sender; otherwise the registration path uses the existing speaker sender and reply-to values.

The responsive DevCongress email gives the event date, Accra time, and location their own prominent rows. A saved HTTPS Google Maps place/share URL becomes a **View map** action; other or unsafe URL hosts remain plain location text. Confirmed guests receive both a Google Calendar action and a downloadable `.ics` file from `GET /api/registration/events/:eventKey/calendar.ics`. Waitlisted guests retain the event details and waitlist copy without calendar actions that could imply a confirmed place. HTML and plain-text versions are always sent, and every attendee/event field is escaped before HTML rendering.

Timed events use their saved end time in calendar links and files. If a timed event has no valid end, calendar generation uses a three-hour fallback; date-only events are exported as all-day entries and show **Time to be announced** in the email.

If Resend is unavailable or its daily quota is exhausted:

- the attendee record remains saved;
- the public page keeps its neutral acknowledgement and does not disclose delivery or attendee state;
- the outbox remains pending or failed;
- organizers can retry queued delivery from the Registration tab.

Provider acceptance is recorded as `accepted`; it is not proof of inbox delivery.

## Key Files

| File | Purpose |
|---|---|
| `src/views/admin/AdminEventsView.vue` | Sole native event-creation flow |
| `src/views/admin/AdminRegistrationsView.vue` | Campaign controls, large-list guest filtering, check-in, cancellation, development-only simulation/test cleanup, and email retry |
| `src/views/admin/AdminMobileOrganizerView.vue` | Compact event list and links into focused phone operations |
| `src/views/admin/AdminMobileCheckInView.vue` | Dedicated phone event-day name/email and first-letter guest check-in |
| `src/components/ui/RegistrationAlphabetFilter.vue` | Shared 44px first-letter rail for phone, tablet, and desktop check-in |
| `src/lib/registration-checkin.ts` | Shared initial normalization, filtering, and alphabetical ordering |
| `src/lib/registration-simulation.ts` | Development-only dynamic 64-person fixture; excluded from production use |
| `src/components/ui/AppDatePicker.vue` | Themed adaptive date and 24-hour date-time selection |
| `src/components/ui/EventCoverPicker.vue` | Local cover selection, preview, limits, and URL fallback |
| `src/views/EventRegistrationView.vue` | Standalone public name/email form and receipt |
| `lib/email/templates/event-registration-confirmation.ts` | Escaped HTML/text email, safe location actions, Google Calendar link, and `.ics` generation |
| `lib/location-links.ts` | HTTPS Google Maps allowlist shared by event input and attendee-email rendering |
| `lib/event-registration.ts` | Capacity, availability, and summary policy |
| `lib/event-registration-store.ts` | Supabase/local adapter boundary |
| `lib/supabase/event-registrations.ts` | Relational production repository |
| `server/app.ts` | Public and organizer registration API |
| `supabase/migrations/20260728000000_native_event_registrations.sql` | Relational schema and atomic registration function |

## Current Boundaries

- Monthly meetup registration is free.
- Ghana venues currently use organizer-pasted Google Maps share links; provider-backed place autocomplete and country verification remain a separate enhancement.
- Online and hybrid events may store an optional HTTP(S) video conference link in the existing event stream field.
- Paid December 2026 registration, payment-provider webhooks, refunds, and ticket reconciliation are not part of this slice.
- Historical Luma event metadata and uploaded Luma attendance CSVs remain readable; active Luma event preview/import routes are removed.
- Waitlisted guests are visible to organizers, but automatic promotion and promotion email are follow-up work.
