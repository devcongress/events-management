# Community Event Submissions

## Status

Implemented in code; requires the `20260801020000_community_event_submissions.sql` and `20260802000000_event_submission_notifications.sql` migrations, production Turnstile hostname configuration, and Resend credentials before deployment.

## Product boundary

`devcongress.org` owns the public form and discovery experience. Events Management owns validation, abuse controls, relational persistence, organizer moderation, canonical event promotion, audit history, and the public events feed.

A proposal is not an event. It becomes a canonical external event only when an organizer approves it. Approval and publication are stored separately even though the initial organizer UI deliberately offers one primary **Approve & publish** action.

## Public submission contract

`POST /api/public/event-submissions` accepts:

- title and short summary;
- event format;
- ISO start/end timestamps and IANA timezone;
- in-person, online, or hybrid location details;
- a registration or online event URL;
- organizer name, email, and optional website;
- optional notes from the submitter;
- Turnstile action and token.

The server forces `source_app = website`, rejects unknown fields, validates location-dependent requirements, verifies the `event_submission` Turnstile action against the dedicated public-site hostname allowlist, then consumes distributed client and email rate limits. Production fails closed if any security dependency or relational storage is unavailable.

Accepted proposals receive only an opaque receipt id and pending status. There is no public status lookup, and pending/rejected records never enter a public feed. The intake transaction also queues a receipt email; provider failure does not roll back the saved proposal.

## Organizer review

Community submissions live inside the Events workspace at `/organizer-console/events/submissions`, alongside the canonical event collection rather than as a separate global product area. The former `/organizer-console/event-submissions` path redirects there so existing bookmarks remain valid. The shared workspace switcher stays mounted while its selection indicator and the content beneath it transition between All events and Community submissions, avoiding duplicate navigation or overlapping pages. **Pending** is the default inbox filter and carries a circular counter for proposals still awaiting review; the current model does not claim per-organizer read/unread state. The inbox uses a compact table with pending, approved, and rejected filters in the table toolbar. Selecting a row opens a right-side detail drawer that preserves the queue context and contains the review actions. Organizers can:

- approve and publish an external community event;
- reject it with a required reason category, optional organizer-facing message, and optional private internal note;
- open the canonical event after approval.

Approval and rejection are transactional, idempotent Supabase functions. A source-submission unique constraint prevents repeated approval requests from creating duplicate canonical events. Each decision queues one durable email in the same transaction. **Approve & publish** needs no extra confirmation; it publishes the canonical external event and queues the approval notice. **Reject & notify organizer** shows the outgoing reason/message separately from the internal note. Review actions are written to the admin audit ledger without submitter contact data or note/message content.

The drawer shows receipt and decision delivery state as **Queued**, **Accepted**, or **Failed**. Accepted means Resend accepted the message, not that it reached the inbox. A failed notification can be retried without re-running approval/rejection or creating another event.

Approved listings appear in the main organizer Events workspace with a **Community event** badge so they remain visibly distinct from events created by DevCongress organizers.

## Event taxonomy

Canonical events keep these dimensions independent:

- ownership: `devcongress` or `external`;
- DevCongress series: monthly, quarterly, special, or none;
- format: meetup, conference, workshop, hackathon, webinar, or other;
- source: internal or public submission;
- moderation: pending, approved, or rejected when applicable;
- publication: draft, published, or archived.

External promoted events retain the submitted organizer identity, have no DevCongress series, and are explicitly marked approved. Being listed does not make DevCongress the owner or organizer.

## Public discovery

`GET /api/public/events` is the additive generic-events feed. It returns published DevCongress events and approved, published external events. `GET /api/public/meetups` remains the compatibility feed for DevCongress-owned meetups only.

Approval updates the public API immediately. The current Astro website is statically built, so its `/events/` page reflects the new listing after the next website build/deployment; the approval email links to the submitted registration/event page when available instead of depending on that refresh.

## Deliberate follow-ups

- Verified delivered/bounced state requires a signature-checked Resend webhook; the current system deliberately stops at provider acceptance.
- A scheduled outbox drain can be added if volume makes organizer-driven retry insufficient; every pending/failed record is already durable and idempotent.
- Approve-as-draft is supported by the API and relational model but is not exposed in the initial two-decision organizer UI.
- Submitter edit/appeal and rejected-record retention require product policy before implementation.
