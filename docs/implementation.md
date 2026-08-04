# Implementation

## Entry Points

| File | Role |
|---|---|
| `src/main.ts` | Vue app bootstrap — waits for initial router readiness before replacing the static boot screen, then mounts Vue Router, TanStack Query, global CSS, and delegated button press feedback |
| `src/App.vue` | Active app shell and top navigation, including the shared organizer-access boot surface |
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
| `lib/email/scenarios.ts` / `lib/email/resend.ts` / `lib/email/templates/monthly-archive-request.ts` | Code-owned sender and subject policy, Worker-native Resend client, and Archive Request email |
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
  - Active Vue pages: `src/views/CfpView.vue`, `src/views/EventRegistrationView.vue`, `src/views/admin/AdminEventsView.vue`, `src/views/admin/AdminEventView.vue`, `src/views/admin/AdminRegistrationsView.vue`
  - Public CFP page: `app/(public)/cfp/[eventId]/page.tsx`
  - APIs: `/api/events/[eventId]`, `/api/events/[eventId]/checklist`, `/api/events/[eventId]/speaker-submissions`, `/api/events/[eventId]/registrations`, `/api/registration/events/[eventId]`, `/api/cfp`
  - Mock DB: `lib/mock-db/event-checklists.ts` stores per-event organizer run sheets and status-changing milestones.
- **Native registration**
  - `GET /api/admin/venues/search?q=...` proxies authenticated, rate-limited Places API (New) autocomplete and returns a narrow Ghana-only venue DTO without exposing the provider key.
  - `POST /api/events` creates a published, upcoming classified event and one open registration campaign as one application command; event format and DevCongress series are independent organizer fields, with meetup as the backwards-compatible format default. A failed campaign write compensates by removing the new event.
  - Authenticated registration reads return `managed_internally: true` with the private campaign/guest list, or `managed_internally: false` for an existing historical event with no campaign. Unknown events remain `404`, and reads never create campaigns or synthetic attendees.
  - `register_for_event` serializes capacity allocation per campaign in Postgres, rejects duplicate active emails, confirms within capacity, and automatically waitlists overflow. The legacy `auto_confirm` and `waitlist_enabled` columns remain fixed internal compatibility fields and are no longer organizer-controlled. `cancel_registration_and_promote` takes the same campaign lock, cancels the selected registration, promotes the oldest waitlisted guest when a confirmed place opens, and queues the promotion delivery in the same transaction.
  - The canonical public `/r/:eventSlug` form collects name/email only; legacy `/register/:eventId` links remain valid. Attendee tables have RLS and no anonymous policies; all access goes through validated Hono routes.
  - Confirmation delivery is an outbox operation. Missing provider configuration or a Resend quota error never rolls back the attendee record.
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
  - Active Vue pages: `src/views/admin/AdminAnnualConferenceView.vue`, `src/views/admin/AdminAnnualConferenceWorkPlanView.vue`, `src/views/admin/AdminAnnualConferenceTimelineView.vue`, `src/views/VolunteerIntakeView.vue`, `src/views/admin/AdminVolunteerView.vue`, `src/views/admin/AdminVolunteerDisplayView.vue`
  - Organizer workspace: `/organizer-console/annual-conference/:year`, with edition-scoped Work plan and Timeline routes; Volunteers remains a 2026-specific compatibility workflow. The workspace header uses one edition selector beside the Annual Conference label, places module navigation on its own row, and exposes future-edition creation as a secondary action.
  - Overview composition: an unboxed editorial edition brief makes the provisional date the page heading, keeps delivery progress visible, and reserves the only filled action for Work Plan. Venue and keynote facts open from the anchored Planning notes disclosure; Volunteers stays a quiet utility route, and workstream detail remains in the Work Plan.
  - Work-plan interface: a page-level phase selector defaults to the current or next delivery phase and scopes every downstream calculation; one consolidated phase panel combines phase context, completion, compact status controls, owner filtering, and filter clearing above an eight-workstream snapshot and a six-row paginated task ledger with no internal vertical scrollbar. Filter changes use a reduced-motion-aware View Transition so the ledger can resize without page wobble; the former task search strip is intentionally removed; creating, opening, or editing a task uses one accessible right-side drawer. Owner and collaborator controls display organizer names while retaining normalized email values in the submitted ownership contract; the collaborator summary shows at most two names plus a remaining count.
  - Work-plan API: authenticated `GET`, `POST`, and `PATCH` under `/api/annual-conference/:year/work-plan`; the platform owner and edition planning owner can edit every task, while organizers can edit only tasks where their membership email is accountable or collaborating. Volunteers continue receiving assigned tasks only and may change only their statuses. Task creation is available to the platform owner and edition planning owner. New or changed ownership is normalized to active organizer emails, collaborators are deduplicated, and accountable/collaborator overlap is rejected without blocking unchanged legacy Excel assignments. Migration `20260803120000_annual_conference_owner_override_and_identity_backfill.sql` converts unique active-member legacy name matches to canonical emails and leaves ambiguous values untouched.
  - Edition and phase APIs: authenticated edition list/create plus phase create/update/delete routes. The platform owner or latest edition's planning owner can create the next edition; the platform owner or each edition's planning owner manages its phases. New planning owners must be active organizers, and omission inherits the latest edition's owner.
  - Work-plan storage: relational Supabase `annual_conference_editions`, `annual_conference_phases`, and `annual_conference_tasks`, with `lib/mock-db/annual-conference-work-plan.ts` as the local JSON fallback. Database triggers reject overlapping phase windows, cross-edition phase assignment, target dates after phase end, and phase-end changes that would invalidate assigned tasks.
  - Conference-health contract: 2026 seeds Phase 1 for 1–31 August and Phase 2 for 1 September–19 December. Confirmed kickoff work is assigned to Phase 1 while the remaining tasks stay unclassified. Timeline defaults to the current or next phase and recalculates its completion, schedule facts, countdown, and planning gaps from the selected phase; organizers can explicitly switch to another phase, No phase, or the entire conference. The Timeline derives completion, phase elapsed-time comparisons, overdue/blocked/due-soon counts, and planning confidence from the same work-plan response. **Needs planning** remains the readiness signal while any task lacks a phase or target date, avoiding a false on-track forecast. The top summary owns completion and countdown, with current phase, planning confidence, overdue, blocked, and due-soon values consolidated into one supporting facts row instead of repeated statistic cards. The shared work-plan query refreshes every 30 seconds while the Timeline is open and immediately when its window regains focus, so task changes from another organizer update or remove the corresponding rows without a manual reload. One paginated planning-gap table lists each incomplete record exactly once and shows the task, missing fields, owner, status, phase, target date, and a direct editing action. The goal is zero rows; fully planned tasks leave this exception table and remain in the Work Plan. The Accra-local day value refreshes every minute and on window focus so the countdown and Today marker stay current across midnight. Future editions can use any number of phases; deleting one returns its tasks to **No phase**.
  - Initial data: 26-row Excel seed plus the manual Volunteer recruitment task in `lib/annual-conference-work-plan.ts`; confirmed Phase 1 responsibility updates override the original sheet; 19 December 2026 is provisional, the first named owner is accountable, remaining names collaborate, and `All`, `TBD`, or blank owners are unassigned
  - Task contract: exactly `Not started`, `In progress`, `Blocked`, and `Done`; no reminders; finance remains a later restricted module
  - Organizer compatibility redirects: `/organizer-console/volunteers` and `/organizer-console/volunteer-display`
  - Public form: `/volunteer/december-mega-meetup`, intentionally preserved and standalone without organizer navigation or app chrome
  - APIs: `POST /api/volunteer-applications`, `GET /api/admin/volunteer-applications`
  - Authenticated volunteer access: `admin_memberships.role = volunteer`; the SPA routes volunteers to Annual Conference without rendering the redundant global navigation tab, the API returns only tasks matched by accountable-owner/collaborator email, and volunteer mutations accept status-only changes on those assigned tasks
  - Security boundary: non-conference APIs retain the owner/organizer role gate, volunteer-applicant records remain organizer-only, and assigned-task responses redact `internal_note`
  - Storage: `lib/mock-db/volunteer-applications.ts` uses the existing `app_json_documents` Supabase compatibility store under the `volunteer-applications` key when server-side Supabase is enabled, with local JSON fallback for development
  - Abuse controls: mandatory production Turnstile using the `volunteer_intake` action, atomic cross-Worker client limits, and one application per campaign/email
- **Monthly system design**
  - Active Vue pages: `src/views/admin/AdminSystemDesignView.vue`, `src/views/SystemDesignPresenterView.vue`, `src/views/SystemDesignParticipantView.vue`, `src/views/EventView.vue`, `src/views/ArchiveEventView.vue`
  - Storage: `event.schedule` rows with type `system_design`, optional public recap notes, and prompt-link resources
  - Draft generation: `POST /api/events/[eventId]/system-design/draft` reads public Google Slides prompt decks and returns extracted `title`, raw `content`, and a generated `summary`
  - Learning room: `src/components/SystemDesignLearningRoomPanel.vue` generates and reviews exactly five source-based questions on the saved-artifact page, including a directly adjustable per-question answer timer. `POST /api/quiz/sessions/[sessionId]/presentation` prepares a fresh room-scoped run after completion without expiring the reusable content; `/present/system-design/:sessionId` opens separately outside the admin shell. The public `/learn/system-design/:code` participant page receives a unique default room name and fixed avatar, then permits a device-authorized name edit only while the lobby is waiting.
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
- When Supabase is configured, shared-document read/write failures surface and fail closed instead of silently serving or writing local JSON. Production also never seeds a missing remote document from bundled local data; that bootstrap convenience is limited to non-production runtimes.
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
- `supabase/migrations/20260620032000_event_series_type.sql` adds a nullable `series_type` field (`monthly`, `quarterly`, `special`, or `null` for no series) so organizers stop relying on event titles to drive attendance and organizer workflow decisions. The Event Profile editor keeps both series and format drafts separate from persisted values, enabling **Save profile** only when there is a real change.
- `supabase/migrations/20260801020000_community_event_submissions.sql` adds independent event taxonomy fields, a private relational proposal queue, and service-role-only transactional approve/reject functions with idempotent canonical promotion.
- `supabase/migrations/20260728000000_native_event_registrations.sql` adds relational campaigns, attendee records, check-ins, retryable confirmation deliveries, and the atomic free-registration function.
- `supabase/migrations/20260729010000_registration_waitlist_promotion.sql` fixes the automatic-allocation policy at the database boundary, adds promotion deliveries, and performs cancellation plus oldest-first waitlist promotion atomically.
- `supabase/migrations/20260728020000_security_hardening.sql` removes direct anonymous feedback access, adds atomic public rate-limit buckets, moves CFP proposals to private relational rows with database-enforced active-proposal uniqueness, moves speaker links to relational hash-only state with atomic claim/consume/release functions, and revokes organizer sessions after membership role/status changes.
- `supabase/migrations/20260729000000_fix_public_rate_limit_timestamp_ambiguity.sql` repairs the distributed limiter for projects that already applied the security migration by replacing its ambiguous `current_time` variable with an explicit `timestamptz` value.
- `supabase/migrations/20260615001000_meetup_media_bucket.sql` adds the public `meetup-media` Supabase Storage bucket for selected image uploads.
- Feedback tables have no anonymous select/insert privileges after the security migration; all public submissions pass through validated, rate-limited Hono routes using the server-only service role.
- Row-level security allows public reads of `community_events` only when `publish_to_website = true`; trusted organizer writes use the server-side service role.
- `/api/health` and `/api/health/supabase` expose only minimal public readiness state.
- `/api/health/data-sources`, `/api/health/supabase/community-events`, and `/api/health/supabase/storage` require owner access before returning internal diagnostics.
- `/api/events` reads, writes, and removes Supabase `community_events` when `APP_DATA_SOURCE=supabase` is set with credentials. Configured Supabase query failures surface instead of silently serving stale local JSON; JSON fallback is limited to local/dev runtimes that explicitly disable or omit the Supabase data source.
- The hosted `community_events` projection remains separate from compatibility `Talk` archive records. Until those records move to a relational archive source or are joined into that projection, a Supabase-backed public meetup response may not include archive items that exist only in the compatibility store.
- Active Luma preview/import routes are removed because deployed Cloudflare Workers cannot reliably extract the public pages. Historical Luma metadata and attendance CSVs remain compatibility data.

### Hono Server (`server/`)

- **Entry points:**
  - `server/app.ts` exports the fetch-compatible Hono app used by Vite dev server.
  - `server/index.ts` starts Bun in production, serving `/api/*` through Hono and all other paths from `dist/`.
- **Annual Conference module:** `server/annual-conference-service.ts` owns edition/phase/task use-case sequencing and audit events; `server/annual-conference-repository.ts` selects and normalizes Supabase or mock persistence once per request; `lib/annual-conference-access.ts` is the capability, visibility, redaction, and task-authorization policy; `lib/annual-conference-read-model.ts` produces the shared indexed phase projection; and `src/composables/useAnnualConferenceWorkspace.ts` owns the Work Plan/Timeline query, phase scope, refresh, task selection, and task-update lifecycle.
- **Current active APIs:**
  - `/api/health` and `/api/health/supabase` (minimal public readiness)
  - owner-only `/api/health/data-sources`, `/api/health/supabase/community-events`, and `/api/health/supabase/storage`
  - `/api/public/meetups`, `/api/public/meetups/[slug]`, `/api/public/meetups/[slug]/talks`, `/api/public/events`, `/api/public/event-submissions`
  - `/api/auth/session`, `/api/auth/admin/exchange`, `/api/auth/admin/callback`, `/api/auth/logout`
  - `/api/admin/organizers`, `/api/admin/audit-log`, `/api/admin/event-submissions`, `/api/admin/events-preview`
  - `/api/overview`
  - `/api/attendance/monthly`
  - `/api/feedback/inbox`, `/api/feedback/inbox/[feedbackId]`
  - `/api/events`, including native event creation, registration, checklist, and historical attendance routes
  - `/api/registration/events/[eventId]`
  - `/api/cfp/events/[eventId]`
  - `/api/talks`
  - `/api/leaderboard`
- **Public website contract:** `/api/public/meetups*` reads Supabase `community_events` when the server Supabase runtime is enabled; a configured query failure does not silently serve stale local data. Local JSON plus explicitly published compatibility `Talk` data remains the development fallback only when Supabase is disabled. The compatibility API returns DevCongress-owned meetups only. The additive `/api/public/events` feed always returns published DevCongress events; approved, published events promoted from public submissions appear only when the fail-closed `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED=true` runtime gate is explicit. `/api/public/event-submissions` stores no canonical event until authenticated review and first requires the independent fail-closed `PUBLIC_EVENT_SUBMISSIONS_ENABLED=true` intake gate; when enabled, it verifies the `event_submission` Turnstile action and dedicated website hostname allowlist before consuming distributed client/email limits. Intake and moderation functions atomically queue receipt/approval/rejection outbox rows; Resend dispatch happens only after persistence, uses stable idempotency keys, and records queued/accepted/failed state for organizer retry without repeating the decision. Existing `/talks`, `talks`, and talk-count names remain for compatibility; each returned archive item may add `kind`, with a missing value interpreted as `talk`, so `product_demo` can be rendered without breaking older consumers. `/api/public/archive*` returns narrow public archive payloads, and `/api/public/home` excludes attendance identity and is non-cacheable. Internal `/api/*` routes remain organizer-gated except explicit public intake routes.
- **Public website verification:** `pnpm verify:public-api` validates the public meetup response shape against the current `devcongress.org` Astro meetup schema expectations, plus CORS headers, cache headers, detail lookup, and talks lookup against `PUBLIC_API_BASE_URL` before the Astro website is wired to consume it.
- **Public event consumer preview:** authenticated organizers open `/organizer-console/website-preview/events` from Event Management to inspect the complete published collection returned by the private, non-cacheable `/api/admin/events-preview` contract. Every card opens `/organizer-console/website-preview/events/:slug`, backed by `/api/admin/events-preview/:slug`. This preview intentionally includes private-beta submissions excluded from `/api/public/events`; it remains organizer-gated and does not expose unpublished drafts.
- **Auth note:** All organizer routes use Supabase Google OAuth plus app-owned HTTP-only sessions stored in `admin_sessions`; owner-only organizer email management lives at `/organizer-console/organizers`, and owner-only audit review lives at `/organizer-console/audit-log`. Local development uses the same Google flow and membership allowlist as hosted environments. Missing Supabase auth configuration fails closed and never creates a shared-password owner session.

### Vue App (`src/`)

- `src/main.ts` starts initial router resolution before mounting Vue, preserving the server/Vite-injected boot screen through a hard-refresh route load. It then mounts Vue Router, the shared TanStack Query plugin, and the delegated pointer-only button press-feedback system from `src/button-press-feedback.ts`.
- `src/router.ts` lazy-loads routed page components with dynamic imports, keeping the shell and route guard eager while splitting public pages, organizer workspaces, quiz views, and fallback pages into route chunks. Once organizer auth resolves, its route guard applies the shared viewport policy before importing a desktop organizer page.
- `src/organizer-viewport.ts` is the single organizer breakpoint and route-policy source. Authenticated phone routes resolve to the canonical Mobile Ops page except for the dedicated Annual Conference and event check-in routes plus standalone public/protected displays. Phone visits to the desktop Annual Conference workspace resolve to its Conference Ops companion; tablets and desktops resolve that mobile URL to the edition work plan. Tablets and desktops otherwise resolve Mobile Ops to the event list and a phone check-in URL to that event’s full Registration tab.
- `src/App.vue` provides the active shell/nav, mounts `AppToaster`, and polls `/api/quiz/active` so the public `Play` link appears only while a quiz session is waiting or active. Organizer pages begin directly beneath the primary navigation or event tabs; the shell does not render a breadcrumb layer or fetch event names solely for page context. The shell presents Annual Conference as a top-level organizer workspace while keeping Volunteers edition-scoped beneath December 2026, renders CFP and one-time speaker intake links as standalone public forms without app chrome, and gives protected QR displays the same standalone treatment so they cannot inherit organizer navigation or the phone ops view. It preserves the deployed cream header, yellow logo artwork, full-yellow ink-outlined active tabs, offset control shadows, and the established boxed event tabs. During a direct protected-route load, the shell uses the same `AppBootScreen` content as the pre-JavaScript first paint while the organizer session resolves, rather than switching to a second loading design. It redirects organizer routes back to login if the cached/admin-session query later resolves unauthenticated and listens to the shared media query so crossing the phone/tablet boundary updates the canonical organizer route.
- `src/views/admin/AdminLoginView.vue` presents the selected responsive Programme Cover sign-in as the single visual organizer-auth surface. It can be controlled by the protected-route gate and OAuth callback, while its ordinary login mode verifies that server-side Supabase organizer auth is configured before enabling Google. Session checking, callback exchange, non-organizer denial, service failure, and retry states all stay in the same access panel. `src/lib/admin-auth-flow.ts` maps response statuses to allowlisted generic copy, and `src/admin-routes.ts` rejects external or ambiguous redirect targets before a destination is stored or followed.
- `src/App.vue` lazily renders `src/components/AdminEventTabs.vue` for event-scoped organizer routes only, keeping sub-section tabs stable while routed event pages change underneath without adding the tabs to the initial shell chunk. The tab bar reads the shared event-checklist query so a monthly System Design exclusion is rendered as a genuinely non-interactive tab and updates immediately when the checklist choice changes.
- `src/components/ui/AppToaster.vue` wraps `vue-sonner` with the DevCongress editorial/ops toast theme; app code should call `notify` from `src/lib/notify.ts` instead of importing `toast` directly.
- `src/components/ui/ViewSkeleton.vue` provides reusable skeleton variants for full-page loading states; prefer it over bare loading text so routed views preserve their header, panel, table, and form structure while data fetches.
- The earlier `src/components/FeedbackBot.vue` and `src/views/RouteFeedbackView.vue` route-feedback components remain in the repository for compatibility, but the active router and app shell do not expose or mount them.
- `src/views/FeedbackView.vue` renders an event-scoped campaign from a minimal attendee-safe `/api/feedback/events/:eventId` payload; campaigns are open when manually set to `active`, or when draft with auto-open enabled and the event status is `completed`. Monthly meetups use `lib/event-feedback-window.ts` to open at event end and close 24 hours later by default; organizers can close sooner or reopen for a fresh 24-hour grace period without changing the database schema. The form does not request name or email. Session questions accept a 1–5 rating or a separate `Did not attend` state, and public submissions send a per-event random browser token so the server can reject duplicate submissions without collecting attendee identity.
- `src/views/ArchiveEventView.vue` reads `/api/public/archive/:eventId`, shows uploaded recap photos and quarterly-only raw links shared during the meetup, hides the empty talk archive for talkless quarterly meetups, and shows the community “Give Feedback” CTA only while that public archive payload says the form is open.
- `src/views/DashboardView.vue` renders the community hub from `/api/public/home`, using only public counts, recent published talk cards, and an optional public CFP event pointer instead of the broad organizer overview aggregate.
- `src/views/EventsView.vue` is the authenticated consumer-preview collection. It mirrors the DevCongress website event-listing shape, reads `/api/admin/events-preview` through the shared TanStack Query cache, includes published private-beta submissions, and routes every card into the matching preview detail.
- `src/views/EventView.vue` is the authenticated consumer-preview detail. It consumes `/api/admin/events-preview/:slug` to render the event cover, schedule resources, speakers, status action, past-event photos, and recordings. Third-party media is embedded only for exact HTTPS YouTube or Vimeo player hosts inside a restricted iframe and matching Content Security Policy allowlist; other validated URLs remain explicit external links.
- `src/views/ArchiveView.vue` filters completed events by year, query, topic, and speaker from `/api/public/archive`; archive search and speaker filters also look at saved schedule metadata so system-design recap text and facilitators still help people find the right meetup.
- Shared event reads now normalize stale lifecycle states from the saved dates before the client sees them, so a published meetup that has already ended resolves to `completed` across the archive, dashboard, attendance, and feedback flows even if the stored row was left on `live` or another pre-event status.
- `src/views/NotFoundView.vue` is mounted by the final Vue Router catch-all route for unknown client paths.
- `src/views/admin/AdminMobileOrganizerView.vue` is the lightweight phone Home and does not load event or conference operating data. The mobile menu exposes **Home**, **Events**, and **Conference** as separate destinations. `src/views/admin/AdminMobileEventsView.vue` owns the complete event list plus safe registration/source links, while **Check in guests** opens the standalone `AdminMobileCheckInView.vue` door-mode screen with name/email search, first-letter filtering, progress, and full-width check-in actions. `src/views/admin/AdminMobileAnnualConferenceView.vue` is a standalone role-specific workspace: organizers receive Overview, filtered Work Plan, Timeline, phase and planning-gap management, Volunteers, edition controls, and full task create/edit flows; volunteers receive only assignment-scoped Overview and My Tasks with status-only controls. It reuses the shared workspace controller, API capabilities, task form, and task drawer without loading desktop route chunks. The shared `RegistrationAlphabetFilter.vue` exposes only initials present in the guest list through 44px touch targets, while `src/lib/registration-checkin.ts` combines that selection with name/email search and stable alphabetical ordering. Existing events without a native campaign show a bounded historical-registration explanation instead of search controls or synthetic guests. Cancellation/removal remain in the full event console; canonical mobile routes prevent hidden desktop route chunks from loading behind them.
- `src/views/admin/AdminAttendanceOverviewView.vue` renders the monthly attendance ledger and a compact two-chart pattern panel from `/api/attendance/monthly`. The charts compare approved RSVPs with check-ins across recent uploaded events and summarize selected-year approved RSVP outcomes; missing CSVs remain outside those populations. Its people panel defaults to regular attendees with at least two actual check-ins and restores the registered, came, rate, and last-seen summary. A separate **Never came** view lists every person with at least two approved RSVPs and zero check-ins, excluding pending and declined registrations. The people table uses a capped, keyboard-focusable scroll area with a sticky column header so long follow-up lists do not lengthen the entire page.
- `src/views/admin/AdminFeedbackOverviewView.vue` opens the Feedback Hub directly into event feedback reports grouped by selectable year and period. Reports default to the current month when that period exists, and event rows keep a lighter identity block on the left with a full-width stat strip plus end-aligned action on desktop.
- `src/views/admin/AdminEventsView.vue` reads the organizer event list through the shared TanStack query layer, shows focusable detail popovers for the compact lifecycle legend, creates and publishes classified native events with open registration campaigns, auto-generates an editable website slug from the event name, uploads a selected/compressed cover after the event record exists, and invalidates the event-list plus overview queries after creating a new event.
- `src/components/ui/AppDatePicker.vue` supplies the organizer forms with one themed date/date-time control. Its body-level popover uses the visual viewport to open above or below the trigger, clamps horizontally on narrow screens, and scrolls internally when neither side can fit the full calendar.
- `src/views/admin/AdminAuditLogView.vue` reads audit rows through the shared TanStack query layer and now swaps directly into a dedicated audit-log skeleton while the route data is loading.
- `src/views/admin/AdminEventView.vue` invalidates shared event/overview queries after checklist, program-outline, photo-link, and media-upload mutations so status, schedule, and media changes stay visible across routes.
- `src/lib/meetup-media-client.ts` centralizes browser-side meetup image validation, compression, and upload helpers so organizer create/edit surfaces share the same storage limits and encoding behavior.
- `src/lib/event-form.ts` centralizes Zod validation for organizer event creation so the create form and `/api/events` server endpoint share the same required-field, slug, date, and URL rules.
- `src/views/admin/AdminAttendanceView.vue` uploads/replaces a Luma CSV and renders post-event import metrics, source/ticket breakdowns, checked-in guests, and approved no-shows.
- `src/views/admin/AdminEventView.vue` renders the shared chronological event checklist from `/api/events/:eventId/checklist`; checking status milestones can advance the event state, while the status dropdown remains available for manual correction. Unpublished events can disable incomplete checklist milestones that do not apply to that event. The incomplete monthly System Design milestone is the deliberate published-event exception: `Not this month` persists its exclusion and disables that event's System Design navigation, while `Include this month` reverses it.
- `src/views/admin/AdminEventView.vue` also manages optional program outlines in `event.schedule`, letting organizers add structured time/title/type/lead/description/resource rows when a meetup has a run of show. Each editing row has accessible move-up and move-down controls, so a live organizer can adjust the running order before saving. A separate quarterly-only Shared links panel lets organizers paste raw recap URLs without titles; those links are saved into a dedicated schedule bucket and preserved when the outline is edited. The editor includes a monthly system-design scenario helper for Google Slides prompt decks, empty outlines are allowed, and event feedback can reuse saved schedule rows as activity prompts.
- `src/views/admin/AdminFeedbackView.vue` keeps event feedback setup private while restoring deliberate organizer-only attendee-form tools: preview the current draft, copy the live form URL, open a protected TV-safe QR display, close an open form immediately, or reopen a closed form for 24 hours. A manually published campaign can show its QR immediately, subject to its close boundary.
- Event-feedback reporting treats every submission as anonymous, keeps missed-session counts separate, and calculates averages from valid numeric ratings only. Historical identity fields are not returned to the organizer surface. The event report renders dependency-free aggregate charts from all loaded submissions; individual responses are kept out of the page and are available through a full CSV download with one submission per row and every configured question as a column. `lib/event-feedback-export.ts` owns deterministic response ordering, CSV escaping, and spreadsheet-formula neutralization for attendee-provided values.
- `src/views/admin/AdminSystemDesignView.vue` calls `/api/events/:eventId/system-design/draft` when organizers click `Generate Draft` with a Google Slides prompt URL, fills the scenario title if it was blank, writes the returned summary into the full-width public recap field, and switches back to a saved/read-only state after persistence with explicit edit/remove actions for each saved scenario. When the event already has a matching system-design slot in the program outline, this editor updates that existing row in place instead of appending a duplicate `system_design` row at the bottom. A saved source also mounts `SystemDesignLearningRoomPanel` directly on this workspace, including for completed meetups, while the presenter opens in a separate organizer-protected tab. Before anyone joins, organizers choose generated aliases or attendee-entered room names; the setting locks after the first participant.
- `src/views/admin/AdminEventView.vue` also manages event media: organizers can upload selected cover/photo images to Supabase Storage or add website-compatible `{ url, type }` links where `type` is `image` for direct media or `folder` for shared galleries.
- `src/views/admin/AdminQuizView.vue` generates local QR-code join links for the live lobby.
- Legacy Next pages/components remain in `app/`, `components/`, and `hooks/` as a reference while routes are ported.

### Quiz State API (`server/quiz-state.ts`, `server/app.ts`)

- **Key function:** `GET /api/quiz/state?sessionId=&userId=`
- **Facilitator commands:** protected `POST /api/quiz/sessions/:sessionId/release` selects the next unreleased System Design question in reviewed order, while `POST /api/quiz/sessions/:sessionId/reveal` controls when its answer and explanation appear. The compatibility `POST /api/quiz/state/advance` remains timed/all-answered for the separate quiz flow and is a no-op for facilitator-led System Design rooms.
- **Non-obvious logic:** `GET /api/quiz/state` is read-only. Attendee requests do not receive live answer distribution before reveal; the standalone authenticated presenter opts into aggregate option counts and percentages with `presenter=true`. Its shared-screen UI uses the current cream, paper, ink, pink, and yellow design system, with a fixed four-column vertical aggregate chart that highlights the correct option only after reveal. Per-answer respondent identities are not returned. On finish, the presenter receives the top-ten leaderboard with Navii avatars; a System Design attendee receives only `player_standing` for the requesting participant and never the full leaderboard.
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
  body: { kind: 'talk' | 'product_demo', speaker_name, speaker_email, title, expires_in_days }
  → admin-only; creates a month-scoped, one-time Archive Request token
  → requires the event's Archive Requests workflow to be explicitly enabled
  → locks the event, invited identity, archive-item kind, and title into that token
  → only one matching active manual token may exist for the same event, email, and kind; different recipients may use the same expiry duration

POST /api/events/[eventId]/speaker-intake-emails
  body: { recipients: [{ program_item_index, speaker_email }], expires_in_days }
  → admin-only; accepts up to 100 unique eligible rows from the stored event schedule
  → requires the event's Archive Requests workflow to be explicitly enabled
  → validates each one-off organizer-supplied email while deriving name, title, kind, and event from the stored program row
  → does not write the supplied address back into the program outline or speaker allowlist
  → creates one fresh title-bound private link per unsent row and submits personalized entries through Resend Batch
  → records pending/accepted/failed state and provider IDs on the link, uses a stable idempotency key, and skips identities already accepted

GET  /api/events/[eventId]/speaker-intake/[token]
  → returns public event context and the locked kind only when the link is active

POST /api/events/[eventId]/speaker-intake/[token]
  body for archive_backfill links: { topic?, abstract?, bio?, slides_url? }
  body for selected_speaker_confirmation links: { slides_url }
  → manual-request identity, event, kind, and title come from the organizer-issued token, not browser-provided form fields
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
POST /api/quiz/join              body: { join_code, device_id }
  → creates/finds User by deviceId, creates an anonymous QuizParticipant
  → increments User.events_participated when joining a new session
  → returns { session_id, user_id, participant_id }

System Design joins also send purpose: 'system_design_learning'. The response includes a unique default room-scoped `display_name` and immutable participant-derived `avatar_seed`. Hosted sessions, questions, participants, and responses live in relational Supabase storage; local development keeps serialized JSON fallbacks behind the same domain repository APIs. Unique `(quiz_session_id, user_id)` and `(quiz_session_id, nickname_key)` constraints reserve participant identities, while `(question_id, user_id)` prevents repeat answers. Concurrent generated-alias conflicts reload and retry, while a participant-edited duplicate returns `409 nickname_taken`. Answer acceptance, scoring/streak updates, presentation reset/release/reveal, timed advancement, and question reorder operations use short PostgreSQL functions. Participant counts, answer distribution, leaderboard ranks, and requesting-player response state are aggregated in SQL instead of rebuilding them from shared arrays on each poll. While the room is waiting, the same device can send a validated replacement name to `PATCH /api/quiz/participants/[participantId]/name`; the endpoint closes once presentation starts. On participant phones, expiry of the local question countdown removes the answer grid and shows a waiting-for-reveal state; answer submission errors remain local to the question rather than becoming room-level failures.

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
