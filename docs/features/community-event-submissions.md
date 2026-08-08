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

The server first requires the runtime launch gate `PUBLIC_EVENT_SUBMISSIONS_ENABLED=true`. Missing, false, or invalid values reject the request before validation, Turnstile, rate limits, email, or persistence. When enabled, the server forces `source_app = website`, rejects unknown fields, validates location-dependent requirements, verifies the `event_submission` Turnstile action against the dedicated public-site hostname allowlist, then consumes distributed client and email rate limits. Production fails closed if any security dependency or relational storage is unavailable.

Accepted proposals receive only an opaque receipt id and pending status. There is no public status lookup, and pending/rejected records never enter a public feed. The intake transaction also queues a receipt email; provider failure does not roll back the saved proposal.

## Organizer review

Community submissions live inside the Events workspace at `/organizer-console/events/submissions`, alongside the canonical event collection rather than as a separate global product area. The former `/organizer-console/event-submissions` path redirects there so existing bookmarks remain valid. The shared workspace switcher stays mounted while its selection indicator and the content beneath it transition between All events and Community submissions, avoiding duplicate navigation or overlapping pages. **Pending** is the default inbox filter and carries a circular counter for proposals still awaiting review; the current model does not claim per-organizer read/unread state. The inbox uses a compact table with pending, approved, and rejected filters in the table toolbar. Selecting a row opens a right-side detail drawer that preserves the queue context and contains the review actions. Organizers can:

- approve and publish an external community event;
- reject it with a required reason category selected through the organizer app dropdown, optional organizer-facing message, and optional private internal note;
- open the canonical event after approval.

Approval and rejection are transactional, idempotent Supabase functions. A source-submission unique constraint prevents repeated approval requests from creating duplicate canonical events. Each decision queues one durable email in the same transaction. **Approve & publish** needs no extra confirmation; it publishes the canonical external event and queues the approval notice. **Reject & notify organizer** shows the outgoing reason/message separately from the internal note. Review actions are written to the admin audit ledger without submitter contact data or note/message content.

The review drawer groups the proposal summary, schedule, location, submitter, and supporting links into one neutral review card. Submitter notes, email operations, and replies are visually secondary so organizers can scan the event facts before making a decision; the shared organizer action primitives provide the primary and secondary decision treatments, while semantic colors are limited to actual status. The drawer shows receipt and decision delivery state as **Queued**, **Accepted**, or **Failed**, with actionable failure copy for quota/rate limits, sender or credential configuration, invalid message details, provider outages, and connectivity failures. When Resend supplies a safe provider reason, it is included after the category so the missing sender or recipient detail is visible. Retry responses preserve that same reason in the organizer toast instead of collapsing it to a generic HTTP status. Accepted means Resend accepted the message, not that it reached the inbox. A failed notification can be retried without re-running approval/rejection or creating another event.

## Organizer replies

When inbound reply routing is configured, each community-submission email receives a signed, submission-specific Reply-To such as `s+<submission-id-without-hyphens>.<signature>@updates.devcongress.org`. The compact token keeps the email local part within the 64-character limit while retaining a 120-bit HMAC signature derived from `EVENT_SUBMISSION_REPLY_TOKEN_SECRET`; a reply can be matched to the correct proposal without storing a reusable public token. The same verified `updates.devcongress.org` domain is used for speaker, registration, and event-blast Reply-To mailboxes; the existing `devcongress.org` Zoho MX records are not changed.

Resend sends an `email.received` webhook to `POST /api/webhooks/resend/inbound`. EMS verifies the raw Svix signature, ignores addresses that do not match a valid submission token, retrieves the message body through Resend, stores a sanitized plain-text copy in `event_submission_replies`, and exposes it in the submission drawer. Webhook delivery is idempotent on both the webhook event id and Resend email id. Attachments are recorded as metadata only in this slice.

If `SLACK_EVENT_SUBMISSION_WEBHOOK_URL` is configured for the private submission channel, every saved public submission posts a bounded submission summary and a link to the EMS submissions inbox. Replies to submission emails post there too. Slack failure never rejects intake or discards the EMS record; the dashboard remains the source of truth.
The reply card exposes the bounded Slack rejection reason and gives an Organizer a **Retry Slack** action. A retry addresses only that saved reply, records its outcome in the audit ledger, and never reprocesses the inbound email.

The reply card keeps the new message prominent. When a standard reply boundary or quoted-line marker is present, the preserved original email is cleaned for display and appears in an optional **Original email** disclosure; the full inbound body remains stored unchanged.

### Provider setup checklist

These steps require deployment/provider access and are intentionally not performed by application code:

1. Configure Resend receiving for `updates.devcongress.org` and add the MX records Resend provides to DNS. Do not replace the existing root `devcongress.org` Zoho MX records.
2. Create a Resend webhook subscribed to `email.received`, pointing to `https://em.devcongress.org/api/webhooks/resend/inbound`. Add its `whsec_...` signing secret as `RESEND_INBOUND_WEBHOOK_SECRET`.
3. Generate a strong random secret and add it as `EVENT_SUBMISSION_REPLY_TOKEN_SECRET`; add `EVENT_SUBMISSION_REPLY_DOMAIN=updates.devcongress.org` with the Resend receiving configuration.
4. Create a Slack incoming webhook for the private submission/review channel and add its URL as `SLACK_EVENT_SUBMISSION_WEBHOOK_URL`.
5. Apply `20260807120000_event_submission_replies.sql` to the production Supabase project and deploy the Worker with the new variables/secrets.

Emails sent before signed routing is enabled still point at the old `EVENT_EMAIL_REPLY_TO` mailbox; their replies are not retroactively captured by EMS. Local webhook testing needs a publicly reachable HTTPS URL or a Resend webhook tunnel.

Approved listings appear in the main organizer Events workspace with a **Community event** badge so they remain visibly distinct from events created by DevCongress organizers.

## Event taxonomy

Canonical events keep these dimensions independent:

- ownership: `devcongress` or `external`;
- DevCongress series: monthly, quarterly, special, or none;
- format: meetup, conference, workshop, hackathon, webinar, or other;
- source: internal or public submission;
- moderation: pending, approved, or rejected when applicable;
- publication: draft, published, or archived.

The organizer create and Event Profile editors expose **Event format** separately from **DevCongress series**. Existing and omitted values remain `meetup`; `conference` is the one canonical stored value and is displayed as **Conference / congress**.

External promoted events retain the submitted organizer identity, have no DevCongress series, and are explicitly marked approved. Being listed does not make DevCongress the owner or organizer.

## Public discovery

`GET /api/public/events` is the additive generic-events feed. It returns published DevCongress events and, only when `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED=true`, approved and published events promoted from public submissions. During private beta the variable remains false, so those events stay out of devcongress.org without changing their titles. `GET /api/public/meetups` remains the compatibility feed for DevCongress-owned meetups only.

Authenticated organizers can inspect the complete published collection, including private-beta submissions, through `/organizer-console/website-preview/events`. That preview reads the private, non-cacheable `/api/admin/events-preview` contract and never changes the public visibility of a record.

Approval updates the public API immediately. The current Astro website is statically built, so its `/events/` page reflects the new listing after the next website build/deployment; the approval email links to the submitted registration/event page when available instead of depending on that refresh.

## Temporary manual acceptance testing

Before opening submissions to the general public, testers may exercise the hosted submission, approval, rejection, publication, and email paths against the existing Supabase project. Keep `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED=false` throughout the controlled test window. Public submissions retain their normal titles and email subjects; approved records remain visible in the authenticated EMS preview but every `public_submission` event is excluded from `GET /api/public/events`.

Before public launch, run `pnpm cleanup:private-beta-events` for a dry-run inventory of every public submission and its promoted canonical event. This deliberately broad scope is safe only while the form is still in closed beta and every public submission belongs to that window. After reviewing every row, `pnpm cleanup:private-beta-events -- --execute --confirm DELETE_PRIVATE_BETA_EVENT_DATA` deletes canonical events first and submissions second, then verifies that no matching rows remain. Submission email-outbox records cascade from submission deletion; administrator audit history and email already accepted by the provider remain.

Only after cleanup reports zero beta submissions and promoted events should `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED` become `true`. This is a temporary, controlled pre-launch workflow rather than permanent test/production data isolation. Once the public form is launched, use explicit test-data scoping if acceptance testing must coexist with real submissions.

## Deliberate follow-ups

- Verified delivered/bounced state for outbound messages still requires a separate delivery webhook; this inbound webhook only handles organizer replies.
- A scheduled outbox drain can be added if volume makes organizer-driven retry insufficient; every pending/failed record is already durable and idempotent.
- Approve-as-draft is supported by the API and relational model but is not exposed in the initial two-decision organizer UI.
- Submitter edit/appeal and rejected-record retention require product policy before implementation.
