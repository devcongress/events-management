# Architectural Decisions

> ADR entries explain WHY — not what was built, but why it was built that way.

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
