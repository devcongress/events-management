# Changelog

## 2026-08-09 — Decoupled Annual Conference speakers from Events

- Replaced the hidden Annual Conference backing Event with edition-owned Call for Speakers state, proposals, secure presenter links, and confirmed conference sessions.
- Kept the monthly speaker workflow unchanged; conference proposals, reviews, and archive materials now remain exclusively inside their Annual Conference edition.
- Added forward-only migration `20260809110000_annual_conference_speaker_scope.sql`, which migrates existing conference speaker records before removing the obsolete private Event bridge.

## 2026-08-09 — Protected transactional email capacity from event blasts

- Added a quota-aware blast preflight that subtracts queued transactional work and a configurable daily reserve from Resend's latest observed capacity.
- Immediate blasts that would consume the protected capacity are saved as **Needs email capacity** without contacting the provider; the Blasts workspace now shows safe-today capacity and directs organizers to schedule the update instead.
- Added the same owner-only allocation equation and recent broadcast state history to Audit Log → Email delivery, keeping provider acceptance distinct from inbox delivery.

## 2026-08-09 — Reviewed updates for approved community listings

- Replaced receipt-email correspondence for public community submissions with an on-page confirmation, reducing repeated-submission email consumption.
- Approved organizers now receive a private, revocable management link for schedule, venue, online-link, and registration-link amendments; each submitted amendment remains pending until an organizer accepts or declines it.
- Organizers can copy the existing active management link from an approved submission without sending email or spending quota; copies are audit-recorded without storing the bearer URL, and links close at the canonical event end time.
- Added amendment review in the existing EMS submission drawer, transactional canonical-event updates, durable decision emails, and forward-only migrations `20260809100000_reviewed_event_amendments.sql` and `20260809103000_event_submission_management_links_expire_at_event_end.sql`.

## 2026-08-08 — Shared pagination across organizer workspaces

- Added one accessible Previous / Page / Next pagination component, with a quiet full-width footer and automatic hiding when a result fits on one page.
- Replaced the divergent pagination controls in events, attendance, People & Access, audit activity and email delivery, annual-conference work planning and timeline gaps, and the public leaderboard.
- Added the same bounded queue to conference speaker proposals so a larger Call for Speakers stays easy to review without changing the existing status filters.

## 2026-08-09 — Standardized organizer detail drawers

- Made desktop review and detail drawers consistently 48rem wide across community submissions, talks, Annual Conference tasks and speakers, finance, People & Access, and Audit Log.
- Kept narrow dialogs, bottom sheets, and mobile full-screen workflows unchanged; detail drawers still fill the available viewport on small screens.

## 2026-08-09 — Made Slack submission alerts open the exact review record

- Slack notifications for new community submissions, inbound replies, and Slack retries now link to the specific EMS submission.
- Opening that link selects the matching queue state and opens the existing review drawer; closing it removes the deep-link parameter without changing the submission.

## 2026-08-09 — Refined the Annual Conference speaker review queue

- Replaced large proposal cards and status tiles with one compact directory table: its Review queue header has a live Pending-button counter, default Pending view, and clear Approved and Rejected filters; rows use compact status icons for faster scanning.
- Made table rows open a focused right-side proposal drawer, where authorized organizers review the full submission and approve or reject it.
- Removed the browser-only sample queue and all fabricated speaker proposals, so the workspace renders only persisted conference submissions.

## 2026-08-08 — Separated monthly and Annual Conference Calls for Speakers

- Added short public Call for Speakers routes for monthly events and Annual Conference editions, with one concise first-submission form.
- Kept monthly proposals in each Event's Talks review and added an Annual Conference Speakers workspace so the queues never mix.
- Reused the existing selected-speaker secure follow-up lifecycle through a private programme Event per conference edition; it is excluded from public event feeds.
- Added organizer-only conference speaker capabilities, Call open/close controls, proposal selection, and audited state changes.
- Added forward-only migration `20260808180000_annual_conference_speaker_calls.sql` for the edition-to-programme relationship and speaker-query index.

## 2026-08-08 — Made annual-conference workload visible at a glance

- Removed the standalone Volunteer Intake callout from the Annual Conference Overview.
- Added a compact, clickable **Completion by assignee** view for Owners and Organizers, grouped by accountable owner and ordered by pending workload with completed-versus-total task progress.
- Selecting a person opens Work plan filtered to their owner value across the full conference; matching legacy aliases resolve through the active member directory.
- Kept volunteer sessions assignment-only: they do not fetch or render the team-wide workload summary.

## 2026-08-08 — Condensed Community submissions rows

- Removed proposal summaries from the review queue so each event occupies a single compact scan row; full proposal context remains in the existing right-side drawer.
- Replaced in-row status text with accessible status icons while keeping each icon's status available on hover and to screen readers; the queue toolbar now contains only its count and filters.

## 2026-08-08 — Added owner-facing email delivery health to the Audit Log

- Added icon-led **Activity** and **Email delivery** Audit Log sections, keeping daily Resend capacity, monthly plan capacity, recoverable outbox work, and a compact, paginated accepted/queued/failed history for registration, community-listing, and speaker-archive messages in one focused delivery view. Delivery rows use a concise date stamp and status icons, with a clear legend above the log.
- Tightened the Audit Log header so its supporting copy and divider form one compact visual unit before the section tabs.
- Simplified Activity into concise, selectable rows and moved record IDs, metadata, target details, and request context into an accessible right-side audit drawer.
- Tightened Activity rows into a compact, single-line scan path and separated the actor role into an icon-led column, leaving email and action as distinct readable columns.
- Kept the shared Annual Conference workspace navigation visible while desktop users scroll through Overview, Work plan, Timeline, Volunteers, or Finance; mobile keeps its existing horizontal-scroll treatment.
- Removed the app-wide loading-shell clipping and aligned shared skeleton headers with the loaded editorial layout; the Audit Log skeleton now mirrors its current tabs, filters, and four-column activity table. Replaced the remaining generic loading blocks in Community submissions, Registration, Monthly finance, and System Design with matching route previews.
- Captured Resend quota headers after accepted transactional sends and added a system audit row only when capacity crosses a warning threshold, avoiding noisy per-email audit entries.
- Added the private singleton health record and documented the optional quota-limit settings, with an explicit distinction between provider acceptance and future delivery/bounce webhook evidence.

## 2026-08-08 — Added presenter follow-up for missing archive materials

- Owners can select missing abstracts, bios, and resource links in an archive preview and email the presenter a secure one-time update link.
- The presenter updates the existing archive record only, preserving publication state and preventing duplicate Talks; unrequested fields are rejected server-side.
- Added durable delivery, retry, expiry, and completion history to the existing private-link model, plus Owner-versus-Organizer and existing-record regression coverage.
- Added forward-only migration `20260808150000_archive_materials_follow_up.sql` for the target-record binding and requested-field contract.

## 2026-08-08 — Let Owners remove an archive item from public visibility

- Added an **Unpublish** action to the published archive-item preview for Owners only.
- Restores items with a resource link to **Resource received**, otherwise **Ready to publish**, so they leave public endpoints without being excluded or losing their stored details.
- Enforced the same rule on the server, recorded unpublishing separately in the audit log, and added Owner-versus-Organizer regression coverage.

## 2026-08-08 — Refreshed production posture and technical-debt documentation

- Updated the README to describe the deployed Cloudflare/Supabase path accurately while keeping compatibility-storage and operations limits explicit.
- Reframed the active technical-debt register around evidence, impact, exit criteria, and ownership between repository and platform operations; retained the previous register as historical provenance.
- Corrected the migration status: both hardening migrations are applied, and future scale/observability work is documented as optional evolution rather than open implementation debt.

## 2026-08-08 — Hardened concurrent Conference and shared-data writes

- Added a forward-only integrity migration: receipt recording is idempotent, active-owner and membership/grant eligibility rules are enforced in PostgreSQL, and task dependency / phase scheduling validation serializes concurrent edits.
- Added versioned compare-and-swap storage for the remaining shared JSON documents, so a competing hosted write reports a refresh-and-retry conflict instead of silently replacing newer data.
- Kept inbound Resend webhook bodies under the public-write size cap before raw-body signature verification.
- Batched the Monthly Feedback hub's hosted campaign, question, and submission reads; recorded immutable question snapshots for submissions; and blocked question-set replacement after public responses exist.
- Returned registration success immediately after persistence while confirmation email delivery continues through the Worker lifetime, and stopped hidden or overlapping System Design polling.
- Changed the Monthly Attendance overview into a summary/read-model response: historical raw CSV rows remain event-scoped while the overview receives only aggregates and compact repeat-attendee trails.
- Moved Event Overview and Talks onto the shared event/checklist query keys already used by persistent workspace navigation, removing duplicate tab-load reads.

## 2026-08-08 — Made Annual Conference task dependencies actionable

- Replaced the Annual Conference task form's free-text **Dependency** and **Internal note** fields with explicit **Depends on** prerequisite-task links.
- Validated every link at the service boundary, rejecting duplicate, self-referential, cross-edition, and circular task chains while preserving legacy note data without guessing its meaning.
- Added the Overview **Dependency pulse** with a concise status summary, link/waiting/ready totals, and direct prerequisite-to-downstream paths.

## 2026-08-08 — Removed the duplicate Annual Conference section divider

- Removed the Overview page's redundant black-and-pink masthead divider beneath the Annual Conference navigation.
- Kept the shared navigation's active tab underline as the single section indicator.

## 2026-08-08 — Aligned Annual Conference navigation with Registration

- Replaced the boxed Annual Conference section buttons with the Registration workspace's icon-led, underline tab treatment.
- Preserved capability-aware links and routes while adding a mobile horizontal scroll affordance, focus treatment, and reduced-motion-safe press feedback.

## 2026-08-08 — Kept People & Access action failures non-blocking

- Moved People & Access validation and update failures into the shared dismissible app toast, so a failed delegation or role update does not take over the page layout.
- Kept directory-load failures inline because the page content itself may be incomplete in that state.
- Removed the static Access levels explainer so People & Access stays focused on the team directory and editable access controls.

## 2026-08-08 — Made Annual Conference income commitments auditable

- Kept the existing edition-specific **Finance** access toggle in People & Access as the Owner-controlled, Organizer-view-only finance boundary.
- Added a manual-income lifecycle: Owners can amend a GHS expectation with a reason, record partial receipts, or cancel an unpaid expectation with a reason.
- Preserved the original commitment, revision/cancellation history, receipts, received total, and outstanding balance instead of overwriting expected income.
- Reserved source-linked finance records for future ticketing and sponsorship integrations, keeping derived revenue read-only in Finance to prevent double counting.

## 2026-08-08 — Standardized community-event review criteria

- Added a compact, four-point **Before you decide** checklist above pending-submission actions so every reviewer considers community fit, event clarity, credibility, and calendar value before approving or rejecting a listing.

## 2026-08-08 — Made talk review and archive records inspectable

- Added an explicit right-side **Review proposal** drawer with the complete abstract, presenter bio, topic, contact details, and submission time before an organizer can select or decline a presenter.
- Added the same full-record preview to **Talks Archive**, including already published talks and product demos, so organizers can always inspect the submitted content after review.
- Moved archive status actions into the preview drawer to make content review precede acceptance, publication, exclusion, or a resource reminder.
- Added regression coverage that selected-speaker archive records retain the original proposal title, topic, abstract, bio, and presenter identity.

## 2026-08-08 — Made failed submission-reply Slack alerts actionable

- Preserved Slack's bounded HTTP rejection detail with each captured organizer reply instead of showing an unexplained **Slack failed** state.
- Added an Organizer-only **Retry Slack** action for one saved reply; retries are audited and do not reprocess the inbound email.
- Kept Slack best-effort: a failed retry preserves the EMS reply and its latest safe failure reason.
- Updated the reply count badge to the app pink token with white text.
- Made new organizer replies the primary reading surface and moved cleaned quoted originals into an optional **Original email** disclosure.

2026-08-07 — Fixed signed submission Reply-To delivery

- Replaced oversized signed Reply-To local parts with a compact 120-bit HMAC format that Resend accepts.
- Kept compatibility for replies addressed to the prior token format.
- Made each submission-email retry button show its own retry state instead of marking every failed delivery as retrying.

2026-08-07 — Unified reply routing and exposed safe provider details

- Pointed speaker, registration, event-blast, and community-submission Reply-To configuration at `updates.devcongress.org`.
- Preserved the email provider's bounded rejection reason so organizers can see which sender or recipient detail needs correction.

## 2026-08-07 — Preserved email failure reasons on retry

- Returned the classified provider failure from the email retry endpoint so the organizer toast explains the same actionable reason shown in the delivery row instead of only displaying `Request failed: 502`.

## 2026-08-07 — Events channel announcements

- Added an optional server-only Slack webhook for the `#events` channel.
- Published organizer-created events and approved public-submission events now post a compact event card with a link to the public event page.
- Slack delivery is best-effort: an unavailable webhook is logged without failing or rolling back event publication.

## 2026-08-07 — Refined the community-submission review drawer

- Reorganized proposal details into a calm, responsive review card with a clearer event summary, schedule, location, submitter, and supporting links.
- Replaced repeated pink section labels with the app's neutral surface, text, border, success, and destructive tokens; destructive styling is confined to actual failure or rejection states.
- Kept delivery retry, captured replies, rejection context, and the sticky approve/reject workflow intact while making supporting information easier to scan; the decision controls now reuse the app's shared action primitives.
- Classified receipt and decision-email failures into actionable provider categories so organizers can distinguish quota, configuration, invalid-request, outage, and connectivity problems.

## 2026-08-07 — Routed new submissions into the review channel

- New public event submissions now post a bounded review card to the same private Slack channel used for submission replies.
- Slack delivery remains best-effort and does not change the existing `202 Accepted` intake behavior.

## 2026-08-07 — Routed community-submission replies into EMS and Slack

- Added signed, submission-specific Reply-To addresses for new community-submission emails, preserving the existing mailbox fallback until Resend receiving is configured.
- Added a signature-checked, idempotent Resend `email.received` webhook that retrieves and stores sanitized organizer replies in Supabase and displays them in the EMS submission drawer.
- Added optional Slack incoming-webhook notifications with bounded reply excerpts and explicit Slack pending/sent/failed state; EMS remains the source of truth when Slack is unavailable.
- Added the reply table migration, environment reference, provider setup checklist, and architectural decision record.

## 2026-08-07 — Fixed the router bootstrap deadlock

- Started the initial Vue Router navigation before awaiting readiness, so local and deployed app loads now mount the organizer login/workspace or the appropriate public shell instead of leaving the static boot screen visible indefinitely.

## 2026-08-07 — Split public and organizer loading shells

- Added a separate `PublicApp` root so registration, CFP, feedback, speaker-intake, volunteer, and System Design participant links do not instantiate the organizer shell or organizer session bootstrap.
- Added route-specific first-paint skeletons for each public link family, with the Cloudflare Pages worker, Bun fallback, Hono fallback, and Vite dev shell selecting the same variant before Vue mounts.
- Replaced the registration blank loading card, speaker-intake CFP-shaped loader, and System Design spinner with page-shaped public skeletons while preserving existing API, route, and authorization behavior.

## 2026-08-06 — Clarified talks navigation labels

- Renamed the event-level Archive tab to **Talks**.
- Renamed the proposal review tab to **Talks review** and the confirmed-talks tab to **Talks Archive**.

## 2026-08-06 — Kept the CFP introduction on one desktop line

- Removed the overly narrow width cap from the CFP description so it stays one line on wider screens while remaining responsive on phones.

## 2026-08-06 — Added a simple CFP introduction

- Added a concise description below the event details to clarify what speakers can share through the Call for Presentations form.

## 2026-08-06 — Simplified the Call for Presentations form

- Removed the event-description card from the public speaker proposal form so the page moves directly from the event heading into the proposal fields.

## 2026-08-06 — Centered CFP verification and submission actions

- Placed the Cloudflare Turnstile check and **Submit proposal** action in one centered responsive row on wider screens.
- Kept the controls stacked and centered on narrow screens so the proposal form remains usable on phones.

## 2026-08-06 — Aligned monthly finance drawer fields

- Kept the monthly expense form in consistent two-column pairs for Category/Status and Amount/Date.
- Matched the Date picker’s field height and border weight to the Amount input while preserving the stacked mobile layout.

## 2026-08-06 — Added a shared monthly finance category catalog

- Kept monthly meetup categories independent from the Annual Conference finance taxonomy.
- Added a shared monthly category catalog so a category created for one meetup can be reused in every other monthly meetup.
- Added secure Owner/Organizer category creation with validation, persistence, audit coverage, and legacy-category preservation.

## 2026-08-06 — Removed the registration title divider

- Removed the horizontal divider between the public event title and its `When / Where` details while preserving the existing metadata spacing and responsive layout.

## 2026-08-06 — Restricted test guest removal to Owners

- Hid the local-only **Remove test guest** control from Organizers and Volunteers.
- Restricted the delete route at the server authorization boundary to Owner sessions while retaining the development/test runtime gate.
- Added authorization coverage so non-Owners cannot permanently delete registrations or linked delivery/check-in data.

## 2026-08-06 — Gave desktop registration titles room to breathe

- Widened the desktop event-information side of the registration split and kept the RSVP panel as the focused action column.
- Let meetup titles wrap naturally on desktop instead of clipping them with a line clamp; mobile keeps a compact two-line limit for scanability.
- Added safe long-word wrapping so unusually long event names cannot push the registration page sideways.

## 2026-08-06 — Truncated long event preview labels

- Kept preview-card event names on one line with an ellipsis while preserving the full value in the underlying event and a hover title.
- Applied the same constrained, one-line treatment to long venue labels so preview cards stay within their layout instead of widening or overflowing.
- Matched the public website’s event and meetup list cards to the same title and venue behavior.

## 2026-08-06 — Added mistaken-check-in undo and hardened registration cancellation

- Added a confirmed-guest **Undo check-in** action to the desktop guest list and phone check-in screen; it removes only the check-in record and leaves the registration active.
- Protected the undo mutation at the Owner/Organizer API boundary and added an independent audit action plus local/Supabase persistence coverage.
- Moved cancellation auditing before promotion-email follow-up and kept a persisted cancellation successful when that non-critical follow-up path is temporarily unavailable.

## 2026-08-06 — Added on-site registration QR display

- Added a protected QR display that opens the existing public registration form for walk-in guests without creating a second registration flow.
- Added **Show QR code** to the registration overview and **Show registration QR** to the phone Events workspace, with a direct-form and copy-link fallback.
- Kept the public form’s existing validation, capacity, waitlist, duplicate-email, and confirmation behavior unchanged.

## 2026-08-06 — Made monthly finance editable by Owners and Organizers

- Monthly finance is now available to every Owner and Organizer across all monthly meetups.
- Both Owners and Organizers can add monthly expenses; Volunteers remain excluded.
- Removed the redundant named-viewer selector and its access-grant persistence/API layer; Volunteers remain excluded at the route and server boundaries.

## 2026-08-06 — Removed test decoration from real organizer events

- Organizer-created events now retain their real names even when the legacy test-mode variable is present.
- Existing `[TEST]` records remain identifiable for the cleanup workflow; public-submission discovery continues to use its independent source and launch gates.

## 2026-08-06 — Added monthly meetup actual-expense finance

- Added an Owner/Organizer Finance tab for monthly meetup events with a dedicated GHS ledger for actual expenses incurred during that meetup.
- Kept budget lines out of the monthly workflow; the summary shows actual spend, paid, unpaid, cancelled, and category totals instead.
- Added a right-side Add expense drawer using the shared compact date picker, protected API routes, audit events, Supabase persistence, and a local JSON fallback.

## 2026-08-06 — Matched Finance header action buttons

- Aligned the Add budget line and Add record actions to the same height, width rhythm, border treatment, focus state, and press behavior while retaining their secondary/primary visual hierarchy.

## 2026-08-06 — Moved Finance owner actions into a drawer

- Replaced the always-visible budget and financial-record forms with compact header actions that open the relevant form in a right-side Owner action drawer.
- Preserved focus restoration, Escape/backdrop dismissal, background interaction locking, reduced-motion handling, and the existing mutation contracts.

## 2026-08-06 — Fixed Finance notes field sizing

- Disabled manual resizing on the Finance notes field so the form keeps a stable layout.

## 2026-08-06 — Finance date field uses the shared app picker

- Replaced the Finance form’s native browser date input with the shared compact app-centric date picker, so finance now gets the same capped calendar popover, `DD/MM/YYYY` display, and keyboard behavior as the rest of the organizer console.

## 2026-08-06 — Compact app-centric date picker

- Reworked the shared calendar popover into a quieter, compact app surface capped at 344px instead of letting wide form fields dictate its size.
- Switched the calendar to Monday-first weeks, numeric `DD/MM/YYYY` field values, lighter navigation chrome, and tighter day/footer controls to match the supplied reference while preserving keyboard navigation and viewport-aware placement.

## 2026-08-05 — Added restricted Annual Conference finance workspace

- Added an edition-scoped GHS Finance workspace with separate budget lines, expense records, income records, and dashboard totals for planned, committed, paid, remaining, unpaid committed, and received income.
- Added relational Supabase finance tables with service-role-only access, RLS enabled, explicit GHS currency constraints, integer minor-unit amounts, and a local JSON adapter for development.
- Added Owner-only finance record creation with explicit expense/income states and audit events, while keeping financial data out of public event responses.
- Added the finance.view capability so Owners can grant read-only finance visibility to selected active Organizers per conference edition; Volunteers remain ineligible.
- Added a protected Annual Conference Finance route, navigation link, People & Access controls, empty states, category variance table, and recent-record ledger.
- Deferred receipts, reimbursements, approval thresholds, payment-provider integrations, reconciliation, and multi-currency support to a later finance workflow slice.

## 2026-08-05 — Volunteer intake and display refinement

- Refined the standalone volunteer intake into a calmer, more legible two-column sign-up flow with a concise **Your details** introduction, consistent field hierarchy, touch-friendly controls, and clearer conference-focused language.
- Kept the existing four-field submission contract and Turnstile verification intact while improving focus, error, disabled, and submit states.
- Reworked the protected QR display into a quiet, room-facing invitation with event context, a single clear scan action, and responsive QR-first composition for both presentation screens and phones.

## 2026-08-05 — Edition-scoped conference responsibility delegation

- Added an explicit Owner-only **Delegation → Conference responsibilities** section to People & Access, with member selection plus edition-scoped Work Plan, Timeline, phase, volunteer-team, intake-sharing, and application-review grants.
- Limited delegation targets to active Volunteers in both the interface and API, keeping Organizer and Owner access governed exclusively by their roles.
- Added Owner-only re-enable and confirmed permanent-removal actions for disabled memberships; permanent removal requires prior disablement, deletes sessions and delegation grants, and preserves historical audit/task records.
- Consolidated the Volunteer team and applications into one deduplicated directory with clear Active and Applicant states, while keeping applicant contact details behind the separate application-review responsibility.
- Tightened the directory into a compact operational table with segmented counts, status pills, single-line dates, and one clear **Added directly** state instead of repeated empty application fields.
- Redesigned the Volunteer QR display as a minimal room-facing invitation with a single scan action, a high-contrast QR stage, concise event context, mobile-safe stacking, and a reduced-motion-safe QR reveal.
- Presented responsibility delegation in an accessible side drawer with focus trapping, Escape and backdrop dismissal, trigger-focus restoration, page scroll locking, and reduced-motion-safe transitions.
- Kept Volunteers assigned-task-only by default, including internal-note redaction and status-only updates, while allowing explicit edition grants to reveal the matching desktop routes and mobile tabs.
- Split volunteer operations into separately authorized team, intake-sharing, and applicant-review responsibilities so access to the Volunteers tab does not automatically reveal applicant email addresses or social handles.
- Enforced every grant at the API boundary, audited grant and removal actions, cleared grants on membership role/status changes, and added RLS-protected relational persistence.
- Centralized the capability catalogue and effective-access resolver so navigation, response shaping, task/phase mutations, and volunteer APIs use the same policy.
- Corrected the People & Access setup order so the responsibility queries cannot evaluate the signed-in role before its computed state exists, and added component-mount regression coverage.

## 2026-08-05 — Event creation field behavior

- Kept the DevCongress-series guidance inside its own field so the location type and online event link share one desktop row while retaining the mobile stack.
- Kept event start and end times synchronized by defaulting new events to two hours and preserving their duration when the start changes.
- Added immediate, accessible end-time feedback and prevented submission when the end is not after the start.

## 2026-08-04 — Removed obsolete Luma page importer

- Removed the unreachable public Luma page scraper and its isolated test after confirming no production code imports it.
- Eliminated its hand-written HTML entity decoder, closing the double-unescaping CodeQL alert at the source instead of preserving dead functionality already replaced by native event creation.

## 2026-08-04 — Current Annual Conference for unassigned volunteers

- Kept volunteers on the current Accra-year Annual Conference by default instead of relying on a permanently hard-coded edition year.
- Populated the volunteer edition control from the authorized work-plan response and locked edition switching, so a volunteer with no assigned tasks sees the current edition label instead of an empty **Select** control.
- Avoided the organizer-only edition-list request in volunteer sessions while preserving the existing assignment-scoped task visibility and status-only permissions.
- Admitted Volunteers to the exact authenticated logout route while retaining the existing request-origin validation, so sign-out now revokes their app session locally and in production.

## 2026-08-04 — Encrypted Supabase backup tooling

- Added a fail-closed backup command for database roles, schema, data, migration history, and Supabase Storage objects, packaged with a SHA-256 manifest and encrypted using an external `age` recipient.
- Added preflight validation, repository-local destination protection, plaintext cleanup, focused safeguards tests, and an operational restore and retention runbook.

## 2026-08-04 — Bodyless API request reliability

- Scoped API request-size parsing to payload methods (`POST`, `PUT`, and `PATCH`) so bodyless `DELETE` requests no longer reconstruct an empty local adapter stream before their route handlers run; existing size limits remain in force for every payload-bearing API write.

## 2026-08-04 — Community event submission launch boundary

- Added an independent, fail-closed EMS runtime switch for the public proposal endpoint so hiding the Astro form cannot leave a directly callable write path open.
- Added event format to organizer event creation and Event Profile editing, kept it independent from the DevCongress series, and retained `meetup` as the compatibility default.
- Standardized `conference` as the stored taxonomy value while displaying it as **Conference / congress**.
- Added a fail-closed discovery switch that keeps every promoted public submission out of the unauthenticated events feed during private beta while retaining normal titles, emails, and authenticated EMS preview access.
- Added a dry-run-first private-beta cleanup scope that deletes promoted events before their submissions and requires a separate explicit destructive confirmation.

## 2026-08-04 — Organizer role clarity

- Replaced redundant role-label chips in the People & Access reference with compact semantic icons, while keeping text badges in the organizer table and signed-in desktop header where they identify a person’s current access.

## 2026-08-04 — Focused registration editing

- Made the Event Profile series-type control visually match the adjacent About editor and enabled its compact save action only after the selected series type differs from the persisted value.
- Matched the About page and Event Profile panel heights within their shared Overview row, removing the visual gap beneath shorter About copy.
- Routed **Manage cover** from Registration directly to the loaded Overview Media section and renamed the cover action to **Re-upload cover** whenever a cover already exists.
- Condensed the Registration workspace header into a compact event context and tab rail, removing the redundant divider and excess vertical space before the active workspace.
- Matched Registration’s top page spacing to the compact Event Overview rhythm instead of the generic, oversized workspace padding.
- Added quiet semantic icons to the Registration workspace tabs so Summary, Guests, Form & capacity, Emails, and Blasts scan more quickly without replacing their text labels.
- Made the Events lifecycle explicitly read as a path from draft to completed, with connected stage markers and restrained hover/focus feedback for each stage's existing guidance.
- Collapsed guest-facing registration-page details by default behind an explicit **Edit details** control, while keeping **Open form**, **Copy form**, availability, capacity, timing, and the public link immediately visible.
- Added immediate Google Maps share-link recognition to event creation and disabled **Create event + registration** until a physical Maps location is a supported HTTPS Google Maps URL.
- Removed the redundant Registration open pill from the registration overview, limited manual refresh to campaigns that are actually accepting guests, and added a confirmed immediate-reopen action for closed or expired campaigns.
- Hid the Guests first-letter filter until at least one registration exists, removing the inert **All** control from the empty state while preserving a short, reduced-motion-safe entrance when guests first arrive.
- Made Archive Requests an explicit per-event opt-in: every monthly event starts with private archive requests off, the Archive workspace offers one clear enable action, existing links remain manageable, and both link-creation APIs reject new requests until enabled.

## 2026-08-04 — Default native event publication

- Removed the confusing “Publish event shell now” choice from native event creation: normal organizer-created events now publish as upcoming and open registration immediately unless a future registration opening time is supplied.

## 2026-08-04 — Fixed Annual Conference task-drawer actions

- Kept task create and edit actions in the drawer’s fixed footer, so Cancel and Save remain available while long forms scroll independently.
- Prevented non-teleported dropdown menus from inheriting a taller neighbouring grid item’s height, keeping each menu close to its selector.
- Consolidated desktop guest search, status filters, and result count into one registration-toolbar row while retaining a compact stacked layout on smaller screens.

## 2026-08-03 — Registration opens with event creation

- Made newly created event registration campaigns open immediately by default instead of requiring a second organizer action.
- Kept optional future opening and closing timestamps authoritative, so scheduled registration remains unavailable until its configured opening time.
- Updated the event-creation interface to explain the default and distinguish immediate from scheduled opening.
- Removed the redundant post-creation settings confirmation so **Save settings** enables only after the persisted campaign values actually change.
- Clarified that the location field expects a complete HTTPS Google Maps share link and render valid saved links directly in the public registration ticket instead of the generic “Google Maps location” text.
- Added a Registration-workspace editor for the guest-facing event name, description, dates, and venue or Maps link, with independent dirty-state saving and a direct cover-management path.
- Reused the Ghana-restricted Google Places autocomplete when organizers update a registration page venue instead of falling back to a plain text field.
- Made organizer event removal proceed even when its optional pre-delete audit-metadata lookup fails, while preserving not-found responses and recording the available audit context.
- Updated Hono and pinned the patched Undici release used by the local Worker development stack after newly published dependency advisories.
- Aligned newly published events with the upcoming lifecycle while retaining draft status for unpublished planning shells.
- Added a blank-by-default registration introduction that is stored separately from event About copy, editable after opening, length-constrained in the API and database, and shown only on the RSVP form.
- Removed invented public-meetup description fallbacks so public copy always comes from an organizer-owned field.

## 2026-08-03 — Compact date and time picker

- Capped shared calendar popovers at a focused 360px width instead of stretching them to match wide event-form inputs.
- Reduced calendar spacing and moved datetime controls above the date grid so the time remains immediately visible in constrained viewports.
- Added positioning coverage for wide trigger controls while preserving responsive viewport clamping.

## 2026-08-03 — Phase editor field alignment

- Bottom-aligned the desktop phase name and date controls, normalized their 50px control height, and retained full-width stacking at smaller breakpoints.
- Matched the mobile phase-name input height to the shared date-picker controls.

## 2026-08-03 — Mobile Annual Conference operations

- Added Annual Conference to Mobile Ops with live attention and completion context instead of hiding the workspace from phone organizers.
- Added a dedicated phone Annual Conference workspace with Overview, filtered Work Plan, Timeline, phase management, planning gaps, Volunteers, edition controls, and full-screen task create/edit flows.
- Gave volunteers a separate Overview and My Tasks interface while preserving assignment-scoped visibility, internal-note redaction, and status-only permissions.
- Routed phone visits from desktop Annual Conference pages into Conference Ops and routed tablet/desktop visits back to the full work plan, without loading the desktop planner behind the mobile view.
- Replaced desktop tables with mobile lists and stacked forms while retaining organizer feature parity; added safe-area-aware fixed navigation, thumb-sized controls, short transform/opacity transitions, and reduced-motion handling.
- Added a platform-owner override for edition, phase, and task administration; retained assignment-scoped organizers and status-only volunteers, backfilled uniquely matched legacy name assignments to membership emails, and replaced blank read-only task footers with an explicit permission explanation.
- Split the phone organizer landing experience into a lightweight Home plus dedicated Events and Conference destinations in the mobile menu; event-day actions now live on `/organizer-console/mobile/events` instead of loading on Home.

## 2026-08-03 — Deployed security verification and staging DAST guardrails

- Added a read-only deployed-security verifier for browser headers, private/public caching, request IDs, authentication denial, and allowed/rejected CORS behavior.
- Verified the canonical production origin and recorded 24 passing checks plus seven failed assertions across four release/configuration gaps: missing private `no-store`, missing cross-domain-policy headers, narrower Pages CSP, and unexpected credentialed localhost CORS.
- Aligned the Pages proxy CSP with the app's allowlisted YouTube/Vimeo frames and added `X-Permitted-Cross-Domain-Policies: none` at that outer response layer.
- Confirmed the deployed app/frontend origins were already canonical, then fixed the actual localhost CORS cause by requiring explicit development mode and declaring `NODE_ENV=production` for the Worker.
- Deployed Worker version `f3b487a8-3971-4cb2-8bde-a1a3b1cadd30`, preserving all secrets and the intentional community Turnstile host list; production now rejects credentialed localhost CORS and sends private `no-store` plus API cross-domain headers.
- Added a staging DAST runner that hard-denies every known production hostname, requires exact hostname confirmation, and gates low-impact mutation probes behind a second explicit switch.
- Documented the isolated staging data/secret requirements and authenticated authorization matrix; no staging scan was run because a safe staging deployment is not currently configured or discoverable with the available Cloudflare permissions.

## 2026-08-03 — OWASP and MITRE security hardening

- Re-audited the current worktree against OWASP Top 10:2025 and mapped credible internet-facing threats, mitigations, detections, and operational gaps to MITRE ATT&CK Enterprise techniques.
- Required public quiz answer and personal-state requests to prove ownership with the participant's random device identifier, closing user-ID-only answer impersonation.
- Added strict quiz join, answer, state, rename, and session-update schemas; applied the 64 KiB public body limit and distributed join/answer abuse controls.
- Preserved the intentional community-submission Turnstile allowance for `localhost` and `127.0.0.1`; the audit records it as a narrowly scoped exception because token, action, and distributed rate-limit checks remain enforced and other forms retain their production hostname boundary.
- Made API responses non-cacheable by default, added the cross-domain policy header, and replaced underlying 500-level exception text with request-ID-correlated generic responses on audited routes.
- Verified RLS/service-role boundaries, current dependencies, ignored local credentials, browser-bundle secret exclusion, and reachable Git history; added a deployment verification gate for platform-owned controls.

## 2026-08-03 — Phase-first work planning

- Made the active delivery phase the primary scope for Work plan and Timeline, defaulting to Phase 1 during its window and allowing organizers to switch to another phase, No phase, or the entire conference.
- Recalculated task status, completion, ownership gaps, schedule health, and planning gaps from the selected phase instead of mixing a phase-filtered ledger with conference-wide statistics.
- Made the timeline runway selectable, changed its countdown to the selected phase end, scoped planning gaps to the selected phase, and preselected the active phase when creating a task from its work plan.
- Consolidated phase context, completion, status, owner filtering, and filter clearing into one Work Plan control panel and removed the separate task search strip.
- Replaced the ledger's internal scrolling with six-row pagination so larger phase plans stay bounded without extending the task table down the page.
- Teleported the phase and owner dropdown menus outside the merged panel so its rounded overflow boundary cannot clip open options.
- Removed the Timeline's workstream-progress, delivery-threat, and upcoming-deadline panels, leaving phase summary, runway, and planning gaps as its focused operating view.
- Replaced the Timeline's planning-gap card lanes with one compact eight-row table showing each task, owner, status, phase, and target date, with missing values highlighted in place, direct editing, and simple pagination.
- Deferred the organizer-directory request until an authorized planning owner opens the future-edition form, removing an unused authenticated request from normal conference overview loads without changing cached data or form behavior.
- Moved Annual Conference authorization, presentation/redaction, persistence selection, and edition/phase/task orchestration behind shared policy, repository, and application-service boundaries while preserving the existing HTTP contract.
- Replaced repeated phase/task summary scans with one indexed read model shared by Work Plan and Timeline, moved their common query/scope/task lifecycle into a testable workspace controller, and fetched independent Supabase phase/task collections concurrently after edition lookup.

## 2026-08-03 — Initial Phase 1 responsibilities

- Assigned the confirmed keynote, venue, website/registration, sponsorship, graphics, media coverage, and conference-call work to Phase 1 without adding duplicate umbrella tasks.
- Moved Venue accountability to Elijah, left graphics and call ownership unassigned where requested, and retained the existing specific design, media, and call tasks.
- Added Volunteer recruitment as a separate unassigned Phase 1 task for finding new volunteers and promoting the volunteer call.

## 2026-08-03 — Conference health layout refinement

- Removed the standalone Phase Health panel and placed delivery threats and upcoming deadlines in its column as two stacked, action-oriented panels beside workstream progress.
- Removed presentation-only task examples from those panels, limited each to two live tasks, prevented near-term tasks from repeating in later deadlines, and added 30-second plus window-focus work-plan refresh so organizer updates automatically change the visible rows.
- Made the Accra-local day value refresh every minute and whenever the window regains focus, keeping the conference countdown, Today marker, overdue state, due-soon state, and preview dates current across midnight.
- Simplified annual-conference owner and collaborator selectors to display organizer names while preserving email-backed values, summarized longer selections as “+N more” without a duplicate count badge, and replaced yellow/black multi-select checks with soft pink selected rows and pink check controls.
- Kept the collaborator menu within the task drawer's content inset by sizing it to its field instead of forcing it wider toward the left edge.
- Joined adjacent selected collaborators into a single softly divided selection group, removing the scalloped corners between consecutive rows while retaining rounded outer edges.
- Consolidated the duplicated annual-conference edition label and selector into one compact header control, moved workspace navigation to a dedicated row, and restyled future-edition creation as a secondary action.
- Fixed the shared date picker so its teleported calendar opens above task drawers and other application overlays instead of appearing unresponsive behind them.
- Replaced the long planning-gap repair list with a bounded three-lane exception board for tasks missing both fields, a phase, or a target date; each lane has independent scrolling and pagination, a header-level status filter, direct editing, and organizer display names instead of raw email labels. Removed the search bar and decorative lane labels/colors, and made the empty-board goal explicit.
- Made planning-gap lane titles self-contained and upgraded each clickable card with status, workstream, ownership, collaborator count, phase, target date, and conditional dependency context, plus restrained hover, focus, movement, and reduced-motion states.
- Simplified planning-gap cards by removing priority badges, animated left rails, accent hover borders, dependency side borders, and all card movement; hover motion is limited to the **Open task** arrow while keyboard focus remains explicit.
- Consolidated conference completion, countdown, current phase, planning confidence, overdue, blocked, and due-soon signals into one responsive summary, removing the six duplicate statistic cards and the repeated no-phase count.
- Tightened the conference summary into a clearer metric, status, progress, facts, and countdown hierarchy, and replaced planning-lane count pills with circular number-only counters.
- Kept the shared annual-conference navigation spatially fixed when switching between Overview, Work Plan, Timeline, and Volunteers by replacing the whole-page directional movement with a short opacity-only transition.
- Reserved a stable scrollbar gutter on the desktop application scroll container, preventing route content from changing width when switching between pages with and without vertical overflow.
- Replaced the oversized volunteer application cards with a compact, horizontally scrollable table for names, email addresses, X handles, Slack names, and sign-up times.
- Stabilized the pre-JavaScript workspace loading screen with system fonts so webfont loading cannot resize its message, reduced the loading headline's scale and weight, and softened the shared application heading/display weights from 700/800 to 600/700.

## 2026-08-02 — Edition-scoped conference phases and timeline

- Added a dynamic annual-conference edition switcher and planning-owner-controlled future-edition creation, with the next owner selected from active organizers or inherited from the previous edition.
- Added fixed 2026 Phase 1 and Phase 2 windows, unlimited phases for later editions, safe phase editing/reordering/deletion, and a No phase state that preserves all existing tasks.
- Added task phase assignment, target-date attention, and server/database validation preventing assigned dates from exceeding phase end dates.
- Added a conference-health Timeline with overall and workstream completion, planning confidence, phase time-versus-work comparisons, overdue/blocked/due-soon signals, upcoming deadlines, and a proportional phase runway.
- Kept unclassified and undated work actionable in a fixed-height planning-repair queue with search, status filtering, explicit missing-field labels, direct task editing, and ten-item pagination so planning gaps never lengthen the whole page.
- Refined the dashboard to a light app-native treatment without dark or yellow feature panels, sorted workstreams by completion percentage, replaced the native status select with the shared dropdown, and added clearly labelled non-persistent example rows to otherwise empty attention and deadline panels.

## 2026-08-03 — Assigned-work access for Annual Conference volunteers

- Added **Volunteer** to People & Access so owners and organizers can grant conference-only sign-in without organizer-wide privileges.
- Redesigned People & Access around a compact member directory, a focused side-panel invite form, concise role definitions, name-first rows, and a matching bounded loading skeleton.
- Added Navii avatars, hid directory emails by default, limited the email reveal control to signed-in owners, and made display names mandatory in both client and server validation.
- Added an owner-only inline role selector for switching active members between Organizer and Volunteer, with server-side owner enforcement, audit logging, and session revocation after a change.
- Removed the redundant global Annual Conference navigation tab and organizer-only ownership-gap counter from volunteer views, restricted full task editing to the edition planning owner or the task's accountable owner/collaborators, and replaced the black In progress badge with a restrained teal treatment.
- Routed volunteer sessions directly into Annual Conference and limited navigation to the edition overview and work plan.
- Filtered volunteer work-plan responses to tasks where their email is accountable or collaborating, removed organizer-only internal notes, and added a clear no-assignment state.
- Allowed volunteers to update only the status of assigned tasks while keeping Events, hubs, access management, applicant records, task creation, reassignment, and task-detail changes server-denied.
- Added the Supabase role migration plus focused route, API-policy, assignment, redaction, and real Hono authorization tests.

## 2026-08-02 — Rejection reason dropdown consistency

- Replaced the browser-native rejection-reason select with the shared organizer app dropdown and aligned both rejection text areas with the non-resizable editorial input treatment, retaining the required reason, existing moderation payload, and compact drawer layout.

## 2026-08-02 — Manual event acceptance-test cleanup

- Added a dry-run-first cleanup command for pre-launch event testing, narrowly selecting submissions and events whose titles begin with `[TEST]` and also tracing canonical events promoted from those submissions.
- Added a server-only `EVENT_TEST_MODE` switch for the former pre-launch workflow that marked organizer-created events and public submissions, preserved the marker through approval, and placed `[TEST]` first in related transactional email subjects.
- Required an explicit destructive confirmation, deleted canonical events before submissions, verified that matching records no longer remain, and retained admin audit history and already-delivered provider email.
- Documented the temporary same-database testing convention and its retirement trigger before general public submissions begin.

## 2026-08-02 — Durable community submission notifications

- Added transactional receipt, approval, and rejection email outbox records with stable per-submission idempotency keys, provider acceptance/failure state, and safe retries that never repeat a moderation decision.
- Activated the three community submission subjects under the code-owned **DevCongress Events** sender and added escaped HTML/plain-text templates for each recipient moment.
- Kept **Approve & publish** as one action while automatically queuing its notification; split rejection into a required reason category, optional organizer-facing message, and private internal note with an inline outgoing-email preview.
- Added organizer delivery-state visibility and failed-email retry controls, while labeling provider acceptance honestly and deferring delivered/bounced state until verified Resend webhooks exist.
- Recorded the durable-notification and private-note boundary in ADR-038.

## 2026-08-02 — Code-owned email identity and subject policy

- Standardized outbound mail on two role-based identities: **DevCongress Events** for attendee/event communication and **DevCongress Speakers** for monthly and annual speaker communication.
- Replaced the meetup-specific speaker display name and vague archive-link subject with `DevCongress Speakers` and `Share your talk resources: {event name}`.
- Centralized active and planned email scenarios, sender assignments, subject builders, one-line normalization, and length limits in a tested policy registry; sender identities can no longer drift through deployment variables.
- Recorded the controlled sender/subject change procedure in ADR-037; ADR-038 and the durable-notification slice later activated the community receipt and decision scenarios.

## 2026-08-02 — Events workspace submission inbox

- Moved community event submissions out of the global organizer navigation and into a local Events workspace switcher beside the canonical event collection.
- Made **Pending** the default review filter, placed its outstanding-proposal counter directly on that control, removed the redundant All filter, and added a polished empty inbox state with reduced-motion-safe transitions.
- Replaced the always-open split submission view with a compact filtered table and a keyboard-accessible right-side review drawer, preserving queue context while progressively revealing proposal details and actions.
- Kept the Events workspace switcher mounted between All events and Community submissions, added a transform-only sliding selection indicator, and limited route motion to a short non-overlapping content transition with a reduced-motion fallback.
- Preserved existing submission bookmarks through a compatibility redirect from `/organizer-console/event-submissions` to `/organizer-console/events/submissions`.

## 2026-08-02 — Temporary local Turnstile submissions

- Temporarily allowed real event-submission Turnstile tokens from `localhost` and `127.0.0.1` so the local public website can exercise the deployed moderation and Supabase flow without weakening action checks, token validation, or rate limits.

## 2026-08-01 — Community event submission and moderation

- Added a strict, Turnstile-protected and distributed-rate-limited public proposal API backed by a service-role-only relational moderation queue.
- Added a current-design organizer inbox with simple approve-and-publish or reject decisions, transactional idempotent promotion, and private audit actions.
- Separated event ownership, series, format, source, moderation, and publication in the canonical event model, while preserving the official-only meetup compatibility feed.
- Added a generic public events feed for published DevCongress programming and approved external community listings, retaining the external organizer identity.
- Recorded the dedicated `devcongress.org` Turnstile hostname allowlist and deferred notification email until it has a durable delivery ledger.

## 2026-08-01 — Database-owned quiz runtime

- Moved hosted quiz sessions, questions, and responses from whole-array compatibility documents into constrained relational Supabase tables, retaining JSON only for local development and rollback evidence.
- Made answer acceptance, score/streak updates, presenter reset/release/reveal, timed quiz advancement, and question reordering atomic PostgreSQL operations.
- Moved participant counts, answer counts, answer distribution, leaderboard ranking, and requesting-player response lookup into one database aggregation function.
- Added relational backfill, foreign keys, unique join codes, one-answer-per-user/question enforcement, question-order constraints, RLS, and service-role-only function access.

## 2026-08-01 — Unique System Design room names

- Moved hosted quiz participant records from the whole-array compatibility document to a dedicated Supabase table while preserving the local JSON development fallback.
- Added database-enforced room-level uniqueness for normalized System Design names and one participant per user/session, preventing simultaneous Worker requests from accepting duplicate labels.
- Made generated aliases retry after a database conflict, preserved the existing friendly duplicate-name response for participant edits, and backfilled historical participants without deleting rollback data.

## 2026-08-01 — System Design presenter redesign

- Rebuilt the organizer's shared System Design screen with the current DevCongress cream, paper, ink, pink, and yellow visual system while leaving the participant phone experience unchanged.
- Replaced the legacy horizontal response meters with a four-column vertical bar chart that shows counts and percentages and distinguishes the correct answer after reveal.
- Aligned the lobby, question, reveal, completion, loading, and unavailable states around the same editorial typography, compact radii, restrained borders, and accessible reduced-motion behavior.

## 2026-08-01 — Registration operations polish

- Made uploaded event covers cache-safe by assigning each upload an immutable storage path and versioning existing Supabase cover requests with the event revision; aligned the public registration ticket with the uploader's 16:9 preview.
- Added foreground 15-second registration polling, focus refresh, an immediate manual **Refresh** action, and last-updated feedback while preserving loaded figures during a transient refresh failure.
- Kept the shared branded boot screen visible until the initial route is ready and reused it while protected organizer access resolves, giving hard refreshes one consistent loading state.
- Removed the renderer-added blast salutation so the organizer's editable greeting appears once, and made **Reminder** the default new-blast template.

## 2026-08-01 — Organizer session safety

- Added a server-enforced 30-minute organizer inactivity limit alongside the existing 12-hour absolute session lifetime.
- Added a two-minute, context-preserving session pause layer with a single **Stay signed in** action, immediate focus revalidation, and a locked re-entry state.
- Cleared cached organizer data and local Supabase session state whenever a session ends, so an unattended tab cannot continue showing protected information.

## 2026-07-31

- Made event location entry mutually exclusive: organizers now choose a verified Ghana venue from an autocomplete dropdown, a Google Maps location, or required online joining details instead of combining unrelated location fields.
- Shortened the public registration receipt greeting to the attendee's first submitted name while preserving their full name on the registration record.
- Activated System Design learning rooms on top of the existing saved-artifact workspace: organizers generate and review five source-based questions in place, then open a separate QR-first presentation view. Participation is account-free and device-only; facilitators release and reveal questions and see the aggregate room pulse.
- Added required reveal explanations to System Design learning questions so every interaction teaches the underlying decision rather than acting as trivia.
- Kept learning questions and presentation runs available to every previous meetup with a saved System Design link. Completed rooms start a fresh room-scoped run without losing the persistent scenario or reviewed questions.
- Moved the presenter onto an organizer-protected standalone route that opens in a new tab, preserves the original admin workspace, and removes admin navigation and editing controls from the shared screen.
- Preserved reviewed question order during presentation and kept pre-reveal answer percentages exclusive to the protected presenter state.
- Registered the QR destination as a dedicated public System Design attendee route, restricted it to learning-room codes, and removed its organizer-only active-session precheck while keeping presenter controls authenticated.
- Every participant now receives a unique default room name and fixed Navii avatar immediately after scanning. Participants may edit only their name on their phone while waiting; identity editing closes when the facilitator starts, and the organizer no longer manages a naming mode.
- Replaced the unbounded per-answer participant cards with four compact response bars showing the number and percentage of people who chose each option; participant identities remain in the final leaderboard instead of the question chart.
- Added a visible answer-timer control to every reviewed System Design question so organizers can save question-specific durations before opening the presentation.
- Added a dedicated participant **Time's up** state that removes answer controls at zero and waits for the facilitator's reveal; late submission errors no longer appear as room-unavailable failures.
- Added a final presenter leaderboard and personal phone finish cards. Each attendee phone receives only its participant's avatar, name, and position; a one-shot, reduced-motion-safe confetti burst is limited to the top five.

## 2026-07-31 — Performance and blast delivery hardening

- Coalesced the organizer-login session lookup through the shared query client, removing the duplicate `/api/auth/session` request observed in the production login journey.
- Marked fingerprinted `/assets/*` responses immutable for one year, preserving the stale-module fallback while avoiding routine revalidation of a deploy-specific asset URL.
- Split Resend blast preparation from delivery: the event-specific segment and provider broadcast are durably recorded before the send/schedule operation. Failed final sends retain that provider ID and can be retried safely from blast history instead of creating another audience.
- Bounded contact preparation to eight concurrent provider requests, replacing the previous 100-contact serial wait while retaining the 100-recipient safety limit.

## 2026-07-30

- Fixed the native event-blasts database migration path by granting the server-only Supabase `service_role` access to `event_blasts` and its status enum. Browser roles remain denied by RLS, while the Worker can load history and persist blasts.
- Restored the registration-email visual system for event blasts: header wordmark, event detail cards, calendar links, and compact unsubscribe footer. Calendar actions stay side-by-side in both receipt and blast emails.
- Refined receipt and blast event details into a compact **When / Where** itinerary card with a map-pin icon; Google Calendar is now the visually primary action and both templates provide deliberate near-black dark-mode rendering.

_Update this file at natural checkpoints: before a commit, before a PR, or when explicitly asked._
_Format: `## YYYY-MM-DD — [Feature / Fix / Refactor]` followed by bullet points._

---

## 2026-07-30 — Blast storage clarity

- Replaced the oversized empty blast-history panel with a compact state, and surfaced unavailable blast storage with a retry action and safe migration guidance rather than an opaque generic error.
- Added a safe storage-error code to Worker logs so deployment configuration can be diagnosed without exposing database details to organizers.

## 2026-07-30 — Registration email wordmark

- Replaced the text-only DevCongress label in the registration email header with the official compact wordmark, while retaining accessible text as the image fallback.

## 2026-07-30 — Registration sender identity

- Gave registration receipts and event blasts their own `DevCongress Events <events@updates.devcongress.org>` sender, rather than presenting them as Monthly Speakers mail.
- Removed the registration-to-speaker sender fallback so a missing attendee identity holds delivery as unconfigured instead of sending under the wrong program.

## 2026-07-30 — Blast templates and delivery preview

- Prefilled new event blasts with editable Event update, Reminder, and Venue change drafts instead of an empty composer.
- Added one modal preview that uses the same escaped HTML email template as Resend delivery; its primary action directly sends or schedules the blast, replacing the duplicate review step.

## 2026-07-30 — Blast composer sizing

- Locked the custom-message field to its intended composed height so organizers cannot distort the blast workspace by resizing it.

## 2026-07-30 — Confirmation email event-details destination

- Changed the confirmation and promotion email’s **View event details** URL from the RSVP form to a read-only event-details state.
- Kept the ticket’s familiar event context and safe map action, while removing the registration fields so confirmed guests are not invited to register again.

## 2026-07-30 — Native event email blasts

- Added a dedicated **Blasts** workspace for custom, email-only event updates to confirmed guests, with a composed send-now or schedule-later flow and a concise sent/scheduled history.
- Enforced a 100-recipient hard stop, excluded waitlisted and cancelled registrations, and avoided partial sends.
- Added a safe capacity outcome: missing Broadcast configuration and provider plan/quota rejections remain visible as **Needs email capacity** instead of a raw provider error.
- Added an event-scoped Resend Segment and separate least-privilege Broadcast API key boundary so each blast is isolated to the intended event and uses provider unsubscribe/scheduling support.

## 2026-07-30 — Quieter registration page heading

- Removed the duplicated **Registration** eyebrow and reduced the view-specific title scale so the page intro matches the calmer workspace hierarchy.
- Kept the event context and historical-registration wording while leaving the shared editorial heading system unchanged.
- Replaced the black selected guest-status filter with the existing brand-pink active treatment used by registration controls.

## 2026-07-30 — No-series event badge cleanup

- Kept **None of these** as the explicit event-creation choice and nullable stored series value, but stopped rendering it as a category badge in desktop and phone organizer event cards.
- Preserved Monthly, Quarterly, Special, legacy series inference, and the existing event-type filters.

## 2026-07-30 — Registration overview visual hierarchy

- Replaced the Registration workspace’s black navigation slab with a quiet paper-aligned tab rail, sentence-case labels, and a restrained pink active indicator.
- Consolidated confirmed registrations, capacity, places left, and percentage filled into one synchronized overview instead of disconnected cards; zero registrations now presents a clear empty state with one contextual form-sharing action.
- Made the overview follow the event lifecycle: upcoming events show capacity, live events show check-in progress and guests still to arrive, and completed events show attendance and no-shows.
- Revealed waitlisted and cancelled counts only when they exist, removed the pre-event no-show placeholder, and added short transform-and-opacity transitions with reduced-motion fallbacks.

## 2026-07-29 — Canonical production domain alignment

- Standardized active public API verification, website-integration guidance, and Turnstile hostname fixtures on `https://em.devcongress.org`.
- Retained dated `events-management.pages.dev` references only where they document historical deployment and migration checks.
- Re-ran the public meetup API contract verifier through the canonical domain and confirmed `ok: true`, 9 published meetups, the expected detail lookup, and `talks: 0`.

## 2026-07-29 — Production organizer sign-out repair

- Fixed hosted organizer sign-out returning `500` by preserving the mandatory `Secure` attribute while expiring the `__Host-devcon_admin` cookie.
- Kept the legacy/local `devcon_admin` cookie cleanup so sessions created before the secure-cookie migration are still removed.
- Added an HTTPS logout regression test that verifies the successful response and both cookie-expiry headers.

## 2026-07-29 — Focused registration operations workspace

- Split native registration into Summary, Guests, Form & Capacity, and Emails so capacity context, attendee actions, campaign configuration, and transactional delivery are no longer mixed on one page.
- Added contextual waitlist visibility, post-event-only no-shows, guest status filters, and distinct accepted/queued/failed delivery counts while preserving name/email and first-letter check-in.
- Removed organizer-facing auto-confirm and waitlist toggles from event creation and campaign updates: free registrations receive places immediately until capacity, then overflow joins the waitlist automatically.
- Added concurrency-safe oldest-first waitlist promotion when a confirmed guest is cancelled, including a durable promotion-notice outbox record, automatic delivery attempt, failed retry support, and promotion metadata in the organizer audit event.
- Kept Emails transactional-only, explicitly excluding broadcasts, bulk messages, exports, and marketing analytics.

## 2026-07-29 — Reviewable Dependabot updates

- Disabled routine npm and GitHub Actions version-update pull requests so outdated-but-not-vulnerable packages no longer create repository noise.
- Retained automated vulnerability remediation and grouped every available npm security fix into one npm pull request.
- Grouped every available GitHub Actions security fix—including all CodeQL components—into one Actions pull request; GitHub does not combine security fixes across package ecosystems.

## 2026-07-29 — Honest historical registration state

- Removed the development-only fictional 64-guest registration simulation from both the full organizer Registration tab and focused phone check-in screen.
- Changed the authenticated registration read contract to distinguish a real native campaign from an existing event whose registration was not managed internally; unknown events remain `404`.
- Replaced the legacy campaign error with a calm, non-interactive explanation that no internal guest list, registration-email history, or native check-in record exists, while pointing organizers to imported historical Attendance data when available.
- Preserved the future-event invariant: native event creation still provisions a private draft registration campaign and compensates by deleting the event if campaign creation fails.

## 2026-07-29 — Unified organizer authentication surface

- Reused the Programme Cover login surface for direct protected-route session checks and the Google OAuth callback, keeping `Checking session…` and `Confirming organizer access…` inside the existing action panel instead of navigating through standalone access pages.
- Kept non-organizer, provider failure, rate-limit, service failure, and retry states on that same page with bounded generic copy and an explicit **Use another Google account** action.
- Hardened intended-destination handling to reject external, protocol-relative, and backslash-based redirect values; callback failures now map HTTP statuses to allowlisted UI states rather than rendering provider or server error text.
- Preserved the fail-closed boundary: organizer navigation and routed workspace content remain unmounted until the app-owned session and active membership are confirmed.
- Added focused tests for auth-state mapping, non-sensitive denial copy, and safe internal redirect validation, plus desktop and phone browser checks for sign-in, delayed session, callback, and denied-account layouts.

## 2026-07-29 — Public event consumer preview

- Added an authenticated **Preview Website Events** flow from Event Management so organizers can inspect only the published events exposed to external consumers.
- Added collection and event-detail previews backed by the exact `/api/public/meetups` and `/api/public/meetups/:slug` responses, with card-to-detail navigation, endpoint context, direct JSON inspection, and a return to Event Management.
- Kept the preview available on phones without exposing the wider desktop organizer console, and verified responsive layouts without horizontal overflow.
- Restricted third-party iframe previews to exact HTTPS YouTube and Vimeo player hosts, matched them with the production Content Security Policy, sandboxed embedded media, encoded route slugs at the shared API boundary, and kept all other validated media as external links.

## 2026-07-29 — Distributed rate-limit runtime repair

- Added an additive Supabase migration that recreates `consume_public_rate_limit` with an unambiguous `timestamptz` variable, fixing PostgreSQL `42883` failures that blocked organizer OAuth exchange and other rate-limited forms after the security migration.
- Kept the limiter fail-closed and retained its validation, expiry cleanup, atomic upsert, retry calculation, and service-role-only execution boundary.

## 2026-07-28 — OWASP 2025 security hardening

- Removed attendee identity and attendance history from the public home API, made it non-cacheable, and revoked the direct anonymous Supabase feedback paths that bypassed server controls.
- Stopped draft registration links/calendars from exposing unpublished event details and removed unauthenticated feedback GET/POST side effects.
- Made organizer authorization use live membership roles, revoke sessions on role/status changes, require an origin on authenticated mutations, and use secure same-origin `__Host-` cookies in hosted environments.
- Replaced recoverable speaker bearer tokens with hash-only relational records and atomic cross-Worker claim/consume/release transitions.
- Moved CFP proposals out of whole-document JSON into private relational rows with database-enforced active-proposal uniqueness, preventing concurrent Workers from overwriting or duplicating submissions.
- Added production-fail-closed Turnstile checks and distributed Supabase rate limits to registration, CFP, feedback, volunteer, token exchange, and private intake boundaries; duplicate registration/CFP responses no longer enumerate emails.
- Added strict update/input schemas, public URL revalidation, image signature checks, request body limits, bounded external fetches, generic exception responses, token-redacted structured security events, fail-closed configured data stores, and browser security headers.
- Upgraded vulnerable dependencies to a zero-advisory lockfile and added pinned CI dependency audit, Gitleaks, CodeQL, and Dependabot coverage.
- Added the complete OWASP Top 10:2025 scenario/prevention audit and production release gate in `docs/security-audit-2026-07-28.md`.

## 2026-07-28 — Native free-event registration

- Moved phone guest check-in out of expandable event cards and onto a dedicated event route with a visible **Back to events** action, event identity/progress, focused filters, and no competing organizer chrome; 768px-and-wider visits resolve to the event’s full Registration tab.
- Added a development-only 64-person guest-list simulation for realistic high-volume review without creating registrations, sending email, consuming capacity, or writing audit data; simulated check-ins reset when the preview closes and the fixture is dynamically excluded from normal production use.
- Fixed that simulation so it can open for legacy events with no registration campaign instead of remaining trapped behind the campaign `404`; exiting the simulation restores the original setup error.
- Removed the misleading **Confirmed** badge from ordinary guest rows because registration does not promise attendance; waitlisted, cancelled, and checked-in states remain visible, and the capacity summary now says **Has a place**.
- Contained long guest lists inside their own momentum-scroll region on tablets and desktops so search and first-letter filters remain visible; phone Mobile Ops keeps a single natural page scroll to avoid nested touch scrolling.
- Added thumb-first first-letter guest filtering to phone Mobile Ops and the full Registration tab. The rail shows only represented initials, keeps every target at least 44px, combines with name/email search, and was browser-verified without horizontal page overflow at 320, 390, 430, 744, and 768px.
- Added focused native guest check-in to phone Mobile Ops while preserving the limited-phone boundary: organizers can open an event card, search registrations by name/email, and check in confirmed guests with full-width touch controls; tablets retain the full Registration tab with 44px minimum row actions.
- Added a confirmation-protected **Remove test guest** action for local development; permanent deletion clears the registration plus linked check-in/email-delivery data, while production hides the control and returns `404` from the delete endpoint.
- Added a restrained brand-colour confetti burst to confirmed registrations, removed redundant QR/confirmation-code wording, and preserved a static reduced-motion treatment; waitlist receipts remain non-celebratory.
- Upgraded native event creation to collect real start/end times and a validated HTTPS Google Maps share link for Ghana venues, so public details, email confirmations, and calendar exports no longer fall back to midnight or an unlinked address.
- Rebuilt registration email as a responsive DevCongress confirmation with prominent date/time and location rows, sink-validated Google Maps links, matching plain text, and confirmed-only Google Calendar plus downloadable `.ics` actions; waitlist messages retain their distinct status without implying a reserved place.
- Fixed live Supabase registrations failing with PostgreSQL `42702` by removing an ambiguous `normalized_email` function variable, added an additive repair migration for projects that already ran the original schema, and recorded unexpected registration errors in server logs without attendee details.
- Shortened the public form action from **Register for free** to **Register**.
- Reframed the public registration page as one cohesive event ticket with a perforated RSVP stub instead of two separate panels; the ticket unfolds vertically on phones with a lighter event title, roomier content groups, and stacked date/location details.
- Split the open-campaign sharing action into **Open form** and **Copy form**, added a temporary **Copied** confirmation, and shortened new public links to the unique event-slug route `/r/:eventSlug` while keeping existing UUID links valid.
- Removed Turnstile from free meetup registration after verifying that a baked-in browser site key could conflict with a missing server secret and reject a successfully completed form; retained validated input, campaign/email uniqueness, atomic capacity allocation, RLS, and tightened per-client request throttling.
- Matched the desktop event and form card heights, kept long event descriptions to a three-line registration summary without changing stored copy, and vertically centered the complete composition when space is available.
- Reworked phones into a relaxed top-down page with natural scrolling, warm page separation, clearer type hierarchy, persistent context, comfortable form spacing, safe-area padding, and full-size touch targets.
- Disabled **Save settings** on ordinary registration-campaign visits until the organizer makes a real change, retained a one-time active confirmation immediately after event creation, and added a pre-save dialog that lists every changed value.
- Reworked public registration into balanced desktop columns with safe-area padding and bounded event copy.
- Removed the redundant registration preview and exposed the copy-link action only for saved Open campaigns; draft and closed campaigns retain server-side submission rejection.
- Fixed the standalone registration route’s blank canvas by keeping its public logo URL as an image request instead of a failed JavaScript module import, restoring both unavailable-link messaging and the open name/email form.
- Moved the campaign status dropdown into a viewport-aware overlay layer so its options are no longer clipped by the registration settings panel.
- Made today a persistent visual anchor in the custom date picker with a pink outline and dot, distinct from the yellow selected-date state.
- Added an optional validated video conference link to native event creation for online and hybrid meetups, backed by the existing event stream field.
- Locked the create-event description textarea to its designed height so organizers cannot resize and distort the form layout.
- Replaced the blocked Luma URL preview/import workflow with the sole native event form, retaining monthly/quarterly/special classification or an explicit no-series choice and creating a private draft registration campaign alongside every event.
- Added relational Supabase campaigns, registrations, check-ins, and confirmation-email deliveries with RLS, atomic capacity allocation, duplicate prevention, waitlisting, and cascading event cleanup.
- Added the standalone `/register/:eventId` name/email form with rate limiting, confirmed/waitlisted receipts, and explicit delayed-email messaging.
- Added an organizer Registration tab for campaign opening/closing, capacity/windows, public-link copying, guest search by name/email, check-in, cancellation, and queued Resend retries.
- Replaced browser-native date and date-time controls with the themed app calendar, including 24-hour time entry, viewport-aware upward/downward placement, narrow-screen clamping, and constrained-height scrolling.
- Made the website slug follow the event name automatically until an organizer edits it, with normalization and a one-click return to the generated value.
- Added cover selection from the organizer’s computer with an immediate preview, replace/remove controls, a 15MB source limit, browser compression, server-side 5MB/type enforcement, and URL fallback.
- Added **None of these** to event-series selection and filtering, storing it as a true nullable series instead of misclassifying independent events as Special or Monthly.
- Preserved historical Luma metadata and CSV attendance readouts while removing all active Luma preview/import UI and API routes.
- Added policy and API tests for campaign windows, capacity/waitlist behavior, native event provisioning, duplicates, and delayed confirmation email state.

## 2026-07-28 — Quieter Archive Details form focus

- Replaced the yellow focus halo around Archive Details inputs, textareas, and the Topic trigger with a subtle neutral ink ring.
- Replaced the Topic menu's solid yellow selected row with a restrained pink tint and pink checkmark, scoped to the private speaker form.

## 2026-07-28 — Transient organizer access feedback

- Replaced the persistent inline login alert shown after an unapproved Google account attempts organizer sign-in with the shared app error toast.
- Removed the consumed callback error from the login URL so refreshing the page does not repeat stale access feedback, while configuration and connectivity failures remain inline because they block sign-in.

## 2026-07-28 — Readable Archive Request email action

- Replaced the dark-mode-fragile boxed form action with a high-contrast underlined pink text link, which avoids Gmail repainting its background and label into the same colour.
- Shortened personalized greetings to the first word of the invited speaker name in both HTML and plain-text email.

## 2026-07-27 — Stable Archive Request email contrast

- Removed all live text from yellow email surfaces, replacing the presentation area with a neutral session card and the yellow CTA with a high-contrast action button.
- Retained DevCongress yellow only in image-based brand accents so Gmail mobile dark mode cannot create white-on-yellow copy.

## 2026-07-27 — Resend-powered Archive Request emails

- Replaced one-at-a-time link generation and the obstructive speaker dropdown with an inline program roster that keeps selection, topic context, and per-speaker email entry in the same row, with bulk select/clear controls and up to 100 personalized sends per organizer action.
- Added a required email field for each selected program speaker because the one-off July outline does not store recipient addresses; those addresses stay scoped to the private requests and are not written back into the program or speaker allowlist.
- Embedded each private, topic-bound form URL behind a branded email call-to-action, retained a plain-text fallback, and kept all dynamic HTML escaped.
- Added an authenticated Worker endpoint that validates organizer-supplied addresses, derives the program identity server-side, creates or reuses one-time links, calls Resend Batch with idempotency, and records pending, accepted, or retryable failed states without logging addresses or private tokens.
- Disabled accepted program rows to prevent repeat sends from the UI, enforced the same duplicate suppression on the server, and added count-aware success plus non-blocking send-failure toasts.
- Added contract coverage for multi-recipient sends, organizer-address validation, provider retries, duplicate suppression, delivery persistence, program identity matching, and template/client behavior.
- Removed the private intake page's nested viewport-height constraint, widened its desktop canvas, and moved the abstract, bio, resource URL, and submit action into responsive grids so the default desktop form fits without avoidable inner-page overflow.
- Reduced the private form's final action to a field-aligned 48px control, fixed the abstract and bio textareas so they cannot be resized, and added live 500/300-character limits enforced by both the browser and API.
- Redesigned the archive email as a responsive DevCongress editorial invitation with the hosted wordmark, a gender-neutral presentation-kit illustration, canonical `#F5E642` yellow, the project's self-hosted Inter/IBM Plex Mono type hierarchy, a shorter archive-link subject, explicit dark-mode styling, and yellow-preservation fallbacks for clients that force dark palettes; unusually long card titles are truncated without shortening the plain-text fallback.
- Hardened the mobile email against Gmail dark-mode inversion by preserving the near-black header/content/footer surface system, forcing black text and borders on yellow cards and actions, and tightening only the dark 390px composition without changing the approved light-mode layout or introducing horizontal overflow.
- Added a Gmail-safe black gradient text lock inside yellow session cards and call-to-action buttons, preventing dark-mode colour inversion from turning those yellow-surface labels white.
- Reduced the private archive form to three layers: the DevCongress wordmark, a purposeful two-line introduction, and the form itself. Removed the archive eyebrow, display heading, date/expiry metadata, generic meetup copy, duplicate instructions, identity card, speaker name, and visible recipient email; unboxed the form and aligned text fields, dropdowns, radii, borders, and focus treatment so the page reads as one interface.
- Locked the program-selected talk title as invitation context, removed it from the browser submission, and made the API restore it from the one-time link so request tampering cannot rename the archived session.
- Removed the mobile shell's organizer-header offset from standalone routes, eliminating the empty `3.65rem` band above public forms that do not render the organizer header.
- Renamed the transactional sender to `DevCongress Monthly Speakers`, leaving `DevCongress Conference Speakers` as the distinct display identity for future annual-conference outreach. ADR-037 later superseded both programme-specific names with the stable `DevCongress Speakers` identity.

## 2026-07-27 — Unified Event Archive workflow

- Reframed the organizer's lasting event content as one **Event Archive**, with `talk` and `product_demo` item kinds stored through the existing Talk compatibility model; records without a kind continue to resolve as talks.
- Aligned July manual **Archive Requests** and the later selected-proposal completion flow so both produce the same archive record instead of maintaining separate speaker/backfill outcomes.
- Locked each one-time intake link to its event, recipient identity, and item kind, while keeping publication as an explicit organizer decision after form completion.
- Mounted the organizer-generated `/cfp/:eventId` link in the active Vue router, added the same Talk/Product demo choice to proposals, and kept the proposal form focused by removing the GitHub username field.
- Kept the Speakers allowlist separate as an event-access mechanism, preserved existing `/talks` public names with additive `kind` and `archive_items` fields, and recorded the separate hosted `community_events` projection as a known archive-enrichment limitation.
- Replaced per-instance-reset field counters with Vue-generated IDs across app dropdowns, multi-selects, and date pickers so forms with several custom controls retain correct accessible labels.
- Hardened the public CFP and private intake states with connected topic labels, non-blocking native validation, clear network errors, neutral proposal confirmation, and no exit links into the organizer console.
- Invalidated selected-presenter links after deselection or event/type drift, restricted archive resource links to HTTP(S), and serialized same-token submissions with atomic duplicate checks so retries cannot create a second archive record in one runtime.
- Simplified Archive Requests into one full-width form, sourced its topic/speaker selector from eligible presenter-led rows in the event's saved program outline, excluded welcome-address and system-design rows, and removed the duplicate presenter-name field while preserving the locked identity required by private links.

## 2026-07-27 — Uniform application typography hierarchy

- Preserved the existing Inter and IBM Plex Mono pairing, DevCongress palette, spacing, borders, and motion while replacing the app's scattered 650–950 weights with one body-to-display scale from 400 through 800.
- Reserved Inter 800 for page and hero display, Inter 700 for section titles and major metrics, Inter 500 for form values and supporting emphasis, and IBM Plex Mono 600 for labels, navigation, statuses, and controls.
- Removed the unused Inter 900 asset and disabled synthetic font weights so IBM Plex Mono can no longer be artificially emboldened beyond its loaded 700 face.
- Normalized shared fields, dropdowns, calendars, public feedback, speaker intake, monthly meetup organizer routes, Annual Conference views, and retained public views without changing their color or layout treatment.
- Added a regression test that rejects `font-black`, unsupported one-off weights, and synthetic monospace display combinations; all 96 tests, typecheck, production build, and source consistency checks pass.

## 2026-07-27 — Phased Resend speaker email plan

- Expanded the planned speaker-link delivery design into two deliberate email paths: transactional monthly archive requests with unique private links, and annual-conference Call for Speakers outreach through Resend Broadcasts with unsubscribe handling.
- Defined the July manual single-recipient pilot, later selected-speaker multi-send, safe custom-note boundary, delivery ledger, idempotency, webhook states, Resend/Cloudflare setup, testing, and ownership checklist.
- Recorded the prerequisites that email delivery must not hide: the canonical monthly CFP route must be settled, product-demo submissions need a source model, and the annual-conference CFP form must be live before outreach begins.

## 2026-07-27 — Organizer feature handoff hardening

- Made the committed local environment example organizer-capable by selecting the required Supabase data source, while retaining `local-json` as an explicit public-only development mode.
- Added an explicit organizer access-check failure state with retry and return-to-sign-in actions so a failed session request cannot leave the branded first-load gate onscreen indefinitely.
- Switched new Annual Conference owner and collaborator selections to stable organizer emails while continuing to display friendly names and preserving legacy Excel assignments.
- Enforced the same ownership rules at the API boundary by validating changed assignments against active organizer memberships, deduplicating collaborators, and rejecting accountable/collaborator overlap.
- Removed the retired floating website-feedback toggle from current environment and migration guidance, and corrected the remaining password-era verification note.

## 2026-07-27 — Compact attendance pattern charts

- Replaced the Attendance Hub's four stacked planning cards with one compact two-view panel so the monthly ledger remains the primary surface without adding more page height.
- Added a grouped bar chart for approved RSVPs versus check-ins across the latest six uploaded events and a selected-year pie chart for approved attendees versus no-shows.
- Kept chart populations honest by excluding missing CSVs and pending or declined registrations, while retaining CSV coverage, median turnout, P80 turnout, and the room-capacity guide in the same panel.
- Removed the repeat-RSVP histogram because its grouped percentages were not clear enough to support an organizer decision; the chronological came/missed table remains the repeat-attendance view.
- Verified both accessible chart summaries, zero horizontal overflow, and no browser errors at 1440px and 768px.

## 2026-07-27 — Regular attendance and repeat no-show tracking

- Restored the regular-attendee table's straightforward Registered, Came, Rate, and Last seen columns for people with at least two check-ins, ranked by actual check-ins and attendance rate.
- Added a separate **Never came** view for people with at least two approved RSVPs and zero recorded check-ins, showing their RSVP count, missed count, no-show rate, and latest RSVP.
- Kept pending and declined registrations outside the no-show signal so only approved commitments are tracked.
- Capped the people table to a viewport-aware height with its own scrollbar and sticky column headings, keeping long no-show lists from stretching the full page.

## 2026-07-26 — Simpler speaker archive form

- Removed GitHub username from the speaker archive intake UI, its local form state, and the browser-submitted payload; existing backend records and the separate CFP/admin talk contracts remain compatible.

## 2026-07-26 — Content-sized Work Plan ledger

- Replaced the Work Plan ledger’s fixed viewport height with an auto-sized task area that grows with its rows and becomes scrollable only after reaching the existing viewport cap.
- Added a 220ms transform-and-opacity View Transition for status, workstream, owner, and clear-filter changes so the ledger morphs between result sizes without animating layout properties or wobbling the page.
- Kept keyboard search immediate, disabled the transition for reduced-motion users, and prevented scroll anchoring from moving the page while results change.

## 2026-07-26 — Editorial Annual Conference briefing

- Replaced the boxed Annual Conference snapshot with an unboxed editorial edition brief: the provisional date anchors the page, delivery progress stays immediately visible, and Work Plan is the only filled action.
- Moved venue and keynote facts behind a compact anchored Planning notes disclosure, while Volunteers remains a quiet utility route so secondary information does not compete with the next operational action.
- Removed the redundant overview-only “Conference workspace” title and divider, preserving the shared edition navigation while letting the conference date become the page heading.
- Preserved the deployed DevCongress cream, saturated pink, yellow, and ink palette; the disclosure uses transform-and-opacity motion, focus restoration, outside-click and Escape dismissal, and reduced-motion support.
- Replaced the Work Plan ledger’s ambiguous plus/minus controls with eye icons and explicit “View details” labels so task inspection no longer resembles task creation.

## 2026-07-26 — Clear attendance turnout denominators

- Expanded each imported event's Attendance Hub readout from a standalone check-in count and rate to `checked in out of total registrations`, with the displayed percentage calculated from that same total so the values cannot contradict one another.

## 2026-07-26 — Original organizer UI restored

- Rebuilt the Annual Conference overview as one compact planning snapshot: the provisional date and Work Plan progress stay visible, Volunteers is a quiet secondary action, and venue/keynote notes open from an animated Edition details disclosure instead of occupying a permanent second card.
- Replaced free-text accountable-owner entry with the shared app dropdown, populated from active organizer memberships and labelled with each organizer's name and email. Older assignments remain visible until an active organizer is selected.
- Replaced comma-separated collaborator entry with an organizer multi-select that stays open for multiple choices, shows selected counts and checkmarks, and prevents the accountable owner from also being selected as a collaborator.
- Aligned Priority and Target date as equal-height drawer controls, replacing the browser date field with the shared DevCongress calendar, day-first dates, coordinated dropdown dismissal, arrow-key navigation, focus restoration, and viewport-contained scrolling.
- Kept the Add task action visible for every organizer instead of silently removing it: Angela sees the active create action, while other organizers see a clearly locked control that explains the named-creator restriction without weakening server authorization.
- Consolidated the Annual Conference edition label, workspace navigation, page title, description, and page actions into one shared header so Work Plan, Volunteers, and Overview no longer repeat the same context.
- Removed the duplicate Delivery Map from the Annual Conference overview; workstream progress remains available in the Work Plan.
- Moved task creation, details, and editing into one accessible right-side drawer with a transform-only Slide in, a subtle left-origin content entrance, Escape/backdrop dismissal, focus trapping and restoration, scroll locking, and reduced-motion support.
- Removed organizer breadcrumbs and their event-name lookup so pages begin directly beneath the primary or event navigation without an extra context strip.
- Rolled back the route-wide minimalist/editorial redesign to the earlier DevCongress presentation: cream canvas and header, saturated yellow and pink accents, ink borders and offset shadows, and boxed tabs.
- Restored the established route compositions for Events, Attendance, Feedback, Annual Conference, Organizers, Audit Log, and event-scoped work instead of applying one flattened surface and progressive-disclosure pattern everywhere.
- Kept the approved functional work: Supabase-only organizer authentication, the branded first-load gate, event-only Feedback Hub, compact Annual Conference Work Plan and Volunteers actions, four task statuses, one accountable owner, collaborators, and named task-creation permission.
- Returned lifecycle guidance, organizer access rules, event-feedback analytics, and Annual Conference workstreams to the earlier visible interaction patterns without the resize wobble introduced by the redesign.
- Verified nine organizer routes at 1440px, 900px, and 768px, plus Mobile Ops at 390px, with no browser errors or horizontal overflow.
- Verified all 88 tests, `pnpm typecheck`, `pnpm build`, and `git diff --check`.

## 2026-07-26 — Event-only Feedback Hub

- Changed the organizer Feedback Hub to open event feedback reports directly instead of presenting website and event feedback as two separate streams.
- Removed the website-notes card, website-feedback inbox, and app-shell website-feedback badge from the active organizer UI.
- Simplified each event row to Responses, Rating, and Attend again; missed-session analysis remains in the detailed event report.
- Replaced the response download button's heavy black fill with the app's yellow action treatment.
- Preserved event campaign, response, preview, QR-display, and month-aware return links while leaving the legacy app-feedback storage and API contract untouched.

## 2026-07-26 — Annual conference overview and shared work plan

- Replaced the static annual-conference overview with live progress, provisional 19 December edition facts, current venue/keynote decisions, and per-workstream delivery counts.
- Added a searchable, filterable Work plan with exactly Not started, In progress, Blocked, and Done; all organizers can edit task details, accountability, collaborators, dates, dependencies, and notes.
- Replaced the full-card task stack with a compact status strip, eight-workstream snapshot, and bounded task ledger so organizers can scan the conference on one screen and disclose task details or editing only when needed.
- Imported the 26 non-empty Excel rows as a one-time December 2026 seed, assigning the first listed person as accountable and the remaining names as collaborators while leaving `All`, `TBD`, and blank owners unassigned.
- Defined the live volunteer form as Done without treating review, assignment, briefing, or communications as complete.
- Added relational Supabase edition/task tables with a local JSON fallback, authenticated API routes, audit entries, input validation, and server-enforced task creation restricted to `angelateyvi@gmail.com`.
- Kept finance as a later restricted module and left reminders out of this release.
- Verified all 86 tests, `pnpm typecheck`, `pnpm build`, authenticated local API reads/authorization, and zero horizontal overflow at 1440px and 900px.

## 2026-07-26 — Optional monthly system design sessions

- Added an explicit `Not this month` choice to the incomplete `Prepare system design session` checklist milestone, including for events that have already been published.
- Persisted that per-event choice through the existing checklist `disabled_at` state, so no database or event-schema migration is required.
- Made the event tab bar consume the shared checklist query and render System Design as a genuinely non-interactive tab with no link when that month excludes the session.
- Added `Include this month` to reverse the choice, restore the tab immediately, and keep other published checklist milestones protected from availability changes.
- Added focused policy tests and verified both directions in a 1280×900 browser run against a published monthly-event fixture.
- `pnpm typecheck`, all 80 tests, `pnpm build`, and `git diff --check` pass.

## 2026-07-26 — Clear Luma rate-limit messaging

- Preserved Luma's upstream rate-limit failure as an HTTP 429 and now tell organizers that Luma is temporarily limiting DevCongress imports instead of collapsing the failure into a generic 502.
- Applied the message consistently to event preview, public-page preview, and confirmed import.

## 2026-07-26 — Generated speaker links open the private intake form

- Registered the generated `/speaker-talks/:eventId/:token` URL with the active Vue router so private backfill and selected-speaker links no longer fall through to the Events page.
- Kept speaker intake as a standalone public exception without organizer navigation and added focused route coverage for event and token matching.

## 2026-07-26 — Bounded monthly feedback windows and downloadable reports

- Restored a real server-enforced feedback window for monthly meetups: forms without an explicit deadline now close 24 hours after `end_date`, or after `event_date` when no end time exists.
- Kept late feedback recoverable without leaving forms open indefinitely by adding `Reopen for 24 hours`, plus an explicit `Close now` action for organizers.
- Updated published feedback screens to show accurate Scheduled, Open, Auto-closed, or Closed status and expose attendee links/QR controls only while submissions are accepted.
- Added an aggregate response dashboard with rating-distribution bars, a return-intent donut, and per-session score bars that keep missed-session counts separate from averages.
- Removed the individual-response inbox from the organizer page and replaced it with one header-level CSV download containing every submission, one response per row, and all configured questions as columns.
- Extracted the export into a pure tested helper and neutralized formula-like attendee answers before they reach spreadsheet software.
- Kept the reporting surface dependency-free and extracted its aggregate calculations into a pure tested module.
- Added six focused feedback-window tests covering monthly automatic windows, manual publishing, explicit reopening, manual closure, and unchanged quarterly behavior.
- Added five focused reporting tests covering distributions, per-session averages, missed-session exclusion, yes/no summaries, comments, and empty states.
- Verified both close/reopen UI states in a local 1280×900 browser run, then exercised the aggregate dashboard and zero-overflow tablet layout with 200 mocked responses.
- `pnpm typecheck`, all 77 tests, `pnpm build`, and `git diff --check` pass.

## 2026-07-26 — Organizer responsive and performance hardening

- Added one canonical authenticated Mobile Ops route and shared viewport policy, so phones resolve to the limited organizer surface before desktop route components load while tablets and desktops retain the full console.
- Limited the phone surface to at most three priority events and three grouped unavailable-work categories, with no bypass into setup, editing, attendance/feedback operations, access, audit, reporting, or bulk-table tools.
- Kept full organizer capability from 768px upward and made the primary organizer navigation adapt into a zero-overflow grid across tablet widths.
- Added five focused viewport-policy tests covering phone redirects, safe standalone routes, unauthenticated routes, and tablet/desktop return behavior.
- Deferred event tabs and optional browser Supabase sign-out cleanup, removed unused Pinia and Fontshare payloads, hoisted repeated Mobile Ops formatting work, and replaced dynamic viewport-height dependencies with stable small-viewport units.
- Reduced the built main JavaScript chunk from 127.46 kB to 71.42 kB gzip (about 44%) while moving optional Supabase browser code behind a dynamic import.
- Verified phone and tablet routing/overflow in an emulated browser; `pnpm typecheck`, all 61 tests, `pnpm build`, and `git diff --check` pass. A live Chrome DevTools Core Web Vitals trace remains outstanding because that browser integration is not configured in this workspace.

## 2026-07-26 — Anonymous event feedback and honest session ratings

- Removed name and email collection from attendee event-feedback forms and stopped event-feedback submissions from storing page paths or browser user agents.
- Kept the existing per-event random browser token as a soft duplicate guard; the server hashes it before storage and does not use attendee identity to enforce one response.
- Added a distinct `Did not attend this session` answer beside every 1–5 session rating, with generated session questions requiring either a rating or the non-attendance choice.
- Whitelisted feedback values server-side by question type, including 1–5-only rating validation and event-talk validation, so arbitrary browser payloads cannot contaminate organizer reports.
- Excluded non-attendance from all rating averages while adding separate missed-session counts to event response reviews and monthly feedback summaries.
- Removed attendee identity from the organizer response API and UI, including historical event-feedback rows shown through the console.
- Added focused answer-contract tests and confirmed that the existing JSON answer storage supports the sentinel without a Supabase migration.

## 2026-07-26 — App-wide physical button feedback

- Added one delegated pointer-feedback system for every enabled native button, so pressable controls move down 2px and compress subtly before releasing with a fast ease-out.
- Kept the feedback pointer-only, interruptible, transform-only, disabled-button safe, multi-touch safe, and compatible with existing button hover/color transitions.
- Disabled the physical movement under `prefers-reduced-motion` while preserving normal button activation and keyboard behavior.

## 2026-07-26 — Organizer sign-in concept redesign

- Replaced the existing split credential page with the selected editorial Programme Cover design on the real organizer login route.
- Removed the design-preview switcher, query-parameter selection logic, Night Pass, Welcome Table, and their unused responsive styling so the chosen direction is the sole production sign-in experience.
- Expanded the decorative year from the ambiguous `26` shorthand to `2026` and kept it explicitly labeled as the organizer-edition programme year.
- Preserved Google OAuth, intended-destination storage, callback errors, and the local-password fallback while adding an explicit session-checking state that prevents Google/local controls from flashing incorrectly.
- Kept authentication errors persistently visible beside the controls, added provider and security iconography, strengthened focus and loading semantics, and removed automatic password focus on phones.
- Applied the shared Inter/IBM Plex Mono type system, DevCongress brand tokens, 8px spacing rhythm, restrained 6/8/12px radii, purposeful transform-only interaction feedback, and reduced-motion fallbacks.
- Refined the Programme Cover Google action from a heavy solid-black block to a paper-white editorial control with ink text, a crisp border, and a restrained yellow edge.
- Verified the Google and local-password layouts at desktop and phone widths, including mobile scroll containment and horizontal overflow; `pnpm build` and all 56 tests pass.

## 2026-07-26 — Product operating model and domain decisions

- Added the first Annual Conference workspace at `/organizer-console/annual-conference/2026`, with a December 2026 overview and a working Volunteers section nested inside it.
- Replaced the global Volunteer Hub navigation item with Annual Conference so volunteer operations are no longer presented as a year-round top-level organizer domain.
- Preserved `/volunteer/december-mega-meetup`, its QR destination, the `december-mega-meetup` campaign identity, existing application storage, and both volunteer APIs; no Supabase migration is required for this workspace slice.
- Redirected the former organizer volunteer and QR-display routes to their new conference locations so bookmarks and internal links remain compatible.
- Added a single product operating model for the year-round DevCongress operations platform, covering system boundaries, official and external event classification, the annual December conference, people and event-scoped access, public API compatibility, moderation, persistence, and delivery sequencing.
- Recorded the accepted architecture decision to separate event ownership, DevCongress series, format, submission source, moderation, and publication instead of overloading the existing meetup category.
- Documented that `events-management` remains the operational source of truth, `devcongress.org` remains the public surface, and the existing meetup API will be extended additively before public external-event submissions are introduced.
- Marked annual conference operations and community submissions as confirmed direction rather than already implemented features, and captured the remaining role, ticketing, sponsor, moderation, and retention questions explicitly.
- Added a living December 2026 conference plan covering event decisions, speakers, volunteers, task assignments, registration, sponsors, venue/production, creative, media, feedback, and finance, with accountable-owner and target-date placeholders for the organizer team to complete.
- Recorded expenses as an explicit annual-conference workstream, including budgets, approvals, purchases, receipts, reimbursements, sponsor income, audit history, and actual-versus-budget reporting while leaving the financial capability model open for design.
- Defined the annual conference as an edition-scoped workspace inside the existing organizer console, with overview, work plan, programme, volunteers, registration, sponsors, logistics, marketing/media, finance, feedback/reporting, and access modules that can ship incrementally while monthly, quarterly, and special event operations continue.
- Protected the existing December 2026 volunteer form as a compatibility contract: the current link and QR remain valid, any new 2026 link feeds the same campaign/list, existing applications survive relational migration, and future annual editions receive separate campaign identities.
- Refreshed the repository planning files so ongoing work tracks the current year-round operations direction instead of the completed prototype community-hub phase.

## 2026-07-25 — Organizer sign-in pass and session cleanup

- Constrained the December volunteer-form headline to its desktop grid column so the DevCongress word wraps cleanly rather than sitting underneath the form at mid-sized desktop widths.
- Added a standalone December Mega Meetup volunteer form for name, email, X handle, and Slack name, plus a private Volunteer Hub and TV-safe QR display for organizers. Applications use the existing Supabase shared-document compatibility store, enforce per-campaign email de-duplication, and add optional Turnstile plus per-client rate limits; no new Supabase migration is required.
- Made the protected organizer feedback QR display a dedicated standalone surface, removing inherited organizer navigation, breadcrumbs, and phone-ops replacement while keeping the route protected. Added restrained pink and yellow structural accents to improve at-a-distance readability without changing the attendee feedback form.
- Documented the planned Supabase-plus-Resend speaker-link email feature: DevCongress sending-subdomain setup, code-owned templates, safe server-side delivery contract, audit/delivery records, and later test/release checks. No email sending behavior was added.
- Restored organizer-only event-feedback distribution tools: draft preview, live attendee-link copying, and a protected QR display route. The QR display now becomes available as soon as a campaign is open, including manually published campaigns.
- Added accessible move-up and move-down controls to every editable program-outline row. Reordering is immediate in the draft and persists through the existing Save outline action, so organizers can adapt the run of show when speakers or sessions change on the day.
- Corrected the deployed Worker origin contract for the `em.devcongress.org` custom domain. `PUBLIC_APP_URL` and `PUBLIC_FRONTEND_ORIGIN` now allow the actual browser origin, so authenticated state-changing requests such as sign-out are no longer rejected with `Invalid request origin`.
- Pinned the Worker to the DevCongress Cloudflare account in `wrangler.toml`, preventing local deploys from stopping when more than one Cloudflare account is authenticated.
- Updated the Cloudflare, Google OAuth, and environment-variable documentation to use the organizer console's custom production hostname rather than the historical Pages hostname.
- Reworked the organizer sign-in into the selected “Pass” design: a responsive DevCongress credential surface with component-level ink, warm-paper, ticket-yellow, and pink tokens, one clear Google action, and the existing local-password fallback for development.
- Hardened sign-out across both authentication layers: a successful server logout now immediately clears the client session cache, tab-scoped Supabase browser session, and pending OAuth redirect before replacing the route with the organizer sign-in screen.
- Made the optional browser Supabase cleanup non-blocking, so a browser-side provider failure cannot prevent a confirmed app logout from reaching the organizer sign-in screen.
- Kept a failed sign-out on the current screen with explicit error feedback, avoiding a misleading redirect while the session state is uncertain.
- Verified a complete local password sign-in/sign-out cycle: the server session became unauthenticated, the app returned to `/organizer-console/login`, and all organizer navigation/sign-out controls disappeared. Also verified `pnpm build` and whitespace checks.

## 2026-07-25 — Admin-only organizer surface

- Made legacy archive backfill links speaker-bound: organizers now issue each one to a named email, can create multiple links with the same expiry for different speakers, and the public form locks identity to the invitation instead of trusting submitted name/email fields. Older anonymous backfill links now close and must be reissued.
- Restored the organizer login to the established DevCongress editorial system: shared cream/paper/ink/pink tokens, the existing panel/input/action primitives, and a compact viewport-fitting form rather than a separate marketing-style split screen. Navigation now stays hidden until the organizer session is authenticated.
- Refined the Google-only organizer sign-in into a clearer private-console entry point and removed redundant allowlist copy from the screen.
- Made the desktop organizer sign-in a two-column console entry, with the operational context separate from the single Google sign-in action; it remains compact and stacked on smaller screens.
- Fixed the local login page module load by binding the public brand asset at runtime, preventing Vite from requesting it as a JavaScript import through the Hono fallback.
- Replaced the native program-outline type picker with the shared app dropdown, so the editor uses the same controlled menu, selected state, focus treatment, and compact field sizing as the rest of the organizer console.
- Redirected the root and former public Vue routes into the protected organizer console, so this deployment no longer competes with `devcongress.org` as a community website; the standalone event-feedback form remains the intentional attendee-facing exception.
- Removed public feedback preview, share-link, and attendee QR controls from the organizer UI; feedback setup and response review remain private operations while public experiences move to the Astro website.
- Removed the feedback-display browser route and its mobile shortcut, keeping the phone surface focused on organizer actions.
- Redesigned organizer sign-in around the actual authorization model: an approved Google account is required, and a valid Google identity alone is not sufficient. The page now has clearer error feedback, accessible alert semantics, responsive layout, focused typography, and restrained motion with reduced-motion support.

## 2026-07-25 — Organizer performance and debt pass

- Cut organizer auth overhead per API request: `requireAdmin` now reuses the middleware-resolved session from the Hono context instead of re-querying Supabase in every handler, and `auditAdminAction` consumes that same cached session instead of a third lookup.
- Throttled the `admin_sessions.last_seen_at` bump to at most once per minute and made it non-blocking; it was an awaited write on every authenticated request.
- Removed the artificial 300ms `SIMULATED_DELAY_MS` sleep from the Hono `GET /api/quiz/state` route, which every client poll paid every 1.5s.
- Parallelized the whole-document reads behind quiz state build/advance and dropped a duplicate full `responses` collection read per poll.
- Made `reorderQuestions` O(n) via an id map instead of a `find` per question id.
- Organizer client: deduped background session revalidation on navigation (30s staleTime instead of forced refetch per route change); scoped checklist-toggle invalidation to the event+checklist keys unless the milestone changed the event itself; parallelized selected-speaker link generation PATCHes; replaced per-row filter+sort speaker-link lookups and feedback question lookups with precomputed id maps; debounced and hoisted the attendance ledger search; cached event-date timestamps in the attendance consistency aggregator; stable-keyed program outline edit rows; lazy-loaded the `qrcode` chunk and skipped QR regeneration outside live mode.

## 2026-07-10 — Website integration architecture plan

- Audited the current Astro/GitHub Pages website, Events Management Worker/Supabase runtime, organizer auth flow, and live deployment boundaries without changing the website repository.
- Defined a static-first Cloudflare Worker with Static Assets target that keeps public pages prerendered while moving organizer and community routes behind the `devcongress.org` origin.
- Documented the staged parity cutover, private Service Binding bridge, Hono route-group extraction, Supabase persistence risks, organizer UI seam, vertical feature order, and rollback requirements in `docs/website-integration/`.
- Made Supabase Postgres the explicit durable system of record for every dynamic organizer/community domain, with Auth for organizer identity, Storage for media, and Durable Objects limited to transient live coordination.
- Audited the live Supabase project read-only, recorded aggregate row/storage baselines, identified live-vs-`main` schema drift and migration-version collision, and mapped every JSON compatibility domain to its relational migration wave.
- Left the proposed platform/repository decisions uncommitted as ADRs until user approval.

## 2026-07-09 — Speaker intake topic dropdown fix

- Replaced the speaker talk intake Topic text field with the shared app dropdown, using the same Frontend, Backend, DevOps, AI/ML, and related topic choices as the public CFP flow.
- Preserved already-prefilled custom topics as selectable current values so existing intake links keep showing their stored topic accurately.
- Summarized long Program abstracts in organizer talk cards by default, with an explicit toggle to review the full submitted abstract without changing stored speaker content.
- Summarized long published talk descriptions on public event and archive pages so detailed speaker submissions do not overwhelm attendee-facing pages.
- Collapsed duplicate Accept and Publish controls on Program talk cards into one primary status action with visible saving and success/error feedback.

## 2026-07-06 — Organizer allowlist pagination fit

- Reworked Organizer Access pagination so the allowlist keeps five row slots without the oversized blank min-height that caused the page scrollbar and empty space on shorter pages.
- Tightened Organizer Access vertical spacing so the five-row allowlist and pagination controls fit the intended desktop viewport more cleanly.

## 2026-07-06 — Speaker intake standalone fix

- Made one-time speaker talk intake links render as standalone forms without the public app navigation, breadcrumbs, feedback launcher, or organizer/community chrome.
- Removed the manual talk-entry form and on/off speaker-form toggle from Legacy Backfill so the page focuses on generated speaker archive links.
- Added a persistent Backfill Link Shelf: newly generated links remain copyable/openable from Legacy Backfill, show active/used/expired status, and can be removed by organizers.
- Disabled expiry-duration options that already have active backfill links, and blocked duplicate active links for the same duration on both the UI and API.
- Blocked CFP opening and direct public CFP submissions for past or non-monthly events, keeping CFP available only for upcoming monthly meetups.
- Paginated the Organizer Access allowlist at five rows per page with a stable page height so long access lists no longer stretch or jump the admin security page.
- Moved selected-speaker slides links into one Proposals shelf: links are still private per speaker, but organizers can generate missing links and copy/open them from one place once speakers are selected.
- Removed the public My Talks/Speaker Desk route and unauthenticated talk lookup/update surface so slide collection now runs through organizer-issued private speaker links.

## 2026-07-05 — Quarterly recap media fix

- Added archive event media to the public recap payload so uploaded meetup photos appear on `/archive/:eventId`, not only on `/events/:slug`.
- Hid the empty Published Talks section for quarterly recap pages when there are no published talks, since quarterly meetups are recap/media-first.
- Added raw `shared_links` support for quarterly meetup recap links, gave organizers a quarterly-only Shared links editor on the event overview page, and seeded the July quarterly recap with the six links shared during the room.
- Routed completed quarterly meetups to Feedback instead of Attendance and hid attendance checklist/access points from quarterly event workspaces for now.
- Replaced the monthly CFP/program checklist with a two-item quarterly meetup checklist: create the event shell, then update it with the G-Meet link from Edem.
- Removed Back to Home navigation from closed/submitted speaker one-off links so the flow ends without sending speakers into the app.
- Pinned local Google organizer sign-in to `http://localhost:5173`, blocking OAuth launches from other local origins so testing ports do not bounce organizers into the deployed console.

## 2026-07-03 — Talk Management workflow split

- Split Talk Management into nested CFP, Proposals, Program, and Legacy Backfill routes under the existing Talks event tab.
- Made `/talks` redirect to the CFP setup step so the permanent CFP-to-program flow is the default path.
- Kept Legacy Backfill separate and explicitly temporary so last-month cleanup no longer competes with the lasting CFP workflow.
- Stabilized switching between Talk Management workflow sections and replaced the nested pills with a wide sliding segmented control.
- Refined expanded proposal details into readable abstract/bio sections with a separate metadata panel for submitted date, email, and GitHub.
- Added per-row selected-speaker slides link generation so organizers can create, copy, and open the confirmation link from the selected speaker list.
- Changed speaker-link copy feedback from a toast to a temporary inline Copied/checkmark button state.

## 2026-07-02 — CFP speaker selection workflow

- Split public CFP interest from confirmed talks so proposals land in a speaker-submissions inbox before organizers select or reject them.
- Added selected-speaker confirmation links that reuse the expiring one-time intake form without confusing them with archive backfill links.
- Stopped requiring public CFP submitters to already be on the approved speaker list.
- Moved CFP open/close controls into Talk Management, kept checklist CFP rows as process visibility, and collapsed the empty Talks page into one combined program empty state.
- Reworked the CFP control panel into a compact status-and-share strip with copy/open actions and grouped state controls.
- Improved the public CFP form with required field validation, red required markers, side-by-side contact/topic fields, searchable custom topics, and word-count limits for abstracts and speaker bios.
- Kept CFP URLs public and shareable after organizers close submissions, showing visitors a polished closed-state message instead of an unavailable form.
- Made the public CFP route standalone by hiding the app navigation/feedback chrome and replacing the plain submitted state with a more polished proposal receipt.
- Added a manual refresh action to the organizer CFP inbox and compressed speaker proposals into single-open list rows with slim accordion detail previews.
- Removed the redundant proposal Details button so the row itself opens the inline proposal detail.
- Changed selected-speaker links into a slides-only flow that creates the confirmed talk from the original CFP proposal, while archive-backfill links keep the full details form.
- Split generated link output so archive-backfill links stay in the archive panel and selected-speaker slides links appear in the CFP inbox context.

## 2026-07-02 — Header reload scrollbar fix

- Hid the primary header nav's internal scrollbar and clipped vertical overflow so organizer reloads no longer flash a black scrollbar thumb beside the mode/sign-out actions.

## 2026-07-02 — Mobile paused-state centering fix

- Vertically centered the paused My Talks and Leaderboard content on normal-height phone screens while keeping short phone screens top-safe.
- Reworked page skeleton loaders into first-viewport previews on mobile so they show useful structure without creating fake loading-page scroll.
- Prevented organizer route skeletons from making the desktop organizer work area scroll while loading, then restored normal scrolling after content loads.

## 2026-07-01 — Organizer mobile ops and route perf

- Added a mobile-only 45-degree coming-soon ribbon to the speaker My Talks form so the paused state remains visible when the compact phone layout hides the larger masthead.
- Centered the admin sign-in card in the mobile viewport instead of pinning it near the top below the app header.
- Gated feedback QR access by event date so future events no longer expose the QR action even when their feedback window is already open.
- Removed the remaining inline success banner from Talk Management so speaker-link generation, copy, manual talk creation, and reminders all use app toasts.
- Added a phone-only organizer ops surface that shows current/next event cards, public/registration/source links, and feedback QR access when feedback is open.
- Blocked full organizer workspaces on phone-width routes while keeping organizer login/auth and feedback QR display available.
- Aligned the mobile app-shell breakpoint with the organizer phone-view breakpoint so community and organizer routes use the same compact header/menu treatment through 767px.
- Added mobile tap-action handling for pressable controls so phone interactions feel immediate without changing desktop behavior.
- Lazy-loaded Vue route components so public visitors and mobile organizers do not download every page workspace in the initial app bundle.
- Reused cached event data for organizer breadcrumbs and fell back to a single-event fetch, avoiding repeated full event-list requests while moving between event workspaces.
- Added follow-up technical-debt notes requiring the `$thumb-first` suite for mobile/header artifact investigation, performance QA, and the structured organizer code-review/audit checklist.

## 2026-07-01 — Talk Management toast fix

- Moved the one-time speaker-link generated confirmation from the full-width inline success banner to the app toast system, keeping the generated link card focused on copy/open actions.
- Moved the speaker-link copied confirmation to the same toast system and kept the copy button label stable so the Talk Management panel does not shift after copying.
- Added `APP_DATA_SOURCE` so local/dev runs default to JSON data and local password auth even when Supabase credentials exist, while the deployed Worker explicitly keeps Supabase enabled.

## 2026-06-30 — Attendance event gate fix

- Kept event attendance CSV import locked until the actual meetup has ended, so next-month events no longer become uploadable just because the previous month reached its last Saturday.
- Applied the same event-completion gate to Attendance Hub rows so future meetup months show as not open and do not expose upload actions early.

## 2026-06-30 — Audit log page polish

- Scoped Supabase organizer OAuth PKCE storage to the current browser tab so parallel organizer sign-in attempts cannot overwrite each other's verifier before callback.
- Removed the redundant open-state badge from Feedback Hub event rows while keeping preview and QR actions as the explicit ways to access forms.
- Routed upcoming-event `Prepare` actions to the event overview instead of the paused quiz page so the Overview tab is highlighted after navigation.
- Increased spacing between event-list primary actions and the destructive Remove control so organizers are less likely to misclick while reviewing events.
- Let organizers disable incomplete milestones on unpublished event checklists while keeping those rows visible and excluded from progress.
- Replaced the audit log filter selects with the shared app dropdown component, removed the actor email search field, and added a grouped-by-email view toggle.
- Kept the audit log filter bar sticky inside the organizer scroll area and paginated recent audit rows into compact pages for dense owner-only activity reviews.
- Kept the audit activity summary and table header sticky under the filter controls while reviewing long owner-only logs.
- Reduced audit-log page height with a smaller page size, compact row spacing, fixed table columns, and truncated summaries so pagination remains visible without horizontal overflow.
- Aligned Feedback Hub event-row actions beside the response metrics on wide screens so the buttons no longer drop beneath the `Attend again` stat.
- Removed the unused Feedback Hub reports side column so event rows get the full card width and their action buttons stay beside the metrics.
- Disabled `View responses` on published event feedback rows with zero responses while leaving Configure and QR actions available where relevant.
- Preserved the selected event-feedback month when drilling into an event's responses, so `Back to Feedback Hub` returns to the same period.
- Reduced the attendance ledger page height with compact rows, truncated cells, and smaller pages so its pagination stays visible in the viewport.
- Moved the feedback form remove action into the Community Link controls and removed the separate rare-action card.
- Removed the duplicate Recent Responses sidebar card from the feedback form setup page because response review already lives in the main responses view.
- Restored the public home Top Regulars card by including attendance regulars in `/api/public/home` and wiring the dashboard to that payload.
- Ranked attendance regulars by check-ins first, then attendance rate, registration count, recency, and name so perfect repeat attendance wins tied check-in counts.
- Removed organizer-only check-in counts and attendance percentages from the public Top Regulars card.
- Added the original Luma source link to the organizer About Page card when an event was imported from Luma.
- Matched the Audit Log skeleton loader to the current sticky filters, activity summary, fixed-column table, and pagination layout.
- Capped and compacted organizer and community skeleton loaders so loading states no longer create their own page scrollbars.

## 2026-06-30 — Attendance upload window fix

- Opened attendance CSV import for same-month events once the specific event has ended, while keeping future current-month events locked.
- Clarified the public archive system-design source action so the prompt deck or source sheet link reads as a clickable action instead of a decorative label.
- Added a data-source health endpoint so local and deployed runtimes can confirm whether Supabase-backed domains share the same project and which remaining domains still use runtime-local JSON.
- Fixed the Feedback Hub monthly response counts to use the same configured event-feedback store as the event detail page, so Supabase attendee submissions are counted in both places.
- Smoothed Feedback Hub state changes with coordinated pane, row, and count transitions so stream switches, period changes, and response-count updates feel less abrupt.

## 2026-06-30 — Speaker talk backfill

- Added an organizer manual talk form for confirmed or past talks, with optional slide links and immediate archive publishing.
- Added public speaker archive form links from Talk Management so organizers can generate month-scoped, expiring, one-time links for speakers to fill the same post-event details form.
- Made the speaker form the default backfill mode and collapsed manual entry behind a toggle, with disabled controls and a short accordion/collapse transition.
- Slowed the manual-entry collapse state and moved the speaker-link validity picker onto the shared app dropdown component.
- Kept the event-admin tab rail sticky while organizer pages scroll, including the mobile fixed-header offset.
- Kept manual talk entry aligned with speaker access by creating the speaker allowlist row when needed.
- Kept the speaker My Talks lookup and event speaker-access management surfaces visually present but disabled with the coming-soon treatment.
- Made the event checklist derive visible milestones from currently available features, hiding paused CFP, speaker-access, talk-material, quiz, and manual event-day-start work while keeping event creation, publishing, system design, completion, attendance, feedback, and archive tasks available.
- Made the `Publish archive` checklist milestone explicitly publish the event to the public site and mark it completed, so published talks from speaker-intake links appear in the public archive without relying on paused workflows.
- Documented the active URL-only slide-link flow and the backfill workflow for pre-app events.

## 2026-06-30 — Quiz creation pause

- Disabled the empty-state quiz creation button in the organizer quiz builder and marked the action with a coming-soon tag while the quiz workflow remains paused.
- Standardized coming-soon labels onto the diagonal yellow corner-ribbon treatment used by paused panels and mastheads.
- Gave paused event tabs such as Speakers and Quiz a disabled visual state instead of active or badge-style treatment.

## 2026-06-30 — Local organizer auth redirects

- Made non-production auth redirects prefer the current localhost request origin over deployed public origins, so local Google sign-in callbacks stay on the dev server instead of jumping to the Pages URL.
- Documented the Supabase redirect allowlist entries needed when local development runs on a non-default port.

## 2026-06-26 — System design prompt links

- Extended the organizer Program outline editor with a one-click monthly system-design scenario row.
- Added outline description and primary resource fields so organizers can save Google Slides prompt decks as structured `system_design` schedule resources.
- Show saved outline descriptions and resource links in the event overview before publishing them to the public meetup page.
- Kept timing ownership in the Program outline by removing the time field from the dedicated System Design artifact editor while preserving existing outline times on save.
- Added a full-width draft generator for public system-design notes so organizers can prefill readable scenario copy from the title, facilitator, and prompt link before replacing it with the actual post-event recap.
- Replaced the generic system-design draft placeholder with a server-backed Google Slides parser that reads public presentation text exports, infers a title, and generates a concrete recap draft from the actual deck content.
- Simplified the dedicated System Design editor by removing the separate prompt-label field and making public/archive scenario titles themselves open the linked prompt deck.
- Tightened shared button disabled states so in-progress actions stop showing hover/press affordances, and locked the System Design editor's sibling actions while draft generation is running.
- Added a proper saved state to the dedicated System Design page so saved scenarios show a clear stored indicator plus explicit edit and remove actions instead of leaving organizers in an always-open form.
- Kept public system-design discovery inside each meetup archive entry: public meetup system-design links now return to the parent archive page, archive search stays event-based, and archive meetup pages show the recap copy plus prompt-deck links inline.
- Synced the dedicated System Design editor back into existing outline slots, so when an event already has a `System Design session` row the scenario title, recap, facilitator, and prompt-deck link now attach to that row instead of creating a duplicate `TBD` system-design entry.
- Sent past-meetup `View recap` CTAs directly to the monthly archive entry and removed the duplicate standalone system-design recap block from the public meetup page so recap content now lives in one place.
- Normalized stale event lifecycle statuses from event dates on server reads, so published meetups that already ended now show up in archive/dashboard flows as `completed` even if an organizer left the stored row on `live` or another earlier phase.
- Gated non-public API routes behind organizer authentication so only `/api/public/meetups*` remains open for unauthenticated website consumption, with auth routes left available for sign-in.
- Added narrow public home and archive APIs, moved the public dashboard/archive pages off `/api/overview`, and reduced public feedback form responses to attendee-safe event, campaign, and talk labels.

## 2026-06-25 — Migration closeout

- Archived the old `Elvis020/devCon-comm` GitHub repository now that `devcongress/events-management` is the active home.
- Confirmed Cloudflare Pages production deployments are still coming from `main`, with the latest listed source commit present in the new repository, while documenting the historical `devcon-comm` Pages project name.
- Updated the contributor setup path from the old local folder name to `events-management` and re-ran the deployed public meetup API verifier against the final Pages URL.

## 2026-06-22 — Migration verification wrap-up

- Switched this checkout's `origin` remote and branch tracking to `devcongress/events-management` now that the new repo is the active home.
- Re-ran the public meetup API contract verifier against `https://events-management.pages.dev` and confirmed the deployed Cloudflare app passes.
- Cleared the remaining Turnstile migration blocker after verifying both the floating feedback bot and the standalone `/feedback` route can submit on the final Pages hostname.

## 2026-06-21 — Cloudflare migration wiring

- Updated repository configuration and docs to point at the new DevCongress Cloudflare Pages and Worker deployment URLs.
- Renamed the Wrangler Worker target from `devcongress-comm-api` to `events-management` and updated the Pages API proxy origin.
- Marked the completed GitHub, Pages, Worker URL, Worker secrets, Supabase Auth, Google OAuth, health-check, auth-mode, Turnstile hostname, and README-link migration tasks in the repository migration checklist.
- Recorded the remaining Turnstile feedback-form blocker: the live `/feedback` widget returns client error `110200` for the compiled site key on the new Pages hostname.
- Renamed the package metadata to `events-management` and restored the public meetup API's cache/CORS headers so the website integration verifier can pass after redeploy.
- Collapsed both the floating feedback bot and the standalone `/feedback` route into a high-contrast receipt-only state after a browser sends feedback or enters the cooldown window.

## 2026-06-21 — Repository migration checklist

- Added a central checklist for moving active development from `Elvis020/devCon-comm` to `devcongress/events-management`, covering GitHub, Cloudflare, Supabase Auth, Google OAuth, Turnstile, docs, and final smoke checks.
- Linked the checklist from the documentation map for integrators and maintainers.

## 2026-06-21 — README documentation gateway

- Shortened the root README into a contributor-friendly entry point that links into the centralized `docs/` folder instead of duplicating detailed product, setup, and feature guidance.
- Kept quick-start commands, key capabilities, documentation tables, technology stack, contribution guidance, security, and license information in the root file.

## 2026-06-20 — Android mobile scroll fix

- Released the mobile app shell from the desktop inner-scroll layout on every route, including organizer/admin pages, so Android Chrome can scroll the document normally.
- Added a coarse-touch fallback so Pixel/Android devices still get document scrolling even when Chrome reports a viewport wider than the small-screen breakpoint.
- Kept the desktop fixed-shell behavior intact while adding a minimum-height guard to the main scroll container.

## 2026-06-20 — Monthly system design sessions

- Added `System design` as a first-class program outline item type so monthly architecture scenarios can sit alongside talks, panels, workshops, and discussion slots.
- Added an organizer System Design tab for each full event workflow, letting organizers maintain the monthly scenario title, facilitator, public recap notes, and prompt link over time.
- Exposed system design rows on public meetup and archive pages so people who missed the in-person event can still read what was discussed and open the original scenario prompt.
- Added a checklist milestone for preparing the monthly system design scenario, with existing checklists backfilled when they are loaded.

## 2026-06-20 — Optional event program outlines

- Added an optional Program outline editor to the organizer event overview so events can store structured time/title/type/lead rows when a run of show exists, while leaving events with no outline unchanged.
- Saved outlines into the existing `event.schedule` field so public meetup schedules and feedback activity drafts can reuse the same structured event flow.
- Added a paste parser for plain text program outlines, including `PROGRAM OUTLINE` headings, final time ranges, `by Speaker`, and `- Speaker` lead formats.
- Updated fresh event feedback campaigns to generate and persist per-activity questions from the saved program outline instead of leaving organizers on the generic default campaign.
- Moved event feedback campaign, question, and submission persistence onto Supabase in deployed environments so Luma-imported Supabase events can create feedback forms without hitting the JSON mock store.

## 2026-06-20 — Pages asset fallback fix

- Updated the Cloudflare Pages worker so stale `/assets/*.js` requests no longer receive `index.html` as `text/html`, preventing strict module MIME failures after a deploy or during organizer sign-in redirects.
- Refreshed the shared admin-session query immediately after local or Google organizer sign-in completes, preventing stale unauthenticated cache state from sending admins back through sign-in a second time.

## 2026-06-20 — Event lifecycle stage details

- Added hover and keyboard-focus detail popovers to the organizer event lifecycle legend so each status explains the stage purpose, expected organizer move, and next action without expanding the page chrome.

## 2026-06-20 — Explicit event series type

- Added an explicit event `series_type` (`monthly`, `quarterly`, or `special`) across the organizer flow so event behavior no longer depends on whether the word `quarterly` appears in the title.
- Updated the Luma import review step to ask organizers which series the event belongs to before import, and threaded that choice into both organizer-side import and public preview payloads.
- Added a simple series-type editor on the organizer event overview page so an imported event can be corrected later without renaming it.
- Replaced the old title-based monthly/quarterly checks in organizer tabs and attendance logic with the new shared field, while keeping a safe fallback for older rows until the Supabase migration is applied.
- Added an organizer feedback QR display page plus a `Show QR` action on live event-feedback rows, so organizers can open a TV-safe screen that attendees can scan directly into the published feedback form.

## 2026-06-20 — Feedback Hub redesign

- Reworked the organizer Feedback Hub around two clear categories: website feedback from the floating widget, and event feedback from monthly, quarterly, or one-off event forms.
- Replaced the heavy yellow route-feedback block with quieter paper-toned panels, restrained metrics, and simpler empty/loading states that match the existing DevCongress palette without dominating the page.
- Made the two feedback category cards the primary entry points, hiding detailed website and event feedback sections until an organizer explicitly opens one.
- Disabled automatic website-feedback inbox fetching on the Feedback Hub; organizers now load or refresh that inbox manually.
- Loosened the event report header layout so the explanatory copy and period/configuration controls no longer crowd each other.
- Removed the redundant selected-month banner from event feedback reports so the event rows start immediately after the period summary.
- Simplified the event report body by showing only active event periods, labeling period buttons by event count instead of response count, and removing aggregate month metrics from the hub so per-event rows carry the work.
- Smoothed event-period switching with a keyed fade/slide transition while letting the report container resize to the selected month.
- Changed the desktop event-period picker to six columns so a complete year stays within two rows.
- Removed the redundant report-level configure action because each event row already links to its own feedback configuration.
- Defaulted event reports to the current month when it exists, and redesigned each event row into a calmer summary with inline status, a compact response stat strip, and cleaner right-aligned actions.
- Trimmed event rows again so the left column stays lighter, the stats own a full desktop strip, and the action sits in a dedicated far-right slot instead of compressing the summary.
- Split event feedback row status tags into their own left-aligned column and muted zero-response counts for draft or unconfigured forms that have not been published.
- Generated event-aware draft questions for the June 2026 feedback campaign, using optional per-session 1-5 ratings for the Fido talks, discussions, and demos instead of the generic default copy.
- Added a final-activity workspace to the event feedback configure screen so organizers can remove skipped sessions, add last-minute activities, generate per-activity rating questions, and preview the draft form before saving.
- Added a standard `Other comments` text question as the final prompt on event feedback forms, with a conservative comment-length cap to stay inside the current Supabase submission limit.
- Reworked public event-feedback question cards so prompts sit fully inside each card as readable sans titles with a two-line cap, giving long talk, demo, and session labels a consistent layout without relying on border text treatment.
- Changed published event-feedback rows to send organizers straight into a dedicated responses workspace, removing the old configure/preview actions once a form is live and replacing the cramped sidebar summary with full submission cards.

## 2026-06-20 — Nav route warmup

- Removed the navbar prefetch path and kept route changes immediate, letting pages swap on-screen first and then show their own skeleton loaders while data resolves.
- Reworked organizer route protection to reuse the cached admin session for in-console navigation, then refresh `/api/auth/session` in the background so organizer nav no longer waits on that request before switching pages.
- Moved the public Events page onto the shared TanStack Query cache so later revisits can reuse the same meetup payload instead of always waiting for a fresh mount-time fetch.
- Added a dedicated audit-log skeleton so every top-level organizer destination now has an on-route loading state instead of a text-only wait message.

## 2026-06-20 — Organizer event removal

- Added a clearer organizer remove flow for event rows, including imported-event labeling plus confirmation copy that makes it obvious an imported Luma event can be removed and re-imported if it came in wrong.
- Fixed organizer event list pagination after a removal so deleting the last row on a page snaps back to a valid page instead of leaving the list on an empty page.
- Made organizer event rows themselves the primary next-step navigation target, so hovering anywhere on a row signals clickability and clicking or pressing Enter/Space opens the event's next organizer page without needing the far-right action text.
- Limited quarterly meetup event tabs to Overview and Feedback so the organizer surface matches the lighter quarterly workflow instead of showing monthly-only sections.
- Reworked Luma import preview so organizers can open the real public meetup page shell before import, while the preview page clearly explains that schedule, speakers, gallery, and recap details can be added later.
- Added an organizer-side About editor on the event overview page so organizers can update the public meetup description copy in place without leaving the control screen.
- Removed the back-link affordance from Luma preview mode so the public preview opens as a clean standalone page in its own tab, without import-flow navigation copy.
- Locked the top Luma URL field and `Preview event` action once a preview is available, so the import flow stays focused on `Preview event page`, `Import event`, or `Clear`.
- Changed Luma import so it creates an organizer-only draft instead of publishing immediately, and added an explicit publish action on the draft event overview that pushes the event into the public community meetup list.
- Updated the shared confirmation dialog so event deletion can show `Removing...` instead of the generic `Working...` while the request is in flight.
- Added lightweight cross-tab refresh for the public Events list so community tabs refetch after organizer-side publish and About-copy updates, without needing a manual sync button.
- Moved the public meetup detail page onto TanStack Query as well, added same-tab refresh signaling for organizer-side publish and About-copy edits, and disabled browser caching on public meetup API reads so description and publish changes appear immediately instead of hanging on stale responses.
- Made imported-event removal final for Luma matches by deleting every Supabase row tied to the same external id or registration URL, and changed Luma import to refuse silent reuse of published matches in favor of an explicit `Remove and re-import` organizer path that creates a fresh draft.
- Simplified the organizer event lifecycle guide into a compact status legend so the event list gets priority and the page no longer spends a full panel explaining the workflow.
- Added compact month and event-type filters to the organizer event table, covering monthly, quarterly, and special events while keeping pagination counts in sync with the filtered rows.
- Refined the shared dropdown treatment with a compact density for table filters, softer menus, lighter trigger borders, and quieter scrollbars.

## 2026-06-19 — Organizer Google sign-in

- Replaced hosted organizer magic-link sign-in with Supabase Google OAuth while keeping the existing app-owned `admin_sessions` cookie model and `admin_memberships` allowlist.
- Changed the organizer login screen to launch Google directly and disabled the hosted `/api/auth/admin/login` magic-link path, while preserving the local shared-password fallback for non-Supabase environments.
- Moved the hosted organizer callback completion fully onto `/api/auth/admin/callback`, and repurposed the old frontend callback route as a safe recovery page for stale magic-link returns.
- Fixed the PKCE callback handoff so the browser keeps the Supabase code verifier across the Google redirect, exchanges the code, then clears the browser Supabase session after the app-owned cookie is created.
- Fixed split-origin Cloudflare callbacks so the API Worker forwards browser-facing OAuth returns to the Pages frontend origin from `PUBLIC_APP_URL` instead of its own Worker origin.
- Reused the organizer session fetched by the route guard so owner-only nav items render immediately for owners, and redirected non-owners away from owner-only organizer routes.
- Relaxed organizer access management so organizers can add or disable other organizers, while owner creation, owner updates, owner disablement, and audit log access remain owner-only.
- Softened the shared skeleton system with quieter paper-tone fills, lower-contrast surfaces, and a slower pulse so loading states feel calm across both light and dark views.
- Changed the shared toast layer to reuse a single app-status toast by default, so follow-up success and error messages replace the current toast instead of stacking multiple alerts.
- Added a router recovery path for OAuth codes that land on the public Site URL and tightened organizer route guards so protected pages re-check the app session instead of trusting prior organizer navigation.
- Updated the auth and deployment docs with Google provider setup requirements, and removed the obsolete email-link flow references.

## 2026-06-17 — Cloudflare organizer auth deploy drift

- Added Cloudflare Worker public origin bindings to `wrangler.toml` so deploys preserve the Pages callback origin used by Supabase organizer magic links.
- Added targeted Worker logging and machine-readable response codes for Supabase OTP send failures so hosted organizer sign-in errors expose the upstream status, code, and redirect origin in Cloudflare logs without leaking secrets.
- Mapped Supabase email-send rate limits to a clearer organizer sign-in message with `429` and `Retry-After` instead of the generic send-link failure.
- Clarified Worker Supabase auth environment docs, including the required anon key and the split between secret keys and public origin bindings.

## 2026-06-17 — Event removal and Luma preview

- Added an organizer event removal flow with a simple reusable confirmation dialog and server-side audit logging for successful deletions.
- Split public Luma event imports into preview and explicit import steps, so organizers can inspect the scraped event shell before it is added.
- Differentiated monthly and quarterly events in the organizer event list while showing the real imported event name instead of a generic meetup label.
- Added a soft anonymous one-response guard for public event feedback forms using per-event browser tokens and server-side token hashes.
- Documented the new Luma preview route and clarified that event APIs can now remove events as an admin mutation.

## 2026-06-17 — Meetup CTA polish

- Updated public meetup CTAs so upcoming meetups use `Register`, past meetups use `View recap`, and action buttons now carry a clearer right-arrow affordance.
- Made the public meetup list CTA destinations match their labels, so registration buttons open the registration URL directly when one exists instead of always routing through the detail page.
- Reworked the meetup detail hero content treatment with a taller cover, bottom-left layout, outlined status pill, app-consistent typography, and clearer metadata contrast.

## 2026-06-17 — Skeleton motion softening

- Added owner-only audit log review at `/organizer-console/audit-log`, backed by Supabase `admin_audit_log` with request context columns and filters for actor, action, and target type.
- Extended server-side audit logging across organizer mutations including logout, Luma imports, event/checklist/media changes, feedback management, attendance CSV import/removal, speaker access, talk review/reminders, and quiz builder changes.
- Reworked shared skeleton loaders to use neutral grayscale surfaces instead of yellow-accented placeholders.
- Replaced the sweeping shimmer with a softer pulse animation and disabled that pulse for reduced-motion users.
- Moved the meetup detail loading state onto the shared skeleton system so it matches the rest of the app.

## 2026-06-16 — Supabase admin auth and organizer allowlist

- Replaced hosted admin sign-in with Supabase email OTP, a token exchange endpoint, and an app-owned HTTP-only admin session cookie, while preserving the shared `ADMIN_PASSWORD` fallback for local development without Supabase auth.
- Added Supabase `admin_memberships`, `admin_sessions`, and `admin_audit_log` tables for organizer email allowlisting, opaque session validation, and security-sensitive action logs.
- Added owner-only organizer email management at `/organizer-console/organizers`, including role assignment and disable access actions.
- Locked the organizer sign-in email field during link-send cooldowns and kept the submitted address visible so valid sign-in attempts cannot be edited mid-countdown.
- Moved hosted organizer magic-link returns onto a dedicated `/organizer-console/auth/callback` route so sign-in completes before the login form can flash its resend countdown state.
- Added cover-image file picking to the organizer create-event form, reusing the shared browser compression flow before the uploaded image is written to Supabase Storage.
- Added shared Zod validation for organizer event creation, disabled the create action until required fields are valid, and marked required fields with red asterisks in the form UI.
- Split public meetup viewing from the archive by adding a dedicated `/events/:slug` meetup detail route, so event cards now open the website-style meetup context while archive pages stay focused on published talks and slide links.
- Reworked meetup detail photo sections from a flat grid into the homepage-style stacked print treatment, including rotating front-photo shuffles and a separate gallery action rail.
- Simplified the organizer access management screen with lighter form chrome, quieter access rows, and plain text role/status treatment.
- Replaced the organizer role picker native select with the app-native dropdown component so the menu styling stays inside the DevCongress UI system.
- Replaced the old shared page loader with route-specific skeleton components across public and organizer pages, plus a dedicated feedback inbox section skeleton where that page has nested loading states.
- Reworked the organizer route-feedback inbox into grouped New, Reviewing, and Resolved sections with quieter shared row styling, compact metadata, expandable long notes, one status dropdown per item, auto-refresh plus focus-refresh behavior with a visible manual refresh control, and a soft-archive `Clear resolved` action that removes closed items from the active inbox without deleting them.
- Fixed shared dropdown closing so archive Topic and Speaker filters cannot remain open together, and tightened the archive filter menu widths/alignment.
- Refactored the attendance overview from event rows into true month buckets, so each month appears once, empty months remain visible, and same-month events render inside that month instead of duplicating the month label.
- Tightened the attendance overview into a narrower monthly ledger with a slimmer vertical stack of visual planning cards for peak month, expected turnout, room-capacity buffer, and CSV coverage.
- Hardened organizer magic-link requests with generic success responses that no longer reveal allowlist membership, added IP/email rate limiting and resend cooldowns, and deduped login toasts so repeated attempts do not stack noisy errors.
- Disabled the Organizer Access add-email action until the email field passes Zod email validation, and mirrored the same validation on the admin organizer API.
- Added DevCongress-branded Supabase confirmation and magic-link email templates with logo, app copy, and production-safe `{{ .ConfirmationURL }}` links.
- Reworked the organizer create-event schedule fields into a compact two-column row and replaced the native browser date inputs with a shared app-themed calendar picker.
- Added free-tier Luma event import for organizers: public Luma event URLs can be pasted from the create-event page, imported into Supabase-backed `community_events`, marked with source metadata, and deduplicated by Luma event id without requiring Luma Plus or an API key.
- Split the organizer create-event screen into an active Luma URL import path and a disabled manual Event Form preview with a coming-soon badge.
- Compressed the disabled manual Event Form preview so the create-event page fits in a desktop viewport, with the coming-soon ribbon rotated across the top-left corner.
- Added a compatibility fallback so public Luma URL import still works before the `external_*` metadata migration is applied, using the registration URL to detect existing imports.
- Aligned meetup schedule type tags into a dedicated column and changed them from pill chips to small-radius labels so rows line up consistently without the capsule look.
- Moved the meetup detail `All meetups` back link below the hero and simplified the about section CTA to match the selected-event structure on `devcongress.org`.
- Replaced the feedback campaign inline saved banner with the shared app toast so successful saves do not push the form layout down.
- Documented the admin auth flow, first-owner bootstrap SQL, local fallback, role model, and deployment security notes in `docs/auth.md`.

## 2026-06-16 — Feedback form gating and iOS admin input fix

- Disabled route-feedback submission until the form has a name, an explicitly selected feedback type, a sufficiently detailed note, and a resolved Turnstile token.
- Moved public route-feedback validation into a shared Zod schema so the floating feedback bot and standalone `/feedback` route enforce the same requirements and reset state consistently.
- Raised the organizer sign-in password input back to the iOS-safe 16px mobile text size so Safari no longer zooms the admin login form on focus.

## 2026-06-16 — TanStack Query cache foundation

- Added `@tanstack/vue-query` with a shared query client so client-side API reads can reuse cached results instead of each view re-fetching in isolation.
- Centralized common `/api/overview`, `/api/feedback/monthly`, and `/api/feedback/inbox` fetchers plus shared response typing in `src/lib/api.ts`.
- Moved the Home and Archive routes onto the shared overview query so those screens can reuse the same cached event/talk payload and avoid duplicate loading logic.
- Moved the organizer Feedback Hub route feedback inbox onto TanStack Query with optimistic status updates and cache invalidation instead of a manual re-fetch loop.
- Replaced the app-shell route-feedback badge sync event with the shared feedback inbox query so the Feedback Hub badge and inbox stay aligned through one cache entry.
- Added optional Cloudflare Turnstile support for the feedback bot and `/feedback`, including server-side Siteverify enforcement when the Worker secret is configured.
- Invalidated shared event and overview queries after organizer event creation plus event-level checklist/media updates so newly created or updated meetups appear immediately instead of waiting for cache expiry.

## 2026-06-15 — Mobile route fit and feedback UX

- Kept the floating feedback bot visible after a successful submission with a "Feedback received" thank-you bubble and happy face state, plus browser-side cooldown and daily caps to discourage repeat spam from the same device.
- Added a server-side route-feedback rate limiter keyed to client network/user-agent context, returning `429` plus retry timing for repeat submissions that bypass the browser cooldown.
- Added an app-wide mobile keyboard dismiss control for focused inputs, textareas, and selects so iOS users can intentionally blur fields without relying on Safari's form accessory behavior.
- Refined mobile keyboard dismissal with tap-outside blur behavior and a smaller 44px edge fallback button so the control no longer blocks active form content.
- Compactly redesigned the mobile archive event detail page, including the detail card, description copy, presentation count, and empty state.
- Restored the floating public feedback bot now that mobile community pages use document scrolling.
- Tightened public mobile typography, cards, header controls, and My Talks placement so phone routes feel less oversized and the speaker email form starts in the first viewport.
- Moved mobile community pages back to normal document scrolling instead of the nested app `<main>` scroller so real phone browsers own visual-viewport and address-bar scroll behavior.
- Locked the app shell to the visual viewport so document/body overscroll no longer creates phantom vertical scrolling after route content ends.
- Tightened the route-stack height contract so short mobile pages fill the app scroll area instead of leaving blank space below their content.
- Replaced the desktop-style mobile nav strip with a compact hamburger header and full-screen mobile menu while preserving accessible 44px+ navigation targets.
- Tightened the full-screen mobile menu with denser navigation rows and a bottom feedback/footer area so the panel no longer ends with unused empty space.
- Compactly fitted the mobile My Talks and empty Leaderboard routes within common small-device heights, with My Talks centered on roomy phones and kept top-safe on short screens.
- Made the mobile route-feedback page center after launcher taps on roomy phones while falling back to top-safe placement when the form is taller than the viewport.
- Simplified the mobile 404 route into a centered recovery card without the desktop suggestion stack, keeping unknown routes non-scrollable on common phone sizes.
- Hard-paused the public leaderboard for phase one so seeded prototype rows and account tools cannot appear from hosted environment drift.
- Reset the internal app scroll container on route changes so feedback opens at the form instead of inheriting scroll position from a previous long page.
- Reduced feedback launcher prominence with route-view interval gating and mobile routing to a standalone `/feedback` page instead of an overlay.
- Added the `/feedback` route to documentation and noted the mobile feedback behavior for community testers.
- Made the header sticky at the top on mobile viewports only, leaving larger layouts non-sticky.
- Hardened organizer sign-in so failed JSON checks no longer leave the button stuck, compacted the mobile sign-in card typography and password field, and kept the mobile topbar fixed/reachable across routes.
- Gated attendance CSV uploads by meetup cycle: current-month uploads stay locked, next-month uploads open from this month’s last Saturday, and locked months show why in the Attendance Hub and event readout.
- Clarified that removing an attendance CSV drops that meetup from aggregate attendance statistics until a replacement is uploaded.
- Replaced the Attendance Hub's locked-month text treatment with a disabled row/action state and compact padlock icon.

## 2026-06-15 — CI badge and workflow

- Added a GitHub Actions CI workflow that runs typecheck, tests, and production build on pushes to `main` and pull requests.
- Split the README badge block into clearer groups and added the real CI workflow badge plus Cloudflare Pages and Worker deployment badges.

## 2026-06-15 — Cloudflare Worker API deploy path

- Added a Cloudflare Worker entrypoint for the Hono API with Wrangler config and a `pnpm deploy:worker` script.
- Added `VITE_API_BASE_URL` support so the Cloudflare Pages frontend can call a separate Worker API origin before same-domain `/api/*` routing exists.
- Added a Cloudflare Pages `_worker.js` `/api/*` proxy and made same-origin API calls the default again so mobile organizer auth can use first-party cookies.
- Added credentialed API CORS support for split Pages/Worker origins, controlled by `PUBLIC_FRONTEND_ORIGIN`.
- Deferred hosted PDF-to-quiz generation behind `ENABLE_PDF_QUIZ_UPLOADS` and removed the PDF parser from the Worker top-level import path so Cloudflare can validate the API bundle.
- Documented the split Cloudflare Pages + Worker deploy steps and clarified that server-only secrets belong on the Worker, not in the Pages frontend environment.

## 2026-06-15 — Open-source documentation foundation

- Added a concise open-source README that explains the product, quick start, documentation map, project status, stack, contribution path, security posture, and license without overcrowding the landing page.
- Added root contribution, security, code-of-conduct, and MIT license files for public collaboration readiness.
- Added structured contributor docs under user guides, technical docs, reference docs, and feature docs so community members, organizers, integrators, and maintainers can enter at the right level of detail.
- Added a technical debt register and linked it from the README and documentation map so open-source contributors can see production-readiness risks without crowding the README.
- Added `VITE_SHOW_ORGANIZER_LINK` so public deployments can hide the Organizer header button without changing route or auth behavior.
- Hardened JSON mock persistence so missing files still behave as empty collections, invalid/non-array JSON fails loudly, and writes replace files through temp-file rename.
- Moved quiz phase advancement out of `GET /api/quiz/state` into explicit `POST /api/quiz/state/advance`, with shared quiz-state helpers and focused tests.
- Added focused tests for mock DB persistence, Luma attendance parsing/summarization, and quiz state advancement/read behavior.

## 2026-06-15 — Browser metadata polish

- Added standard 16px and 32px favicon assets so browser tabs can render the DevCongress icon instead of falling back to the default icon.
- Updated the static and production HTML titles to `DevCongress | Community`.
- Added route-aware document titles so organizer-console routes show `DevCongress | Organizers`.

## 2026-06-15 — Archive header polish

- Removed the event, talk, and year count cards from the public archive masthead.
- Removed the masthead count cards from the public leaderboard and My Talks pages for the same cleaner header treatment.
- Constrained the leaderboard mode-switch underline to the same width as the leaderboard table.
- Replaced the separate leaderboard coming-soon banner with a small angled masthead ribbon.
- Matched the homepage Top Members preview to the same angled coming-soon ribbon treatment.
- Removed the homepage Players coming-soon summary card and moved the Top Members preview higher.
- Removed Praise from the route feedback kind picker, replaced tester-name selection with a typed name plus Anonymous checkbox, and improved route-path contrast.
- Added capped auto-growth, internal textarea overflow, and a character counter to the route feedback textarea so longer notes are easier to write without scrolling the whole feedback panel.
- Hid the feedback launcher while the feedback panel is open so its bubble cannot overlap the submit button.
- Added a Supabase-backed App Feedback Inbox to the organizer Feedback Hub, including route-feedback tagging and admin-only status updates.

## 2026-06-15 — Community events UI polish

- Removed the count tiles from the public Events masthead so the page opens with a simpler archive-style header.

## 2026-06-15 — Supabase community events source

- Added a Supabase `community_events` migration modeled from the current `devcongress.org` Astro meetup schema and seeded it with the existing website meetup YAML content.
- Added a Supabase community-event repository so `/api/events` can read/write Supabase events when configured while preserving JSON fallback during local development.
- Updated `/api/public/meetups*` to prefer Supabase-published community events before falling back to the local JSON event stream.
- Updated fallback public meetup mapping so event photo links flow through as website-compatible `photos[]` instead of substituting the cover image.
- Added `/api/health/supabase/community-events` as a focused readiness check for the new event-source table.
- Extended organizer event creation with website-facing fields and a publish toggle so new rows can be tested through the public meetup endpoint.
- Added organizer event media management for direct photo links and shared gallery/folder links.
- Added Supabase Storage support for organizer-uploaded event covers and selected event photos through a public `meetup-media` bucket.
- Added browser-side image compression before Supabase Storage uploads, targeting 1600px/WebP/2MB while keeping the server-side 5MB validation cap.
- Added `/api/health/supabase/storage` for checking the media bucket before testing uploads.
- Documented the Supabase event-source contract and recorded the decision to make this app the meetup data owner before the Astro website repo consumes it.

## 2026-06-15 — Free-first launch scope

- Marked quiz and leaderboard as phase-one coming-soon features while preserving their route/UI paths for later rollout.
- Kept the homepage leaderboard preview visible but de-emphasized it with coming-soon treatment.
- Kept attendance CSV imports active and added a 2MB file-size policy for Luma exports.
- Reframed speaker slide handling as link-only so the app stores public slide URLs instead of files.
- Revised the hosting recommendation around the reduced phase-one scope: Cloudflare Pages/Worker plus Supabase as target, Render plus Supabase as a temporary bridge, and Durable Objects reserved for future quiz work.

## 2026-06-14 — Cloudflare/Supabase deployment planning

- Added a deployment runbook for the proposed Cloudflare Pages/Workers, Durable Objects, and Supabase production shape.
- Documented the current app blockers before Cloudflare deployment: JSON persistence, Bun-specific serving, local filesystem assumptions, and in-request PDF processing.
- Captured a starter cost posture showing that early testing can begin on free tiers, while public launch should budget for Cloudflare Workers Paid and Supabase Pro.
- Added a free-first deployment posture for a non-funded community group, including upload caps, delayed quiz realtime, and a Firebase cost/fit comparison.

## 2026-06-14 — Organizer attendance analysis

- Added a reusable `ViewSkeleton` loader system with page-shaped variants for dashboards, tables, cards, forms, ledgers, event overview, quiz builder, and quiz entry states.
- Replaced full-page `LOADING...` placeholders across active public and organizer Vue views with layout-preserving skeletons that respect reduced-motion preferences.
- Added contextual breadcrumbs under the app shell navigation for public and organizer routes, including event-level organizer pages, so deep pages have a clear way back without relying only on the top navbar.
- Added restrained breadcrumb hover, press, and current-route motion that respects reduced-motion preferences.
- Added directional organizer event subsection transitions and a gliding active tab indicator so Overview, Talks, Speakers, Attendance, Quiz, and Feedback behave like one continuous tabbed workspace.
- Reworked the organizer event overview into a compact dashboard layout so the overview subsection fits the desktop viewport without requiring page scroll at the target wide layout.
- Refined the organizer event overview workstream UI into a compact operations list with calmer sans-serif numeric stats.
- Added a compact event lifecycle key to the organizer event list with plain-language speaker-submission and program-set stages instead of unexplained CFP/upcoming labels.
- Reworked pagination footers into a shared compact control pattern so page counts read as status text instead of a third button.
- Added a monthly attendance ledger at `[adminBase]/attendance` with import coverage, month-by-month metrics, best-month readouts, and venue-planning guidance.
- Added an organizer-only attendance page at `[adminBase]/events/[eventId]/attendance` for post-event Luma attendance readouts.
- Added a Vue Sonner toast foundation with a globally mounted DevCongress-themed toaster and typed `notify` helper for future view-level usage.
- Added a single-action CSV import control with real file-read and upload progress states for replacing an event's Luma guest export.
- Added a remove-file action for clearing a stored Luma attendance import from an event.
- Added JSON-backed Luma CSV import storage and summary metrics for approved registrations, check-ins, approved no-shows, check-in rate, source breakdowns, and ticket breakdowns.
- Added admin-only Hono routes for monthly attendance insights plus fetching, importing, and removing per-event Luma attendance data.
- Kept the top organizer nav focused on global sections, and moved event-specific navigation back into nested event tabs with Attendance and Feedback included.
- Preserved Attendance Hub and Feedback Hub return context when organizers open event subpages from monthly hub actions, breadcrumbs, tabs, and nested event links.
- Added Attendance to organizer event overview action rows.
- Polished the event overview operations area with consistent ops panels, aligned card tops, fixed metric/action columns, and tighter typography hierarchy.
- Moved app toasts to the bottom-right corner.
- Fixed event sub-section route changes so the event tab strip stays mounted and routed content transitions in a stacked slot instead of collapsing through a loading placeholder.
- Reworked the attendance hub ledger around the selected year, month filters, status filters, and paginated full-width rows so monthly CSV actions stay visible.
- Simplified attendance hub month rows so CSV state, action, and attendance summary read as one compact decision instead of repeated metric cards.
- Added an organizer event checklist with chronological milestones, shared JSON persistence, progress state, and milestone-driven event status updates.
- Reframed the event status dropdown as a manual correction control while the checklist becomes the primary coordination surface for monthly event work.

## 2026-06-13 — Event feedback campaigns

- Added event-scoped feedback campaigns with default post-event questions, local JSON persistence, and Supabase migration support.
- Added organizer feedback management at `[adminBase]/events/[eventId]/feedback` with campaign status, auto-open behavior, question editing, public link copy, and recent response review.
- Added a rare organizer remove action for event feedback forms, backed by `DELETE /api/events/:eventId/feedback-campaign`, so organizers can reset a form while keeping existing responses available for reports.
- Added public community feedback forms at `/feedback/[eventId]` that render campaign questions and submit structured event answers.
- Added Hono routes for feedback campaign management, public campaign lookup, and event feedback submission.
- Added feedback to the event overview and organizer event navigation.
- Time-boxed event feedback so forms auto-open from the event date and close after 3 days by default.
- Added a community archive CTA that appears only while feedback is open, and kept manual `active` campaigns open for testing regardless of the auto window.
- Polished the feedback form UI by replacing native selects with the app dropdown and adding trigger-origin dropdown motion plus question-card enter/hover motion.
- Added restrained info/success design tokens and applied them to secondary status surfaces, archive stats, feedback state chips, and form focus rings.
- Added lighter operational panel/table primitives and applied them to dense organizer event, talk, speaker, and attendance surfaces.
- Reworked the organizer quiz builder and live-host screens with stronger control grouping, option labels, stage contrast, and a dedicated finished-session view.
- Added an organizer Feedback Hub with month-by-month switching, combined monthly response metrics, and event-level form status links.

## 2026-06-13 — DevCongress.org integration notes

- Recorded the decision to align public app surfaces with the `devcongress.org` light theme instead of keeping the dark companion theme.
- Added the initial website palette notes to the design-token usage guidance.
- Added read-only `/api/public/meetups*` endpoints for the `.org` website integration contract.
- Added `pnpm verify:public-api` to validate the read-only meetup API before touching the `devcongress.org` Astro integration.
- Added `docs/public-meetups-api.md` as the local contract note for future website consumption.
- Tightened the public meetup DTO against the current `devcongress.org` Astro meetup schema: offset datetimes, `location.url`, full CTA/archive URLs, non-null speaker images, and draft-event exclusion.
- Added a public `/events` page that lists all website-publishable meetups from `/api/public/meetups`.
- Aligned the public `/events` page with the `devcongress.org` All Meetups layout: listing header, two-column cards, cover images, status badges, photo counts, date/location meta, and meetup CTAs.
- Synced organizer pages to the `.org` light theme across event management, event overview, talks, speakers, quiz builder/live host, login, tabs, and shared number steppers.
- Switched the active design tokens, app shell, feedback UI, and landing page foundation to the `.org` light palette.
- Updated public dynamic routes so archive detail, CFP, and quiz-code pages use the `.org` light palette instead of legacy dark accents.
- Added Inter font assets for the light-theme UI pass.
- Added a shared archive-style community masthead and applied it to Events, Leaderboard, My Talks, and Play while leaving Home distinct.

## 2026-05-30 — Supabase feedback foundation

- Added Supabase JS client configuration with browser anon and server service-role helpers.
- Loaded `.env.local` into the Hono dev server so server routes can access Supabase secrets locally.
- Added environment placeholders for Supabase URL, anon key, and server-only service role key.
- Added a Supabase migration for name-selected tester feedback without Supabase sessions or user auth.
- Added `/api/health/supabase` to verify server-side Supabase connectivity.
- Added a public feedback bot that loads tester names from Supabase and submits route-aware feedback without tester sessions.

## 2026-05-30 — Temporary mode switch

- Added a simple masthead switch for testing between the public community experience and the organizer console.

## 2026-05-30 — Admin overview polish

- Reworked the event overview operations area into a calmer program pulse and compact next-action rail.
- Reduced the stretched metric-card feel so counts, status, and actions scan together on wide screens.
- Replaced remaining native Vue dropdowns with the shared app-themed dropdown component across archive filters, event status, and quiz answer selection.
- Added an app-themed number stepper and replaced native quiz builder number inputs.
- Softened generated quiz question cards with calmer typography, lighter answer rows, and quieter edit/delete controls.
- Fixed admin shell nav highlighting so only the deepest matching event section is marked active.
- Removed redundant event back links from admin event child pages now covered by shell navigation.

## 2026-05-29 — Quieter admin event overview

- Replaced the dominant event lifecycle panel with a compact header status selector.
- Added a calmer organizer overview for talk pipeline, speaker access, quiz state, and event-specific next actions.

## 2026-05-29 — Editorial page scroll fix

- Changed shared editorial pages to fill the available app shell height instead of forcing full viewport height inside the header-offset scroll area.
- Removed the phantom vertical scrollbar on admin pages when content fits the visible area.
- Added contextual admin shell navigation so event routes and the event list expose Overview, Talks, Speakers, Quiz, and Live links for the current/default event.
- Removed duplicate in-page admin event tabs now that event operations live in the admin shell navigation.
- Hid the admin Live nav item unless the selected/default event has a waiting or active quiz session.

## 2026-05-29 — Live quiz nav visibility

- Updated the app header to show the public `Play` navigation item only when `/api/quiz/active` reports a waiting or active quiz session.
- Added periodic quiz availability refresh so the `Play` link can appear during a meetup without reloading the page.
- Removed the redundant "Back to events" link from the admin event detail page because Events is already reachable from the admin navbar.

## 2026-05-29 — Local Navii leaderboard avatars

- Added `@usenavii/core` and a Vue `NaviiAvatar` component so leaderboard avatars render locally as deterministic data URI images.
- Seeded avatars from stable leaderboard identifiers (`user_id`, `device_id`, then nickname/rank fallback) instead of using display names alone.
- Added static 48px mascot avatars to leaderboard rows without enabling repeated avatar animation.

## 2026-05-29 — Motion system pass

- Switched the app motion standard to `$ui-animations` and added shared spring, smooth, and fast motion tokens.
- Replaced active Vue `transition-all` usage with transform/opacity-only motion utilities for press, surface, icon, page, spinner, and quiz answer interactions.
- Removed repeated decorative pulse motion, avoided layout-property transitions, and kept hover movement pointer-gated with reduced-motion fallbacks.

## 2026-05-29 — Landing hero meetup photo

- Replaced the single landing hero image with a three-photo automatic meetup stack.
- Refined the meetup stack into a contact-sheet style zig-zag pile with paper borders, staggered rear prints, external captioning, and transform-only motion.
- Simplified the automatic photo rotation so only the front print shifts to the back before the stack order advances.
- Added a previous meetup photo to the landing hero's "Right now" feature panel.
- Removed the redundant current-event summary from the photo panel so the hero only shows one meetup image.
- Updated the hero photo caption to identify it as the April meetup.
- Renamed the landing leaderboard eyebrow from "Community board" to "Community Kahoot board".

## 2026-05-29 — Configurable organizer route

- Moved organizer-facing Vue routes from the predictable `/admin` prefix to a configurable `VITE_ADMIN_BASE_PATH`, defaulting to `/organizer-console`.
- Updated admin navigation, auth redirects, event tabs, and admin back links to build URLs through the shared route helper.
- Added a catch-all client route so old or unknown paths recover through the branded 404 instead of exposing an admin entry point.

## 2026-06-20 — Always-open event feedback default

- Removed the event-completion gate from event feedback so campaigns can exist and stay reachable before the event ends.
- Updated the public feedback status and submission APIs to create campaigns for any event instead of waiting for completed status.
- Reworded organizer feedback surfaces so they describe always-open draft access instead of an automatic completion window.

## 2026-06-20 — TV-safe feedback QR cleanup

- Simplified the organizer feedback display route by removing the visible URL and campaign-settings actions from the live QR screen.
- Increased the QR code size and widened the display layout so the screen reads better from across a room.
- Kept the unavailable state focused on returning to the feedback hub instead of exposing extra controls on the display surface.

## 2026-05-29 — Branded 404 page

- Added a Vue catch-all route for unknown client paths.
- Added a branded 404 page with the missing path, quick recovery links, and organizer-aware primary navigation.
- Removed the oversized hero glow so the 404 background stays quiet at wide viewport sizes.

## 2026-05-29 — Softer interaction states

- Reworked the app header into a compact app bar with grouped navigation and aligned status/actions.
- Simplified the header into an editorial masthead with plain text navigation and subtle active underlines.
- Removed the public "Community" header label; the masthead now only shows an organizer indicator on admin routes.
- Removed the decorative nav group separator from the public masthead.
- Reworked the public navigation active state from a solid yellow fill to a lighter tinted selection with subtler hover, press, and focus states.
- Reduced the intensity of shared editorial action button hover/active states while preserving the yellow DevCon-Comm accent.
- Removed the nav item hover lift that could clip the selected border inside the horizontal scroller.

## 2026-05-29 — Archive redesign

- Redesigned the public archive from a sparse timeline into event cards with clear titles, descriptions, topic chips, and talk previews.
- Reworked year selection, summary metrics, and filters so desktop and mobile archive browsing are easier to scan.
- Replaced native archive topic/speaker selects with app-themed custom dropdown popovers.
- Removed the redundant "View issue" chip from archive cards because the full card already opens the event.

## 2026-05-29 — Softer admin UI polish

- Reduced hard-edged admin chrome with softer shared panels, controls, tabs, and inputs.
- Removed terminal-style event status decoration from the admin event overview.
- Softened quick action cards and top navigation while keeping the editorial DevCon-Comm identity.
- Simplified the event overview so tabs stay in a consistent position across Overview/Talks/Speakers and the overview no longer repeats navigation as cards.
- Simplified talk review cards into a quieter list with muted metadata and one primary action.
- Redesigned archive event details as a quieter editorial list with restrained slide links and no terminal symbols.
- Added pagination to the public leaderboard table.

## 2026-05-29 — Kahoot-from-paper prototype

- Added an admin-only PDF upload endpoint for quiz sessions that validates PDF type/size, extracts text locally, and appends rule-based draft questions to the existing quiz flow.
- Added Quiz Builder UI for uploading a paper/resource PDF, choosing draft count, viewing generation status, and editing generated questions before opening the lobby.
- Added local PDF extraction dependency and documented the new quiz-generation API surface.

## 2026-05-29 — Community product hardening

- Reframed the Vue landing page as a community hub with CFP/live quiz actions, recent published talks, and top members.
- Added archive search and filters across event text, talk titles, topics, and speakers.
- Improved speaker slide workflow with visible deadlines, upload state, and organizer reminder logging.
- Added local QR-code generation to the live quiz lobby.
- Updated reputation tracking so new quiz participation increments event counts and answers add to user totals.
- Added all-time/monthly leaderboard modes and claimed-profile badges.
- Added same-origin prototype admin cookie auth with `/admin/login`, route redirects, logout, and server-side guards for organizer mutations.
- Added planning/status files for the autonomous community-product pass.

## 2026-05-29 — Stack migration foundation

- Added Satoshi + IBM Plex Mono typography direction and removed the old Lato/JetBrains Mono pairing.
- Introduced editorial UI primitives for page headers, panels, labels, inputs, and actions.
- Made top navigation role-aware and added event-level admin tabs for Overview/Talks/Speakers/Quiz/Live.
- Refined major public/admin surfaces toward a more cohesive editorial tech-conference look.
- Switched package management from npm lockfile to pnpm and added `pnpm-lock.yaml`.
- Added Vue 3 + Vite app shell under `src/` and restored the DEV::CON[] branded landing page with Lato/JetBrains Mono fonts.
- Added Hono API app and Bun production server under `server/` so the UI and `/api/*` run on one same-origin port.
- Ported public Vue routes for archive, event talks, leaderboard, CFP, My Talks, quiz join, and live player gameplay.
- Ported admin Vue routes for event management, event status, talks, speakers, quiz builder, and live quiz controls.
- Added matching Hono endpoints for event CRUD, speaker allowlists, CFP, talks/slides, leaderboard/account tools, quiz sessions/questions, join/state/answer.
- Updated TypeScript, Vite, Tailwind, and docs for the new migration target while keeping the legacy Next implementation as reference.

## 2026-05-01 — Docs sync to current app/api surface

- Updated architecture docs with current public/admin route inventory and complete API route list.
- Updated implementation docs to reflect active route-to-module mappings for CFP, speakers, talks/slides, and quiz workflows.
- Corrected API contract examples to current snake_case payloads (`/api/cfp`, `/api/quiz/join`, `/api/quiz/answer`).
- Added missing major endpoint coverage in docs: speaker management endpoints, quiz question `PATCH`/`DELETE`/`reorder`, and `/api/talks/[talkId]/upload`.

## 2026-03-23 — Initial index

- First scan of codebase; generated all 5 docs
- Project: DevCon-Comm (Next.js 14, JSON mock DB, quiz system)

---

_Future entries go above this line._
