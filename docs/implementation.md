# Implementation

## Entry Points

| File | Role |
|---|---|
| `src/main.ts` | Vue app bootstrap — Pinia, Vue Router, global CSS |
| `src/App.vue` | Active app shell and top navigation |
| `src/admin-routes.ts` | Configurable organizer route base path helpers |
| `src/router.ts` | Active Vue route table |
| `src/components/ui/AppToaster.vue` | Globally mounted app-themed Sonner toaster |
| `src/components/ui/ViewSkeleton.vue` | Shared page-shaped skeleton loader variants for loading states |
| `src/lib/notify.ts` | Typed notification helper that targets the app toaster |
| `src/views/DashboardView.vue` | DEV::CON[] landing page backed by current mock data |
| `src/views/ArchiveView.vue` / `ArchiveEventView.vue` | Public archive and talk detail surfaces |
| `src/views/CfpView.vue` / `MyTalksView.vue` | Speaker CFP and slide management flows |
| `src/views/FeedbackView.vue` | Public event feedback form for active or auto-open campaigns |
| `src/views/RouteFeedbackView.vue` | Standalone app feedback form used by the mobile feedback launcher |
| `src/components/FeedbackBot.vue` | Public feedback bot that asks testers for name-selected feedback and submits to Supabase |
| `src/components/NaviiAvatar.vue` | Local deterministic Navii avatar renderer for leaderboard profiles |
| `src/views/PlayView.vue` / `PlayCodeView.vue` | Quiz join and live player gameplay |
| `src/views/NotFoundView.vue` | Branded fallback for unknown Vue routes |
| `src/views/admin/*` | Active admin event/talk/speaker/quiz management views |
| `lib/luma-attendance.ts` | Luma guest CSV normalization and organizer attendance metrics |
| `server/quiz-state.ts` | Quiz state read model and explicit phase-advance command helper |
| `lib/supabase/browser.ts` / `server.ts` | Typed Supabase clients for browser-safe anon access and server-only service-role access |
| `lib/supabase/community-events.ts` | Supabase-backed community event repository and public meetup DTO mapper |
| `lib/supabase/media.ts` | Server-side Supabase Storage upload helper for meetup covers and selected event photos |
| `supabase/migrations/*` | Supabase SQL migrations, starting with tester feedback tables |
| `server/app.ts` | Hono app — active API routes plus dev SPA fallback |
| `server/index.ts` | Bun production server — serves `dist/` and `/api/*` on one port |
| `vite.config.ts` | Vite + Vue + Hono dev-server wiring |
| `data/seed.ts` | Seed script — run via `pnpm seed` |

---

## Route-to-Module Notes (Current)

- **Event + CFP flow**
  - Active Vue pages: `src/views/CfpView.vue`, `src/views/admin/AdminEventsView.vue`, `src/views/admin/AdminEventView.vue`
  - Public CFP page: `app/(public)/cfp/[eventId]/page.tsx`
  - APIs: `/api/events/[eventId]`, `/api/events/[eventId]/checklist`, `/api/events/[eventId]/validate-speaker`, `/api/cfp`
  - Mock DB: `lib/mock-db/event-checklists.ts` stores per-event organizer run sheets and status-changing milestones.
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
  - APIs: `/api/quiz/sessions*`, `/api/quiz/questions*`, `/api/quiz/state`, `/api/quiz/state/advance`, `/api/quiz/answer`, `/api/quiz/active`, `/api/quiz/join`
- **Event feedback campaigns**
  - Active Vue pages: `src/views/admin/AdminFeedbackView.vue`, `src/views/FeedbackView.vue`
  - APIs: `/api/events/[eventId]/feedback-campaign`, `/api/feedback/events/[eventId]`, `/api/feedback/events/[eventId]/submissions`
  - Mock DB: `lib/mock-db/feedback.ts`
- **Attendance analysis**
  - Active Vue pages: `src/views/admin/AdminAttendanceOverviewView.vue`, `src/views/admin/AdminAttendanceView.vue`
  - APIs: `/api/attendance/monthly`, `/api/events/[eventId]/attendance`, `/api/events/[eventId]/attendance/import`, `DELETE /api/events/[eventId]/attendance`
  - Mock DB: `lib/mock-db/attendance.ts`
  - CSV parser and summary metrics: `lib/luma-attendance.ts`

---

## Per-Module Breakdown

### Mock DB (`lib/mock-db/`)

- **Entry point:** `lib/mock-db/index.ts`
- **Key functions:**
  - `readData<T>(filename)` — reads `data/{filename}.json`, returns `[]` only when the file is missing, and throws on invalid/non-array JSON.
  - `writeData<T>(filename, data)` — serializes writes via a per-filename promise queue and replaces files through temp-file write + rename.
- **Non-obvious logic:** The write queue chains promises per file key — concurrent writes to `events` and `sessions` can overlap, but concurrent writes to the same file are serialized inside one process. Atomic rename reduces partial-write corruption, but JSON files are still not a multi-process production store.
- Each entity module (`events.ts`, `talks.ts`, etc.) exports typed helpers like `getAll*`, `get*ById`, `create*`, `update*`.
- `event-checklists.ts` creates a default chronological run sheet on first read. For existing events, it infers already-reached milestones from the current event status so completed events start with post-event tasks instead of a blank checklist.

### Supabase (`lib/supabase/`, `supabase/`)

- `lib/supabase/browser.ts` exports a browser client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; auth session persistence is disabled because tester feedback does not use Supabase Auth.
- `lib/supabase/server.ts` exports a server/admin client using `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; keep the service key server-only.
- `vite.config.ts` loads `.env.local` and injects it into the Hono dev server so local server routes can read Supabase secrets.
- `types/supabase.ts` currently types the feedback tables by hand until generated Supabase types are introduced.
- `supabase/migrations/20260530000000_feedback.sql` creates `feedback_testers` for the original testing loop and `feedback_submissions` for route-level and event-level feedback rows.
- `supabase/migrations/20260613000000_event_feedback_campaigns.sql` adds event feedback campaigns, dynamic questions, structured answers, and event/campaign submission fields.
- `supabase/migrations/20260615000000_community_events.sql` adds `community_events`, modeled from the current `devcongress.org` Astro meetup collection and seeded with the existing website meetup YAML entries.
- `supabase/migrations/20260615001000_meetup_media_bucket.sql` adds the public `meetup-media` Supabase Storage bucket for selected image uploads.
- Row-level security allows public reads of active tester names and public inserts of new feedback, but not public reads of submitted feedback; organizer reads and status updates go through authenticated server routes using the service role.
- Row-level security allows public reads of `community_events` only when `publish_to_website = true`; trusted organizer writes use the server-side service role.
- `/api/health/supabase` verifies that server-side Supabase config is present and that the feedback tester table is reachable.
- `/api/health/supabase/community-events` verifies that the Supabase event-source table is reachable.
- `/api/health/supabase/storage` verifies that the `meetup-media` bucket is reachable.
- `/api/events` reads and writes Supabase `community_events` when configured, falling back to JSON events if Supabase is unavailable or the table has not been migrated.

### Hono Server (`server/`)

- **Entry points:**
  - `server/app.ts` exports the fetch-compatible Hono app used by Vite dev server.
  - `server/index.ts` starts Bun in production, serving `/api/*` through Hono and all other paths from `dist/`.
- **Current active APIs:**
  - `/api/health`
  - `/api/health/supabase`
  - `/api/public/meetups`, `/api/public/meetups/[slug]`, `/api/public/meetups/[slug]/talks`
  - `/api/auth/session`, `/api/auth/admin/login`, `/api/auth/logout`
  - `/api/overview`
  - `/api/attendance/monthly`
  - `/api/feedback/inbox`, `/api/feedback/inbox/[feedbackId]`
  - `/api/events`, including admin-only checklist and attendance analysis/import/removal routes under `/api/events/[eventId]/checklist*` and `/api/events/[eventId]/attendance*`
  - `/api/talks`
  - `/api/leaderboard`
- **Public website contract:** `/api/public/meetups*` reads Supabase `community_events` first, then falls back to current `Event` + published `Talk` JSON data. It returns a DevCongress.org-friendly meetup DTO with `slug`, `start`, `end`, `cover`, `location`, `speakers`, `schedule`, `photos`, counts, and app route URLs. These endpoints are read-only, CORS-enabled, and cacheable for short-lived website consumption.
- **Public website verification:** `pnpm verify:public-api` validates the public meetup response shape against the current `devcongress.org` Astro meetup schema expectations, plus CORS headers, cache headers, detail lookup, and talks lookup against `PUBLIC_API_BASE_URL` before the Astro website is wired to consume it.
- **Public events page:** `/events` consumes `/api/public/meetups` inside this app so organizers can inspect the same public event stream the website will later consume.
- **Auth note:** Admin routes and organizer mutations use a same-origin HTTP-only cookie session. Set `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` outside local development; otherwise the prototype falls back to local defaults.

### Vue App (`src/`)

- `src/main.ts` mounts Vue, Pinia, and Vue Router.
- `src/App.vue` provides the active shell/nav, contextual breadcrumbs for public and organizer routes, mounts `AppToaster`, and polls `/api/quiz/active` so the public `Play` link appears only while a quiz session is waiting or active.
- `src/App.vue` renders `src/components/AdminEventTabs.vue` once for event-scoped organizer routes, keeping sub-section tabs stable while routed event pages change underneath.
- `src/components/ui/AppToaster.vue` wraps `vue-sonner` with the DevCongress editorial/ops toast theme; app code should call `notify` from `src/lib/notify.ts` instead of importing `toast` directly.
- `src/components/ui/ViewSkeleton.vue` provides reusable skeleton variants for full-page loading states; prefer it over bare loading text so routed views preserve their header, panel, table, and form structure while data fetches.
- `src/components/FeedbackBot.vue` mounts globally on public routes only; it captures typed or anonymous route feedback and inserts `feedback_submissions` with `trigger_source = route_feedback`, page path, user agent, and viewport context. On small screens, the launcher routes to `src/views/RouteFeedbackView.vue` instead of opening an overlay.
- `src/views/FeedbackView.vue` renders an event-scoped campaign from `/api/feedback/events/:eventId`; campaigns are open when manually set to `active`, or when draft with auto-open enabled and the event status is `completed`. The default auto-open response window starts at the event date and closes 3 days later unless an explicit campaign close time is set.
- `src/views/ArchiveEventView.vue` checks `/api/feedback/events/:eventId/status` and shows the community “Give Feedback” CTA only while the form is open.
- `src/views/DashboardView.vue` renders the community hub: featured event/CFP, live quiz join, recent talks, and top members from `/api/overview`.
- `src/views/ArchiveView.vue` filters completed events by year, query, topic, and speaker.
- `src/views/NotFoundView.vue` is mounted by the final Vue Router catch-all route for unknown client paths.
- `src/views/admin/AdminAttendanceOverviewView.vue` renders the monthly attendance ledger, import coverage, source-quality readout, repeat-attendee count, and venue-planning summary from `/api/attendance/monthly`.
- `src/views/admin/AdminFeedbackOverviewView.vue` renders the route-level App Feedback Inbox from `/api/feedback/inbox` above the monthly event-feedback report, and lets organizers move route feedback through `new`, `reviewing`, `done`, and `wont_fix`.
- `src/views/admin/AdminAttendanceView.vue` uploads/replaces a Luma CSV and renders post-event import metrics, source/ticket breakdowns, checked-in guests, and approved no-shows.
- `src/views/admin/AdminEventView.vue` renders the shared chronological event checklist from `/api/events/:eventId/checklist`; checking status milestones can advance the event state, while the status dropdown remains available for manual correction.
- `src/views/admin/AdminEventView.vue` also manages event media: organizers can upload selected cover/photo images to Supabase Storage or add website-compatible `{ url, type }` links where `type` is `image` for direct media or `folder` for shared galleries.
- `src/views/admin/AdminQuizView.vue` generates local QR-code join links for the live lobby.
- Legacy Next pages/components remain in `app/`, `components/`, and `hooks/` as a reference while routes are ported.

### Quiz State API (`server/quiz-state.ts`, `server/app.ts`)

- **Key function:** `GET /api/quiz/state?sessionId=&userId=`
- **Advance command:** `POST /api/quiz/state/advance` checks whether the current active question should transition from `answering` to `revealing` because time expired or all participants answered.
- **Non-obvious logic:** `GET /api/quiz/state` is now read-only; polling clients call the explicit advance command before fetching state. This removes hidden mutation from GET while preserving polling behavior until a realtime/job-backed state machine exists.
- `correct_index` is stripped from `current_question` in the state payload; player-specific reveal data is returned through `player_result.correct_index` after answering.
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
- Current public theme direction is the `devcongress.org` light palette: cream page background, black ink text/borders, yellow brand fills, and pink primary accent. `@fontsource/inter` supplies the body/UI font; IBM Plex Mono remains the mono/accent font.

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
| `VITE_SUPABASE_URL` | unset | Supabase project URL for browser and server clients |
| `VITE_SUPABASE_ANON_KEY` | unset | Browser-safe Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | unset | Server-only Supabase service role key for trusted admin operations |

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

POST /api/quiz/state/advance              body: { session_id } explicit phase tick
GET  /api/quiz/state?sessionId=&userId=   read-only state fetch, polled every 1500ms
POST /api/quiz/answer            body: { session_id, user_id, answer_index }
  → scores via scoring.ts, updates QuizParticipant totals and User.total_points
```


### Quiz Question Management (Admin)
```
POST   /api/quiz/questions                 body: { quiz_session_id, question_text, options[4], correct_index, order_index, time_limit_seconds?, points? }
PATCH  /api/quiz/questions/[questionId]    body: Partial<Question>
DELETE /api/quiz/questions/[questionId]
POST   /api/quiz/questions/reorder         body: { session_id, question_ids[] }
POST   /api/quiz/sessions/[sessionId]/questions/from-paper
       multipart/form-data: { file: PDF, question_count? }
       → requires admin session, extracts text locally, appends prototype rule-based questions to the session
```

### Slides Upload Endpoints
```
PATCH /api/talks/[talkId]         body: { slides_url } (URL mode)
POST  /api/talks/[talkId]/upload  multipart/form-data (file: PDF/PPT/PPTX, max 50MB)
  → stores file under /public/uploads/slides and sets talk status to 'slides_received'
```
