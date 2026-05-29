# Implementation

## Entry Points

| File | Role |
|---|---|
| `src/main.ts` | Vue app bootstrap — Pinia, Vue Router, global CSS |
| `src/App.vue` | Active app shell and top navigation |
| `src/router.ts` | Active Vue route table |
| `src/views/DashboardView.vue` | DEV::CON[] landing page backed by current mock data |
| `src/views/ArchiveView.vue` / `ArchiveEventView.vue` | Public archive and talk detail surfaces |
| `src/views/CfpView.vue` / `MyTalksView.vue` | Speaker CFP and slide management flows |
| `src/views/PlayView.vue` / `PlayCodeView.vue` | Quiz join and live player gameplay |
| `src/views/admin/*` | Active admin event/talk/speaker/quiz management views |
| `server/app.ts` | Hono app — active API routes plus dev SPA fallback |
| `server/index.ts` | Bun production server — serves `dist/` and `/api/*` on one port |
| `vite.config.ts` | Vite + Vue + Hono dev-server wiring |
| `data/seed.ts` | Seed script — run via `pnpm seed` |

---

## Route-to-Module Notes (Current)

- **Event + CFP flow**
  - Active Vue pages: `src/views/CfpView.vue`, `src/views/admin/AdminEventsView.vue`, `src/views/admin/AdminEventView.vue`
  - Public CFP page: `app/(public)/cfp/[eventId]/page.tsx`
  - APIs: `/api/events/[eventId]`, `/api/events/[eventId]/validate-speaker`, `/api/cfp`
- **Speaker management**
  - Admin page: `app/(admin)/admin/events/[eventId]/speakers/page.tsx`
  - APIs: `/api/events/[eventId]/speakers` (`GET`/`POST`), `/api/events/[eventId]/speakers/[speakerId]` (`DELETE`)
- **Talk review + slides**
  - Active Vue pages: `src/views/admin/AdminTalksView.vue`, `src/views/MyTalksView.vue`
  - APIs: `/api/talks/[talkId]`, `/api/talks/[talkId]/reminder`, `/api/my-talks`
- **Quiz authoring + live ops**
  - Active Vue pages: `src/views/admin/AdminQuizView.vue`, `src/views/PlayView.vue`, `src/views/PlayCodeView.vue`
  - Builder: `app/(admin)/admin/events/[eventId]/quiz/page.tsx`
  - Live control: `app/(admin)/admin/events/[eventId]/quiz/live/page.tsx`
  - APIs: `/api/quiz/sessions*`, `/api/quiz/questions*`, `/api/quiz/state`, `/api/quiz/answer`, `/api/quiz/active`, `/api/quiz/join`

---

## Per-Module Breakdown

### Mock DB (`lib/mock-db/`)

- **Entry point:** `lib/mock-db/index.ts`
- **Key functions:**
  - `readData<T>(filename)` — reads `data/{filename}.json`, returns `[]` on missing/corrupt
  - `writeData<T>(filename, data)` — serializes writes via a per-filename promise queue (`writeQueues: Map<string, Promise<void>>`)
- **Non-obvious logic:** The write queue chains promises per file key — concurrent writes to `events` and `sessions` can overlap, but concurrent writes to the same file are serialized. Reads are unguarded (last-write-wins on read-during-write).
- Each entity module (`events.ts`, `talks.ts`, etc.) exports typed helpers like `getAll*`, `get*ById`, `create*`, `update*`.

### Hono Server (`server/`)

- **Entry points:**
  - `server/app.ts` exports the fetch-compatible Hono app used by Vite dev server.
  - `server/index.ts` starts Bun in production, serving `/api/*` through Hono and all other paths from `dist/`.
- **Current active APIs:**
  - `/api/health`
  - `/api/auth/session`, `/api/auth/admin/login`, `/api/auth/logout`
  - `/api/overview`
  - `/api/events`
  - `/api/talks`
  - `/api/leaderboard`
- **Auth note:** Admin routes and organizer mutations use a same-origin HTTP-only cookie session. Set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` outside local development; otherwise the prototype falls back to local defaults.

### Vue App (`src/`)

- `src/main.ts` mounts Vue, Pinia, and Vue Router.
- `src/App.vue` provides the active shell/nav.
- `src/views/DashboardView.vue` renders the community hub: featured event/CFP, live quiz join, recent talks, and top members from `/api/overview`.
- `src/views/ArchiveView.vue` filters completed events by year, query, topic, and speaker.
- `src/views/admin/AdminQuizView.vue` generates local QR-code join links for the live lobby.
- Legacy Next pages/components remain in `app/`, `components/`, and `hooks/` as a reference while routes are ported.

### Quiz State API (`app/api/quiz/state/route.ts`)

- **Key function:** `GET /api/quiz/state?sessionId=&userId=`
- **Non-obvious logic:** This GET handler **mutates** the session. On every poll, if `question_phase === 'answering'` and either the time limit has expired or all participants have answered, it transitions the phase to `'revealing'` and stamps `phase_started_at`. This makes the server the authority on quiz timing — no client coordination needed.
- `correct_index` is stripped from the question payload when `question_phase === 'answering'`; it's included in `'revealing'` and `'scoreboard'` phases.
- A `SIMULATED_DELAY_MS` (300ms) `setTimeout` is added to simulate realistic network latency.

### Scoring (`lib/scoring.ts`)

- `calculatePoints(basePoints, timeLimitMs, timeTakenMs, isCorrect)` → speed-scaled score
  - Formula: `base × (0.5 + 0.5 × timeRemaining/timeLimit)` — instant = 100%, deadline = 50%, wrong = 0
- `calculateStreakBonus(streakCount)` → bonus from `STREAK_BONUSES` map (2→100, 3→200, 4→300, 5+→500)

### Legacy Role Store (`hooks/use-role.ts`)

- Zustand store with `persist` middleware — saves to `localStorage` key `devcon-comm-role-storage`
- Holds `role: Role` and `speakerEmail: string | null`
- Convenience hooks: `useRole()`, `useSpeakerEmail()`
- Legacy-only. The new Vue/Hono app has no migrated auth/session layer yet.

### Quiz Polling (`hooks/use-quiz-polling.ts`)

- `useQuizPolling(sessionId, userId)` → `{ state, loading, error, sessionEnded }`
- Polls `GET /api/quiz/state` every `POLL_INTERVAL_MS` (1500ms)
- Sets `sessionEnded = true` on HTTP 404 (session deleted or finished)

### Design System (`lib/design-system.ts`)

- Exports `designSystem` object with `colors`, `quizColors`, `fonts`, `styles`, `spacing`, `animations`
- Helper functions: `getStatusBadge(status)` → `{ className, label }`
- JS-side mirror of the Tailwind theme in `tailwind.config.ts` — keep both in sync when rebranding

---

## Configuration

| Variable / Property | Default | Purpose |
|---|---|---|
| `DEFAULT_TIME_LIMIT` | `20` (seconds) | Per-question time limit |
| `DEFAULT_POINTS` | `1000` | Base points per correct answer |
| `POLL_INTERVAL_MS` | `1500` | Quiz state polling frequency |
| `SIMULATED_DELAY_MS` | `300` | Fake network latency in API routes |
| `REVEALING_DURATION_MS` | `5000` | Time players see correct answer + distribution |
| `SCOREBOARD_DURATION_MS` | `5000` | Time players see leaderboard between questions |
| `STREAK_BONUSES` | `{2:100, 3:200, 4:300, 5:500}` | Bonus points per consecutive correct streak |

All constants are in `lib/constants.ts`.

---

## Key API Flows

### CFP Submission
```
POST /api/cfp
  body: { event_id, speaker_name, speaker_email, github_username?, title, abstract?, bio? }
  → creates Talk with status 'submitted'
  → requires approved speaker email for the event
```

### Talk Status Lifecycle (Admin)
```
PATCH /api/talks/[talkId]
  body: { status: 'accepted' | 'rejected' | 'slides_received' | 'published' }
  → requires admin cookie session when changing status

POST /api/talks/[talkId]/reminder
  → logs an organizer slide reminder for accepted talks without uploaded slides
```

### Quiz Session Lifecycle (Admin)
```
POST /api/quiz/sessions          → create session (status: 'draft')
PATCH /api/quiz/sessions/[id]    → partial QuizSession field updates
```

### Player Join + Play
```
POST /api/quiz/join              body: { join_code, nickname, device_id }
  → creates/finds User by deviceId, creates QuizParticipant
  → increments User.events_participated when joining a new session
  → returns { session_id, user_id, participant_id }

GET  /api/quiz/state?sessionId=&userId=   (polled every 1500ms)
POST /api/quiz/answer            body: { session_id, user_id, answer_index }
  → scores via scoring.ts, updates QuizParticipant totals and User.total_points
```


### Quiz Question Management (Admin)
```
POST   /api/quiz/questions                 body: { quiz_session_id, question_text, options[4], correct_index, order_index, time_limit_seconds?, points? }
PATCH  /api/quiz/questions/[questionId]    body: Partial<Question>
DELETE /api/quiz/questions/[questionId]
POST   /api/quiz/questions/reorder         body: { session_id, question_ids[] }
```

### Slides Upload Endpoints
```
PATCH /api/talks/[talkId]         body: { slides_url } (URL mode)
POST  /api/talks/[talkId]/upload  multipart/form-data (file: PDF/PPT/PPTX, max 50MB)
  → stores file under /public/uploads/slides and sets talk status to 'slides_received'
```
