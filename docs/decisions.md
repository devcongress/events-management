# Architectural Decisions

> ADR entries explain WHY — not what was built, but why it was built that way.

---

## ADR-032: Session-Scoped Navii Avatars And Final Learning-Room Standings

**Date:** 2026-07-31
**Status:** Accepted
**Context:** Room-scoped names make the per-question reveal understandable, but participants also need a visual identity and a clear closing moment. A shared final leaderboard helps the room recognize the overall outcome, while sending the full ranking to every phone would unnecessarily expose other participants' scores and labels.
**Decision:** Give every System Design session participant a deterministic Navii avatar seeded from the participant record ID, so the immutable avatar remains paired with that participant's default or edited room name throughout one run. Use avatars on the authenticated presenter's final top-ten leaderboard, while keeping per-question results as aggregate answer bars. When the room finishes, return only the requesting participant's own name, avatar seed, position, and participant count to their phone; do not return scores or the full System Design leaderboard publicly. Render the phone finish card with only the participant avatar, name, and position. Trigger one confetti burst only for positions one through five, with a static reduced-motion fallback.
**Trade-offs:** System Design now has a competitive closing rank even though its questions remain discussion-led. Position uses the existing score calculation and deterministic join order to break equal scores. The presenter shows the top ten rather than an unbounded room list, while attendee phones deliberately receive a minimal personal result.
**Alternatives considered:** Use names without avatars (weaker visual continuity), seed avatars from display names (duplicate or changed names could collide), send the complete leaderboard to every phone (unnecessary identity exposure), celebrate every participant (dilutes the requested top-five distinction), or add a new avatar service (unnecessary because `@usenavii/core` already renders deterministic avatars locally).
**Revisit when:** Tied ranks need shared positions, the room wants a non-competitive mode, participant-scoped API tokens replace device/user IDs, or final leaderboards need more than ten visible entries.

---

## ADR-031: Room-Scoped Participant Identity With Presenter-Only Response Labels

**Date:** 2026-07-31
**Status:** Accepted; final standing behavior extended by ADR-032.
**Context:** System Design facilitators need a readable post-question response summary without requiring participant accounts. Identity setup belongs to participants during the QR lobby, not to an organizer setting on the saved scenario workspace, and per-person reveal cards do not scale to a full room.
**Decision:** On join, assign every participant a unique server-generated friendly name and a participant-scoped avatar. Let that participant keep or edit only their room name from their phone while the session is waiting; the avatar cannot be changed. Validate edited names as 1–24 character room labels, reject duplicates case-insensitively, and authorize the public edit with the participant record and originating device ID. Close edits when the facilitator starts the first question. Persist the chosen label on the session participant record. Present question responses only as four aggregate bars containing the option, participant count, and percentage; do not return per-answer respondent identities. Keep the System Design leaderboard out of public attendee state.
**Trade-offs:** Edited labels can be inaccurate or playful because they are not authenticated. Device ownership is the lightweight authorization boundary for this account-free room, while the shared JSON compatibility model cannot make the session-start and participant-name writes one cross-document transaction. Names and answers remain ephemeral run data and are cleared together when a completed room is reopened.
**Alternatives considered:** Require organizer or attendee accounts (too much friction for QR participation), make the organizer choose a room-wide naming mode (puts participant identity work in the wrong workflow), make names mandatory before joining (slows scanning), keep names permanently generated (less useful for discussion follow-up), allow avatar changes (weakens stable visual recognition), or render every respondent beneath their answer (does not scale and unnecessarily expands identity exposure).
**Revisit when:** Learning-room runs move to relational or durable realtime persistence, participant-scoped tokens replace device ownership, verified attendance identity is required, or historical participant-level analytics are intentionally introduced with a retention policy.

---

## ADR-030: Reusable System Design Content With Independent Live Runs

**Date:** 2026-07-31
**Status:** Accepted
**Context:** The System Design workspace already owns each meetup's saved scenario, source link, facilitator, and recap. The first learning-room implementation placed question preparation in a replacement setup page and copied the meetup end time into the live session, so historical meetups immediately appeared finished and could only open a completion slide. Organizers need to reuse any previous meetup that still has a System Design source link.
**Decision:** Keep the saved System Design page as the persistent organizer workspace and add exactly five generated, reviewable learning questions to it. A saved System Design source keeps that workspace available even when an older checklist record says the monthly workflow was disabled. Open the presenter in a new browser tab on a standalone route outside the admin shell, with no admin navigation or editing links; mark that route organizer-protected and keep every facilitator mutation behind the existing HTTP-only organizer session. Treat a presentation as a temporary run of the persistent content: meetup dates never expire System Design learning rooms; opening a completed room clears only that room's prior anonymous participants, responses, and runtime phase fields, then starts a fresh waiting lobby while preserving the scenario and questions. Opening a waiting or active room resumes it.
**Trade-offs:** The compatibility JSON model still stores the question set and current run under one quiz-session identity, so restarting intentionally discards the previous anonymous pulse instead of retaining run history. This keeps the first implementation direct and avoids introducing a second live-run schema before reporting is required. Polling remains the realtime mechanism.
**Alternatives considered:** Replace the System Design page with a dedicated learning-room builder (breaks the established artifact workflow), permanently close rooms at the meetup end time (prevents historical reuse), show a read-only completion page for old rooms (does not support another learning session), or introduce separate template/run tables immediately (cleaner history, but unnecessary until multiple-run reporting is required).
**Revisit when:** Organizers need historical per-run analytics, concurrent presentations of one scenario, durable realtime coordination, or the compatibility JSON domains move to relational persistence.

---

## ADR-029: Native Email-Only Event Blasts Through Isolated Resend Segments

**Date:** 2026-07-30
**Status:** Accepted
**Context:** Organizers need to send a useful event update before a registered event, including scheduling it, without reconnecting Luma or turning registration operations into a general multi-channel marketing product. The first operating limit is 100 confirmed guests per blast, but an artificial monthly blast cap would prevent normal event follow-up. Provider plan/quota errors must not leave organizers with an opaque failure or a partial audience.
**Decision:** Add a native **Blasts** workspace beside transactional registration email state. It accepts a plain-text subject and message, targets the current confirmed registrations only, and creates a new Resend Contact Segment per blast before requesting a Resend Broadcast send or scheduled send. Use a separate least-privilege `RESEND_BROADCASTS_API_KEY`, rather than widening the transactional key. Persist message metadata and provider IDs in `event_blasts`, but retain attendee email only in the existing registration table. Reject sends above 100 recipients; do not pick the first 100. If configuration or plan/quota capacity is unavailable, preserve the blast in a friendly `needs_capacity` state and do not send any subset.
**Trade-offs:** Per-blast segments leave operational provider records and use Resend's global contact model, but create the clearest recipient snapshot and avoid a shared all-attendees audience. The first release is intentionally plain text and does not offer templates, per-recipient variables, cross-event segments, or editing/cancelling an already scheduled provider broadcast. Provider acceptance is still not proof of inbox delivery; delivery webhooks remain a later addition.
**Alternatives considered:** Integrate Luma (would surrender the native registration source of truth), send through the transactional batch endpoint (does not provide provider-owned scheduling/unsubscribe mechanics), build a Worker cron queue now (more delivery machinery than the initial scale needs), or allow arbitrary recipient selection (adds privacy and accidental-send risk).
**Revisit when:** Events routinely exceed 100 confirmed guests, organizers need cancellation/editing of a scheduled blast, delivery/open metrics become an operational need, or email updates need a consent/topic model beyond event logistics.

---

## ADR-028: Immediate Places With Contextual Registration Operations

**Date:** 2026-07-29
**Status:** Accepted
**Context:** Free meetups do not require organizers to approve individual guests. The earlier campaign UI exposed `auto_confirm` and `waitlist_enabled` as monthly organizer settings, mixed capacity controls, guest actions, and email retries on one long page, and displayed waitlist/no-show concepts even when they had no operational meaning.
**Decision:** Give every registration a place immediately while capacity remains, then place overflow registrations on the waitlist automatically. Keep the legacy database flags as internal compatibility fields fixed to that policy and reject organizer API attempts to change them. When an organizer cancels a confirmed guest, atomically promote the oldest waitlisted registration and queue a distinct transactional promotion notice; cancelling a waitlisted guest does not trigger promotion. Structure the organizer Registration area as **Summary**, **Guests**, **Form & Capacity**, and **Emails**. Show waitlist information only when overflow exists and calculate no-shows only after the event ends. Limit Emails to transactional receipt/waitlist/promotion delivery state and failed retries; do not add broadcasts, bulk messaging, exports, marketing analytics, pending approval, or an organizer-facing monthly auto-confirm setting.
**Trade-offs:** Organizers cannot pause automatic allocation independently of closing the campaign or manually reorder/promote the waitlist. Oldest-first promotion is predictable and avoids a new discretionary admission surface; the shared campaign lock prevents registration and cancellation races from over-allocating capacity. The focused workspace reduces accidental policy changes and keeps privacy-sensitive guest operations distinct from campaign configuration and transactional delivery.
**Alternatives considered:** Keep both booleans as organizer settings (creates contradictory monthly behavior), show every metric at all times (makes zero-value waitlists and pre-event no-shows look meaningful), add a general communications tab (expands authorization, privacy, audit, and abuse scope), or combine historical external registrations with native guests (misrepresents data provenance).
**Revisit when:** Paid registration introduces explicit reservation/payment states, organizers need a documented waitlist-priority exception, or another event type requires approval-based admission.

---

## ADR-027: Missing Campaign Means Registration Was Not Managed Internally

**Date:** 2026-07-29
**Status:** Accepted
**Context:** Historical events may have registration links and attendance imported from an external provider but no native `event_registration_campaigns` row. The organizer registration views previously treated that absence as a generic `404` and offered a development-only fictional guest simulation, which made it harder to tell historical data from real DevCongress registrations.
**Decision:** For an existing event, treat the absence of a registration campaign as an explicit `managed_internally: false` read state. Show organizers that registration was not managed in this app and direct them to historical Attendance data when available. Do not synthesize guests, create a campaign during a read, or retrofit an old event automatically. Keep unknown events as `404`. Every new event created through the active native command still receives a private draft campaign, and the command removes the event if campaign provisioning fails.
**Trade-offs:** Campaign absence is now meaningful compatibility state for historical records, so a manually corrupted future event would present the same state until repaired. The native creation invariant and server-side write checks prevent normal product flows from producing that mismatch. Historical external guest data remains separate from the native registration tables.
**Alternatives considered:** Keep returning a campaign `404` (conflates valid history with missing data), preserve the fictional preview (looks like guest data without being evidence), create missing campaigns on GET (a hidden write that could misclassify history), or add a new registration-mode column solely for existing records (unnecessary while campaign presence and the native creation invariant already define the boundary).
**Revisit when:** Organizers need to migrate an external guest list into native registration, another first-party registration provider is introduced, or event/campaign creation moves into one database transaction.

---

## ADR-026: Fail-Closed Public Boundaries and Relational Security State

**Date:** 2026-07-28
**Status:** Accepted; supersedes ADR-025 and the JSON-link portions of ADR-015/ADR-016.
**Context:** The security audit found that per-isolate throttles, optional public verification, whole-document one-time links, cached duplicate responses, and login-time role snapshots were insufficient for a multi-Worker production app. A public attendance response and direct anonymous Supabase feedback policies also bypassed the intended privacy and validation boundaries.
**Decision:** Public writes fail closed in production unless Turnstile and the atomic Supabase rate limiter are available. Registration and CFP return non-enumerating acknowledgements. CFP proposals move to relational rows with a normalized partial unique index so concurrent Workers cannot overwrite or duplicate active submissions. Speaker links move to a relational, hash-only table with atomic claim/consume/release functions. Organizer sessions resolve the current membership role and are revoked on role/status changes. Public contracts revalidate URLs and never include attendance identity. The Pages proxy remains the same-origin browser boundary, enabling `SameSite=Lax` `__Host-` cookies and strict origin checks without cross-site session cookies.
**Trade-offs:** A Turnstile or rate-limit-store outage temporarily disables public submissions instead of accepting unverified writes. Raw speaker links cannot be recovered or reused after issuance; a failed email retry creates a new link. Deployment must coordinate the database migration, Worker, Pages, and Turnstile secret. Cloudflare edge controls and production alerting remain necessary for volumetric attacks.
**Alternatives considered:** Keep best-effort per-isolate limits (bypassable across Workers), retain recoverable tokens (larger database-read blast radius), accept public writes when security dependencies fail (unsafe), or use cross-site session cookies for direct Worker calls (unnecessary with the Pages proxy).
**Revisit when:** Public forms move to a different origin, participant-scoped quiz authorization is designed, remaining compatibility domains become concurrent/high-value, or an edge security policy can replace part of the application limiter without reducing coverage.

---

## ADR-025: Free Meetup Registration Without a Turnstile Dependency

**Date:** 2026-07-28
**Status:** Superseded by ADR-026.
**Context:** The registration browser bundle had a baked-in Turnstile site key while the registration API could run without `TURNSTILE_SECRET_KEY`. A visitor could therefore complete the visible human check successfully and then receive a server `503` because the two sides disagreed about whether verification was configured. Free monthly meetup registration is a low-volume name/email flow, and making an external challenge a hard prerequisite adds both friction and a third-party availability failure to the primary attendee action.
**Decision:** Do not use Turnstile on native free-event registration. Keep server-side schema validation, a best-effort twenty-attempt-per-ten-minute client network limit, one active registration per normalized campaign/email, atomic campaign locking and capacity allocation, server-only Supabase access, and RLS. Ignore obsolete Turnstile fields from a cached pre-change browser during rollout so mixed client/server versions do not fail valid registrations. Turnstile remains available for the separate feedback and volunteer flows.
**Trade-offs:** A distributed attacker can rotate network identities, and the in-process limit is scoped to a running server/Worker isolate rather than a globally durable counter. The database constraints still prevent duplicate-email amplification, but they do not stop a coordinated bot from using many unique addresses. Removing the challenge materially improves reliability and completion for the expected monthly-meetup traffic while accepting that stronger edge abuse controls may be required later.
**Alternatives considered:** Require matching Turnstile secrets in every environment (retains a hard external dependency and visible challenge), expose server verification configuration to the browser (prevents drift but keeps the same attendee friction), or remove all abuse controls (unacceptable because unique-address spam could consume capacity).
**Revisit when:** Registration spam affects capacity or email delivery, monthly traffic grows beyond the best-effort limiter, or a durable Cloudflare edge-rate-limit/challenge policy can be introduced without challenging every attendee.

---

## ADR-024: Native Event Creation and Relational Free Registration

**Date:** 2026-07-28
**Status:** Accepted; supersedes ADR-014 for active event creation.
**Context:** Public Luma page extraction is blocked from the deployed Cloudflare Worker, so an import-first workflow can no longer create events reliably. DevCongress also intends to move registration into the product instead of keeping Luma as the registration source of truth. Monthly meetups are free; the December 2026 conference will be paid, but its payment provider and reconciliation rules are not ready.
**Decision:** Make native organizer creation the only active event-creation path. One create command writes the classified `community_events` record and provisions a private draft registration campaign. Store campaigns, attendee identities, check-ins, and email delivery state in dedicated relational Supabase tables with RLS and server-only access. Allocate confirmed capacity atomically in Postgres; use a waitlist after capacity when enabled. Ask attendees only for name and email, and let organizers check in with those values instead of a QR or confirmation code. Save registration before attempting Resend delivery and retain failed/quota-limited confirmations in a retryable outbox. Keep the current public meetup `registration_url` field as an additive compatibility link to the internal form. Preserve historical Luma metadata and attendance imports as readable legacy records, but expose no active Luma preview/import API or UI. Defer payments behind a later paid-registration capability rather than mixing incomplete payment state into the free path.
**Trade-offs:** Event creation plus campaign provisioning uses an application command with compensating event deletion when campaign creation fails, rather than one cross-table RPC. Attendee identities now become first-party private data and require retention/access policy. Waitlists do not yet auto-promote. Email acceptance does not prove delivery, and free-tier quota delays are visible as queued delivery. Keeping `registration_url` preserves the public API but its values may point to historical external pages or the new internal form depending on the record.
**Alternatives considered:** Continue scraping public Luma pages (blocked and unreliable from the Worker), ask organizers to copy Luma fields manually (retains two sources of truth), retain external/no-registration modes (contradicts the decision to own registration), or build paid December checkout first (adds payment and refund risk before the free registration core is proven).
**Revisit when:** December paid registration begins, attendee cancellation/self-service is required, waitlist promotion becomes operationally important, or event/campaign creation moves into one database transaction.

---

## ADR-023: Unified Event Archive With Talk Compatibility Records

**Date:** 2026-07-27
**Status:** Accepted
**Context:** Organizers need one understandable destination for both talks and product demos. The earlier Program and Legacy Backfill labels split one outcome across workflow-specific screens, while the separate Speakers allowlist made it unclear whether a person row or a talk row was the lasting public record. July also needs a manual backfill path before the selected-proposal and email workflows are complete.
**Decision:** Call the organizer concept **Event Archive** and classify each item as `talk` or `product_demo`. Preserve the existing `Talk` storage, IDs, status lifecycle, `/talks` routes, and public field names as a compatibility model; old records without a kind resolve to `talk`. July manual **Archive Requests** and later selected-proposal completion both create the same compatibility record. Every one-time link is locked to its event, recipient identity, and item kind. Public-form completion creates an accepted or materials-received item but never publishes it; publication remains an explicit organizer action. Treat the Speakers allowlist as event-scoped identity/access only, not archive content. Extend the public API additively with `kind`, retaining existing response names and treating a missing kind as `talk`.
**Trade-offs:** Internal and public code temporarily retains talk-specific names for items that may be product demos, and the hosted Supabase `community_events` projection still cannot be assumed to include archive items held only in the compatibility store. This avoids a breaking migration now, gives organizers one workflow, and leaves room for a relational archive source later.
**Alternatives considered:** Keep Program and Legacy Backfill separate (preserves the conceptual duplication), make Speakers the archive source (conflates access with content), create a second product-demo store (duplicates status, intake, email, and publishing logic), or replace `/talks` immediately (breaks current data and public consumers).
**Revisit when:** The compatibility archive moves to relational Supabase persistence, `community_events` can join durable archive items, or a versioned public API can replace historical talk-specific names.

---

## ADR-022: Supabase-Only Organizer Authentication

**Date:** 2026-07-26
**Status:** Accepted
**Context:** The development-only shared-password fallback repeatedly appeared when a local restart selected `local-json` or incomplete Supabase configuration. That made a configuration mistake look like an intentional login method and silently created a synthetic owner identity with broader access than a named organizer should receive.
**Decision:** Remove shared-password organizer authentication, its cookie format, and its login endpoint. Every organizer-capable environment uses Supabase Google OAuth, the `admin_memberships` allowlist, and app-owned HTTP-only sessions. `/api/auth/session` reports whether the required Supabase auth configuration is present. Missing configuration fails closed and the login page shows a configuration error; it never grants a local owner session. Local JSON may remain a persistence adapter for non-auth prototype domains, but it does not select a different authentication mechanism.
**Trade-offs:** Local organizer development now requires network access to the configured Supabase project and a permitted Google account. Offline shared-owner testing is no longer available. In exchange, local and hosted identity, roles, task permissions, audit actors, and logout behavior use one security boundary.
**Alternatives considered:** Keep the fallback but hide its password field (the endpoint and synthetic owner would remain), make it opt-in through another environment flag (still preserves a downgrade path), or continue coupling auth to `APP_DATA_SOURCE` (recreates the recurring configuration bug).
**Revisit when:** A dedicated local Supabase stack provides equivalent Google/member/session behavior, or test-only authentication is introduced behind an isolated automated-test adapter that cannot run in normal app environments.

---

## ADR-020: Relational Annual Work Plan With Named Task Creation

**Date:** 2026-07-26
**Status:** Accepted
**Context:** The December 2026 conference was being tracked in a shared Excel file with inconsistent status labels, multiple names in one owner cell, dependencies buried in comments, and no durable multi-user edit history. Organizers want that workbook to be a one-time starting point, not an ongoing synchronization source. They also want broad task editing while keeping creation of new work controlled by one specifically named organizer.
**Decision:** Store annual editions and tasks in relational Supabase tables, scoped by edition, and seed the 26 non-empty 2026 spreadsheet rows once. Normalize tasks to exactly `not_started`, `in_progress`, `blocked`, and `done`. The first named spreadsheet owner is accountable and later names are collaborators; `All`, `TBD`, and blank owners import as unassigned. Treat 19 December 2026 as provisional. Every authenticated organizer may edit every task, but the server permits task creation only when the session email is `angelateyvi@gmail.com`. Keep finance outside this slice as a later restricted module, and do not add reminders. Use a local JSON adapter only when Supabase is not configured.
**Trade-offs:** The named-email creation rule is intentionally narrower than the existing owner role and must be changed deliberately if responsibility moves. Eleven imported tasks begin unassigned because the source workbook did not name a person. Every task edit now has a named Supabase organizer identity; no synthetic local owner can read or edit the plan. The one-time seed will not reflect later spreadsheet edits, which is intentional once the application becomes the source of truth.
**Alternatives considered:** Continue using Excel (no reliable multi-user application state or API authorization), synchronize the workbook indefinitely (creates two competing sources of truth), let every owner-role organizer add tasks (contradicts the named-organizer decision), or store the plan in `app_json_documents` (weaker constraints and reporting for a durable multi-user domain).
**Revisit when:** Task-creation responsibility moves to another organizer, finance is ready for its restricted capability model, reminders are requested, or future editions need a rollover/template workflow.

---

## ADR-019: Anonymous Event Feedback With Explicit Non-Attendance

**Date:** 2026-07-26
**Status:** Accepted
**Context:** Asking attendees for names and email addresses can turn feedback into a courtesy exercise instead of an honest signal. The current session-rating questions also force someone who arrived late or missed a session to choose a score, which incorrectly lowers or raises speaker ratings.
**Decision:** Event-feedback submissions are anonymous at the application data layer: the public form does not request identity, the API ignores any submitted identity, and new event-feedback records store no respondent email, page path, or user agent. Keep the existing random per-browser/event token only as a soft duplicate guard and store only its hash. Every session rating accepts exactly `1` through `5` or the separate `not_attended` sentinel. Generated session questions require one of those choices. Non-attendance is counted separately and is never included in rating averages. Organizer event-feedback views do not expose historical identity fields even when an older record contains them.
**Trade-offs:** Clearing browser storage or using another browser can bypass the soft duplicate guard, so it protects signal quality rather than proving one human submitted once. Infrastructure providers may still produce operational request logs outside the application database. Historical identity data is hidden from the organizer product but is not destructively erased by this change. The existing JSON answer column can store the sentinel, so no schema migration is required.
**Alternatives considered:** Keep optional identity fields (still discourages candour), require email solely for de-duplication (creates unnecessary personal data), encode non-attendance as zero (corrupts averages), or make every session rating optional with no reason (cannot distinguish a missed session from an abandoned question).
**Revisit when:** Feedback moves to a different public origin, formal research consent or retention requirements are introduced, or stronger abuse controls are needed without collecting identity.

---

## ADR-018: Preserve Volunteer Campaign Links and Data Through the Annual-Workspace Migration

**Date:** 2026-07-26
**Status:** Accepted
**Context:** The December 2026 volunteer form is already public at `/volunteer/december-mega-meetup`, submits through `/api/volunteer-applications`, and stores applications under the `december-mega-meetup` campaign ID. Moving volunteer operations into an annual-conference workspace and later into relational Supabase tables must not invalidate distributed links or hide existing applicants.
**Decision:** Keep the current public path as a compatibility route for the December 2026 campaign. If a new 2026 URL is introduced, both URLs resolve to the same edition/campaign and update one volunteer dataset. Preserve existing application IDs, contact data, and timestamps during relational migration. Move the organizer view under Annual Conference → December 2026 → Volunteers while keeping the current organizer route as a redirect or alias. Future annual editions receive distinct campaign IDs and links rather than repointing the 2026 route.
**Trade-offs:** The retained public path does not contain a year and therefore looks less canonical than a future edition-aware path. Keeping it is still safer than breaking already-shared URLs and QR codes. Supporting aliases adds a small routing obligation but prevents split volunteer tables and lost applications.
**Alternatives considered:** Replace the existing link immediately (breaks distributed links and QR codes), repoint the link to whichever annual campaign is active (old materials could submit to the wrong year), or create a new table without migrating existing records (loses the current intake history).
**Revisit when:** The public volunteer form moves to `devcongress.org`; the existing Events Management route should then redirect to the edition’s canonical public URL without changing the underlying campaign identity.

---

## ADR-017: Year-Round Operations With Independent Event Dimensions

**Date:** 2026-07-26
**Status:** Accepted
**Context:** DevCongress operations now span monthly and quarterly meetups, one-off official events, an annual December conference, multiple event-scoped participant roles, and a future moderated listing for events owned by outsiders. The earlier meetup-oriented categories and global role union cannot express those boundaries without conflating ownership, event format, programme series, review state, and access.
**Decision:** Treat Events Management as the year-round operational source of truth. Model event ownership, DevCongress series, format, submission source, moderation, and publication as independent dimensions. Model people separately from platform membership, event engagement, and work assignment. Treat the December conference as an annual series with yearly editions and give each active edition a first-class workspace inside the existing organizer console while regular event operations continue. Extend the existing public meetup API additively and validate the `devcongress.org` integration before adding external event submission and moderation. New durable multi-user domains use relational Supabase persistence. The complete operating rules are recorded in [DevCongress Product Operating Model](product-operating-model.md).
**Trade-offs:** The domain has more explicit entities and states than the current meetup prototype, and compatibility routes may retain meetup-specific naming while the broader model is introduced. In return, official and external events stay distinguishable, access can be scoped safely, annual operations can grow without isolated spreadsheets, and the public website can evolve without a breaking API replacement.
**Alternatives considered:** Keep expanding `monthly | quarterly | special` (would make `special` an ambiguous catch-all), create a separate December app (would fragment people, events, and reporting), give speakers and volunteers global roles (too much access and loses event context), or replace the public API immediately (unnecessary breakage for `devcongress.org`).
**Revisit when:** DevCongress co-owns external events, a breaking public API version is justified, a new event ownership model appears, or ticketing/sponsor finance creates a separate compliance boundary.

**Implementation note (2026-07-28):** Native event creation and editing now expose **None of these** as a deliberate series choice. It persists as `series_type = null`, remains filterable as **None of these**, and is returned as `null` by the public API; it is not rewritten to `special` or inferred as `monthly`.

---

## ADR-016: Campaign-Scoped Volunteer Intake In Existing Shared Documents

**Date:** 2026-07-25
**Status:** Active transitional implementation; the relational-workflow revisit trigger was reached on 2026-07-26.
**Why:** The December Mega Meetup needs a fast public volunteer form and a private organizer review surface without creating a new production schema dependency during event preparation. The app already has a Supabase-backed `app_json_documents` compatibility store for cross-instance JSON domains, so the campaign records live there under the `volunteer-applications` key when server-side Supabase is configured. This keeps deployed submissions durable while preserving the local JSON fallback used by the rest of the compatibility layer.
**Tradeoffs:** This is deliberately limited to one campaign and does not provide relational reporting, database-level uniqueness, or a long-term volunteer CRM. The server protects it with one application per campaign/email, mandatory production Turnstile, and atomic cross-Worker per-client rate limiting; a future multi-event volunteer workflow should move to dedicated relational Supabase tables with database constraints.
**Alternatives considered:** Add a new Supabase table immediately (more migration and rollout coordination than the December drive needs), keep applications only in the Worker filesystem (not durable across instances), or use a third-party form (loses the existing organizer console and QR-display experience).
**Revisit when:** More than one volunteer campaign is active, volunteer assignments/communications are added, or reporting needs to join volunteers to events and organizer actions.

---

## ADR-015: Supabase Records With Resend Speaker-Link Delivery

**Date:** 2026-07-25
**Status:** Accepted; program-based multi-send implemented 2026-07-27.
**Why:** Speaker archive/backfill and selected-speaker links need a branded, low-friction delivery channel without adopting a paid Cloudflare Email Sending plan. Supabase remains the durable system of record for link and delivery metadata, while Resend handles transactional delivery on its free tier. The existing authenticated Hono Worker will call Resend server-side so delivery authorization stays alongside the speaker-link lifecycle.
**Decision:** Resolve presenter name, title, kind, and event on the server from the stored program row. For the one-off July backfill, accept and validate an organizer-entered email per selected row because the program outline does not store addresses; keep that address on the private request record without writing it back into the program or speaker allowlist. Later CFP-driven sends use the proposal's stored address. Send personalized messages through Resend Batch and store pending/accepted/failed metadata with the existing compatibility links. Use a deterministic idempotency key and suppress accepted program identities in both the API and organizer multi-select. Keep private URLs behind a branded HTML call-to-action rather than introducing a third-party shortener. Treat Resend acceptance as a successful send request, not proof of inbox delivery.
**Tradeoffs:** This introduces one external delivery provider and a server-only API key. The free tier has daily and monthly limits. The current whole-document compatibility store provides weaker cross-isolate concurrency guarantees than a relational table, and provider delivery/bounce truth is unavailable until verified webhooks are added. Email is not proof that a recipient read or completed the form; the strongest business signal remains one-time form completion.
**Alternatives considered:** Cloudflare Email Sending (not chosen because it requires Workers Paid for outbound production delivery), Supabase's default mailer (not suitable for production speaker mail because of authorization and rate limits), or manual copy/paste only (remains available, but does not provide delivery auditability).
**Revisit when:** Sending volume approaches the Resend free-tier limit, bulk reminders are required, or the link store moves from JSON compatibility data to hash-only Supabase records.

---

## ADR-014: Read-Only Luma Event Import

**Date:** 2026-06-17
**Status:** Superseded by ADR-024 on 2026-07-28. Historical imported rows and attendance files remain readable.
**Why:** Organizers already create DevCongress meetups in Luma, so the app should avoid duplicate manual entry while preserving Luma as the source of truth for registration. A read-only import from Luma into Supabase `community_events` gives the organizer console the event shell it needs for website publishing, checklists, talks, feedback, media, and attendance without trying to manage Luma itself.
**Tradeoffs:** The import reads public Luma event pages instead of the Plus-only Luma API, so it can only import fields Luma exposes in page metadata. Supabase-backed events are still required because local JSON fallback cannot deduplicate external records safely. Imported data is a snapshot, so later Luma edits will not automatically appear until a refresh/sync feature is added.
**Alternatives considered:** Creating Luma events from DevCon-Comm (rejected because organizers prefer Luma as the event-registration tool), requiring Luma Plus API keys (rejected because the project is not paying for Luma Plus), or full automatic sync/webhooks now (larger operational surface before the import mapping is proven).
**Revisit when:** The import mapping is trusted and organizers ask for `Refresh from Luma`; start with manual diff-based refresh before considering webhooks or automatic sync.

---

## ADR-013: Supabase Admin Auth With App-Owned Sessions

**Date:** 2026-06-16
**Why:** Organizer access needs per-admin identity, role checks, and auditability before hosted use. Supabase Auth already fits the production data plan, while Hono-owned HTTP-only sessions preserve the same-origin cookie contract and avoid storing Supabase tokens in the browser.
**Tradeoffs:** The app now owns session rows and organizer membership checks, so auth is more code than the prototype password. The development shared-password fallback described by this decision was removed by ADR-022.
**Alternatives considered:** Keep the shared password (too weak for hosted admin workflows), use Cloudflare Access only (good outer gate, but not enough for API-level roles and audit logs), or store Supabase browser sessions directly (higher XSS blast radius and weaker same-origin control).
**Revisit when:** Owner MFA is enforced, Cloudflare Access is added as an outer production gate, or Supabase Auth custom claims become the source of role truth.

## ADR-012: Explicit Quiz Phase Advance Command

**Date:** 2026-06-15
**Why:** Quiz polling still needs server-authoritative phase transitions, but mutating the session inside `GET /api/quiz/state` made a read endpoint perform hidden writes. Moving the transition check behind `POST /api/quiz/state/advance` keeps polling behavior working while making the mutation explicit and easier to replace later with a job, Durable Object, or realtime state machine.
**Tradeoffs:** Polling clients now make one extra request before reading state, and any client that forgets the advance call may see stale `answering` state until another client advances it. This is still a prototype-era bridge, not the final realtime architecture.
**Alternatives considered:** Keep GET mutation (simple but misleading), move immediately to Supabase Realtime or Durable Objects (larger deployment decision than this debt slice), or require organizer-only manual advancement (worse live-game UX).
**Revisit when:** Quiz returns to phase-one scope or the app chooses a production realtime host.

---

## ADR-011: Supabase Community Events As The Website Data Source

**Date:** 2026-06-15
**Why:** The meetup app needs to own event CRUD and expose a stable endpoint that `devcongress.org` can consume later. Modeling the Supabase `community_events` table after the current Astro meetup collection lets the app seed existing website content, preserve the website schema shape, and prove the E2E path before editing the Astro repo.
**Tradeoffs:** The app now has a Supabase-backed event source while some related organizer workflows still use JSON-backed prototype stores. This keeps phase-one scope focused on event publishing and public API integration, but speaker/talk enrichment will need a later persistence pass if the website should consume fully dynamic schedules and speaker profiles.
**Alternatives considered:** Editing the Astro website repo first (rejected until the API is tested locally), moving the whole meetup section into Astro now (premature before persistence is stable), or keeping JSON as the source of truth (not deploy-safe for cross-app consumption).
**Revisit when:** Supabase becomes the only source of truth for talks, speakers, attendance, and feedback, or when the app moves behind a dedicated subdomain.

---

## ADR-010: Align Public App Surfaces With DevCongress.org Light Theme

**Date:** 2026-06-13
**Why:** The meetup product is being integrated into `devcongress.org`, so public-facing app surfaces should feel like a direct continuation of the main website rather than a separate dark event-ops tool. Use the `.org` light theme as the visual baseline: warm cream page backgrounds, black ink text, DevCongress yellow, and pink accent moments.
**Tradeoffs:** This moves away from the current dark operational identity and will require a focused token pass across Tailwind, CSS variables, and JS-side design tokens. Organizer-heavy views can still use density and restrained surfaces, but should inherit the light brand system unless a specific workflow needs a darker control room mode later.
**Alternatives considered:** Keeping a dark companion theme for the app (cohesive internally, but too separate from the website for Phase 1 integration), or switching the whole app to Astro now (premature before the API/data contract is stable).
**Revisit when:** The app is hosted as a subdomain or separate product surface; at that point, decide whether organizer/admin views need a distinct dark mode while public meetup pages stay aligned with `devcongress.org`.

---

## ADR-009: Lightweight Route Feedback Without Supabase Sessions

**Date:** 2026-05-30
**Why:** Testers should be able to submit route-level feedback quickly during app testing without account creation, magic links, or session state. A typed name plus Anonymous option is enough context for this feedback loop and avoids blocking early product iteration on auth design.
**Tradeoffs:** Tester identity is not cryptographically verified, so someone can submit feedback under any typed display name. This is acceptable for a small trusted testing group, but not for production abuse-resistant reporting.
**Alternatives considered:** Supabase Auth sessions for testers (too much friction for the current testing loop), a curated tester-name dropdown (too rigid once anonymous feedback is allowed), external forms (fast but lose app route/browser context).
**Revisit when:** Feedback is opened beyond a trusted tester group, or when the app's broader Supabase Auth model is introduced.

---

## ADR-008: Same-Origin Prototype Admin Session

**Date:** 2026-05-29
**Status:** Superseded by ADR-013 for hosted admin auth.
**Why:** The Vue/Bun migration must keep UI and API on one origin so future cookie auth does not require cross-origin workarounds. A small Hono cookie session now protects organizer routes and mutating admin APIs while keeping speaker/player flows public.
**Tradeoffs:** This is still prototype auth: one shared admin password, JSON data, no roles, no password reset, and local defaults for development. It is enough to prevent accidental public admin mutations during product work, but not production-ready.
**Alternatives considered:** Shipping all admin endpoints open until Supabase (too risky for continued iteration), adding a second auth/API server (rejected because same-origin auth is a project constraint), integrating Supabase Auth now (correct long term, too much infrastructure for this migration checkpoint).
**Revisit when:** Reviewing the local development fallback; hosted auth now uses Supabase email OTP and per-admin memberships.

---

## ADR-007: Vue/Vite Frontend with Single Bun/Hono Server

**Date:** 2026-05-29
**Why:** The app needs to move off Next.js while preserving one same-origin server for future cookie/session auth. Vue 3 + Vite gives a fast SPA migration path; Hono provides fetch-native API handlers; Bun serves the production build and API from one port. pnpm is now the dependency manager.
**Tradeoffs:** The old Next implementation remains as legacy reference during migration, so the repo temporarily contains two app shapes. The active Vue route surface is still thin and must be ported route-by-route.
**Alternatives considered:** Vite frontend and separate API dev server (rejected because auth would cross origins/ports), Nuxt (more framework than needed at this stage), keeping Next.js (conflicts with requested Vue migration).
**Revisit when:** SSR becomes a firm product requirement, or Supabase auth/realtime integration exposes a server capability that the Bun/Hono setup cannot support cleanly.

---

## ADR-001: JSON Flat Files Instead of Supabase

**Date:** 2025-02
**Why:** Allows building and testing the full feature set (event lifecycle, CFP, quiz, leaderboard) without provisioning Supabase infrastructure. The `readData<T>` / `writeData<T>` API surface closely mirrors what Supabase client calls will look like, making the swap mechanical.
**Tradeoffs:** No relational integrity, no concurrent multi-process safety (write queue only guards within a single Node process), no auth, data resets require re-seeding.
**Alternatives considered:** SQLite via `better-sqlite3` (more robust, but still not production Supabase), Supabase from day one (adds config/env overhead before core UX is validated).

---

## ADR-002: Polling Instead of WebSockets for Quiz Real-time

**Date:** 2025-02
**Why:** Simpler to implement without a live Supabase Realtime connection. At 1500ms intervals, transitions (5s reveal phase, 5s scoreboard phase) are long enough to absorb the polling lag without visible UX degradation.
**Tradeoffs:** Higher request volume per client; 0–1.5s lag on state transitions; doesn't scale to hundreds of concurrent players.
**Alternatives considered:** Supabase Realtime (target for production), Server-Sent Events (simpler than WebSockets but still needs persistent connections, unnecessary for prototype).

---

## ADR-003: Server-Driven Phase Transitions via GET Mutation

**Date:** 2025-02
**Status:** Superseded by ADR-012 for the active Vue/Hono app.
**Why:** Centralizing timing on the server means all clients converge to the same phase without requiring them to coordinate or agree on clock time. The GET handler checks elapsed time on each poll and mutates the session if a transition is due.
**Tradeoffs:** Breaks the HTTP convention of idempotent GETs; only safe because there's a single Node process. In production this would be a DB trigger, a Supabase Edge Function, or a cron job.
**Alternatives considered:** Client-driven transitions (admin clicks "next" for each phase — simpler but requires manual pacing), cron job / background worker (correct but out of scope for prototype).

---

## ADR-004: Simulated Auth via Zustand + localStorage

**Date:** 2025-02
**Why:** Unblocks all UI development without wiring Supabase Auth. Role and speaker identity are stored client-side and can be switched in the UI — useful for testing multiple personas in one browser.
**Tradeoffs:** Zero security — any user can DevTools their way to admin. No server-side enforcement.
**Alternatives considered:** Supabase Auth from day one (correct, but adds magic-link setup, session management, and middleware before core features are working).
**Exit criteria:** Replace with Supabase Auth: email/password for admin, magic link for speakers, anonymous auth for players.

---

## ADR-005: Single Next.js App for Both Admin and Public UIs

**Date:** 2025-02
**Why:** At this scale, splitting into two apps adds deployment and code-sharing complexity with no benefit. Route groups `(public)` and `(admin)` give clean URL separation without a separate codebase.
**Tradeoffs:** Admin routes are only guarded client-side. A Next.js middleware guard (`middleware.ts`) would be needed before production to enforce server-side role checks.
**Alternatives considered:** Separate Next.js app for admin (unnecessary complexity for a single-team prototype).

---

## ADR-006: Design Tokens in Both Tailwind Config and JS Module

**Date:** 2025-02
**Why:** Tailwind utility classes are needed in JSX for static styles; JS constants are needed for programmatic style generation (`getStatusBadge`, quiz answer colors). Both sources must exist.
**Tradeoffs:** Two sources of truth — `tailwind.config.ts` and `lib/design-system.ts` must be kept in sync manually.
**Alternatives considered:** CSS variables only (would require runtime JS to read them, awkward); Tailwind `theme()` function in JS (not natively supported without PostCSS at runtime).
