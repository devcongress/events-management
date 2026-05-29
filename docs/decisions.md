# Architectural Decisions

> ADR entries explain WHY — not what was built, but why it was built that way.

---

## ADR-008: Same-Origin Prototype Admin Session

**Date:** 2026-05-29
**Why:** The Vue/Bun migration must keep UI and API on one origin so future cookie auth does not require cross-origin workarounds. A small Hono cookie session now protects organizer routes and mutating admin APIs while keeping speaker/player flows public.
**Tradeoffs:** This is still prototype auth: one shared admin password, JSON data, no roles, no password reset, and local defaults for development. It is enough to prevent accidental public admin mutations during product work, but not production-ready.
**Alternatives considered:** Shipping all admin endpoints open until Supabase (too risky for continued iteration), adding a second auth/API server (rejected because same-origin auth is a project constraint), integrating Supabase Auth now (correct long term, too much infrastructure for this migration checkpoint).
**Revisit when:** Supabase Auth is introduced; replace the shared password with per-admin identities and middleware-backed role checks.

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
