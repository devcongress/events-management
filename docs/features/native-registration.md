# Native Event Registration

## Status

Free monthly-meetup vertical slice implemented. Paid December registration is deliberately deferred.

## Overview

Events Management now owns event creation and registration. Creating an event writes the native `community_events` record, publishes it into the upcoming lifecycle, and provisions one open registration campaign. Registration is available immediately unless the organizer supplies a future opening time during event creation. The organizer shares the internal registration link and manages the guest list without relying on Luma.

The public form asks only for name and email. Confirmed guests check in at the event by either value. A protected organizer display can show a QR code that opens the same public registration form for walk-in guests; the QR code is an entry point, not an attendee identity or check-in credential.

Historical events without a native campaign remain readable but are explicitly labelled as not managed internally. Their Registration tab never invents a guest list; imported historical records remain in Attendance when available.

## Organizer Flow

1. Open **Events → Create Event**.
2. Enter the event details and choose one location path. Physical events either select a verified Ghana venue from the Google Places dropdown or provide a Google Maps share link; online events provide their joining link. Maps links receive immediate recognition feedback, and event creation remains unavailable until the link is a full HTTPS URL for an allowed Google Maps host. Then classify the event as monthly, quarterly, special, or **None of these** and set the free registration capacity/window.
3. Submit once to create and publish both the event and its registration campaign. With no opening time, registration is open immediately; a future opening time keeps the public form scheduled until that timestamp.
4. Open the event’s **Registration** tab. Its quiet internal workspace navigation is limited to **Summary**, **Guests**, **Form & capacity**, **Emails**, and **Blasts**.
5. Use **Summary** for one lifecycle-aware registration story: before the event it pairs confirmed registrations, capacity progress, and places left; during the event it becomes check-in progress and guests still to arrive; after the event it becomes final attendance and no-shows. Figures refresh automatically every 15 seconds while the workspace is visible and when the tab regains focus; manual **Refresh** is available only while the public form is accepting guests. Closed or expired campaigns show one **Reopen registration** action instead; its confirmation makes the form available immediately and clears the previous schedule. When the form is open, **Show QR code** opens a protected phone-safe display for walk-in guests, while the empty state retains **Copy registration link** and waitlist/cancellation details appear only when they exist.
6. Use **Form & Capacity** to update the event name, About description, start/end times, and venue or Google Maps link, with a direct path to cover management. **Manage cover** opens the Overview page directly at its Media section; the action becomes **Re-upload cover** when the event already has one. Those guest-facing page details start collapsed under **Edit details**, while **Open form** and **Copy form** remain immediately available. Venue updates reuse the Ghana-restricted Google Places autocomplete from event creation. A separate optional **Registration introduction** controls only the copy above the RSVP form and defaults to blank; event About copy remains on the read-only details view. The always-visible availability section controls campaign status, capacity, and the registration window. Page details and campaign settings have separate change-aware save actions; each remains disabled until its own persisted values change. Places are immediate until capacity is reached; overflow joins the waitlist automatically, so there is no pending approval or organizer-facing auto-confirm/waitlist toggle.
7. On event day, use **Show QR code** to display the registration form on a shared screen or phone. Guests scan with their camera, complete the existing name/email form, and appear in the same live guest list. The display also offers a direct **Open form on this phone** fallback and the short registration URL. Use **Guests** to combine status, first-letter, and name/email filters, then select **Check in**. If the wrong person is checked in, select **Undo check-in** and confirm; this removes only the attendance record and keeps the registration active. The first-letter rail remains hidden until the first guest exists, so an empty list has no inert **All** control. Ordinary registered guests do not carry a redundant “Confirmed” badge; the list calls out only waitlisted, cancelled, checked-in, or post-event no-show states. Tablet and desktop guest rows scroll inside a bounded region so the controls remain visible; phones retain one natural page scroll. Tablets use the event’s full Registration tab; on phones, **Show registration QR** is available from the dedicated Events workspace and **Check in guests** opens a dedicated event screen with its own back action, event identity, progress, filters, and guest actions.
8. Use **Emails** only for transactional registration receipt, waitlist, and promotion delivery state plus failed-delivery retries. Cancelling a confirmed registration gives the oldest waitlisted guest the open place and queues their promotion notice atomically.
9. Use **Blasts** for one custom event-update email to confirmed guests only. The composer opens with the editable **Reminder** draft by default, while Event update and Venue change remain available starters, then opens one rendered email preview whose primary action sends or schedules the message. The renderer treats the editable message as the complete body, so a greeting entered by the organizer appears exactly once. Blast emails deliberately use the same branded event-details layout as registration receipts—including the DevCongress wordmark, one compact **When / Where** itinerary card, a map pin, side-by-side calendar actions, and explicit light/dark email colours—so guests receive one coherent event communication system. The first release stops at 100 recipients and preserves the message as **Needs email capacity** when the dedicated Resend Broadcast key or provider capacity is unavailable. Before an immediate send, EMS subtracts queued transactional work and a protected daily reserve from Resend's last observed quota; an oversized blast is saved without delivery, with the safe-today number shown to the organizer so it can be scheduled instead. A provider draft is saved before its send call, so a failed final send can be retried against the same provider broadcast rather than creating a second audience. Waitlisted and cancelled guests are never added, and the app never sends a partial blast.
9. For an older event with no native campaign, the tab explains that registration was not managed in this app. It does not expose campaign controls, guest actions, or made-up attendee data. Use Attendance for any historical CSV import.
10. In local development, Owners only can use **Remove test guest** to permanently delete real test registrations after confirming the attendee and linked-data cleanup. Organizers and Volunteers never see or can call the action. Production builds hide the action, and the production API rejects the delete route.

New events publish a short same-origin `/r/:eventSlug` URL through the existing `registration_url` compatibility field, so the public meetup API can expose the native action without changing its consumer contract. When EMS writes shared Supabase event data, that URL is always rooted at the configured hosted EMS origin; local development URLs are permitted only for local JSON data. Existing `/register/:eventId` links remain valid. Organizer copy and QR actions can create a separate tracked `go.devcongress.org` short link without changing the canonical registration URL.

## Attendee Flow

- Open `/r/:eventSlug` (or a previously shared `/register/:eventId` link).
- Submit name and email. The existing page checks syntax, common provider typos, known disposable domains, and mail-domain DNS availability inside the same action; the disabled button moves from **Checking email** to **Submitting** without requiring a link, code, or second attendee action.
- Receive the same neutral on-page acknowledgement whether the address is new or already registered. This prevents the form from revealing attendee membership.
- Receive the authoritative confirmed/waitlist outcome by email when the address can be registered. Registration remains saved if delivery is delayed.
- Check in at the venue with name or email.

The public page presents event details and the form as one continuous registration ticket: desktop uses a vertically centred invitation with a perforated RSVP stub, while phones unfold the same ticket vertically with a horizontal tear line. The RSVP form displays only the campaign's optional registration introduction; the email-linked read-only details state displays the event About description. Neither surface invents fallback copy. A saved HTTPS Google Maps share link appears directly in the ticket's **Where** section as **Open in Google Maps**; invalid or unsupported location URLs are never rendered as links. Cover previews and the public ticket share the same 16:9 crop. Uploaded covers use unique immutable storage URLs, and existing Supabase cover URLs carry the event revision so a replaced image cannot be hidden by a stale browser or CDN cache. Mobile event titles use the lighter heading weight, date and location stack for legibility, and the form keeps full-size controls, persistent labels, safe-area padding, and natural scrolling when required. Event summaries remain clamped without truncating the stored description.

## Data Model

| Table | Purpose |
|---|---|
| `event_registration_campaigns` | One private registration introduction, capacity, window, automatic overflow, and lifecycle record per event; legacy auto-confirm/waitlist columns remain internal policy fields |
| `event_registrations` | Private attendee identity and confirmed/waitlisted/cancelled state |
| `event_registration_checkins` | One organizer check-in per registration; undoing check-in removes this row without changing registration status |
| `registration_email_deliveries` | Durable pending/accepted/failed receipt, waitlist, and promotion-notice queue |
| `event_blasts` | Organizer-owned subject/body, confirmed-recipient snapshot count, preparation/scheduled/sent/capacity state, and provider reconciliation IDs for custom event updates |

All four tables have RLS enabled and no anonymous table policies. Public writes go through the validated Hono endpoint using the server-only Supabase client. In production, the endpoint requires action/hostname-bound Turnstile verification and applies atomic cross-Worker limits by client and normalized email. The browser's rate-limited email preflight is repeated by the final registration endpoint; definite invalid domains are rejected, while DNS timeouts and other inconclusive resolver results continue to registration. This is deliverability preflight, not mailbox-ownership verification, and it introduces no registration or check-in state. Each campaign permits one active registration per normalized email. The `register_for_event` database function locks the campaign row while allocating capacity, preventing concurrent submissions from over-confirming the event. The service-role-only `cancel_registration_and_promote` function takes the same campaign lock, cancels the selected guest, promotes only the oldest waitlisted guest when a confirmed place opens, and queues the promotion notice in the same transaction. Draft campaigns return the same not-found contract as an unknown registration link so unpublished event details are not exposed; scheduled and closed campaigns reject public submissions on the server.

## Email Delivery

Confirmation email uses the existing server-only `RESEND_API_KEY` integration with the code-owned attendee-facing `DevCongress Events <events@updates.devcongress.org>` sender. `REGISTRATION_EMAIL_REPLY_TO` remains required deployment configuration, and registration never falls back to the distinct speaker-program identity. Blasts use a separate least-privilege `RESEND_BROADCASTS_API_KEY`; Resend owns per-recipient unsubscribe links and scheduled delivery. The app creates an event-specific Resend Segment at send time so an event blast cannot accidentally address all DevCongress contacts.

The responsive DevCongress email gives the event date, Accra time, and location their own prominent rows. A saved HTTPS Google Maps place/share URL becomes a **View map** action; other or unsafe URL hosts remain plain location text. Confirmed and newly promoted guests receive both a Google Calendar action and a downloadable `.ics` file from `GET /api/registration/events/:eventKey/calendar.ics`. Its **View event details** link opens the same event ticket in a read-only details state, never a second RSVP form or a claim that a bare link proves the visitor's identity. Waitlisted guests retain the event details and waitlist copy without calendar actions that could imply a confirmed place. Promotion notices explicitly state that the guest is off the waitlist. HTML and plain-text versions are always sent, and every attendee/event field is escaped before HTML rendering.

Timed events use their saved end time in calendar links and files. If a timed event has no valid end, calendar generation uses a three-hour fallback; date-only events are exported as all-day entries and show **Time to be announced** in the email.

If Resend is unavailable or its daily quota is exhausted:

- the attendee record remains saved;
- the public page keeps its neutral acknowledgement and does not disclose delivery or attendee state;
- the outbox remains pending or failed;
- organizers can retry failed delivery from the **Emails** workspace.

Provider acceptance is recorded as `accepted`; it is not proof of inbox delivery.

Owners also see a compact **Email delivery** workspace in the Audit Log. It separates daily capacity, monthly capacity, recoverable transactional outbox work, and the current blast allocation equation (daily limit − observed use − queued transactional work − protected reserve). It then shows a five-row, paginated history of registration, community-listing, and speaker-archive delivery records plus the ten most recent event-broadcast states. The capacity values are Resend's most recent accepted-send response and use the configured plan limits; only capacity threshold crossings enter the audit timeline. **Accepted** and **Sent to provider** still mean Resend accepted the request, not that the recipient's inbox received it. Delivery, bounce, and complaint truth remains a later outbound-webhook integration.

## Key Files

| File | Purpose |
|---|---|
| `src/views/admin/AdminEventsView.vue` | Sole native event-creation flow |
| `src/views/admin/AdminRegistrationsView.vue` | Five-part registration workspace, honest historical-registration state, campaign controls, guest actions, transactional delivery status, and email-blast composer/history |
| `src/views/admin/AdminRegistrationDisplayView.vue` | Protected, phone-safe QR display for on-site registration with a direct-form fallback |
| `src/views/admin/AdminMobileOrganizerView.vue` | Compact event list and links into focused phone operations |
| `src/views/admin/AdminMobileEventsView.vue` | Phone event list with check-in, public-registration, and registration-QR actions |
| `src/views/admin/AdminMobileCheckInView.vue` | Dedicated phone event-day name/email and first-letter guest check-in, including mistaken-check-in undo |
| `src/components/ui/RegistrationAlphabetFilter.vue` | Shared 44px first-letter rail for phone, tablet, and desktop check-in |
| `src/lib/registration-checkin.ts` | Shared initial normalization, filtering, and alphabetical ordering |
| `src/lib/registration-workspace.ts` | Derived capacity, contextual waitlist/no-show, guest-status, and email-delivery presentation policy |
| `src/components/ui/AppDatePicker.vue` | Themed adaptive date and 24-hour date-time selection |
| `src/components/ui/EventCoverPicker.vue` | Local cover selection, preview, limits, and URL fallback |
| `lib/supabase/media.ts` | Validated immutable cover/photo storage paths and public URLs |
| `src/views/EventRegistrationView.vue` | Standalone public name/email form and receipt |
| `lib/email/templates/event-registration-confirmation.ts` | Escaped HTML/text receipt, waitlist, and promotion notices with safe location actions, Google Calendar link, and `.ics` generation |
| `lib/location-links.ts` | HTTPS Google Maps allowlist shared by event input and attendee-email rendering |
| `lib/event-registration.ts` | Capacity, availability, and summary policy |
| `lib/event-registration-store.ts` | Supabase/local adapter boundary for check-in and undo mutations |
| `lib/supabase/event-registrations.ts` | Relational production repository |
| `lib/event-blast-store.ts` | Supabase/local blast persistence boundary |
| `lib/email/resend.ts` | Transactional batch client plus event-scoped Contact/Segment/Broadcast client |
| `lib/email/public-email-preflight.ts` | Shared syntax, typo, disposable-domain, DNS, caching, and fail-open policy for new public email submissions |
| `server/app.ts` | Public and organizer registration API |
| `supabase/migrations/20260728000000_native_event_registrations.sql` | Relational schema and atomic registration function |
| `supabase/migrations/20260729010000_registration_waitlist_promotion.sql` | Fixed automatic-allocation policy plus atomic cancellation, oldest-first promotion, and durable promotion delivery |
| `supabase/migrations/20260730000000_event_email_blasts.sql` | Native blast history and provider-reconciliation table with server-only RLS boundary |
| `supabase/migrations/20260730010000_event_email_blast_permissions.sql` | Explicit service-role grants for the private blast table while browser roles remain blocked by RLS |
| `supabase/migrations/20260731000000_event_blast_preparing_status.sql` | Durable provider-preparation state for safe Resend broadcast retries |

## Current Boundaries

- Monthly meetup registration is free.
- Venue-name search uses authenticated, server-proxied Google Places (New) predictions restricted to Ghana. It requires the server-only `GOOGLE_MAPS_PLACES_API_KEY`; organizers can alternatively use the explicit Google Maps-link location mode.
- Online and hybrid events may store an optional HTTP(S) video conference link in the existing event stream field.
- Paid December 2026 registration, payment-provider webhooks, refunds, and ticket reconciliation are not part of this slice.
- Historical Luma event metadata and uploaded Luma attendance CSVs remain readable; active Luma event preview/import routes are removed.
- Cancelling a confirmed guest automatically promotes the oldest waitlisted registration; cancelling a waitlisted guest does not move anyone else. The cancellation response records the state change before attempting the follow-up promotion email, so a temporary delivery-path failure does not report a persisted cancellation as unsuccessful.
- Undoing a check-in is a separate Owner/Organizer-only action. It requires a confirmed, currently checked-in registration and is audited independently from registration cancellation.
- Archiving an event is Owner-only. It hides the event from normal organizer/public surfaces, closes the registration campaign, revokes active short links, and keeps the event restorable from Audit Log only while its recovery window and timeline remain viable. Hard delete is also Owner-only and is intended for test or junk events.
- Registration exports and marketing analytics remain out of scope. Native event-update blasts are email-only; SMS, WhatsApp, push, cross-event segments, templates, and recipient selection are not part of this first release.
