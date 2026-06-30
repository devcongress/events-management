# Routes

This is a contributor-facing route map. The active app is the Vue route surface in `src/router.ts` plus Hono routes in `server/app.ts`.

## Public Routes

| Route | Purpose |
|---|---|
| `/` | Community landing page |
| `/events` | Published meetup listing |
| `/events/:slug` | Meetup detail page with cover, schedule, speakers, photos, and event-level CTA |
| `/archive` | Past event archive |
| `/archive/:eventId` | Event archive detail and talks |
| `/cfp/:eventId` | Public talk submission form |
| `/speaker-talks/:eventId/:token` | Public post-event speaker archive details form opened from an expiring one-time organizer link |
| `/feedback` | General app feedback form, used by the mobile feedback launcher |
| `/feedback/:eventId` | Public post-event feedback form |
| `/leaderboard` | Community leaderboard preview |
| `/my-talks` | Speaker talk lookup and slide links |
| `/play` | Live quiz waiting/empty state |
| `/play/:code` | Quiz join flow for a host-opened session |
| `/:pathMatch(.*)*` | Branded 404 recovery page |

## Organizer Routes

The organizer base path defaults to `/organizer-console` and can be changed with `VITE_ADMIN_BASE_PATH`.
The public header's Organizer button can be hidden with `VITE_SHOW_ORGANIZER_LINK=false`, but this does not disable the routes below.

| Route | Purpose |
|---|---|
| `/organizer-console/login` | Organizer sign-in, using Supabase Google OAuth when configured or local password fallback otherwise |
| `/organizer-console/auth/callback` | Legacy organizer auth landing page that redirects back to Google sign-in if a stale magic-link route is hit |
| `/organizer-console/events` | Organizer event list |
| `/organizer-console/organizers` | Owner-only organizer email allowlist |
| `/organizer-console/audit-log` | Owner-only organizer mutation and sign-in audit ledger |
| `/organizer-console/events/:eventId` | Event overview and checklist |
| `/organizer-console/events/:eventId/talks` | Talk review, manual backfill, archive publishing, and slide follow-up |
| `/organizer-console/events/:eventId/speakers` | Speaker access allowlist |
| `/organizer-console/events/:eventId/attendance` | Event attendance readout and CSV import |
| `/organizer-console/events/:eventId/quiz` | Quiz builder and host controls |
| `/organizer-console/events/:eventId/feedback` | Event feedback campaign builder |
| `/organizer-console/attendance` | Monthly attendance ledger |
| `/organizer-console/feedback` | Feedback hub and app feedback inbox |

## API Routes

| Group | Purpose |
|---|---|
| `/api/events*` | Event list, event details, organizer mutations, event removal, media metadata |
| `/api/talks*` | CFP submissions, manual talk backfill, speaker archive intake, talk review, speaker slide links |
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
