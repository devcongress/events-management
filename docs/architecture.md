# Architecture

## Project Type

Vue 3 + Vite + TypeScript 5 — community tech conference platform. Full-stack monorepo: Vue SPA, Hono API, and Bun production server in one app process.

**Intended production stack:** Supabase (auth, PostgreSQL, storage, realtime).
**Current state:** Prototype data still uses JSON flat files in several areas, while all organizer authentication uses Supabase Google OAuth with app-owned HTTP-only sessions and fails closed when configuration is incomplete.

---

## Directory Map

```
devcongress-comm-idea/
├── src/                  ← Vue SPA shell
│   ├── App.vue
│   ├── main.ts
│   ├── router.ts
│   └── views/
├── server/               ← Hono API + Bun production server
│   ├── app.ts
│   └── index.ts
├── app/                  ← Legacy Next.js routes kept as migration reference
│   ├── (public)/          ← Attendee / speaker / player pages
│   │   ├── page.tsx            Landing page
│   │   ├── archive/            Past events & talks
│   │   ├── cfp/[eventId]/      CFP submission form
│   │   ├── play/               Quiz join + live player view
│   │   └── leaderboard/        Global leaderboard
│   ├── (admin)/           ← Organizer pages
│   │   └── admin/
│   │       ├── events/         Event CRUD + talk review
│   │       └── leaderboard/    Admin leaderboard view
│   ├── api/               ← REST route handlers
│   ├── layout.tsx
│   └── globals.css
├── components/           ← Legacy React components kept as migration reference
│   ├── admin/             ← Admin-specific forms/cards
│   ├── archive/           ← Event/talk listing components
│   ├── layout/            ← Nav bars (public + admin)
│   ├── slides/            ← Slide upload modal
│   └── ui/                ← Shared primitives (select, avatar, toast)
├── lib/
│   ├── mock-db/           ← JSON CRUD layer (readData / writeData)
│   ├── design-system.ts   ← Design tokens (JS-side)
│   ├── constants.ts       ← Quiz timing & scoring constants
│   ├── scoring.ts         ← Point calculation logic
│   └── utils.ts           ← Shared helpers
├── hooks/                 ← Legacy custom React hooks
├── types/index.ts         ← All TypeScript interfaces
└── data/                  ← JSON flat-file database + seed script
```

---

## Module Overview

| Module/Package | Purpose |
|---|---|
| `src` | Vue SPA shell and active client-side routes |
| `server` | Hono API routes and Bun static/API server |
| `app/(public)` | Legacy public-facing Next pages: landing, archive, CFP, quiz play, leaderboard |
| `app/(admin)` | Legacy organizer dashboard: event/talk/quiz/speaker management |
| `app/api` | Legacy REST route handlers retained during migration |
| `lib/mock-db` | Typed CRUD over JSON files; promise-queue serializes writes |
| `lib/supabase` | Typed Supabase clients for browser anon access and server service-role access |
| `lib/scoring.ts` | Speed-scaled point formula + streak bonus calculation |
| `lib/design-system.ts` | JS-side design tokens; mirrors `tailwind.config.ts` |
| `hooks/` | Legacy React hooks: `useRole`, `useDeviceId`, `useQuizPolling`, `useCountdown` |
| `types/index.ts` | Canonical entity types, enums, and API payload types |

---

## Event Archive Domain

**Event Archive** is the organizer-facing concept for the lasting material attached to one event. An archive item has a `kind` of `talk` or `product_demo`. The current storage and API compatibility model remains named `Talk`; records created before `kind` existed are read as `talk`, so existing data and routes do not require a rewrite.

Both intake paths converge on that same model:

- **Archive Requests** is the manual path used for July and for a known participant who did not enter through proposals.
- The later selected-proposal path starts from an organizer decision and creates the same archive item after the selected participant completes their private form.

In both paths, a one-time link is locked to one event, recipient identity, and archive-item kind. The browser cannot turn a talk request into a product demo, move it to another event, or replace the invited identity. Completing the form creates an accepted or materials-received compatibility `Talk`; publication remains a separate organizer action. Only explicitly published items enter the public archive.

The event-scoped **Speakers** allowlist is an access/identity mechanism, not the archive. Creating an archive item may ensure a matching allowlist row exists for compatibility, but removing or adding an allowlist entry does not itself create, publish, or remove archive content.

Public API evolution is additive: archive list and detail payloads expose `archive_items` as the preferred archive-facing alias while retaining `talks`; both fields currently contain the same explicitly published items. Historical `/talks` routes and count names also remain, archive items add `kind`, and consumers treat a missing kind as `talk`. No new archive endpoint is introduced. The Supabase `community_events` public projection is still separate from the compatibility `Talk` store; hosted meetup responses cannot be assumed to contain every archive item until that projection gains a durable join or relational archive source.

---

## Route Surface (Current)

### Active Vue Routes (`src/router.ts`)

- `/` — community hub backed by `/api/overview`
- `/archive` — searchable completed event archive
- `/archive/[eventId]` — explicitly published event archive items
- `/leaderboard` — public leaderboard and prototype account claim/merge tools
- `/cfp/[eventId]` — public talk or product-demo proposal form
- `/speaker-talks/[eventId]/[token]` — private selected-proposal or manual Archive Request form (compatibility URL)
- `/feedback/[eventId]` — public event feedback form for open feedback campaigns
- `/play` — quiz join form
- `/play/[code]` — live quiz player flow
- `/:pathMatch(.*)*` — branded 404 for unknown client routes
- Organizer routes live under `VITE_ADMIN_BASE_PATH` (`/organizer-console` by default) instead of `/admin`
- `[adminBase]/login` — prototype organizer sign-in
- `[adminBase]/events` — event management overview
- `[adminBase]/website-preview/events` — authenticated preview of the exact public meetup collection contract
- `[adminBase]/website-preview/events/[slug]` — authenticated website-shaped preview of one public meetup DTO
- `[adminBase]/annual-conference/2026` — active annual-edition overview
- `[adminBase]/annual-conference/2026/work-plan` — shared annual-conference task plan
- `[adminBase]/annual-conference/2026/volunteers` — December volunteer intake operations
- `[adminBase]/events/new` — create event form
- `[adminBase]/attendance` — monthly attendance ledger and cross-month insights
- `[adminBase]/events/[eventId]` — event detail, shared checklist, and status progression
- `[adminBase]/events/[eventId]/talks` — Event Archive, proposal review, and Archive Requests (compatibility URL)
- `[adminBase]/events/[eventId]/registrations` — registration campaign, private guest list, and name/email check-in
- `[adminBase]/events/[eventId]/speakers` — legacy speaker allowlist compatibility route, hidden from event navigation
- `[adminBase]/events/[eventId]/attendance` — organizer-only Luma attendance analysis
- `[adminBase]/events/[eventId]/quiz` — quiz builder
- `[adminBase]/events/[eventId]/quiz/live` — live quiz host controls
- `[adminBase]/events/[eventId]/system-design` — monthly system design scenario summary from the event program outline
- `[adminBase]/events/[eventId]/feedback` — feedback campaign builder and response review

### Active Hono API Routes (`server/app.ts`)

- `/api/health` — minimal public runtime smoke check
- `/api/health/supabase` — minimal public Supabase readiness check
- `/api/health/data-sources`, `/api/health/supabase/community-events`, `/api/health/supabase/storage` — owner-only internal diagnostics
- `/api/overview` — events, talks, and leaderboard summary for the Vue shell
- `/api/public/meetups*` — read-only DevCongress.org integration contract with CORS and short public cache headers
- `/api/auth/session`, `/api/auth/admin/exchange`, `/api/auth/admin/callback`, `/api/auth/logout` — Google OAuth and app-owned organizer session lifecycle
- `/api/admin/organizers*` — owner-only organizer email allowlist management
- `/api/admin/audit-log` — owner-only audit ledger for organizer sign-ins and successful admin mutations
- `/api/annual-conference/[year]/work-plan` — organizer-only annual edition/task reads, named-organizer task creation, and all-organizer task edits
- `/api/attendance/monthly` — admin-only monthly attendance ledger, import coverage, and cross-month insights
- `/api/events` — all events, create event
- `/api/events/[eventId]` — event detail, status update, and admin-only removal
- `/api/events/[eventId]/checklist` — admin-only chronological organizer checklist with status-changing milestones
- `/api/events/[eventId]/talks` — compatibility archive-item reads and organizer creation for `talk` and `product_demo` kinds
- `/api/events/[eventId]/speaker-intake-links` — admin-generated, month-scoped, expiring one-time archive-request links
- `/api/events/[eventId]/speaker-intake-emails` — authenticated, program-identity-derived personalized Resend Batch delivery using validated one-off recipient emails and accepted-send suppression
- `/api/events/[eventId]/speaker-intake/[token]` — public manual or selected-participant archive submission through an event-, identity-, and kind-locked token
- `/api/events/[eventId]/speaker-submissions` — admin-only CFP proposal inbox for organizer selection decisions
- `/api/events/[eventId]/registrations*` — admin-only registration campaign, guest list, check-in, and cancellation
- `/api/events/[eventId]/registration-emails/process` — admin-only queued confirmation-email retry
- `/api/events/[eventId]/attendance` — admin-only attendance summary for the latest Luma import
- `/api/events/[eventId]/attendance/import` — admin-only CSV import endpoint for Luma guest exports
- `DELETE /api/events/[eventId]/attendance` — admin-only removal of the stored Luma import
- `/api/events/[eventId]/speakers*` — speaker allowlist CRUD
- `/api/events/[eventId]/feedback-campaign` — admin feedback campaign setup, public link, and response list
- `/api/events/[eventId]/validate-speaker` — speaker allowlist validation for legacy/manual speaker access checks
- `GET/POST /api/registration/events/[eventId]` — public registration availability and name/email submission
- `/api/feedback/events/[eventId]` — public feedback campaign payload when open
- `/api/feedback/events/[eventId]/status` — public feedback availability for community CTAs
- `/api/feedback/events/[eventId]/submissions` — public structured event feedback submission
- `/api/cfp/events/[eventId]` — minimal public event context for an open monthly CFP
- `/api/cfp` — CFP submission
- `/api/talks` — all talks, optional `eventId` query filter
- `/api/talks/[talkId]` — admin talk status update
- `/api/talks/[talkId]/reminder` — logs organizer slide reminders for accepted talks
- `/api/leaderboard` — all-time, monthly, or session leaderboard
- `/api/users/claim`, `/api/users/merge` — prototype account tools
- `/api/quiz/active`, `/api/quiz/join`, `/api/quiz/state`, `/api/quiz/answer` — player quiz flow
- `/api/quiz/sessions*`, `/api/quiz/questions*` — quiz builder/live host flow
- `/api/quiz/sessions/[sessionId]/questions/from-paper` — admin-only PDF upload, local text extraction, and prototype question generation

### Legacy Public App Routes (`app/(public)`)

- `/` — landing page
- `/archive` — completed events index
- `/archive/[eventId]` — published talks for one event
- `/cfp/[eventId]` — speaker CFP submission
- `/speaker-talks/[eventId]/[token]` — private selected-proposal or manual Archive Request form (compatibility URL)
- `/play` — quiz join form
- `/play/[code]` — live quiz gameplay
- `/leaderboard` — public leaderboard view

### Legacy Admin App Routes (`app/(admin)/admin`)

- `/admin` — admin home (entry/redirect)
- `/admin/events` — event management overview
- `/admin/events/new` — create event
- `/admin/events/[eventId]` — event detail + status progression
- `/admin/events/[eventId]/talks` — talk review/status management
- `/admin/events/[eventId]/speakers` — speaker allowlist management
- `/admin/events/[eventId]/quiz` — quiz builder (create/edit/delete/reorder questions)
- `/admin/events/[eventId]/quiz/live` — live quiz control/monitor
- `/admin/leaderboard` — admin leaderboard modes

### Legacy API Routes (`app/api`)

- `/api/events` (`GET`, `POST`)
- `/api/events/[eventId]` (`GET`, `PATCH`)
- `/api/events/[eventId]/speakers` (`GET`, `POST`)
- `/api/events/[eventId]/speakers/[speakerId]` (`DELETE`)
- `/api/events/[eventId]/speaker-submissions` (`GET`)
- `/api/speaker-submissions/[submissionId]` (`PATCH`)
- `/api/events/[eventId]/validate-speaker` (`POST`, legacy/manual speaker access check)
- `/api/cfp` (`POST`)
- `/api/talks/[talkId]` (`PATCH`)
- `/api/talks/[talkId]/upload` (`POST`, multipart file upload)
- `/api/leaderboard` (`GET`)
- `/api/quiz/active` (`GET`)
- `/api/quiz/join` (`POST`)
- `/api/quiz/state` (`GET`)
- `/api/quiz/answer` (`POST`)
- `/api/quiz/sessions` (`GET`, `POST`)
- `/api/quiz/sessions/[sessionId]` (`GET`, `PATCH`)
- `/api/quiz/questions` (`POST`)
- `/api/quiz/questions/[questionId]` (`PATCH`, `DELETE`)
- `/api/quiz/questions/reorder` (`POST`)
- `/api/seed` (`POST`)

---

## Data Flow

### Active Vue page
```
Browser GET /
  → Hono dev server or Bun static server
  → Vue Router renders DashboardView
  → fetch('/api/overview')
  → server/app.ts → lib/mock-db/* → data/*.json
```

### Legacy page (Server Component)
```
Browser GET /archive
  → Next.js Server Component (legacy)
  → lib/mock-db/events.ts → readData() → data/events.json
  → renders HTML with embedded data
```

### Quiz and System Design learning rooms (client + polling)
```
Browser (player)
  → POST /api/quiz/join           (get sessionId + participantId + room display name)
  → setInterval GET /api/quiz/state (read-only state fetch)
      ↓ strips correct_index and pre-reveal answer distribution
  → POST /api/quiz/answer         (submit answer → score)
  → finished state returns only own standing (Navii seed + name + rank)

Browser (System Design presenter, organizer-protected)
  → POST /api/quiz/sessions/[id]/presentation (prepare or resume run)
  → GET /api/quiz/state?presenter=true (protected live room pulse + reveal identifiers)
  → POST /api/quiz/sessions/[id]/release (next reviewed question)
  → POST /api/quiz/sessions/[id]/reveal (answer + teaching explanation)
  → finished state shows protected top-ten leaderboard
```

### Admin quiz control
```
Browser (admin) → PATCH /api/quiz/sessions/[id]
  { status | question_phase | runtime timestamps }
  → updates session status/phase in data/quiz-sessions.json
```

---

## External Dependencies

| Name | Purpose |
|---|---|
| `vue` 3 | Active UI rendering |
| `vite` 6 | Active dev server and frontend bundler |
| `@hono/vite-dev-server` | Runs the Hono app through one Vite dev server |
| `@supabase/supabase-js` | Supabase client for feedback storage and future production data migration |
| `hono` | Active API framework |
| `bun` | Production runtime and static/API server |
| `@tanstack/vue-query` | Active browser query cache and mutation coordination |
| `vue-router` | Active client routing |
| `qrcode` | Local QR-code generation for quiz lobby join links |
| `tailwindcss` 3 | Utility CSS |
| `tailwind-merge` | Merge Tailwind class strings without conflicts |
| `class-variance-authority` | Variant-based component styling |
| `uuid` | Generate entity IDs |
| `pdf-parse` | Local server-side PDF text extraction for prototype quiz generation |
| `tsx` | Run TypeScript seed script (`pnpm seed`) |
