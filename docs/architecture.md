# Architecture

## Project Type

Vue 3 + Vite + TypeScript 5 — community tech conference platform. Full-stack monorepo: Vue SPA, Hono API, and Bun production server in one app process.

**Intended production stack:** Supabase (auth, PostgreSQL, storage, realtime).
**Current state:** Prototype data still uses JSON flat files in several areas, while hosted admin auth uses Supabase email OTP with app-owned HTTP-only sessions and a local shared-password fallback for development.

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
│   │   ├── my-talks/           Speaker slide upload dashboard
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

## Route Surface (Current)

### Active Vue Routes (`src/router.ts`)

- `/` — community hub backed by `/api/overview`
- `/archive` — searchable completed event archive
- `/archive/[eventId]` — published talks for one event
- `/leaderboard` — public leaderboard and prototype account claim/merge tools
- `/cfp/[eventId]` — speaker CFP submission
- `/feedback/[eventId]` — public event feedback form for open feedback campaigns
- `/my-talks` — speaker lookup and slide URL upload/update
- `/play` — quiz join form
- `/play/[code]` — live quiz player flow
- `/:pathMatch(.*)*` — branded 404 for unknown client routes
- Organizer routes live under `VITE_ADMIN_BASE_PATH` (`/organizer-console` by default) instead of `/admin`
- `[adminBase]/login` — prototype organizer sign-in
- `[adminBase]/events` — event management overview
- `[adminBase]/events/new` — create event form
- `[adminBase]/attendance` — monthly attendance ledger and cross-month insights
- `[adminBase]/events/[eventId]` — event detail, shared checklist, and status progression
- `[adminBase]/events/[eventId]/talks` — talk review/status management
- `[adminBase]/events/[eventId]/speakers` — speaker allowlist management
- `[adminBase]/events/[eventId]/attendance` — organizer-only Luma attendance analysis
- `[adminBase]/events/[eventId]/quiz` — quiz builder
- `[adminBase]/events/[eventId]/quiz/live` — live quiz host controls
- `[adminBase]/events/[eventId]/feedback` — feedback campaign builder and response review

### Active Hono API Routes (`server/app.ts`)

- `/api/health` — single-server runtime smoke check
- `/api/health/supabase` — Supabase config/table reachability smoke check
- `/api/overview` — events, talks, and leaderboard summary for the Vue shell
- `/api/public/meetups*` — read-only DevCongress.org integration contract with CORS and short public cache headers
- `/api/auth/session`, `/api/auth/admin/login`, `/api/auth/admin/exchange`, `/api/auth/admin/callback`, `/api/auth/logout` — organizer auth and app-owned session lifecycle
- `/api/admin/organizers*` — owner-only organizer email allowlist management
- `/api/attendance/monthly` — admin-only monthly attendance ledger, import coverage, and cross-month insights
- `/api/events` — all events, create event
- `/api/events/[eventId]` — event detail/status update
- `/api/events/[eventId]/checklist` — admin-only chronological organizer checklist with status-changing milestones
- `/api/events/[eventId]/talks` — talks for event
- `/api/events/[eventId]/attendance` — admin-only attendance summary for the latest Luma import
- `/api/events/[eventId]/attendance/import` — admin-only CSV import endpoint for Luma guest exports
- `DELETE /api/events/[eventId]/attendance` — admin-only removal of the stored Luma import
- `/api/events/[eventId]/speakers*` — speaker allowlist CRUD
- `/api/events/[eventId]/feedback-campaign` — admin feedback campaign setup, public link, and response list
- `/api/events/[eventId]/validate-speaker` — CFP speaker allowlist validation
- `/api/feedback/events/[eventId]` — public feedback campaign payload when open
- `/api/feedback/events/[eventId]/status` — public feedback availability for community CTAs
- `/api/feedback/events/[eventId]/submissions` — public structured event feedback submission
- `/api/cfp` — CFP submission
- `/api/talks` — all talks, optional `eventId` query filter
- `/api/talks/[talkId]` — admin talk status update or speaker slide URL update
- `/api/talks/[talkId]/reminder` — logs organizer slide reminders for accepted talks
- `/api/my-talks` — speaker talk lookup
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
- `/my-talks` — speaker lookup + slides upload
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
- `/api/events/[eventId]/validate-speaker` (`POST`)
- `/api/cfp` (`POST`)
- `/api/talks/[talkId]` (`PATCH`)
- `/api/talks/[talkId]/upload` (`POST`, multipart file upload)
- `/api/my-talks` (`GET`)
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

### Quiz (Client Component + polling)
```
Browser (player)
  → POST /api/quiz/join           (get sessionId + userId)
  → setInterval POST /api/quiz/state/advance (explicit phase tick)
      ↓ server checks elapsed time and all-answered state
      ↓ advances phase if needed
  → setInterval GET /api/quiz/state (read-only state fetch)
      ↓ strips correct_index from current_question
  → POST /api/quiz/answer         (submit answer → score)
```

### Admin quiz control
```
Browser (admin) → PATCH /api/quiz/sessions/[id]
  { action: 'start' | 'next' | 'finish' }
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
| `pinia` | Active client state library |
| `vue-router` | Active client routing |
| `qrcode` | Local QR-code generation for quiz lobby join links |
| `tailwindcss` 3 | Utility CSS |
| `tailwind-merge` | Merge Tailwind class strings without conflicts |
| `class-variance-authority` | Variant-based component styling |
| `uuid` | Generate entity IDs |
| `pdf-parse` | Local server-side PDF text extraction for prototype quiz generation |
| `tsx` | Run TypeScript seed script (`pnpm seed`) |
