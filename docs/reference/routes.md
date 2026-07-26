# Routes

This is a contributor-facing route map. The active app is the Vue route surface in `src/router.ts` plus Hono routes in `server/app.ts`.

## Browser Surface

This deployment is an organizer-only console, with deliberate public exceptions for event feedback, private speaker intake, and the December 2026 annual-conference volunteer intake. `/` and former public SPA paths redirect to the organizer console; they do not render community pages. Public pages, links, and attendee experiences otherwise belong on `devcongress.org` as they are migrated into the Astro website.

| Route | Purpose |
|---|---|
| `/feedback/:eventId` | Standalone anonymous event feedback form. It deliberately renders without the app header, navigation, organizer controls, or attendee identity fields. |
| `/speaker-talks/:eventId/:token` | Standalone private speaker form opened by generated legacy-backfill and selected-speaker links. The token supplies the invited speaker identity and event context. |
| `/volunteer/december-mega-meetup` | Standalone December 2026 annual-conference volunteer form for name, email, X handle, and Slack name. This compatibility path remains the canonical public link for the active campaign. |

The Hono public integration API remains available for the website and other approved consumers; removing browser routes does not remove that backend contract.

## Organizer Routes

The organizer base path defaults to `/organizer-console` and can be changed with `VITE_ADMIN_BASE_PATH`.
There is no public-site header or organizer-link toggle in this deployment.

| Route | Purpose |
|---|---|
| `/organizer-console/login` | Organizer sign-in, using Supabase Google OAuth when configured or local password fallback otherwise |
| `/organizer-console/auth/callback` | Legacy organizer auth landing page that redirects back to Google sign-in if a stale magic-link route is hit |
| `/organizer-console/mobile` | Canonical authenticated phone-only Mobile Ops surface. Authenticated phone visits to full organizer routes resolve here; tablets/desktops visiting this route resolve to `/organizer-console/events`. |
| `/organizer-console/events` | Organizer event list |
| `/organizer-console/annual-conference` | Redirects to the active annual-conference edition |
| `/organizer-console/annual-conference/2026` | December 2026 annual-conference workspace overview |
| `/organizer-console/annual-conference/2026/volunteers` | December 2026 volunteer-link sharing and private application review |
| `/organizer-console/annual-conference/2026/volunteers/display` | Organizer-only TV-safe QR display for the December 2026 volunteer intake form |
| `/organizer-console/organizers` | Owner-only organizer email allowlist |
| `/organizer-console/audit-log` | Owner-only organizer mutation and sign-in audit ledger |
| `/organizer-console/events/:eventId` | Event overview and checklist |
| `/organizer-console/events/:eventId/talks` | Redirects to the Talk Management CFP step |
| `/organizer-console/events/:eventId/talks/cfp` | CFP status and organizer proposal review controls |
| `/organizer-console/events/:eventId/talks/proposals` | Speaker proposal review, organizer selection decisions, and selected-speaker slides links |
| `/organizer-console/events/:eventId/talks/program` | Confirmed talk management, slide follow-up, and archive publishing |
| `/organizer-console/events/:eventId/talks/backfill` | Legacy talk backfill: issue one private, named link per confirmed speaker and track it until used, expired, or removed |
| `/organizer-console/events/:eventId/speakers` | Speaker access allowlist |
| `/organizer-console/events/:eventId/attendance` | Event attendance readout and CSV import |
| `/organizer-console/events/:eventId/quiz` | Quiz builder and host controls |
| `/organizer-console/events/:eventId/feedback` | Private event feedback campaign builder and response review |
| `/organizer-console/feedback-display/:eventId` | Organizer-only TV-safe QR display for an open event feedback form |
| `/organizer-console/attendance` | Monthly attendance ledger |
| `/organizer-console/feedback` | Feedback hub and app feedback inbox |
| `/organizer-console/volunteers` | Compatibility redirect to `/organizer-console/annual-conference/2026/volunteers` |
| `/organizer-console/volunteer-display` | Compatibility redirect to `/organizer-console/annual-conference/2026/volunteers/display` |

## API Routes

| Group | Purpose |
|---|---|
| `/api/events*` | Event list, event details, organizer mutations, event removal, media metadata |
| `/api/talks*` | Confirmed talk management, speaker archive intake, talk review, speaker slide links |
| `/api/cfp` and `/api/speaker-submissions*` | Public speaker proposals and organizer selection decisions |
| `/api/speakers*` | Speaker access workflows |
| `/api/attendance*` | Luma CSV import, removal, summaries, monthly ledger |
| `/api/feedback*` | App feedback, event campaigns, and anonymous public event-feedback submission. Session ratings accept 1–5 or `not_attended`; the latter is excluded from averages. |
| `POST /api/volunteer-applications` | Public December 2026 volunteer application submission, protected by optional Turnstile, per-client limits, and email de-duplication |
| `GET /api/admin/volunteer-applications` | Organizer-only December 2026 volunteer application read API |
| `/api/integrations/luma*` | Organizer-only Luma event shell preview, public-page preview, and confirmed import |
| `/api/quiz*` | Quiz sessions, questions, explicit state advancement, join/play/host state |
| `/api/public/meetups*` | Read-only website integration API |
| `/api/auth/*` | Organizer session, local password fallback login, Google OAuth callback, and logout |
| `/api/admin/organizers*` | Owner-only organizer email allowlist management |
| `/api/admin/audit-log` | Owner-only audit log read API |
| `/api/health/*` | Local readiness, Supabase readiness, and active data-source checks |
