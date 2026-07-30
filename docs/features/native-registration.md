# Native Event Registration

## Status

Free monthly-meetup vertical slice implemented. Paid December registration is deliberately deferred.

## Overview

Events Management now owns event creation and registration. Creating an event writes the native `community_events` record and provisions one private draft registration campaign. The organizer opens that campaign when it is ready, shares the internal registration link, and manages the guest list without relying on Luma.

The public form asks only for name and email. Confirmed guests check in at the event by either value; there are no QR codes or confirmation codes.

Historical events without a native campaign remain readable but are explicitly labelled as not managed internally. Their Registration tab never invents a guest list; imported historical records remain in Attendance when available.

## Organizer Flow

1. Open **Events → Create Event**.
2. Enter the event details, including the actual start/end time and optional Ghana venue Google Maps share link; classify it as monthly, quarterly, special, or **None of these**, optionally add a video conference link for an online or hybrid event, and set the free registration capacity/window.
3. Submit once to create both the event and a draft registration campaign.
4. Open the event’s **Registration** tab. Its quiet internal workspace navigation is limited to **Summary**, **Guests**, **Form & capacity**, and **Emails**.
5. Use **Summary** for one lifecycle-aware registration story: before the event it pairs confirmed registrations, capacity progress, and places left; during the event it becomes check-in progress and guests still to arrive; after the event it becomes final attendance and no-shows. The empty open-campaign state offers one **Copy registration link** action, while waitlist and cancellation details appear only when they exist.
6. Use **Form & Capacity** to confirm the initial draft or change campaign status, capacity, and registration window. Change the campaign to **Open** before opening or copying the public form. Places are immediate until capacity is reached; overflow joins the waitlist automatically, so there is no pending approval or organizer-facing auto-confirm/waitlist toggle.
7. On event day, use **Guests** to combine status, first-letter, and name/email filters, then select **Check in**. Ordinary registered guests do not carry a redundant “Confirmed” badge; the list calls out only waitlisted, cancelled, checked-in, or post-event no-show states. Tablet and desktop guest rows scroll inside a bounded region so the controls remain visible; phones retain one natural page scroll. Tablets use the event’s full Registration tab; on phones, **Check in guests** opens a dedicated event screen with its own back action, event identity, progress, filters, and guest actions.
8. Use **Emails** only for transactional registration receipt, waitlist, and promotion delivery state plus failed-delivery retries. Cancelling a confirmed registration gives the oldest waitlisted guest the open place and queues their promotion notice atomically. The workspace contains no broadcast, bulk-message, export, or marketing action.
9. For an older event with no native campaign, the tab explains that registration was not managed in this app. It does not expose campaign controls, guest actions, or made-up attendee data. Use Attendance for any historical CSV import.
10. In local development only, use **Remove test guest** to permanently delete real test registrations after confirming the attendee and linked-data cleanup. Production builds hide the action, and the production API rejects the delete route.

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
| `event_registration_campaigns` | One private capacity, window, automatic overflow, and lifecycle record per event; legacy auto-confirm/waitlist columns remain internal policy fields |
| `event_registrations` | Private attendee identity and confirmed/waitlisted/cancelled state |
| `event_registration_checkins` | One organizer check-in per registration |
| `registration_email_deliveries` | Durable pending/accepted/failed receipt, waitlist, and promotion-notice queue |

All four tables have RLS enabled and no anonymous table policies. Public writes go through the validated Hono endpoint using the server-only Supabase client. In production, the endpoint requires action/hostname-bound Turnstile verification and applies atomic cross-Worker limits by client and normalized email. Each campaign permits one active registration per normalized email. The `register_for_event` database function locks the campaign row while allocating capacity, preventing concurrent submissions from over-confirming the event. The service-role-only `cancel_registration_and_promote` function takes the same campaign lock, cancels the selected guest, promotes only the oldest waitlisted guest when a confirmed place opens, and queues the promotion notice in the same transaction. Draft campaigns return the same not-found contract as an unknown registration link so unpublished event details are not exposed; scheduled and closed campaigns reject public submissions on the server.

## Email Delivery

Confirmation email uses the existing server-only `RESEND_API_KEY` integration. `REGISTRATION_EMAIL_FROM` and `REGISTRATION_EMAIL_REPLY_TO` may override the sender; otherwise the registration path uses the existing speaker sender and reply-to values.

The responsive DevCongress email gives the event date, Accra time, and location their own prominent rows. A saved HTTPS Google Maps place/share URL becomes a **View map** action; other or unsafe URL hosts remain plain location text. Confirmed and newly promoted guests receive both a Google Calendar action and a downloadable `.ics` file from `GET /api/registration/events/:eventKey/calendar.ics`. Waitlisted guests retain the event details and waitlist copy without calendar actions that could imply a confirmed place. Promotion notices explicitly state that the guest is off the waitlist. HTML and plain-text versions are always sent, and every attendee/event field is escaped before HTML rendering.

Timed events use their saved end time in calendar links and files. If a timed event has no valid end, calendar generation uses a three-hour fallback; date-only events are exported as all-day entries and show **Time to be announced** in the email.

If Resend is unavailable or its daily quota is exhausted:

- the attendee record remains saved;
- the public page keeps its neutral acknowledgement and does not disclose delivery or attendee state;
- the outbox remains pending or failed;
- organizers can retry failed delivery from the **Emails** workspace.

Provider acceptance is recorded as `accepted`; it is not proof of inbox delivery.

## Key Files

| File | Purpose |
|---|---|
| `src/views/admin/AdminEventsView.vue` | Sole native event-creation flow |
| `src/views/admin/AdminRegistrationsView.vue` | Four-part registration workspace, honest historical-registration state, campaign controls, guest actions, and transactional delivery status |
| `src/views/admin/AdminMobileOrganizerView.vue` | Compact event list and links into focused phone operations |
| `src/views/admin/AdminMobileCheckInView.vue` | Dedicated phone event-day name/email and first-letter guest check-in |
| `src/components/ui/RegistrationAlphabetFilter.vue` | Shared 44px first-letter rail for phone, tablet, and desktop check-in |
| `src/lib/registration-checkin.ts` | Shared initial normalization, filtering, and alphabetical ordering |
| `src/lib/registration-workspace.ts` | Derived capacity, contextual waitlist/no-show, guest-status, and email-delivery presentation policy |
| `src/components/ui/AppDatePicker.vue` | Themed adaptive date and 24-hour date-time selection |
| `src/components/ui/EventCoverPicker.vue` | Local cover selection, preview, limits, and URL fallback |
| `src/views/EventRegistrationView.vue` | Standalone public name/email form and receipt |
| `lib/email/templates/event-registration-confirmation.ts` | Escaped HTML/text receipt, waitlist, and promotion notices with safe location actions, Google Calendar link, and `.ics` generation |
| `lib/location-links.ts` | HTTPS Google Maps allowlist shared by event input and attendee-email rendering |
| `lib/event-registration.ts` | Capacity, availability, and summary policy |
| `lib/event-registration-store.ts` | Supabase/local adapter boundary |
| `lib/supabase/event-registrations.ts` | Relational production repository |
| `server/app.ts` | Public and organizer registration API |
| `supabase/migrations/20260728000000_native_event_registrations.sql` | Relational schema and atomic registration function |
| `supabase/migrations/20260729010000_registration_waitlist_promotion.sql` | Fixed automatic-allocation policy plus atomic cancellation, oldest-first promotion, and durable promotion delivery |

## Current Boundaries

- Monthly meetup registration is free.
- Ghana venues currently use organizer-pasted Google Maps share links; provider-backed place autocomplete and country verification remain a separate enhancement.
- Online and hybrid events may store an optional HTTP(S) video conference link in the existing event stream field.
- Paid December 2026 registration, payment-provider webhooks, refunds, and ticket reconciliation are not part of this slice.
- Historical Luma event metadata and uploaded Luma attendance CSVs remain readable; active Luma event preview/import routes are removed.
- Cancelling a confirmed guest automatically promotes the oldest waitlisted registration; cancelling a waitlisted guest does not move anyone else.
- Registration exports, broadcasts, marketing analytics, and bulk messaging are out of scope.
