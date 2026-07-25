# Notes: Website and Events Management Integration

## Repository Evidence

### Website

- Repository: `/Users/TT/Documents/personal/forks/website`, local `main` at `ad5c96f32ad5437061ccb04a111b046129dde96f`.
- The repository is an Astro 6.4.2 static site (`output: 'static'`) with GitHub Pages deployment from `dist/`.
- The local fork snapshot differs from the deployed upstream website. Phase 1 must establish one approved source commit while treating the live site as the visitor-parity reference.
- `src/lib/meetups.ts` performs a build-time fetch from `https://events-management.pages.dev/api/public/meetups` and falls back to local meetup YAML. This means the generated site is static, but its event snapshot is only as fresh as the last successful deployment.
- `src/components/Navbar.astro` is the insertion point for the future Organizer link and authenticated Sign out action on the homepage. Meetup archive/detail routes currently have separate compact headers and need an explicit product decision about whether organizer session controls appear there too.
- Existing user-owned dirty state was present before this task: modified `AGENTS.md` plus untracked `.codex/git-identity.md`. This task must not overwrite or stage either.
- User constraint for this planning pass: the website repository remains strictly read-only.

### Events Management

- Repository: `/Users/TT/Documents/personal/ideas/events-management`, `main` at `29bd461e69749e568928cfe6c2b80d79d40943c5` before this task's documentation files.
- Active product shape is a Vue SPA plus Hono API. `server/worker.ts` already exposes the Hono app as a Cloudflare Worker; `server/index.ts` is the separate Bun static-server entrypoint.
- Organizer routes use `/organizer-console` by default. Hosted auth is Supabase Google OAuth followed by an app-owned HTTP-only session cookie and server-side membership/role checks.
- The existing public/organizer shell already implements the desired mode switch and authenticated logout behavior in `src/App.vue`; it can serve as behavior reference without forcing its visual system onto the public Astro website.
- Durable data is split: community events, feedback campaigns/submissions, organizer memberships/sessions/audit data, and media use dedicated Supabase tables/storage; talks, speakers, attendance, checklists, quiz state/results/users, and other prototype domains currently use `app_json_documents` as a Supabase-backed JSON bridge in hosted mode.
- Local development still falls back to filesystem JSON. The `fs/promises` and `path` fallback in `lib/mock-db/index.ts`, Bun static server, and optional `pdf-parse` quiz upload path must not be copied blindly into an Astro/Workers runtime.
- The current production topology is already split: Pages serves the Vue assets, `public/_worker.js` proxies `/api/*` to a hardcoded public `workers.dev` URL, and the Hono Worker talks to Supabase. The website target must replace that public proxy hop with colocated Hono routes or a private Service Binding.
- The current Hono API is a roughly 4,800-line monolith with a wildcard Vue-shell handler. It must be split into route groups before composition with Astro; copying it wholesale would intercept Astro pages and bundle unrelated quiz/PDF/filesystem code.
- Current auth fallback constants include development password/session defaults. A website production Worker must fail closed when Supabase auth configuration is absent rather than inheriting the fallback.

## Deployment Evidence

- `https://devcongress.org` currently resolves to GitHub Pages and returns `server: GitHub.com`; `/` and `/meetups/` both returned HTTP 200 on 2026-07-10.
- The production upstream `devcongress/website` head is `10de647f81f71b72a08226dfe41919cf599fd635` from 2026-06-15. The production HTML has the same last-modified date, while the local fork snapshot is newer; compare both intentionally instead of assuming they are equivalent.
- The upstream GitHub Pages project uses the custom domain `devcongress.org`, HTTPS enforcement, and the `Build and Deploy` workflow.
- `https://events-management.pages.dev/api/health`, `/api/health/data-sources`, `/api/auth/session`, and `/api/public/meetups` all returned HTTP 200 on 2026-07-10.
- Hosted organizer auth reports `auth_mode: supabase`. Hosted data-source health reports all listed product domains on Supabase, either dedicated relational tables or the Supabase JSON bridge; no hosted domain reported `local-json`.
- `/api/health` reports the Worker runtime as `vite-dev-server` because its runtime label only distinguishes Bun from non-Bun. This is an observability naming defect, not evidence that production is actually running Vite.
- The domain already uses Cloudflare nameservers, so a Worker Custom Domain can replace the current GitHub Pages origin without a nameserver migration.

## Organizer and Auth Boundary

- Keep browser-facing auth same-origin at `devcongress.org`: callback, token exchange, session check, organizer mutations, and logout should all use relative `/api/...` URLs and an HTTP-only cookie scoped to `/`.
- Preserve Supabase as the identity and durable-data system. Do not expose the service-role key to Astro client code or copy it into `PUBLIC_`/browser-prefixed variables.
- A pre-rendered homepage cannot decide server-side whether to show Sign out. Preserve static HTML and add a minimal client-side session check that reveals Sign out only after `/api/auth/session` confirms authentication; Organizer remains a normal visible link.
- The organizer console can move before every community feature, but only after its required write domains are confirmed Worker-safe and Supabase-backed.

## Data and Runtime Compatibility

- The website's current cross-origin build-time API dependency is transitional. The target removes `EVENTS_MANAGEMENT_ORIGIN` and reads through a same-repository server module or private service binding.
- Supabase Postgres is the target system of record for every dynamic organizer/community domain. Supabase Auth owns organizer identity, and Supabase Storage owns uploaded media while Postgres stores media metadata.
- Repository YAML remains appropriate only for stable editorial website content such as mission, programs, partners, admins, and site copy. It must not become a second source of truth for organizer-managed records.
- Dedicated relational Supabase repositories are the preferred target. The `app_json_documents` bridge can preserve behavior during migration but is compatibility storage, not a final schema for any multi-writer domain.
- The JSON bridge rewrites whole arrays and serializes only within one process/isolate. Concurrent Worker isolates can lose updates, so talks, speakers, attendance, checklists, quiz state, and account-merge flows need dedicated repositories or explicit concurrency control before becoming multi-writer website modules.
- Public pages fall into two classes:
  - Stable marketing/editorial content remains pre-rendered from Astro content collections.
  - Organizer-owned, time-sensitive event/community data uses same-origin runtime reads or deliberately invalidated cached output.
- Worker-incompatible paths must be isolated or replaced: Bun static serving, filesystem fallback writes, and PDF parsing. PDF quiz imports should remain disabled until moved to a compatible asynchronous/storage path.
- Safe first extraction: health, auth/session, organizer membership/audit, read-only organizer events, event CRUD/public meetup projections, and media paths backed by dedicated Supabase boundaries.
- Temporary private-binding candidates: route groups still coupled to the monolith or JSON bridge. Do not expose the compatibility Worker directly to the browser.
- Live quiz/account merging and PDF-to-quiz are explicitly late migrations because their present concurrency and runtime assumptions are not safe for the website Worker.
- Durable Objects coordinate transient live quiz-room state only. Quiz definitions, participants, answers, scores, and completed-session history remain durable Supabase records.
- `feature/community-event-submissions` exists outside current `main`; treat it as a later feature candidate, not baseline parity scope.

## Verification Baseline

- URL/status parity: `/`, `/meetups/`, and each generated meetup detail URL must retain 200/404 behavior, canonical metadata, and trailing-slash behavior.
- Visual parity: capture desktop/mobile screenshots of the current production pages and compare Cloudflare preview output before DNS changes.
- Content parity: compare headings, navigation, CTA targets, image URLs, structured metadata, and meetup counts/slugs.
- Performance parity: record asset count/bytes and Core Web Vitals before cutover; static public routes must not unnecessarily invoke dynamic compute.
- Operational parity: preview deploy, production deploy, rollback, custom-domain TLS, analytics, cache headers, and scheduled content refresh all need explicit smoke checks.
- Auth parity later: unauthorized session response, approved organizer login, callback, role checks, origin/CSRF rejection, logout, and cookie flags must pass on the final custom domain.
