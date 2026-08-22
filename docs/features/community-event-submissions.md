# Community Event Submissions

## Status

Implemented in code; requires the community-submission migrations through `20260821090000_event_page_monitors.sql`, production Turnstile hostname configuration, Resend credentials, and `EVENT_SUBMISSION_MANAGEMENT_TOKEN_SECRET` before deployment.

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

`POST /api/public/event-submissions/with-cover` accepts the same validated fields as multipart form data plus one optional public cover image. It is explicitly unauthenticated, like the coverless intake route, and applies the launch gate plus a distributed client limit before multipart parsing. Turnstile and the normal client/email limits run before image-header work or storage. The normal JSON route remains capped at 64KB; the cover route is capped just above 5MB and accepts only AVIF, JPEG, PNG, or WebP files after extension, MIME, signature, and bounded-dimension validation. Images above a 4096px edge or 16,777,216 total pixels are rejected without decoding the full image. The website renders a client-only event preview before either route is submitted. Draft recovery deliberately excludes the image file.

The server first requires the runtime launch gate `PUBLIC_EVENT_SUBMISSIONS_ENABLED=true`. Missing, false, or invalid values reject the request before validation, Turnstile, rate limits, email, or persistence. When enabled, the server forces `source_app = website`, rejects unknown fields, validates location-dependent requirements, verifies the `event_submission` Turnstile action against the dedicated public-site hostname allowlist, then consumes distributed client and email rate limits. Before persistence it repeats the shared organizer-email preflight for syntax, high-confidence provider typos, maintained disposable domains, and MX/A/AAAA availability; definite invalid results return an `organizer_email` field error, while an inconclusive DNS result continues. Production otherwise fails closed if a required security dependency or relational storage is unavailable.

Accepted proposals receive only an opaque receipt id and pending status. There is no public status lookup, and pending/rejected records never enter a public feed. Intake does not send a receipt email; the on-page confirmation is deliberate quota protection.

## Organizer review

Community submissions live inside the Events workspace at `/organizer-console/events/submissions`, alongside the canonical event collection rather than as a separate global product area. The former `/organizer-console/event-submissions` path redirects there so existing bookmarks remain valid. The shared workspace switcher stays mounted while its selection indicator and the content beneath it transition between All events and Community submissions, avoiding duplicate navigation or overlapping pages. **Pending** is the default inbox filter and carries a circular counter for proposals still awaiting review; the current model does not claim per-organizer read/unread state. The inbox uses a compact table with pending, updates, approved, and rejected filters in the table toolbar. **Updates** is an organizer queue, not a persisted moderation state: an event appears there only while an approved submitter has a submitted amendment awaiting review, and returns to Approved after that amendment is approved or declined. Updates carries its own counter so requested changes are not hidden among normal approved listings. Selecting a row opens a right-side detail drawer that preserves the queue context and contains the review actions. Organizers can:

- approve and publish an external community event;
- reject it with a required reason category selected through the organizer app dropdown, optional organizer-facing message, and optional private internal note;
- open the canonical event after approval.

Before making a pending-submission decision, the review drawer presents the same four criteria to every Organizer:

1. **Community fit** — the event is relevant to Ghana's technology community.
2. **Event clarity** — its date, location or online link, and registration path are ready to publish.
3. **Credibility** — the organizer and the supplied details can be verified.
4. **Calendar value** — it is not a duplicate, already past, or an avoidable major clash.

All four should be true before approval. A reviewer should use the existing rejection category and organizer message to explain a decline clearly; the internal note remains private to organizers.

Approval and rejection are transactional, idempotent Supabase functions. A source-submission unique constraint prevents repeated approval requests from creating duplicate canonical events. Each decision queues one durable email in the same transaction. **Approve & publish** needs no extra confirmation; it publishes the canonical external event and queues the approval notice. **Reject & notify organizer** shows the outgoing reason/message separately from the internal note, directs the organizer to submit a new event if appropriate, and does not invite email replies. Review actions are written to the admin audit ledger without submitter contact data or note/message content.

## Reviewed amendments

An approved organizer receives one private, time-bounded management link. It is a signed bearer capability backed by a service-role-only link record, so it can be revoked without exposing a submission lookup. New links keep the capability in the URL fragment, which browsers do not send in HTTP request paths, and the amendment client presents it to same-origin API routes in the `Authorization` header. Legacy path-bearing links remain accepted so already-issued emails do not break; application logs redact those legacy paths, while retention or removal of old provider URL logs remains a Cloudflare operational task outside this repository. The capability expires at the canonical event end time, including an approved change to that time; expired, revoked, withdrawn, and ended events cannot be mutated. Organizers can retrieve the existing active URL from the approved-submission drawer with **Copy management link** when a sender says they did not receive the approval email. That action creates no email or quota usage and records only the copy event and expiry in the audit ledger, never the bearer URL. The organizer can only propose schedule, location, online, registration, an optional replacement cover image, and an optional reviewer note; title, description, format, and organizer identity remain fixed. The management form is seeded from the current approved community event after each accepted amendment, while the original submission remains unchanged as historical review evidence. The cover is staged with the amendment and does not replace the published image unless the organizer approves the entire change request. Saving drafts and submitting a change request send no email. A successfully submitted request posts a best-effort alert to the existing private submission Slack channel with the requested schedule and location plus a direct link to the Updates review drawer; a missing or unavailable webhook never rolls back the submitted request. Only one draft or submitted request can exist at a time. An Organizer reviews the submitted request in the existing submission drawer: approval transactionally updates the canonical event, clears the reviewed monitor findings, rebaselines monitoring on the new canonical details, and schedules the next source-page comparison at the event's normal cadence. Approval does not fetch the source page or send a monitoring Slack alert immediately, and it never republishes the event announcement to the public Slack channel. Decline leaves the public listing and monitoring baseline untouched and lets the organizer prepare another request. Both decisions use the existing durable email outbox. Rejected initial proposals never receive a management link and must be resubmitted as a new proposal.

Root approval and rejection notifications use the outbox's root-delivery partial unique index, while amendment decisions use the amendment-specific index. This keeps moderation idempotent without allowing the amendment index split to block initial approval or rejection.

The review drawer groups the proposal summary, schedule, location, submitter, and supporting links into one neutral review card. Submitter notes, email operations, and replies are visually secondary so organizers can scan the event facts before making a decision; the shared organizer action primitives provide the primary and secondary decision treatments, while semantic colors are limited to actual status. The drawer shows receipt and decision delivery state as **Queued**, **Accepted**, or **Failed**, with actionable failure copy for quota/rate limits, sender or credential configuration, invalid message details, provider outages, and connectivity failures. When Resend supplies a safe provider reason, it is included after the category so the missing sender or recipient detail is visible. Retry responses preserve that same reason in the organizer toast instead of collapsing it to a generic HTTP status. Accepted means Resend accepted the message, not that it reached the inbox. A failed notification can be retried without re-running approval/rejection or creating another event.

## Organizer replies

When inbound reply routing is configured, each community-submission email receives a signed, submission-specific Reply-To such as `s+<submission-id-without-hyphens>.<signature>@updates.devcongress.org`. The compact token keeps the email local part within the 64-character limit while retaining a 120-bit HMAC signature derived from `EVENT_SUBMISSION_REPLY_TOKEN_SECRET`; a reply can be matched to the correct proposal without storing a reusable public token. The same verified `updates.devcongress.org` domain is used for speaker, registration, and event-blast Reply-To mailboxes; the existing `devcongress.org` Zoho MX records are not changed.

Resend sends an `email.received` webhook to `POST /api/webhooks/resend/inbound`. EMS verifies the raw Svix signature, ignores addresses that do not match a valid submission token, retrieves the message body through Resend, stores a sanitized plain-text copy in `event_submission_replies`, and exposes it in the submission drawer. Webhook delivery is idempotent on both the webhook event id and Resend email id. Attachments are recorded as metadata only in this slice.

If `SLACK_EVENT_SUBMISSION_WEBHOOK_URL` is configured for the private submission channel, every saved public submission posts a compact review card with its cover (or the neutral fallback), human-formatted event details, organizer attribution, bounded summary, and one primary link to that exact record in the EMS submissions inbox. Submitted amendment requests and replies to submission emails post there too. Opening the Slack link loads the matching status filter and opens its review drawer, including the Updates queue for an amendment and approved or rejected submissions. Slack failure never rejects intake, rolls back an amendment submission, or discards the EMS record; the dashboard remains the source of truth.
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

Approved listings open into a compact **Community event** overview rather than the normal DevCongress event workspace. Its administrator-only editor can update the live listing details and cover image directly; those writes use the existing authenticated event mutation/media endpoints and retain their audit records. Direct links to talks, attendance, registration, quiz, System Design, feedback, speakers, and finance redirect community listings back to that overview so they cannot acquire normal DevCongress operational workflows.

Future published external listings with a public HTTPS registration URL also receive a read-only registration-page monitor. The Worker checks ordinary server-rendered HTML only; it does not run a browser, execute page JavaScript, trust the source as canonical, or automatically change/unpublish an event. Every initial URL and redirect hop must remain public HTTPS, redirects are followed manually, responses are bounded, and JSON-LD/Open Graph event metadata is compared with the approved listing. The overview shows a compact status timeline, an approved-versus-source comparison with readable local dates, the original source link, and an audited **Check now** action with a five-minute cooldown. Dates more than 30 days away are checked every 14 days; the cadence tightens to three days from 8–30 days, 12 hours from 2–7 days, and two hours in the final day, then stops after the event ends. Creating, reconciling, or rebaselining a monitor schedules its first comparison at that cadence instead of making it immediately due because code was deployed or an amendment was approved; **Check now** remains the explicit way to request an earlier comparison. A first availability failure is a warning and retries after one hour; a second consecutive failure becomes unavailable and posts a deduplicated best-effort alert to `SLACK_EVENT_SUBMISSION_WEBHOOK_URL`. Structured changes, unsafe/unmonitorable redirects, and persistent outages open an ordered **Next steps** rail. Organizers verify the source first, then open a prefilled message to the linked submitter, edit the canonical listing after confirmation, or temporarily unpublish the listing behind a destructive confirmation while keeping the organizer's event itself untouched.

Eligible published events (current or future only) also keep a durable Events-channel Slack announcement record. EMS checks the exact `devcongress.org/events/...` page before reserving or sending a Slack post, so a static-site 404 or unreachable page can never produce a broken Slack link. The organizer details explain that the post waits for the next website refresh. A Worker scheduled drain checks eligible announcements that were not claimed because the website was unavailable every 15 minutes, so a website build that completes at 6:00, 7:00, or 8:00 is picked up automatically on the next successful check. Provider failures remain explicit **Retry Slack** actions, while the Organizer can still use **Send to Slack** manually. A successful announcement is terminal and the action disappears, preventing accidental duplicate public posts. The actions are audited without storing a webhook URL or other provider secret. Apply `20260810230000_event_slack_announcements.sql` and configure `SLACK_EVENTS_RETRY_SECRET` before deploying this workflow.

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

`GET /api/public/events` is the additive generic-events feed. It returns published DevCongress events and, only when `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED=true`, approved and published events promoted from public submissions. `GET /api/public/events/:slug` returns one event through the same visibility gate for dynamic public detail pages and readiness checks. During private beta the variable remains false, so those events stay out of devcongress.org without changing their titles. `GET /api/public/meetups` remains the compatibility feed for DevCongress-owned meetups only.

Authenticated organizers can inspect the complete published collection, including private-beta submissions, through `/organizer-console/website-preview/events`. That preview reads the private, non-cacheable `/api/admin/events-preview` contract and never changes the public visibility of a record.

Approval updates the public API immediately. The website consumes the collection and slug-scoped event endpoint as a public read model; its dynamic event surface can therefore reflect approval without waiting for the daily static rebuild. The approval email links to the submitted registration/event page when available instead of depending on that refresh.

Approved submissions promote their verified cover URL to the canonical event. If no cover was supplied, or an older submission still references a retired placeholder—including the former Google Meet image—the public API returns `/images/event-announcement-fallback.png` instead of a broken image or unrelated meetup photography.

## Temporary manual acceptance testing

Before opening submissions to the general public, testers may exercise the hosted submission, approval, rejection, publication, and email paths against the existing Supabase project. Keep `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED=false` throughout the controlled test window. Public submissions retain their normal titles and email subjects; approved records remain visible in the authenticated EMS preview but every `public_submission` event is excluded from `GET /api/public/events`.

Before public launch, run `pnpm cleanup:private-beta-events` for a dry-run inventory of every public submission and its promoted canonical event. This deliberately broad scope is safe only while the form is still in closed beta and every public submission belongs to that window. After reviewing every row, `pnpm cleanup:private-beta-events -- --execute --confirm DELETE_PRIVATE_BETA_EVENT_DATA` deletes canonical events first and submissions second, then verifies that no matching rows remain. Submission email-outbox records cascade from submission deletion; administrator audit history and email already accepted by the provider remain.

Only after cleanup reports zero beta submissions and promoted events should `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED` become `true`. This is a temporary, controlled pre-launch workflow rather than permanent test/production data isolation. Once the public form is launched, use explicit test-data scoping if acceptance testing must coexist with real submissions.

## Deliberate follow-ups

- Verified delivered/bounced state for outbound messages still requires a separate delivery webhook; this inbound webhook only handles organizer replies.
- A provider delivery webhook can be added if Slack acceptance must be distinguished from later delivery outcomes; every pending/failed event announcement is already durable and idempotent.
- Approve-as-draft is supported by the API and relational model but is not exposed in the initial two-decision organizer UI.
- Submitter edit/appeal and rejected-record retention require product policy before implementation.
