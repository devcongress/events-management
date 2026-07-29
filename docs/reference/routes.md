# Routes

This is a contributor-facing route map. The active app is the Vue route surface in `src/router.ts` plus Hono routes in `server/app.ts`.

## Browser Surface

This deployment is an organizer-only console, with deliberate public exceptions for event registration, event feedback, the monthly Call for Presentations, private archive intake, and the December 2026 annual-conference volunteer intake. `/` and former public SPA paths redirect to the organizer console; they do not render community pages. Public pages, links, and attendee experiences otherwise belong on `devcongress.org` as they are migrated into the Astro website.

| Route | Purpose |
|---|---|
| `/feedback/:eventId` | Standalone anonymous event feedback form. It deliberately renders without the app header, navigation, organizer controls, or attendee identity fields. |
| `/cfp/:eventId` | Standalone monthly Call for Presentations for talk or product-demo proposals. The organizer Archive workspace generates this URL while CFP is open. |
| `/r/:eventSlug` | Canonical short free-event registration link by name and email. It deliberately has no attendee account, QR code, confirmation code, or organizer navigation. |
| `/register/:eventId` | Backward-compatible free-event registration link retained for previously shared UUID URLs. |
| `/speaker-talks/:eventId/:token` | Standalone private Archive completion form opened by selected-proposal and manual Archive Request links. The token locks the presenter identity, event, and archive-item kind. |
| `/volunteer/december-mega-meetup` | Standalone December 2026 annual-conference volunteer form for name, email, X handle, and Slack name. This compatibility path remains the canonical public link for the active campaign. |

The Hono public integration API remains available for the website and other approved consumers; removing browser routes does not remove that backend contract.

## Organizer Routes

The organizer base path defaults to `/organizer-console` and can be changed with `VITE_ADMIN_BASE_PATH`.
There is no public-site header or organizer-link toggle in this deployment.

| Route | Purpose |
|---|---|
| `/organizer-console/login` | Organizer sign-in through Supabase Google OAuth and the active membership allowlist; incomplete configuration fails closed |
| `/organizer-console/auth/callback` | Legacy organizer auth landing page that redirects back to Google sign-in if a stale magic-link route is hit |
| `/organizer-console/mobile` | Canonical authenticated phone-only Mobile Ops surface. Authenticated phone visits to full organizer routes resolve here; tablets/desktops visiting this route resolve to `/organizer-console/events`. |
| `/organizer-console/mobile/events/:eventId/check-in` | Dedicated authenticated phone check-in screen for one native event. It omits the global organizer navigation and returns to Mobile Ops through a visible back action; tablets/desktops resolve it to the event’s full Registration tab. |
| `/organizer-console/events` | Organizer event list |
| `/organizer-console/annual-conference` | Redirects to the active annual-conference edition |
| `/organizer-console/annual-conference/2026` | December 2026 annual-conference workspace overview |
| `/organizer-console/annual-conference/2026/work-plan` | Shared conference task plan with workstream, status, accountable owner, collaborators, dates, dependencies, and notes |
| `/organizer-console/annual-conference/2026/volunteers` | December 2026 volunteer-link sharing and private application review |
| `/organizer-console/annual-conference/2026/volunteers/display` | Organizer-only TV-safe QR display for the December 2026 volunteer intake form |
| `/organizer-console/organizers` | Owner-only organizer email allowlist |
| `/organizer-console/audit-log` | Owner-only organizer mutation and sign-in audit ledger |
| `/organizer-console/events/:eventId` | Event overview and checklist |
| `/organizer-console/events/:eventId/registrations` | Registration campaign settings, public-link sharing, guest-list search, name/email check-in, cancellation, confirmation-email retries, and local-development test-guest removal |
| `/organizer-console/events/:eventId/talks` | Compatibility URL that redirects to the Event Archive CFP step |
| `/organizer-console/events/:eventId/talks/cfp` | CFP status and organizer proposal review controls |
| `/organizer-console/events/:eventId/talks/proposals` | Talk and product-demo proposal review, organizer selection decisions, and selected-presenter Archive completion links |
| `/organizer-console/events/:eventId/talks/program` | Event Archive review and publishing for talks and product demos |
| `/organizer-console/events/:eventId/talks/backfill` | Archive Requests: multi-select eligible program speakers, email each person a private title/name/kind-locked form, and track it until used, expired, or removed |
| `/organizer-console/events/:eventId/speakers` | Compatibility route for the legacy speaker access allowlist; it is not the Event Archive and is no longer shown in event navigation |
| `/organizer-console/events/:eventId/attendance` | Event attendance readout and CSV import |
| `/organizer-console/events/:eventId/quiz` | Quiz builder and host controls |
| `/organizer-console/events/:eventId/feedback` | Private event feedback campaign builder and response review |
| `/organizer-console/feedback-display/:eventId` | Organizer-only TV-safe QR display for an open event feedback form |
| `/organizer-console/attendance` | Monthly attendance ledger |
| `/organizer-console/feedback` | Event feedback reports grouped by year and event period |
| `/organizer-console/volunteers` | Compatibility redirect to `/organizer-console/annual-conference/2026/volunteers` |
| `/organizer-console/volunteer-display` | Compatibility redirect to `/organizer-console/annual-conference/2026/volunteers/display` |

## API Routes

| Group | Purpose |
|---|---|
| `/api/events*` | Event list, event details, organizer mutations, event removal, media metadata |
| `GET/POST /api/registration/events/:eventKey` | Public registration status and non-enumerating name/email submission by event slug or ID, protected by strict input validation, production Turnstile, atomic cross-Worker limits, campaign/email uniqueness, and atomic capacity allocation |
| `GET /api/registration/events/:eventKey/calendar.ics` | Public, attendee-free calendar download used by confirmed registration emails |
| `/api/events/:eventId/registrations*` | Organizer registration settings, private guest list, check-in, cancellation, and a development/test-only permanent-delete endpoint that returns `404` in other runtimes |
| `POST /api/events/:eventId/registration-emails/process` | Organizer retry for queued confirmation emails |
| `/api/talks*` | Compatibility routes for Event Archive item review, publishing, resources, and reminders |
| `POST /api/events/:eventId/speaker-intake-emails` | Authenticated Resend Batch send using stored program identities and validated one-off recipient emails; successful identities are suppressed from repeat UI/API sends |
| `GET /api/cfp/events/:eventId` | Minimal public event context for an open monthly CFP; avoids exposing organizer event records |
| `/api/cfp` and `/api/speaker-submissions*` | Turnstile/rate-limited public talk/product-demo proposals and organizer selection decisions |
| `/api/speakers*` | Speaker access workflows |
| `/api/attendance*` | Luma CSV import, removal, summaries, monthly ledger |
| `/api/feedback*` | App feedback, event campaigns, and anonymous public event-feedback submission. Session ratings accept 1–5 or `not_attended`; the latter is excluded from averages. |
| `POST /api/volunteer-applications` | Public December 2026 volunteer application submission, protected by mandatory production Turnstile, atomic per-client limits, and email de-duplication |
| `GET /api/admin/volunteer-applications` | Organizer-only December 2026 volunteer application read API |
| `GET /api/annual-conference/:year/work-plan` | Organizer-only annual edition, task list, summary, and task-creation permission |
| `POST /api/annual-conference/:year/work-plan` | Add a task; server-restricted to `angelateyvi@gmail.com` and requires one accountable owner |
| `PATCH /api/annual-conference/:year/work-plan/:taskId` | Edit an existing task; available to every authenticated organizer |
| `/api/quiz*` | Quiz sessions, questions, explicit state advancement, join/play/host state |
| `/api/public/meetups*` | Read-only website integration API |
| `/api/auth/*` | Supabase Google OAuth exchange, app-owned organizer session, callback, and logout; no shared-password fallback |
| `/api/admin/organizers*` | Owner-only organizer email allowlist management |
| `/api/admin/audit-log` | Owner-only audit log read API |
| `/api/health` and `/api/health/supabase` | Minimal public readiness checks without internal error detail |
| `/api/health/data-sources`, `/api/health/supabase/community-events`, `/api/health/supabase/storage` | Owner-only persistence and storage diagnostics |
