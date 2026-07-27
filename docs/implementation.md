# Implementation

## Entry Points

| File | Role |
|---|---|
| `src/main.ts` | Vue app bootstrap — Vue Router, TanStack Query, global CSS, and delegated button press feedback |
| `src/App.vue` | Active app shell and top navigation |
| `lib/app-boot.ts` | Shared first-paint markup and styles injected into both the Vite build shell and Hono development fallback |
| `src/admin-routes.ts` | Configurable organizer route base path helpers |
| `src/organizer-viewport.ts` | Shared phone/tablet organizer route policy and breakpoint helpers |
| `src/speaker-intake-route.ts` | Testable public route record for generated private speaker links |
| `src/router.ts` | Active Vue route table; page components are lazy-loaded per route so the initial app bundle does not include every public and organizer view |
| `src/components/ui/AppToaster.vue` | Globally mounted app-themed Sonner toaster |
| `src/components/ui/ViewSkeleton.vue` | Shared page-shaped skeleton loader variants for loading states |
| `src/lib/query.ts` | Shared TanStack Query client defaults for client-side API caching and invalidation |
| `src/lib/api.ts` | Shared browser fetch helpers, query keys, and common API response types |
| `src/lib/notify.ts` | Typed notification helper that targets the app toaster |
| `src/views/DashboardView.vue` | DEV::CON[] landing page backed by current mock data |
| `src/views/ArchiveView.vue` / `ArchiveEventView.vue` | Public event archive and published item surfaces |
| `src/views/CfpView.vue` / `SpeakerTalkIntakeView.vue` | CFP and private selected-proposal/manual Archive Request flows |
| `src/views/FeedbackView.vue` | Public event feedback form for active or auto-open campaigns |
| `lib/event-feedback-report.ts` | Pure event-feedback aggregate model used by the organizer dashboard |
| `lib/speaker-archive-email.ts` | Eligible program-item selection and strict stored speaker-email resolution |
| `lib/email/resend.ts` / `lib/email/templates/monthly-archive-request.ts` | Worker-native Resend Batch client and code-owned Archive Request email |
| `src/components/NaviiAvatar.vue` | Local deterministic Navii avatar renderer for leaderboard profiles |
| `src/views/PlayView.vue` / `PlayCodeView.vue` | Quiz join and live player gameplay |
| `src/views/NotFoundView.vue` | Branded fallback for unknown Vue routes |
| `src/views/admin/*` | Active admin event/talk/speaker/quiz management views |
| `lib/luma-attendance.ts` | Luma guest CSV normalization and organizer attendance metrics |
| `lib/luma/events.ts` | Server-only Luma calendar event listing and import mapping |
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
  - APIs: `/api/events/[eventId]`, `/api/events/[eventId]/checklist`, `/api/events/[eventId]/speaker-submissions`, `/api/integrations/luma/import`, `/api/cfp`
  - Mock DB: `lib/mock-db/event-checklists.ts` stores per-event organizer run sheets and status-changing milestones.
- **Speaker management**
  - Active Vue page: `src/views/admin/AdminSpeakersView.vue`
  - This is the event-scoped speaker identity/access allowlist. It is not the Event Archive and does not determine what is publicly published.
  - APIs: `/api/events/[eventId]/speakers` (`GET`/`POST`), `/api/events/[eventId]/speakers/[speakerId]` (`DELETE`)
- **Event Archive + requests**
  - Active Vue pages: `src/views/admin/AdminTalksView.vue`, `src/views/SpeakerTalkIntakeView.vue`
  - Compatibility subroutes remain `/talks/cfp`, `/talks/proposals`, `/talks/program`, and `/talks/backfill`; the organizer UI presents the lasting records as **Event Archive** and the manual intake path as **Archive Requests**.
  - Archive items use the existing `Talk` persistence/API shape with `kind: 'talk' | 'product_demo'`. Older rows without `kind` normalize to `talk`.
  - Generated private links open the standalone `/speaker-talks/:eventId/:token` route before the organizer-console catch-all.
  - APIs: `/api/events/[eventId]/talks` (`GET`/`POST`), `/api/events/[eventId]/speaker-submissions` (`GET`), `/api/speaker-submissions/[submissionId]` (`PATCH`), `/api/events/[eventId]/speaker-intake-links` (`GET`/`POST`/`DELETE`), `/api/events/[eventId]/speaker-intake-emails` (`POST`), `/api/events/[eventId]/speaker-intake/[token]` (`GET`/`POST`), `/api/talks/[talkId]`, `/api/talks/[talkId]/reminder`
- **Quiz authoring + live ops**
  - Active Vue pages: `src/views/admin/AdminQuizView.vue`, `src/views/PlayView.vue`, `src/views/PlayCodeView.vue`
  - Builder: `app/(admin)/admin/events/[eventId]/quiz/page.tsx`
  - Live control: `app/(admin)/admin/events/[eventId]/quiz/live/page.tsx`
  - APIs: `/api/quiz/sessions*`, `/api/quiz/questions*`, `/api/quiz/state`, `/api/quiz/state/advance`, `/api/quiz/answer`, `/api/quiz/active`, `/api/quiz/join`
- **Event feedback campaigns**
  - Active Vue pages: `src/views/admin/AdminFeedbackView.vue`, `src/views/FeedbackView.vue`
  - APIs: `/api/events/[eventId]/feedback-campaign`, `DELETE /api/events/[eventId]/feedback-campaign`, `/api/feedback/events/[eventId]`, `/api/feedback/events/[eventId]/submissions`
  - Answer contract: session ratings accept `1`–`5` or `not_attended`; the sentinel is counted separately and excluded from rating averages
  - Reporting model: `lib/event-feedback-report.ts` derives rating distribution, return intent, comments, missed sessions, and per-question averages from the full event response set without adding a chart dependency
  - Privacy contract: event feedback does not collect identity or persist browser/page context; a hashed random browser/event token provides soft duplicate protection
  - Supabase persistence: `lib/supabase/feedback-campaigns.ts`
  - Mock DB fallback: `lib/mock-db/feedback.ts`
- **December 2026 annual-conference workspace and volunteer intake**
  - Active Vue pages: `src/views/admin/AdminAnnualConferenceView.vue`, `src/views/admin/AdminAnnualConferenceWorkPlanView.vue`, `src/views/VolunteerIntakeView.vue`, `src/views/admin/AdminVolunteerView.vue`, `src/views/admin/AdminVolunteerDisplayView.vue`
  - Organizer workspace: `/organizer-console/annual-conference/2026`, with Work plan at `/organizer-console/annual-conference/2026/work-plan` and Volunteers at `/organizer-console/annual-conference/2026/volunteers`
  - Overview composition: an unboxed editorial edition brief makes the provisional date the page heading, keeps delivery progress visible, and reserves the only filled action for Work Plan. Venue and keynote facts open from the anchored Planning notes disclosure; Volunteers stays a quiet utility route, and workstream detail remains in the Work Plan.
  - Work-plan interface: compact status controls and an eight-workstream snapshot sit above a content-sized task ledger that becomes scrollable at its viewport cap. Filter changes use a reduced-motion-aware View Transition so the ledger can resize without page wobble; creating, opening, or editing a task uses one accessible right-side drawer.
  - Work-plan API: authenticated `GET`, `POST`, and `PATCH` under `/api/annual-conference/:year/work-plan`; all organizers can edit, while task creation is server-limited to `angelateyvi@gmail.com`. New or changed ownership is normalized to active organizer emails, collaborators are deduplicated, and accountable/collaborator overlap is rejected without blocking unchanged legacy Excel assignments.
  - Work-plan storage: relational Supabase `annual_conference_editions` and `annual_conference_tasks`, with `lib/mock-db/annual-conference-work-plan.ts` as the local JSON fallback
  - Initial data: one-time 26-row Excel seed in `lib/annual-conference-work-plan.ts`; 19 December 2026 is provisional, the first named owner is accountable, remaining names collaborate, and `All`, `TBD`, or blank owners are unassigned
  - Task contract: exactly `Not started`, `In progress`, `Blocked`, and `Done`; no reminders; finance remains a later restricted module
  - Organizer compatibility redirects: `/organizer-console/volunteers` and `/organizer-console/volunteer-display`
  - Public form: `/volunteer/december-mega-meetup`, intentionally preserved and standalone without organizer navigation or app chrome
  - APIs: `POST /api/volunteer-applications`, `GET /api/admin/volunteer-applications`
  - Storage: `lib/mock-db/volunteer-applications.ts` uses the existing `app_json_documents` Supabase compatibility store under the `volunteer-applications` key when server-side Supabase is enabled, with local JSON fallback for development
  - Abuse controls: optional Turnstile using the `volunteer_intake` action, a ten-minute client cooldown, a two-per-day client limit, and one application per campaign/email
- **Monthly system design**
  - Active Vue pages: `src/views/admin/AdminSystemDesignView.vue`, `src/views/EventView.vue`, `src/views/ArchiveEventView.vue`
  - Storage: `event.schedule` rows with type `system_design`, optional public recap notes, and prompt-link resources
  - Draft generation: `POST /api/events/[eventId]/system-design/draft` reads public Google Slides prompt decks and returns extracted `title`, raw `content`, and a generated `summary`
- **Attendance analysis**
  - Active Vue pages: `src/views/admin/AdminAttendanceOverviewView.vue`, `src/views/admin/AdminAttendanceView.vue`
  - The hub pairs the monthly ledger with one compact attendance-pattern panel: approved RSVP/check-in bars for the latest uploaded events, an approved came/missed pie, and a small venue-planning footer.
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
- `event-checklists.ts` creates a default chronological run sheet on first read. Monthly events use the full CFP/program/post-event checklist, while quarterly meetups use the short setup checklist for creating the event shell and adding the G-Meet link. For existing events, it infers already-reached milestones from the current event status so completed events start with post-event tasks instead of a blank checklist. Event-specific disabled milestones stay visible but do not count toward progress or status backfill. `lib/event-checklist-policy.ts` identifies checklist-backed optional work shared by the server, overview, and event tabs.

### Supabase (`lib/supabase/`, `supabase/`)

- `lib/supabase/browser.ts` exports a browser client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; auth session persistence is disabled because tester feedback does not use Supabase Auth.
- `lib/supabase/server.ts` exports a server/admin client using `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; keep the service key server-only.
- `vite.config.ts` loads `.env.local` and injects it into the Hono dev server so local server routes can read Supabase secrets.
- `types/supabase.ts` currently types the feedback tables by hand until generated Supabase types are introduced.
- `supabase/migrations/20260530000000_feedback.sql` creates `feedback_testers` for the original testing loop and `feedback_submissions` for route-level and event-level feedback rows.
- `supabase/migrations/20260613000000_event_feedback_campaigns.sql` adds event feedback campaigns, dynamic questions, structured answers, and event/campaign submission fields.
- `supabase/migrations/20260617001000_event_feedback_response_tokens.sql` adds hashed anonymous response tokens so event feedback can reject repeat submissions from the same browser/event pair.
- `supabase/migrations/20260615000000_community_events.sql` adds `community_events`, modeled from the current `devcongress.org` Astro meetup collection and seeded with the existing website meetup YAML entries.
- `supabase/migrations/20260620032000_event_series_type.sql` adds an explicit `series_type` field (`monthly`, `quarterly`, or `special`) so organizers stop relying on event titles to drive attendance and organizer workflow decisions.
- `supabase/migrations/20260615001000_meetup_media_bucket.sql` adds the public `meetup-media` Supabase Storage bucket for selected image uploads.
- Row-level security allows public reads of active tester names and public inserts of new feedback, but not public reads of submitted feedback; organizer reads and status updates go through authenticated server routes using the service role.
- Row-level security allows public reads of `community_events` only when `publish_to_website = true`; trusted organizer writes use the server-side service role.
- `/api/health/supabase` verifies that server-side Supabase config is present and that the feedback tester table is reachable.
- `/api/health/supabase/community-events` verifies that the Supabase event-source table is reachable.
- `/api/health/supabase/storage` verifies that the `meetup-media` bucket is reachable.
- `/api/events` reads, writes, and removes Supabase `community_events` when `APP_DATA_SOURCE=supabase` is set with credentials, falling back to JSON events when Supabase is unavailable or the table has not been migrated. Local/dev runs default to JSON even if Supabase credentials exist in `.env.local`.
- The hosted `community_events` projection remains separate from compatibility `Talk` archive records. Until those records move to a relational archive source or are joined into that projection, a Supabase-backed public meetup response may not include archive items that exist only in the compatibility store.
- `/api/integrations/luma/preview` is the organizer-only read-only Luma step. It returns the event shell and duplicate-import state without creating a `community_events` row.
- `/api/integrations/luma/public-preview` turns the current Luma draft into the same public meetup DTO used by `/events/:slug`, so organizers can inspect the website-style event shell before importing even when schedule, speakers, and gallery details are still empty.
- `/api/integrations/luma/import` imports from a public Luma event URL only after organizer confirmation, requires Supabase-backed `community_events`, lets the organizer choose whether the event is monthly, quarterly, or special, stores source metadata to prevent duplicate imports when the Luma metadata migration is present, and keeps the new event unpublished in organizer draft mode until the organizer explicitly publishes it. Before those migrations are applied, import falls back to registration-URL dedupe and saves the event without unsupported columns.

### Hono Server (`server/`)

- **Entry points:**
  - `server/app.ts` exports the fetch-compatible Hono app used by Vite dev server.
  - `server/index.ts` starts Bun in production, serving `/api/*` through Hono and all other paths from `dist/`.
- **Current active APIs:**
  - `/api/health`
  - `/api/health/supabase`
  - `/api/public/meetups`, `/api/public/meetups/[slug]`, `/api/public/meetups/[slug]/talks`
  - `/api/auth/session`, `/api/auth/admin/exchange`, `/api/auth/admin/callback`, `/api/auth/logout`
  - `/api/admin/organizers`, `/api/admin/audit-log`
  - `/api/overview`
  - `/api/attendance/monthly`
  - `/api/feedback/inbox`, `/api/feedback/inbox/[feedbackId]`
  - `/api/events`, including admin-only checklist and attendance analysis/import/removal routes under `/api/events/[eventId]/checklist*` and `/api/events/[eventId]/attendance*`
  - `/api/integrations/luma/import`
  - `/api/talks`
  - `/api/leaderboard`
- **Public website contract:** `/api/public/meetups*` reads Supabase `community_events` first only when the server Supabase runtime is enabled, then falls back to current `Event` + explicitly published compatibility `Talk` data. It returns a DevCongress.org-friendly meetup DTO with `slug`, `series_type`, `start`, `end`, `cover`, `location`, `speakers`, `schedule`, `photos`, counts, and app route URLs. Existing `/talks`, `talks`, and talk-count names remain for compatibility; each returned archive item may add `kind`, with a missing value interpreted as `talk`, so `product_demo` can be rendered without breaking older consumers. System-design recap text and prompt-deck links travel inside the meetup `schedule` rows. Quarterly meetup recaps can also carry raw `shared_links` URLs in schedule rows, and public pages render those links only for quarterly meetups. `/api/public/archive*` returns narrow public archive payloads with event recap metadata, series type, cover, photos, feedback availability, shared links, and published archive items so quarterly recaps can be media-first without showing an empty archive. `/api/public/home` provides the public landing aggregate without the broad `/api/overview` payload. These endpoints are read-only, CORS-enabled, and cacheable for short-lived website consumption; internal `/api/*` routes require organizer auth except auth and minimal attendee-feedback endpoints.
- **Public website verification:** `pnpm verify:public-api` validates the public meetup response shape against the current `devcongress.org` Astro meetup schema expectations, plus CORS headers, cache headers, detail lookup, and talks lookup against `PUBLIC_API_BASE_URL` before the Astro website is wired to consume it.
- **Public events page:** `/events` consumes `/api/public/meetups` inside this app so organizers can inspect the same public event stream the website will later consume.
- **Auth note:** All organizer routes use Supabase Google OAuth plus app-owned HTTP-only sessions stored in `admin_sessions`; owner-only organizer email management lives at `/organizer-console/organizers`, and owner-only audit review lives at `/organizer-console/audit-log`. Local development uses the same Google flow and membership allowlist as hosted environments. Missing Supabase auth configuration fails closed and never creates a shared-password owner session.

### Vue App (`src/`)

- `src/main.ts` mounts Vue, Vue Router, the shared TanStack Query plugin, and the delegated pointer-only button press-feedback system from `src/button-press-feedback.ts`.
- `src/router.ts` lazy-loads routed page components with dynamic imports, keeping the shell and route guard eager while splitting public pages, organizer workspaces, quiz views, and fallback pages into route chunks. Once organizer auth resolves, its route guard applies the shared viewport policy before importing a desktop organizer page.
- `src/organizer-viewport.ts` is the single organizer breakpoint and route-policy source. Authenticated phone routes resolve to the canonical Mobile Ops page except for standalone public/protected displays; tablets and desktops resolve the Mobile Ops route back to the full event console.
- `src/App.vue` provides the active shell/nav, mounts `AppToaster`, and polls `/api/quiz/active` so the public `Play` link appears only while a quiz session is waiting or active. Organizer pages begin directly beneath the primary navigation or event tabs; the shell does not render a breadcrumb layer or fetch event names solely for page context. The shell presents Annual Conference as a top-level organizer workspace while keeping Volunteers edition-scoped beneath December 2026, renders CFP and one-time speaker intake links as standalone public forms without app chrome, and gives protected QR displays the same standalone treatment so they cannot inherit organizer navigation or the phone ops view. It preserves the deployed cream header, yellow logo artwork, full-yellow ink-outlined active tabs, offset control shadows, and the established boxed event tabs. During a direct protected-route load, the shell preserves the branded first-paint state while the router resolves the organizer session instead of exposing an empty `RouterView`; `lib/app-boot.ts` keeps that pre-JavaScript state identical in the Vite build and Hono development fallback. It redirects organizer routes back to login if the cached/admin-session query later resolves unauthenticated and listens to the shared media query so crossing the phone/tablet boundary updates the canonical organizer route.
- `src/views/admin/AdminLoginView.vue` presents the selected responsive Programme Cover sign-in as the sole organizer login design. It exposes Google OAuth only, verifies that server-side Supabase organizer auth is configured before enabling the action, keeps callback and configuration errors inline, and owns its mobile scroll container inside the standalone login shell.
- `src/App.vue` lazily renders `src/components/AdminEventTabs.vue` for event-scoped organizer routes only, keeping sub-section tabs stable while routed event pages change underneath without adding the tabs to the initial shell chunk. The tab bar reads the shared event-checklist query so a monthly System Design exclusion is rendered as a genuinely non-interactive tab and updates immediately when the checklist choice changes.
- `src/components/ui/AppToaster.vue` wraps `vue-sonner` with the DevCongress editorial/ops toast theme; app code should call `notify` from `src/lib/notify.ts` instead of importing `toast` directly.
- `src/components/ui/ViewSkeleton.vue` provides reusable skeleton variants for full-page loading states; prefer it over bare loading text so routed views preserve their header, panel, table, and form structure while data fetches.
- The earlier `src/components/FeedbackBot.vue` and `src/views/RouteFeedbackView.vue` route-feedback components remain in the repository for compatibility, but the active router and app shell do not expose or mount them.
- `src/views/FeedbackView.vue` renders an event-scoped campaign from a minimal attendee-safe `/api/feedback/events/:eventId` payload; campaigns are open when manually set to `active`, or when draft with auto-open enabled and the event status is `completed`. Monthly meetups use `lib/event-feedback-window.ts` to open at event end and close 24 hours later by default; organizers can close sooner or reopen for a fresh 24-hour grace period without changing the database schema. The form does not request name or email. Session questions accept a 1–5 rating or a separate `Did not attend` state, and public submissions send a per-event random browser token so the server can reject duplicate submissions without collecting attendee identity.
- `src/views/ArchiveEventView.vue` reads `/api/public/archive/:eventId`, shows uploaded recap photos and quarterly-only raw links shared during the meetup, hides the empty talk archive for talkless quarterly meetups, and shows the community “Give Feedback” CTA only while that public archive payload says the form is open.
- `src/views/DashboardView.vue` renders the community hub from `/api/public/home`, using only public counts, recent published talk cards, and an optional public CFP event pointer instead of the broad organizer overview aggregate.
- `src/views/EventsView.vue` now mirrors the DevCongress website meetup listing shape, reads `/api/public/meetups` through the shared TanStack Query cache, and sends past-meetup `View recap` CTAs straight into `src/views/ArchiveEventView.vue` while upcoming/live cards stay in the public meetup flow.
- `src/views/EventView.vue` consumes `/api/public/meetups/:slug` to render the meetup cover, schedule, speakers, photos, and status CTA; system-design rows point into the meetup archive page, and the public meetup page itself no longer repeats the archive recap block inline.
- `src/views/ArchiveView.vue` filters completed events by year, query, topic, and speaker from `/api/public/archive`; archive search and speaker filters also look at saved schedule metadata so system-design recap text and facilitators still help people find the right meetup.
- Shared event reads now normalize stale lifecycle states from the saved dates before the client sees them, so a published meetup that has already ended resolves to `completed` across the archive, dashboard, attendance, and feedback flows even if the stored row was left on `live` or another pre-event status.
- `src/views/NotFoundView.vue` is mounted by the final Vue Router catch-all route for unknown client paths.
- `src/views/admin/AdminMobileOrganizerView.vue` is the deliberately limited phone-only organizer surface. It shows at most three live/upcoming/recent event cards with safe registration or source links, and groups unavailable work into three clear categories. Full setup, editing, attendance/feedback operations, access, reporting, audit, and bulk table work stays tablet/laptop-only; the canonical mobile route prevents hidden desktop route chunks from loading behind it.
- `src/views/admin/AdminAttendanceOverviewView.vue` renders the monthly attendance ledger and a compact two-chart pattern panel from `/api/attendance/monthly`. The charts compare approved RSVPs with check-ins across recent uploaded events and summarize selected-year approved RSVP outcomes; missing CSVs remain outside those populations. Its people panel defaults to regular attendees with at least two actual check-ins and restores the registered, came, rate, and last-seen summary. A separate **Never came** view lists every person with at least two approved RSVPs and zero check-ins, excluding pending and declined registrations. The people table uses a capped, keyboard-focusable scroll area with a sticky column header so long follow-up lists do not lengthen the entire page.
- `src/views/admin/AdminFeedbackOverviewView.vue` opens the Feedback Hub directly into event feedback reports grouped by selectable year and period. Reports default to the current month when that period exists, and event rows keep a lighter identity block on the left with a full-width stat strip plus end-aligned action on desktop.
- `src/views/admin/AdminEventsView.vue` reads the organizer event list through the shared TanStack query layer, shows focusable detail popovers for the compact lifecycle legend, can upload a picked cover image during event creation, imports existing Luma events into Supabase from the create-event page, and invalidates the event-list plus overview queries after creating a new event.
- `src/views/admin/AdminAuditLogView.vue` reads audit rows through the shared TanStack query layer and now swaps directly into a dedicated audit-log skeleton while the route data is loading.
- `src/views/admin/AdminEventView.vue` invalidates shared event/overview queries after checklist, program-outline, photo-link, and media-upload mutations so status, schedule, and media changes stay visible across routes.
- `src/lib/meetup-media-client.ts` centralizes browser-side meetup image validation, compression, and upload helpers so organizer create/edit surfaces share the same storage limits and encoding behavior.
- `src/lib/event-form.ts` centralizes Zod validation for organizer event creation so the create form and `/api/events` server endpoint share the same required-field, slug, date, and URL rules.
- `src/views/admin/AdminAttendanceView.vue` uploads/replaces a Luma CSV and renders post-event import metrics, source/ticket breakdowns, checked-in guests, and approved no-shows.
- `src/views/admin/AdminEventView.vue` renders the shared chronological event checklist from `/api/events/:eventId/checklist`; checking status milestones can advance the event state, while the status dropdown remains available for manual correction. Unpublished events can disable incomplete checklist milestones that do not apply to that event. The incomplete monthly System Design milestone is the deliberate published-event exception: `Not this month` persists its exclusion and disables that event's System Design navigation, while `Include this month` reverses it.
- `src/views/admin/AdminEventView.vue` also manages optional program outlines in `event.schedule`, letting organizers add structured time/title/type/lead/description/resource rows when a meetup has a run of show. Each editing row has accessible move-up and move-down controls, so a live organizer can adjust the running order before saving. A separate quarterly-only Shared links panel lets organizers paste raw recap URLs without titles; those links are saved into a dedicated schedule bucket and preserved when the outline is edited. The editor includes a monthly system-design scenario helper for Google Slides prompt decks, empty outlines are allowed, and event feedback can reuse saved schedule rows as activity prompts.
- `src/views/admin/AdminFeedbackView.vue` keeps event feedback setup private while restoring deliberate organizer-only attendee-form tools: preview the current draft, copy the live form URL, open a protected TV-safe QR display, close an open form immediately, or reopen a closed form for 24 hours. A manually published campaign can show its QR immediately, subject to its close boundary.
- Event-feedback reporting treats every submission as anonymous, keeps missed-session counts separate, and calculates averages from valid numeric ratings only. Historical identity fields are not returned to the organizer surface. The event report renders dependency-free aggregate charts from all loaded submissions; individual responses are kept out of the page and are available through a full CSV download with one submission per row and every configured question as a column. `lib/event-feedback-export.ts` owns deterministic response ordering, CSV escaping, and spreadsheet-formula neutralization for attendee-provided values.
- `src/views/admin/AdminSystemDesignView.vue` now calls `/api/events/:eventId/system-design/draft` when organizers click `Generate Draft` with a Google Slides prompt URL, fills the scenario title if it was blank, writes the returned summary into the full-width public recap field, and switches back to a saved/read-only state after persistence with explicit edit/remove actions for each saved scenario. When the event already has a matching system-design slot in the program outline, this editor now updates that existing row in place instead of appending a duplicate `system_design` row at the bottom.
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
- The active organizer UI uses the established `devcongress.org` light palette: cream canvas, white and warm paper, saturated yellow and pink identity/state cues, and strong ink borders and shadows.
- `src/styles.css` owns the shared `.editorial-*` and `.ops-*` primitives, including the boxed navigation and raised panel treatment used across organizer routes.
- `@fontsource/inter` supplies display/body type at 400–800. IBM Plex Mono remains limited to labels, statuses, compact controls, technical values, and live codes at 400–700.
- Shared font-weight roles are body 400, supporting emphasis and form values 500, mono labels and actions 600, headings and major metrics 700, and page/hero display 800. `font-synthesis: none` prevents browsers from fabricating heavier faces.

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
  body: { event_id, kind: 'talk' | 'product_demo', speaker_name, speaker_email, title, topic, abstract, bio }
  → creates a presentation proposal for organizer selection
  → accepts submissions only for upcoming monthly events with CFP open
  → does not create an archive item or require a prior speaker allowlist row

GET /api/events/[eventId]/speaker-submissions
  → organizer-only presentation proposal inbox for the event

PATCH /api/speaker-submissions/[submissionId]
  body: { status: 'selected' | 'not_selected', internal_note?, expires_in_days? }
  → records the organizer decision
  → selecting generates a one-time completion link that preserves the proposal kind
```

### Manual Archive Entry (Admin)
```
POST /api/events/[eventId]/talks
  body: { kind: 'talk' | 'product_demo', speaker_name, speaker_email, title, topic?, abstract?, bio?, github_username?, slides_url?, publish? }
  → writes the existing Talk compatibility record with the requested archive-item kind
  → treats older records without kind as talk
  → creates/keeps the separate speaker allowlist row for that email as a compatibility side effect
  → creates an accepted item when slides_url is empty
  → creates a slides_received item when slides_url is present
  → publishes only when the organizer explicitly requests publish
```

### Event Archive Intake
```
POST /api/events/[eventId]/speaker-intake-links
  body: { kind: 'talk' | 'product_demo', speaker_name, speaker_email, expires_in_days }
  → admin-only; creates a month-scoped, one-time Archive Request token
  → locks the event, invited identity, and archive-item kind into that token
  → only one matching active manual token may exist for the same event, email, and kind; different recipients may use the same expiry duration

POST /api/events/[eventId]/speaker-intake-emails
  body: { program_item_indexes: number[], expires_in_days }
  → admin-only; accepts up to 100 unique eligible rows from the stored event schedule
  → derives the recipient from an exact selected-proposal, talk, or event-speaker match; missing/ambiguous matches fail closed
  → creates or reuses one title-bound private link per row and submits personalized entries through Resend Batch
  → records pending/accepted/failed state and provider IDs on the link, uses a stable idempotency key, and skips identities already accepted

GET  /api/events/[eventId]/speaker-intake/[token]
  → returns public event context and the locked kind only when the link is active

POST /api/events/[eventId]/speaker-intake/[token]
  body for archive_backfill links: { title, topic?, abstract?, bio?, slides_url? }
  body for selected_speaker_confirmation links: { slides_url }
  → manual-request identity, event, and kind come from the organizer-issued token, not browser-provided form fields
  → creates/keeps the separate speaker allowlist row for that invited email
  → July manual Archive Requests create accepted or slides_received compatibility Talk records from submitted details
  → the later selected-proposal flow creates the same compatibility record from the proposal, its stored kind, and the submitted slides URL
  → marks the one-time link as used after a successful submission
  → expired or used links return closed-link errors
  → never publishes an archive item directly from the public form

DELETE /api/events/[eventId]/speaker-intake-links/[linkId]
  → admin-only; removes a generated link from Archive Requests
```

### Archive Publication Lifecycle (Admin)
```
PATCH /api/talks/[talkId]
  body: { status: 'accepted' | 'rejected' | 'slides_received' | 'published' }
  → requires admin cookie session when changing status
  → only published records appear in the public archive

POST /api/talks/[talkId]/reminder
  → logs an organizer slide reminder for accepted archive items without uploaded slides
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
POST /api/events/[eventId]/speaker-intake/[token]
  body for selected_speaker_confirmation links: { slides_url }
  → tokenized selected-speaker links accept public slide links without an organizer session
  → selected-speaker links create slides_received talks from the original CFP proposal
```
