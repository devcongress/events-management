# Technical Debt Register

This register is intentionally direct. It helps contributors understand what is prototype-grade, what is risky before production, and where useful contributions can land.

## Priority Guide

| Priority | Meaning |
|---|---|
| P0 | Must resolve before public production use |
| P1 | Should resolve before broad community adoption |
| P2 | Important maintainability or quality improvement |
| P3 | Nice-to-have cleanup |

## Current Debt

| Priority | Area | Debt | Evidence | Suggested Direction |
|---|---|---|---|---|
| P0 | Persistence | Several core workflows still use JSON flat files. Corrupt files now fail loudly and writes use temp-file rename, but the store is still process-local and lacks database constraints or multi-instance safety. | `lib/mock-db/index.ts`; `data/*.json`; `docs/decisions.md` ADR-001 | Move events, talks, speakers, attendance, quiz, and feedback to Supabase/Postgres with migrations and constraints. |
| P1 | Quiz realtime | Quiz clients still poll every 1500ms. Phase changes now happen through explicit `POST /api/quiz/state/advance`, but there is still no realtime/job-backed state machine for larger live games. | `server/quiz-state.ts`; `server/app.ts`; `docs/features/quiz.md` | Move phase transitions to a server job, Durable Object, Supabase Realtime, or another host-authoritative state machine before larger live games. |
| P1 | Server structure | `server/app.ts` is still a large multi-domain route file. Quiz state logic has been extracted, but auth, health, feedback, attendance, event CRUD, quiz routes, user merge, and public APIs still share one route module. | `server/app.ts`; `server/quiz-state.ts` | Split additional domain route modules and introduce shared request validation/error helpers. |
| P1 | Test coverage | Coverage now includes mock DB hardening, Luma attendance parsing, and quiz state helpers, but active Hono route integration, Vue views, feedback flows, and Supabase helpers still have little or no direct automated coverage. | `lib/mock-db/index.test.ts`; `lib/luma-attendance.test.ts`; `server/quiz-state.test.ts` | Add route-level tests for Hono handlers, component tests for key forms, and integration smoke tests for public API. |
| P1 | Admin auth hardening | Hosted admin auth now has per-email Supabase login, app sessions, owner/organizer roles, and audit rows, but does not yet enforce MFA or rate-limit sign-in attempts beyond Supabase defaults. | `lib/supabase/admin-auth.ts`; `supabase/migrations/20260616000000_admin_auth.sql`; `docs/auth.md` | Add MFA enforcement for owners, route-level auth tests, and optional Cloudflare Access as an outer gate before high-stakes production use. |
| P1 | Secrets posture | Sentinel currently flags local `.env.local` Supabase values and git-history keyword hits. Values are masked, but real service-role keys should be treated as sensitive. | `.sentinel/security.md`; `.sentinel/secrets-found.md`; `SECURITY.md` | Rotate any real exposed keys, keep `.env.local` ignored, and avoid committing generated secret reports if the project decides reports should remain local-only. |
| P2 | Deployment readiness | The target Cloudflare/Supabase architecture is documented, but runtime still assumes Bun/static serving and JSON file behavior in places. | `docs/deployment-cloudflare-supabase.md`; `server/index.ts`; `lib/mock-db/*` | Complete the Supabase migration and decide whether production runs as Cloudflare Workers/Pages, Render bridge, or another hosted Bun target. |
| P2 | Input validation | Several API handlers parse request JSON inline and validate manually, which makes behavior inconsistent across domains. | `server/app.ts` route handlers | Introduce typed request schemas and shared validation response helpers. |
| P2 | Generated artifacts | `.codebase-indexer/` and `.sentinel/` are committed today. That is useful for handoff, but it may not be the right long-term open-source default. | Repo root generated artifact folders | Decide whether to keep these as project artifacts, move reports to CI artifacts, or ignore generated reports locally. |
| P3 | Legacy migration cleanup | Legacy Next/React files remain as reference while active work happens in Vue/Hono. | `app/`, `components/`, `hooks/`; `docs/migration-parity.md` | Remove or archive legacy areas once Vue parity is complete and no docs still depend on them. |

## Good First Debt Issues

- Add Hono route integration tests around quiz state, attendance import, and feedback routes.
- Extract one small route group from `server/app.ts` into a domain route module.
- Add schema validation for one API endpoint group.
- Improve README/CONTRIBUTING guidance around generated reports once the repo policy is decided.
- Add a GitHub Actions workflow for `pnpm typecheck`, `pnpm test`, and `pnpm build`, then add a real CI badge.

## Review Cadence

Review this file before major releases, deployment work, or onboarding contributor issues. Move items out when they are fixed, and add a changelog entry for meaningful debt reduction.
