# Community Event Submissions

## Status

Implemented in code; requires the `20260801020000_community_event_submissions.sql` migration and production Turnstile hostname configuration before deployment.

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
- optional private reviewer notes;
- Turnstile action and token.

The server forces `source_app = website`, rejects unknown fields, validates location-dependent requirements, verifies the `event_submission` Turnstile action against the dedicated public-site hostname allowlist, then consumes distributed client and email rate limits. Production fails closed if any security dependency or relational storage is unavailable.

Accepted proposals receive only an opaque receipt id and pending status. There is no public status lookup, and pending/rejected records never enter a public feed.

## Organizer review

`/organizer-console/event-submissions` provides pending, approved, rejected, and all filters. Organizers can:

- approve and publish an external community event;
- reject it with an optional private reason;
- open the canonical event after approval.

Approval and rejection are transactional, idempotent Supabase functions. A source-submission unique constraint prevents repeated approval requests from creating duplicate canonical events. Review actions are written to the admin audit ledger without submitter contact data.

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

## Deliberate follow-ups

- Receipt and decision emails require a durable delivery/outbox ledger; this slice does not claim best-effort inline email as guaranteed delivery.
- Approve-as-draft is supported by the API and relational model but is not exposed in the initial two-decision organizer UI.
- Submitter edit/appeal and rejected-record retention require product policy before implementation.
