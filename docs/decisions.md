# Architectural Decisions

## ADR-053: Separate Public and Organizer Loading Shells

Date: 2026-08-07
Status: Accepted

Context: The Vue application serves a small set of deliberate public exceptions—registration, CFP, feedback, private speaker intake, volunteer intake, and System Design participant links—alongside the protected organizer console. The shared pre-JavaScript boot screen said “Opening the workspace” for every direct URL, and the eager root app also carried organizer-shell concerns into public page loads. That wording and loading boundary are wrong for attendees and external form users.

Decision: Keep one router and one backend contract, but select a public root (`src/PublicApp.vue`) or the protected organizer root after the initial route resolves. Public routes do not instantiate `src/App.vue` or run its organizer-session query; organizer routes continue to use the existing shell and access gate. Route-aware first-paint markup uses dedicated variants for registration, CFP, feedback, speaker intake, volunteer intake, and the learning room. Vite, the Hono fallback, the local Bun server, and the Cloudflare Pages worker all select the same variant, while public views retain their own data-loading skeletons after Vue mounts. Unknown and protected paths fail closed to the organizer boot variant.

Trade-offs: The public route family is represented in both the TypeScript boot helper and the small Pages worker classifier, so adding a new public exception requires updating both. The shared router and API remain in place, which keeps authorization and route contracts stable while avoiding a separate deployment. Public first paint is still a skeleton rather than server-rendered event content; the actual form waits for its existing public API request.

Alternatives considered: Keep one generic neutral loader (smaller change but still loads the organizer root), remove the first-paint loader (blank and more layout shift), or move every public exception to a separate public deployment immediately (cleaner final boundary but larger migration than this fix).

Revisit when: Public registration and intake pages move to the canonical `devcongress.org` website or need server-rendered event content and independent deployment lifecycles.

## ADR-051: Reuse the Public Registration URL for On-Site QR Entry

Date: 2026-08-06
Status: Accepted

Context: Guests may arrive at a meetup without registering in advance. Staff need a fast way to direct those guests into the existing phone-friendly registration form, while the event-day organizer tools must remain usable from a phone. Creating a second walk-in form or encoding an attendee/check-in credential in a QR code would split registration behavior and increase privacy and operational risk.

Decision: Add a protected `/organizer-console/registration-display/:eventId` route that generates a local QR code from the event’s existing public registration URL. Expose it from the desktop Registration overview and the authenticated phone Events workspace. Keep the QR payload limited to the public form URL; it contains no guest identity, session, or check-in authority. The display is available only when the event has an internal campaign and the public form is accepting registrations, and it provides a direct-form and copy-link fallback for phones.

Trade-offs: Staff need to open the protected display first, and a guest still submits the same name/email form rather than being silently added. The display depends on the public URL remaining valid, but reusing that URL preserves capacity, waitlist, duplicate-email, confirmation, and audit behavior without a second write path.

Alternatives considered: Add a separate walk-in form (duplicates validation and campaign behavior), let QR codes perform check-in (confuses registration with attendance and exposes a stronger credential), or display a QR only on desktop (fails the phone-at-the-door workflow).

Revisit when: Walk-in registration needs staff-entered records, offline capture, payments, or a kiosk mode with a dedicated device policy.

## ADR-052: Shared Monthly Meetup Category Catalog

Date: 2026-08-06
Status: Accepted

Context: Monthly meetups have a different operating pattern from the Annual Conference. Reusing the Annual Conference category taxonomy makes the monthly expense form look more rigid than the workflow requires and prevents organizers from naming costs in the language they actually use. A category created in one monthly ledger should remain useful in later months without duplicating it per event.

Decision: Keep Annual Conference categories and monthly meetup categories in separate domains. Add a shared monthly category catalog with validated display names, expose the catalog in every monthly finance response, and let Owners and Organizers add a category from any monthly meetup. Store expense category names against the monthly ledger, preserve categories found in existing expense records during migration, and do not provide category deletion in this slice so historical totals remain readable.

Trade-offs: The catalog adds one relational table and a small creation flow, but avoids a generic cross-product category system and keeps monthly naming flexible. Categories are shared across all monthly meetups, so an overly broad label can affect future forms; the no-delete rule protects history while a later rename workflow can add explicit migration semantics.

Alternatives considered: Reuse Annual Conference categories (wrong domain semantics), keep a fixed monthly enum (cannot adapt to real meetup costs), create categories separately for every event (repetition across months), or allow free-text expense categories without a catalog (poor reuse and weak server validation).

Revisit when: Monthly finance needs category renaming, archival, per-series category scopes, or reporting across multiple currencies.

## ADR-050: Event-Scoped Monthly Meetup Actuals Without a Budget Baseline

Date: 2026-08-06
Status: Accepted

Context: Monthly meetups happen repeatedly and have an estimated monthly spend, but they do not have a strict budget that organizers need to manage. Reusing the Annual Conference finance model would introduce unnecessary budget and income concepts while making it harder to see what a specific meetup actually cost. Financial records are private operational data and must not be visible to Volunteers or unauthenticated users.

Decision: Add a separate `monthly_meetup_finance_expenses` ledger keyed to `community_events`. Store only GHS integer minor-unit expense records with category, description, paid/unpaid/cancelled state, date, vendor, and notes. Derive monthly actual, paid, unpaid, cancelled, and category totals from the ledger. Expose the workspace only for events resolved as the monthly series and protect both reads and expense mutations with an Owner-or-Organizer boundary. Volunteers and unauthenticated users receive no monthly finance access, and finance is never exposed through general event responses.

Trade-offs: Owners and Organizers can enter monthly expenses, and the rough monthly estimate is intentionally not stored as a budget value. This keeps the monthly workflow honest and small; an optional estimate context can be added without changing the expense record shape.

Alternatives considered: Reuse Annual Conference budgets (adds false budget semantics), put expenses on event tasks (mixes accounting with delivery work), restrict each Organizer behind a separate monthly grant (redundant administration), allow Volunteers to see the ledger (over-shares sensitive data), or hide the route only in the UI (bypassable without server enforcement).

Revisit when: A real approval/reimbursement workflow is needed, or Owners ask for an optional monthly estimate card or a different role boundary.

## ADR-049: Edition-Scoped GHS Finance Visibility and Ledger

Date: 2026-08-05
Status: Accepted

Context: The Annual Conference needs one place to see planned budget, committed spend, paid spend, remaining budget, and income. General Organizer access is intentionally broad enough for event operations, but financial records must not be visible to every Organizer. The existing Annual Conference capability catalogue and Owner-managed People & Access grants provide the narrowest compatible access boundary.

Decision: Add a private Annual Conference Finance workspace backed by relational budget and ledger tables, with a local JSON adapter for development. Store amounts as integer minor units with an explicit GHS currency constraint. Keep budget lines, expense records, and income records distinct, and derive dashboard totals from their explicit states. Owners receive finance visibility by role and remain the only users who can create the first-slice records. Owners may grant finance.view to selected active Organizers for one edition; Volunteers cannot receive finance access. Finance reads are protected by the capability at the server boundary, are never included in public event responses, and all record creation and access changes use the existing audit log.

Trade-offs: The first slice supports a useful at-a-glance ledger without introducing payment-provider, bank-reconciliation, receipt, reimbursement, approval-threshold, or multi-currency complexity. Named finance viewers can see the complete edition finance view but cannot edit it. Owner-only mutations are intentionally conservative until approval and submitter workflows are defined.

Alternatives considered: Add finance to the general Organizer role (over-shares sensitive records), put amounts on work-plan tasks (collapses planning and accounting semantics), expose finance through UI-only navigation hiding (bypassable), or create a new Finance role for every access combination (role explosion).

Revisit when: Expense submitters need access without dashboard visibility, receipts/contracts are introduced, approvals need separation of duties or thresholds, finance operators need write access, or another event type needs the same capability model.

## ADR-048: Additive Edition-Scoped Conference Responsibilities

**Date:** 2026-08-05
**Status:** Accepted
**Context:** The Volunteer role intentionally starts with assigned Annual Conference tasks only, but delivery leads need to hand specific sections—such as Timeline, phase management, volunteer-team visibility, intake sharing, or application review—to individual people without promoting them to a broader Organizer role. Applicant records contain contact details, so exposing one Volunteers tab as a single permission would also over-share personal information.
**Decision:** Keep roles as safe defaults and add a code-owned catalogue of additive capabilities stored per Annual Conference edition and membership. Owners manage explicit grants from People & Access. Resolve effective capabilities from role defaults, planning ownership, and edition grants at the server on each protected request; return the same list to desktop and mobile clients for navigation. Keep volunteer-team viewing, intake sharing, and applicant review separate, with applicant PII available only to the review capability. Clear explicit grants when a membership role or status changes, audit every grant/revocation, and keep the new table behind RLS with service-role-only access.
**Trade-offs:** The system gains a small capability vocabulary and another relational lookup on conference requests. Grants are additive only, so Owners cannot subtract role defaults; this avoids contradictory deny rules and preserves current organizer behavior. The catalogue is intentionally limited to Annual Conference rather than becoming an app-wide ACL framework. Volunteer applications remain tied to the 2026 campaign until ADR-016's relational-workflow revisit is completed.
**Alternatives considered:** Add more roles for each responsibility combination (role explosion), expose sections based only on hidden UI tabs (bypassable), promote temporary leads to Organizer (excess privilege), store arbitrary permission strings (unsafe and difficult to audit), or build a generic plugin/ACL framework (premature for one bounded module).
**Revisit when:** Another product area needs individual delegation, deny rules become a real requirement, multi-edition volunteer campaigns replace the 2026 intake store, or capability lookup volume justifies a request-local batch/cache strategy.

---

## ADR-047: Gate Public-Submission Discovery Independently

**Date:** 2026-08-04
**Status:** Accepted for private beta
**Context:** Private-beta testers must exercise the real external submission, moderation, promotion, and email path against the production EMS and Supabase project. Approving a beta submission creates a published canonical event, but devcongress.org must not list it while beta testing is in progress. Organizers still need to inspect the promoted record in the EMS website-shaped preview, and submitter-facing titles and email should not carry test-only decoration.
**Decision:** Keep public-submission intake and public discovery as independent fail-closed Worker controls. `PUBLIC_EVENT_SUBMISSIONS_ENABLED=true` accepts proposals. Only an explicit `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED=true` allows canonical events whose source is `public_submission` into unauthenticated `GET /api/public/events`; missing, false, or invalid values exclude every such event. The organizer-authenticated, non-cacheable `/api/admin/events-preview*` contract includes them regardless of the public discovery gate. Public submissions retain the submitted title, and internal organizer-created events also retain the name entered by the organizer; the legacy `EVENT_TEST_MODE` marker is no longer applied during event creation.
**Trade-offs:** Beta and production records still share one database and are distinguished operationally by the controlled launch window plus `public_submission` source. Enabling discovery before deleting beta submissions would expose every approved beta record, so reviewed cleanup and zero-row verification are mandatory before launch. No schema migration or test text leaks into public-facing titles and emails.
**Alternatives considered:** Keep a `[TEST]` title marker (visible product noise and brittle data classification), rely on the website not rebuilding (unsafe and non-deterministic), filter only while `EVENT_TEST_MODE=true` (conflates organizer rehearsal with public launch), or add a permanent environment/scope column now (stronger long-term model but larger than the temporary beta need).
**Revisit when:** Private beta ends, real public submissions coexist with acceptance testing, or recurring staged submissions justify an explicit environment or visibility scope in the database.

---

## ADR-046: Separate Website Discovery and EMS Intake Gates

**Date:** 2026-08-04
**Status:** Accepted
**Context:** The Astro website is statically built, so its repository variable can remove or expose the submission route only at build time. The EMS public submission endpoint remains independently addressable and would continue accepting correctly formed requests even when the website form is hidden.
**Decision:** Keep the website's build-time discovery gate and add a separate server-only `PUBLIC_EVENT_SUBMISSIONS_ENABLED` runtime gate to the EMS Worker. Require an explicit case-insensitive `true`; missing, false, or invalid values fail closed before request validation, Turnstile, rate limiting, email, or persistence. Enable both gates for the private beta and disable either one as an immediate launch safety switch.
**Trade-offs:** Operators must keep two non-secret variables aligned during beta and launch. In return, the website controls discoverability while EMS retains an immediate server-side kill switch that does not require rebuilding the static site.
**Alternatives considered:** Rely only on the hidden website route (leaves the API callable), compile the switch into the Worker (requires a deployment to close intake), or remove the endpoint between tests (creates unnecessary code churn and deployment risk).
**Revisit when:** Submission access is managed by a dedicated release-control service or authenticated invite system.

---

## ADR-045: Native Event Creation Publishes by Default

**Date:** 2026-08-04
**Status:** Accepted
**Context:** The native create-event form exposed a “Publish event shell now” checkbox. Its default created a draft record while still opening registration, which made a normal event creation feel like two conflicting states and asked organizers to understand an internal “shell” concept.
**Decision:** The organizer creation flow always creates a published event in the `upcoming` lifecycle and an open registration campaign. Remove the publication checkbox from the form. Treat a future registration opening time as the sole normal creation-time exception: the event remains public while its registration form is scheduled. Preserve the API's explicit `publish_to_website: false` value only for a deliberate non-UI planning-shell integration.
**Trade-offs:** Organizers no longer create private drafts through the normal interface. This removes an unnecessary choice and ensures the public listing, event lifecycle, and registration link agree from the first successful create. Exceptional draft creation remains an intentional integration action rather than an everyday organizer control.
**Alternatives considered:** Keep and rename the checkbox (still asks for an unnecessary decision), default the checkbox to checked (the draft path remains easy to trigger accidentally), or use registration status as publication state (mixes independent public visibility and registration timing concerns).
**Revisit when:** The product adds an explicit multi-step event-planning workflow with a real review gate before public publication.

---

## ADR-044: Independent Event Lifecycle and Registration Introduction

**Date:** 2026-08-03
**Status:** Accepted
**Context:** Creating a website-published event produced contradictory organizer states: publication was marked published while the event lifecycle remained draft. The public registration ticket also reused the event About description, which made inherited or long-form event copy appear as though the organizer had written it specifically for registration. Registration should open with creation by default, but organizers still need to schedule a future opening time during that same flow.
**Decision:** When a newly created event is published to the website, set its operational lifecycle to `upcoming`; retain `draft` only for unpublished planning shells. Create the registration campaign as `open`, while preserving an organizer-supplied future `opens_at` so availability remains scheduled until that timestamp. Store an optional, plain-text registration introduction on the registration campaign, separate from the event About description. Show only that introduction on the RSVP form; show the event About description on the read-only event-details view. Default the registration introduction to blank, validate it at 2,000 characters in both API and database boundaries, and keep updates behind the existing organizer-authorized campaign mutation.
**Trade-offs:** Organizers now manage two intentional pieces of copy, so the workspace must label their destinations clearly. Existing campaigns receive a blank introduction and therefore stop inheriting event About copy on their RSVP form. Published events can no longer remain lifecycle drafts immediately after creation, while unpublished events retain that planning state. Scheduled registration is represented by an open campaign whose availability window has not begun, preserving one campaign lifecycle without pretending the form is currently accepting guests.
**Alternatives considered:** Continue reusing event About copy (caused unexplained registration text), invent a fallback introduction (attributes unsaved copy to the organizer), remove creation-time scheduling (conflicts with the agreed organizer workflow), or keep published events in draft (continues contradictory status reporting).
**Revisit when:** Registration needs structured content blocks, event publication and registration require separate approval workflows, or lifecycle state becomes fully derived from publication and timestamps.

---

## ADR-043: Role-Specific Annual Conference Mobile Workspace

**Date:** 2026-08-03
**Status:** Accepted
**Context:** Organizers need to run the whole Annual Conference workspace when a laptop is unavailable, while volunteers need only their assigned work. The desktop conference workspace is a dense planning tool whose tables and side drawers do not become usable simply by shrinking them onto a phone. Treating mobile as a status-only field companion would also make organizers return to a laptop for normal planning work.
**Decision:** Separate the phone organizer shell into a lightweight Home plus top-level Events and Conference destinations rather than loading both operating surfaces on entry. Provide one dedicated Conference phone route with two capability-derived products. Organizers receive mobile versions of the complete Annual Conference workspace: Overview, filtered Work Plan, full task creation/editing, Timeline, planning-gap repair, phase creation/editing/reordering/deletion, edition switching/creation, and 2026 Volunteer intake/applications. Volunteers receive a distinct Overview and My Tasks experience only. Continue deriving authority from the API: volunteers receive assigned tasks only, never receive internal notes, and can change status only; organizer controls follow the returned task, phase, and edition capabilities. Use full-screen task and edition flows, stacked forms, compact lists, and fixed thumb navigation instead of desktop tables. Redirect dedicated mobile URLs back to their full-console equivalents when opened on a larger viewport.
**Trade-offs:** The mobile and desktop presentations must remain behaviorally aligned as features evolve, although both reuse the same API, policy, query keys, task form, and task drawer. The phone workspace exposes consequential planning mutations, so confirmation and server authorization remain mandatory. It depends on the existing complete work-plan response and client-side filtering, which is appropriate for the current plan size but may need server pagination if editions grow substantially.
**Alternatives considered:** Make the desktop planner responsive (retains desktop information density and fragile drawers), provide a status-only companion (does not meet organizer needs), give volunteers the organizer UI with disabled controls (reveals irrelevant structure and weakens role clarity), or build a separate native app (duplicates authentication, policy, and delivery effort).
**Revisit when:** Conference plans require server-side pagination, offline operation becomes necessary, day-of runbooks require an incident-oriented mode, or another organizer capability is added to desktop without a corresponding mobile workflow.

---

## ADR-042: Deep Annual Conference Module Boundaries

**Date:** 2026-08-03
**Status:** Accepted
**Context:** Annual Conference behavior had accumulated across Hono route handlers, Supabase/mock sentinel wrappers, access helpers, client route guards, and two large planning views. The seams carried security-sensitive sequencing—membership lookup, assignment policy, schedule validation, redaction, persistence, and audit—and Work Plan and Timeline independently recalculated the same phase-scoped state.
**Decision:** Treat Annual Conference as one feature module with five explicit boundaries. Hono remains the transport adapter; an application service owns use-case sequencing and stable domain errors; one repository selects Supabase or mock storage once per request; one resource-aware policy derives authorization, visibility, redaction, and response capabilities; one pure indexed read model derives phase-scoped summaries, health, ownership, workstreams, and planning gaps; and one shared Vue workspace controller owns query, phase scope, task selection, refresh, and task mutation lifecycle. Keep all existing URLs and response fields stable. Use explicit service and repository methods instead of a generic command bus or generic CRUD.
**Trade-offs:** The feature now has more named modules and contracts, but each boundary hides substantial behavior already shared by multiple callers. Mock and Supabase implementations must preserve one repository contract. The shared controller deliberately leaves ledger filters, phase-editor state, animation, and pagination in their owning views to avoid replacing two large components with one god composable. Runtime performance gains are structural: aggregate calculations are linear, independent Supabase phase/task reads overlap, and organizer data remains intent-loaded.
**Alternatives considered:** Keep route-local orchestration (security and audit behavior stays seam-dependent), create one generic command/event bus (small interface but weaker discoverability), split edition/phase/task into separate repositories (exposes aggregate coordination), move every page concern into one composable (creates another monolith), or introduce CQRS/materialized views now (unsupported by current scale).
**Revisit when:** Annual editions require server-side pagination or SQL projections, audit writes must be transactionally atomic with mutations, or another conference surface needs capabilities beyond task/phase planning.

---

## ADR-041: Assignment-Scoped Conference Task Editing

**Date:** 2026-08-03
**Status:** Accepted
**Context:** Conference tasks have one accountable owner and optional collaborators, but the first organizer implementation allowed every owner or organizer to modify every task. That made assignment informational rather than an authorization boundary and allowed unrelated members to change another team's delivery details.
**Decision:** Treat normalized accountable-owner and collaborator emails as the task-edit boundary for organizers and volunteers. The platform owner is an explicit administrative override and may create editions and tasks, manage phases, and edit every task. The edition planning owner, currently Ann for 2026 through `task_creator_email`, retains the same full planning control for that edition. Other organizers retain conference-wide read access but may edit only assigned tasks. Volunteers continue seeing assigned tasks only and remain limited to status changes. Enforce the rule in the API before ownership or schedule processing, and mirror it in the task drawer with a visible explanation when editing is unavailable. Canonicalize legacy spreadsheet name assignments to active membership emails only when the name uniquely identifies one active member.
**Trade-offs:** The platform owner can override task accountability for recovery and administration, so audit history remains important. Email-backed assignment remains the temporary identity link, and organizers can still read unrelated conference tasks even when they cannot edit them. Reassigning accountability can remove the former organizer's edit capability immediately. Ambiguous legacy names remain unchanged for manual review instead of being guessed. Volunteers remain less capable than assigned organizers because they cannot change task details.
**Alternatives considered:** Preserve role-wide editing for every organizer (too broad), hide edit buttons without API enforcement (bypassable), deny the platform owner an administrative override (conflicts with the platform role and recovery expectations), authorize legacy display names (ambiguous and spoofable), or limit all non-planning members to status-only updates (too restrictive for accountable organizers and collaborators).
**Revisit when:** Edition engagements replace platform membership emails, workstream leads need scoped authority, individual fields require separate approval capabilities, or platform-owner overrides require an approval workflow.

---

## ADR-040: Edition-Owned Conference Phases and Target-Date Timeline

**Date:** 2026-08-02
**Decision:** Model delivery phases as edition-scoped relational records and keep task phase assignment nullable. Make phase the primary operating scope for Work plan and Timeline: default both views to the current phase, fall forward to the next phase outside an active window, and derive all visible metrics, workstreams, deadlines, risks, and planning gaps from the selected scope. Organizers may switch to another phase, **No phase**, or the entire conference. Reuse each edition's `task_creator_email` as its planning-owner capability for task creation, phase management, and next-edition creation. A new edition may select an active organizer or inherit the latest edition's owner. Keep target dates optional, but surface missing dates as timeline attention and reject an assigned date after its phase end at both the API and database boundaries. Derive conference-health signals from the task and phase records rather than persisting a second progress model: actual completion stays separate from planning confidence, and readiness remains **Needs planning** while any task in the selected scope lacks a phase or target date.
**Why:** The 2026 checklist must be classifiable without inventing assignments, while future conferences need a variable number of phases and a durable way to hand planning ownership forward. A separate phase table preserves edition history and makes the timeline derive from the same dates used to validate tasks.
**Tradeoffs:** Only confirmed kickoff work is initially assigned to Phase 1; every other task remains in **No phase**, so the timeline is intentionally incomplete until organizers finish classifying and dating the plan. Reusing the task creator as planning owner keeps one clear capability but does not yet support separate task-creation and phase-management delegates. The 2026 volunteer workflow remains edition-specific while overview, work plan, phases, and timeline become year-aware.
**Alternatives considered:** Hard-code two phase columns on tasks (cannot support later editions), store phase names directly on tasks (duplicates dates and breaks referential integrity), or require every target date immediately (would block safe migration of the existing checklist).

---

> ADR entries explain WHY — not what was built, but why it was built that way.

---

## ADR-040: Fail-Closed Assigned-Work Access for Annual Conference Volunteers

**Date:** 2026-08-03
**Status:** Accepted as the first active-edition access slice
**Context:** DevCongress volunteers need to sign in and work inside the Annual Conference without seeing year-round Events, attendance, feedback, access administration, private applicant records, or unrelated conference work. Existing authentication recognized only owners and organizers, and the global API middleware treated every authenticated membership as a potential organizer boundary.
**Decision:** Add a narrow `volunteer` membership role to the existing Google OAuth and app-owned session flow. Route that role to the active Annual Conference and allow only the overview and work-plan routes. At the API boundary, keep owner/organizer as the default allowlist and admit volunteers only to annual work-plan reads and individual task patches. Filter reads by normalized membership email matching the task's accountable owner or collaborators, remove `internal_note`, and allow patches only when the request contains exactly one `status` change for an assigned task. Owners and organizers can assign active volunteers through the existing ownership controls; ADR-041 subsequently narrows their task editing to assignment scope unless they are the edition planning owner.
**Trade-offs:** The first slice represents active-edition volunteer access with a platform membership role because December 2026 is the only live annual workspace. That is simpler and immediately auditable, but it is not the final multi-edition people model. Task assignment depends on stable membership emails, volunteers cannot edit task details, and broader conference modules will require explicit capability rules before they are exposed.
**Alternatives considered:** Hide organizer navigation only (does not protect APIs), give volunteers organizer access (excessive privilege), expose the whole conference plan read-only (violates assigned-work scope), create a second volunteer app (duplicates auth and conference foundations), or build the complete person/engagement/capability schema before any access (correct long term but larger than the active-edition need).
**Revisit when:** A second annual edition is active, volunteers need workstream-wide rather than assignment-only access, speaker or sponsor collaborators sign in, task comments/files need separate visibility, or edition engagements can replace the temporary platform-level volunteer role.

---

## ADR-039: Variable-Controlled Prefix and Manual Cleanup for Pre-Launch Event Testing

**Date:** 2026-08-02
**Status:** Superseded by ADR-047 and the 2026-08-06 real-event naming policy
**Context:** DevCongress needs trusted testers to exercise the real hosted event-creation, submission, moderation, publication, and notification paths before opening them publicly. A separate development database and permanent development deployment are not currently affordable, while merging a full test-data lane would add product and schema work that is not required for this short acceptance period.
**Decision:** The former server-only `EVENT_TEST_MODE=true` workflow is retained only for identifying and cleaning legacy `[TEST]` records; it is no longer consulted when creating organizer events or accepting public submissions. Public-submission intake and discovery remain controlled by their independent gates. The local, service-role-only cleanup command remains dry-run-first, discovers promoted events through their submission relationship as well as the fixed prefix, requires the exact `DELETE_TEST_EVENT_DATA` confirmation to execute, deletes canonical events before submissions, and verifies that no matching application records remain. Preserve the append-only administrator audit ledger and acknowledge that email already accepted by the provider cannot be recalled.
**Trade-offs:** Legacy test and production records still share one schema and failure domain. New organizer events are no longer visually marked, so acceptance-test data must use the public-submission source/gates or an explicitly supplied dummy title and must be reviewed before cleanup. The fixed prefix remains the cleanup selector for legacy rows. The REST deletes are ordered and safely repeatable but are not one database transaction.
**Alternatives considered:** Provision a second Supabase project and development URL (current cost constraint), add permanent test/production scope columns and feeds (safer long-term but larger than the pre-launch need), delete all recently created records by timestamp (could capture legitimate concurrent work), or delete all submissions indiscriminately (unacceptably broad).
**Revisit when:** The public submission form is opened generally, testing overlaps real submissions, a recurring acceptance environment is needed, or cleanup must be atomic across all related records.

---

## ADR-038: Durable Community-Submission Decision Notifications

**Date:** 2026-08-02
**Status:** Accepted
**Context:** Public event submitters previously received an opaque receipt but no email, status page, or moderation decision. Sending Resend mail inline without durable state could lose a notification after the submission or decision had already committed, while coupling provider failure to moderation could incorrectly roll back an approved or rejected record. A single rejection note also could not safely serve both private organizer context and submitter-facing explanation.
**Decision:** Create a service-role-only `event_submission_email_deliveries` outbox with one idempotent record per submission and applicable kind: receipt, approved, or rejected. Queue the receipt through a database trigger in the same transaction as intake, and queue approval/rejection inside their existing locked moderation functions. Attempt delivery after persistence, using Cloudflare request-lifetime background work when available and an awaited fallback in Bun/test runtimes. Record only `pending`, provider-`accepted`, or `failed`; never call provider acceptance delivery. Use stable per-decision idempotency keys and let organizers retry failed deliveries without repeating the moderation transaction. Keep rejection category and optional organizer-facing message separate from the private internal note; email templates cannot receive the internal note, and audit metadata records only category plus content-presence booleans.
**Trade-offs:** Provider acceptance does not prove inbox delivery, and delivery/open state remains unavailable until verified Resend webhooks exist. A queued record can survive a provider outage or interrupted request, but recovery currently depends on the immediate dispatch attempt or an organizer retry rather than a scheduled queue drain. Email content is rendered from the immutable submission decision fields at send time instead of storing duplicate HTML in the database.
**Alternatives considered:** Send email before committing the decision (provider success could precede a failed moderation write), send best-effort after the write without an outbox (lost notifications cannot be discovered or retried), email the internal note (violates its private-review purpose), use one mutable decision row for email state (cannot represent receipt and decision deliveries independently), or mark messages delivered from the Resend API response (overstates provider evidence).
**Revisit when:** Resend webhooks can be signature-verified against raw bodies, queue volume justifies a scheduled drain or Cloudflare Queue consumer, a request-changes workflow needs a fourth notification kind, or retention policy requires snapshotting rendered email content.

---

## ADR-037: Role-Based, Code-Owned Email Identities and Subjects

**Date:** 2026-08-02
**Status:** Accepted
**Context:** Events Management sends attendee registration notices, waitlist promotions, organizer-authored event updates, and speaker archive requests, with community-submission decisions and annual-conference communication planned next. A meetup-specific sender title would misrepresent conference or external-event messages, while environment-owned display names could drift independently between local and deployed runtimes. Subjects were also distributed across templates and UI presets, making it difficult to audit every recipient scenario before adding another send path.
**Decision:** Keep two durable, role-based sender identities in `lib/email/scenarios.ts`: `DevCongress Events <events@updates.devcongress.org>` for attendee, event, community-listing, and conference-attendee communication; and `DevCongress Speakers <speakers@updates.devcongress.org>` for monthly and annual speaker communication. Keep these non-secret identities code-owned rather than environment-overridable. Retain monitored Reply-To mailboxes and provider credentials as deployment configuration. Generate active transactional subjects and blast presets through the same registry, normalize subjects to one line, cap them at 160 characters, and list planned scenarios without claiming delivery exists. Internal moderation notes never become submitter-facing email copy; ADR-038 activates community receipt and decision subjects through a durable outbox.
**Trade-offs:** Changing a sending address now requires a reviewed code deployment as well as Resend domain verification, but an old runtime variable cannot silently restore a series-specific identity. Two identities provide less campaign-level branding than a sender per programme, while remaining recognizable and stable for recipients. Organizer-authored blast subjects stay editable because they describe event-specific content, but the final provider subject is normalized and bounded by the shared policy.
**Change procedure:** Update `EMAIL_SENDERS`, the affected scenario entries and subject builders, policy tests, Resend domain verification, Reply-To configuration if needed, environment documentation, and this ADR. Preview representative HTML and text emails, run the complete test/build suite, then verify the deployed sender and subject with a controlled recipient before wider delivery.
**Alternatives considered:** Keep sender display names in Worker variables (allows silent environment drift), create a sender identity for every event series (does not scale across community listings and annual editions), use one sender for speakers and attendees (weakens recipient context), or add planned community subjects directly to send handlers (would bypass the required delivery ledger).
**Revisit when:** DevCongress introduces a separately staffed communications mailbox, sending reputation requires domain separation, legal requirements demand a different sender or footer, or a new recipient relationship cannot be described honestly as Events or Speakers.

---

## ADR-036: Relational External-Event Moderation With Explicit Promotion

**Date:** 2026-08-01
**Status:** Accepted
**Context:** The public website needs a low-friction event-proposal form, but a static client cannot safely write canonical events or hold privileged credentials. An older preview conflated approval with event classification and predated the current fail-closed public-write boundary. External listings must keep their real organizer and must not become DevCongress programming merely because the team permits them to appear.
**Decision:** Store public proposals in a dedicated service-role-only relational `event_submissions` table. Verify the purpose-specific Turnstile action and an explicit `devcongress.org` hostname allowlist before consuming atomic client/email rate limits. Keep proposals separate from canonical events until an authenticated organizer approves them. Promote approval through a transactional, idempotent database function guarded by a unique source-submission key. Model ownership, series, format, source, moderation, and publication independently. Preserve `/api/public/meetups` as the DevCongress-owned compatibility feed and add `/api/public/events` for generic published discovery. Keep the initial review UI to Approve & publish or Reject while requiring an explicit publication choice at the API boundary.
**Trade-offs:** The website and Worker Turnstile configuration must be deployed together. The first UI does not expose approve-as-draft even though the model supports it. Proposals have no public status endpoint or submitter edit loop. ADR-038 adds durable receipt and decision notifications without exposing private moderation state publicly.
**Alternatives considered:** Let Astro write Supabase directly (would expose or overgrant credentials), create canonical draft events before review (mixes untrusted proposals into operations), reuse `series_type` or an official/community classification (conflates independent taxonomy), broaden `/api/public/meetups` (breaks its established semantics), or replay the abandoned preview branch (predates current schema, security, and UI foundations).
**Revisit when:** A request-changes or submitter-auth workflow is justified, rejected-record retention is agreed, or DevCongress begins co-owning external events.

---

## ADR-035: Database-Owned Quiz Runtime

**Date:** 2026-08-01
**Status:** Accepted
**Context:** Hosted quiz sessions, questions, and responses were stored as whole arrays in `app_json_documents`. Every answer submission read multiple arrays, inserted a response, and updated the participant score in separate writes. Worker-local serialization could not prevent two isolates from accepting the same answer, losing a score update, releasing the same next question concurrently, or overwriting unrelated room state. The presenter and every participant also repeatedly downloaded collections so application code could calculate counts and rankings.
**Decision:** Store hosted `quiz_sessions`, `quiz_questions`, and `quiz_responses` relationally beside `quiz_participants`, while preserving the existing repository functions and local JSON implementation for development. Enforce join-code, question-order, answer, range, and lifecycle invariants with PostgreSQL constraints. Use short, service-role-only database functions for answer acceptance/scoring, presentation reset, question release/reveal, timed advancement, and reorder operations. Return counts, answer distribution, leaderboard ranks, and the requesting player's response through one stable SQL aggregation function. Keep compatibility documents after backfill for a rollback window, but remove these domains from the hosted document writer.
**Trade-offs:** Deployments must apply two ordered quiz migrations before the new server code. Scoring rules now exist in both SQL and the local fallback and must remain parity-tested. User-profile lifetime points still use the legacy user repository after the participant transaction; room score and leaderboard correctness no longer depend on that secondary update. Direct public Realtime subscriptions remain disabled because participant authorization is device-scoped at the API boundary; the relational schema is ready for a later secured broadcast layer without exposing correct answers.
**Alternatives considered:** Keep serializing JSON in each Worker (cannot coordinate isolates), add a lock around the document row (retains high-contention whole-array rewrites), move room state to a Durable Object immediately (adds another source of truth and operational surface), expose relational tables directly to anonymous clients (weakens the current authorization boundary), or encode all presentation behavior in triggers (hides explicit user actions and makes failures harder to reason about).
**Revisit when:** Participant-scoped signed tokens allow secure Realtime subscriptions, user profiles move relationally, scoring rules change, historical runs need retention rather than reset, or concurrent rooms approach the Free Plan's Realtime limits.

---

## ADR-034: Database-Owned System Design Participant Names

**Date:** 2026-08-01
**Status:** Accepted
**Context:** System Design aliases and participant-edited names were checked case-insensitively in application code, but hosted participant state lived inside the `app_json_documents` compatibility row. Write serialization existed only inside one Worker isolate, so simultaneous joins or renames handled by different isolates could both accept the same room name or overwrite participant changes.
**Decision:** Move quiz participant records to a dedicated Supabase `quiz_participants` table while retaining the JSON implementation only as the local-development fallback behind the existing participant repository functions. Store a normalized `nickname_key` for System Design participants and enforce unique `(quiz_session_id, nickname_key)` and `(quiz_session_id, user_id)` constraints in PostgreSQL. Let participant-edited conflicts surface as the existing `409 nickname_taken` response. For generated aliases, treat a unique-constraint violation as normal contention, reload the room names, and retry with another friendly alias. Backfill compatibility records without deleting the source document during the rollback window, and make user-history merges a short database transaction.
**Trade-offs:** Quiz participants now deploy with a schema migration and can no longer be treated as an arbitrary compatibility array in hosted mode. ADR-035 subsequently moved sessions, questions, and answers to relational storage; users remain on the JSON bridge. PostgreSQL `lower()` provides the durable case-insensitive key after the application has performed NFKC and whitespace normalization.
**Alternatives considered:** Keep the existing preflight duplicate check (cannot prevent cross-isolate races), serialize the entire JSON document with a database RPC (deepens reliance on the whole-array bridge and still leaves other participant writes awkward), coordinate names in Worker memory or KV (not a transactional source of truth), or migrate the full quiz domain immediately (larger than the identity correctness problem requires).
**Revisit when:** Quiz sessions and answers move to relational tables, live room coordination adopts a Durable Object, participant history gains a retention policy, or verified attendee identity replaces ephemeral room labels.

---

## ADR-033: Dual-Bound Organizer Sessions With A Context-Preserving Idle Pause

**Date:** 2026-08-01
**Status:** Accepted
**Context:** Organizer sessions were protected by secure, opaque cookies and a 12-hour server expiry, but an open tab could retain previously fetched organizer data and look usable until its next protected request. Organizers need a practical inactivity limit without abruptly losing their working context.
**Decision:** Keep the existing 12-hour absolute session lifetime and add a server-enforced 30-minute inactivity limit based on the session's authenticated `last_seen_at`. Treat absent or malformed activity timestamps as expired. The client resets its local inactivity clock only for meaningful input, warns at 28 minutes with a two-minute pause layer, revalidates immediately when the tab becomes visible, and refreshes the server session only while the organizer is actively using the workspace. On expiry, clear cached organizer data and local Supabase state, revoke the cookie best-effort, and present a minimal sign-in handoff rather than leaving a protected page visible.
**Trade-offs:** A user who returns after 30 minutes must sign in again, and a browser with an active Google session may complete that sign-in with little friction. The browser timer is a usability layer rather than a security authority; the Worker still rejects idle sessions independently. Five-minute active refreshes add small authenticated traffic but avoid continuous polling while a tab is idle.
**Alternatives considered:** Rely only on the 12-hour hard limit (too long for an unattended organizer device), silently redirect at timeout (loses context and feels abrupt), poll continuously (unnecessary traffic), or track mouse movement alone (can keep a session alive without intentional use).
**Revisit when:** Organization-level policy requires a shorter or configurable idle threshold, long-running forms need draft recovery, WebAuthn re-authentication is introduced for sensitive operations, or the console becomes a shared-device workflow.

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
**Status:** Accepted; final standing behavior extended by ADR-032 and name persistence extended by ADR-034.
**Context:** System Design facilitators need a readable post-question response summary without requiring participant accounts. Identity setup belongs to participants during the QR lobby, not to an organizer setting on the saved scenario workspace, and per-person reveal cards do not scale to a full room.
**Decision:** On join, assign every participant a unique server-generated friendly name and a participant-scoped avatar. Let that participant keep or edit only their room name from their phone while the session is waiting; the avatar cannot be changed. Validate edited names as 1–24 character room labels, reject duplicates case-insensitively, and authorize the public edit with the participant record and originating device ID. Close edits when the facilitator starts the first question. Persist the chosen label on the session participant record. Present question responses only as four aggregate bars containing the option, participant count, and percentage; do not return per-answer respondent identities. Keep the System Design leaderboard out of public attendee state.
**Trade-offs:** Edited labels can be inaccurate or playful because they are not authenticated. Device ownership is the lightweight authorization boundary for this account-free room. ADR-034 later moved participant labels to relational storage for database-enforced uniqueness, while session phase and answers remain compatibility data. Names and answers remain ephemeral run data and are cleared together when a completed room is reopened.
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
**Status:** Partially superseded by ADR-040 for edition-owned planning responsibility.
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
