# Architectural Decisions

> ADR entries explain WHY — not what was built, but why it was built that way.

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

---

## ADR-016: Campaign-Scoped Volunteer Intake In Existing Shared Documents

**Date:** 2026-07-25
**Status:** Active transitional implementation; the relational-workflow revisit trigger was reached on 2026-07-26.
**Why:** The December Mega Meetup needs a fast public volunteer form and a private organizer review surface without creating a new production schema dependency during event preparation. The app already has a Supabase-backed `app_json_documents` compatibility store for cross-instance JSON domains, so the campaign records live there under the `volunteer-applications` key when server-side Supabase is configured. This keeps deployed submissions durable while preserving the local JSON fallback used by the rest of the compatibility layer.
**Tradeoffs:** This is deliberately limited to one campaign and does not provide relational reporting, database-level uniqueness, or a long-term volunteer CRM. The server protects it with one application per campaign/email, optional Turnstile, and per-client rate limiting; a future multi-event volunteer workflow should move to dedicated relational Supabase tables with database constraints.
**Alternatives considered:** Add a new Supabase table immediately (more migration and rollout coordination than the December drive needs), keep applications only in the Worker filesystem (not durable across instances), or use a third-party form (loses the existing organizer console and QR-display experience).
**Revisit when:** More than one volunteer campaign is active, volunteer assignments/communications are added, or reporting needs to join volunteers to events and organizer actions.

---

## ADR-015: Supabase Records With Resend Speaker-Link Delivery

**Date:** 2026-07-25
**Why:** Speaker archive/backfill and selected-speaker links need a branded, low-friction delivery channel without adopting a paid Cloudflare Email Sending plan. Supabase remains the durable system of record for link and delivery metadata, while Resend handles transactional delivery on its free tier. The existing authenticated Hono Worker will call Resend server-side so delivery authorization stays alongside the speaker-link lifecycle.
**Tradeoffs:** This introduces one external delivery provider and a server-only API key. The free tier has daily and monthly limits, and Resend domain verification still requires DNS changes. Email is not proof that a recipient read or completed the form; audit records describe the application's delivery request and the provider response.
**Alternatives considered:** Cloudflare Email Sending (not chosen because it requires Workers Paid for outbound production delivery), Supabase's default mailer (not suitable for production speaker mail because of authorization and rate limits), or manual copy/paste only (remains available, but does not provide delivery auditability).
**Revisit when:** Sending volume approaches the Resend free-tier limit, bulk reminders are required, or the link store moves from JSON compatibility data to hash-only Supabase records.

---

## ADR-014: Read-Only Luma Event Import

**Date:** 2026-06-17
**Why:** Organizers already create DevCongress meetups in Luma, so the app should avoid duplicate manual entry while preserving Luma as the source of truth for registration. A read-only import from Luma into Supabase `community_events` gives the organizer console the event shell it needs for website publishing, checklists, talks, feedback, media, and attendance without trying to manage Luma itself.
**Tradeoffs:** The import reads public Luma event pages instead of the Plus-only Luma API, so it can only import fields Luma exposes in page metadata. Supabase-backed events are still required because local JSON fallback cannot deduplicate external records safely. Imported data is a snapshot, so later Luma edits will not automatically appear until a refresh/sync feature is added.
**Alternatives considered:** Creating Luma events from DevCon-Comm (rejected because organizers prefer Luma as the event-registration tool), requiring Luma Plus API keys (rejected because the project is not paying for Luma Plus), or full automatic sync/webhooks now (larger operational surface before the import mapping is proven).
**Revisit when:** The import mapping is trusted and organizers ask for `Refresh from Luma`; start with manual diff-based refresh before considering webhooks or automatic sync.

---

## ADR-013: Supabase Admin Auth With App-Owned Sessions

**Date:** 2026-06-16
**Why:** Organizer access needs per-admin identity, role checks, and auditability before hosted use. Supabase Auth already fits the production data plan, while Hono-owned HTTP-only sessions preserve the same-origin cookie contract and avoid storing Supabase tokens in the browser.
**Tradeoffs:** The app now owns session rows and organizer membership checks, so auth is more code than the prototype password. The local shared-password fallback remains only for development environments without Supabase auth configured.
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
