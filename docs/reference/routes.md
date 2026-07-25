# Routes

This is a contributor-facing route map. The active app is the Vue route surface in `src/router.ts` plus Hono routes in `server/app.ts`.

## Browser Surface

This deployment is an organizer-only console, with one deliberate attendee-facing exception: event feedback. `/` and former public SPA paths redirect to the organizer console; they do not render community pages. Public pages, links, and attendee experiences otherwise belong on `devcongress.org` as they are migrated into the Astro website.

| Route | Purpose |
|---|---|
| `/feedback/:eventId` | Standalone event feedback form. It deliberately renders without the app header, navigation, or organizer controls. |

The Hono public integration API remains available for the website and other approved consumers; removing browser routes does not remove that backend contract.

## Organizer Routes

The organizer base path defaults to `/organizer-console` and can be changed with `VITE_ADMIN_BASE_PATH`.
There is no public-site header or organizer-link toggle in this deployment.

| Route | Purpose |
|---|---|
| `/organizer-console/login` | Organizer sign-in, using Supabase Google OAuth when configured or local password fallback otherwise |
| `/organizer-console/auth/callback` | Legacy organizer auth landing page that redirects back to Google sign-in if a stale magic-link route is hit |
| `/organizer-console/events` | Organizer event list |
| `/organizer-console/organizers` | Owner-only organizer email allowlist |
| `/organizer-console/audit-log` | Owner-only organizer mutation and sign-in audit ledger |
| `/organizer-console/events/:eventId` | Event overview and checklist |
| `/organizer-console/events/:eventId/talks` | Redirects to the Talk Management CFP step |
| `/organizer-console/events/:eventId/talks/cfp` | CFP status and organizer proposal review controls |
| `/organizer-console/events/:eventId/talks/proposals` | Speaker proposal review, organizer selection decisions, and selected-speaker slides links |
| `/organizer-console/events/:eventId/talks/program` | Confirmed talk management, slide follow-up, and archive publishing |
| `/organizer-console/events/:eventId/talks/backfill` | Temporary legacy backfill tools for talks not collected through CFP |
| `/organizer-console/events/:eventId/speakers` | Speaker access allowlist |
| `/organizer-console/events/:eventId/attendance` | Event attendance readout and CSV import |
| `/organizer-console/events/:eventId/quiz` | Quiz builder and host controls |
| `/organizer-console/events/:eventId/feedback` | Private event feedback campaign builder and response review |
| `/organizer-console/attendance` | Monthly attendance ledger |
| `/organizer-console/feedback` | Feedback hub and app feedback inbox |

## API Routes

| Group | Purpose |
|---|---|
| `/api/events*` | Event list, event details, organizer mutations, event removal, media metadata |
| `/api/talks*` | Confirmed talk management, speaker archive intake, talk review, speaker slide links |
| `/api/cfp` and `/api/speaker-submissions*` | Public speaker proposals and organizer selection decisions |
| `/api/speakers*` | Speaker access workflows |
| `/api/attendance*` | Luma CSV import, removal, summaries, monthly ledger |
| `/api/feedback*` | App feedback, event campaigns, public feedback submission |
| `/api/integrations/luma*` | Organizer-only Luma event shell preview, public-page preview, and confirmed import |
| `/api/quiz*` | Quiz sessions, questions, explicit state advancement, join/play/host state |
| `/api/public/meetups*` | Read-only website integration API |
| `/api/auth/*` | Organizer session, local password fallback login, Google OAuth callback, and logout |
| `/api/admin/organizers*` | Owner-only organizer email allowlist management |
| `/api/admin/audit-log` | Owner-only audit log read API |
| `/api/health/*` | Local readiness, Supabase readiness, and active data-source checks |
