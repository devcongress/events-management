# Routes

This is a contributor-facing route map. The active app is the Vue route surface in `src/router.ts` plus Hono routes in `server/app.ts`.

## Browser Surface

This deployment is a protected operations console, with full organizer access and a restricted Annual Conference surface for authenticated volunteers. It also has deliberate public exceptions for event registration, event feedback, the monthly Call for Presentations, private archive intake, and the December 2026 annual-conference volunteer intake. `/` and former public SPA paths redirect into the appropriate protected workspace; they do not render community pages. Public pages, links, and attendee experiences otherwise belong on `devcongress.org` as they are migrated into the Astro website.

| Route | Purpose |
|---|---|
| `/feedback/:eventId` | Standalone anonymous event feedback form. It deliberately renders without the app header, navigation, organizer controls, or attendee identity fields. |
| `/cfp/:eventId` | Standalone monthly Call for Presentations for talk or product-demo proposals. The organizer Archive workspace generates this URL while CFP is open. |
| `/r/:eventSlug` | Canonical short free-event registration link by name and email. It deliberately has no attendee account, QR code, confirmation code, or organizer navigation. |
| `/register/:eventId` | Backward-compatible free-event registration link retained for previously shared UUID URLs. |
| `/speaker-talks/:eventId/:token` | Standalone private Archive completion form opened by selected-proposal and manual Archive Request links. The token locks the presenter identity, event, and archive-item kind. |
| `/volunteer/december-mega-meetup` | Standalone December 2026 annual-conference volunteer form for name, email, X handle, and Slack name. This compatibility path remains the canonical public link for the active campaign. |
| `/learn/system-design/:code` | Public standalone anonymous System Design learning-room join and answer surface. It bypasses organizer routing/authentication and rejects codes belonging to the separate Quiz feature. |
| `/present/system-design/:sessionId` | Organizer-protected, standalone System Design presenter opened in a new tab without organizer navigation or editing controls. |

The Hono public integration API remains available for the website and other approved consumers; removing browser routes does not remove that backend contract.

## Organizer Routes

The organizer base path defaults to `/organizer-console` and can be changed with `VITE_ADMIN_BASE_PATH`.
There is no public-site header or organizer-link toggle in this deployment.

| Route | Purpose |
|---|---|
| `/organizer-console/login` | Organizer sign-in through Supabase Google OAuth and the active membership allowlist; incomplete configuration fails closed |
| `/organizer-console/auth/callback` | Google PKCE exchange and organizer-membership verification using the same visual surface as login; temporary browser auth is cleared before the approved internal destination opens |
| `/organizer-console/mobile` | Canonical authenticated phone-only organizer Home. It provides lightweight orientation while the mobile menu exposes dedicated Events and Conference workspaces. Authenticated phone visits to unsupported full organizer routes resolve here; tablets/desktops visiting this route resolve to `/organizer-console/events`. |
| `/organizer-console/mobile/events` | Dedicated authenticated phone Events workspace for the complete organizer event list, source/registration links, and native guest check-in entry points. Tablets/desktops visiting this route resolve to `/organizer-console/events`. |
| `/organizer-console/mobile/annual-conference/:year` | Dedicated authenticated phone Annual Conference workspace. Organizers receive mobile Overview, Work Plan, Timeline/phase management, Volunteers, edition controls, and task create/edit flows; volunteers receive a separate assignment-scoped Overview and My Tasks surface with status-only updates. Phone visits to Annual Conference routes resolve here; tablets/desktops resolve it to the edition work plan. |
| `/organizer-console/mobile/events/:eventId/check-in` | Dedicated authenticated phone check-in screen for one native event. It omits the global organizer navigation and returns to Mobile Ops through a visible back action; an existing event without a native campaign shows a historical-registration explanation, and tablets/desktops resolve the route to the event’s full Registration tab. |
| `/organizer-console/registration-display/:eventId` | Protected phone-safe QR display for an open native registration campaign; guests scan into the public form, and tablets/desktops keep the same display surface |
| `/organizer-console/events` | Organizer event list |
| `/organizer-console/events/submissions` | Events-workspace moderation inbox for pending, approved, and rejected public event proposals |
| `/organizer-console/event-submissions` | Compatibility redirect to the Events-workspace community submissions inbox |
| `/organizer-console/website-preview/events` | Authenticated, phone-safe preview of the complete published event collection rendered from `GET /api/admin/events-preview`, including private-beta submissions |
| `/organizer-console/website-preview/events/:slug` | Authenticated, phone-safe preview of one published event rendered from `GET /api/admin/events-preview/:slug`, with a direct link to inspect the JSON |
| `/organizer-console/annual-conference` | Redirects to the active annual-conference edition |
| `/organizer-console/annual-conference/2026` | December 2026 annual-conference workspace overview; volunteer summaries contain only assigned work |
| `/organizer-console/annual-conference/2026/work-plan` | Shared conference task plan; volunteers default to assigned tasks and status-only updates, with edition-scoped full-view or management delegation available |
| `/organizer-console/annual-conference/:year/timeline` | Capability-gated edition timeline with phase windows, target-dated tasks, No phase classification, and separately delegated phase controls |
| `/organizer-console/annual-conference/:year/volunteers` | Capability-derived volunteer team, intake sharing, and private application review sections |
| `/organizer-console/annual-conference/:year/volunteers/display` | TV-safe QR display requiring the edition's volunteer-intake sharing responsibility |
| `/organizer-console/organizers` | People & Access allowlist plus Owner-only, edition-scoped Conference responsibilities; volunteers cannot open this route |
| `/organizer-console/audit-log` | Owner-only organizer mutation and sign-in audit ledger |
| `/organizer-console/events/:eventId` | Event overview and checklist |
| `/organizer-console/events/:eventId/registrations` | Five-part registration workspace for capacity summary, public-link/settings, private guest operations, atomic cancellation/promotion, transactional delivery retries, on-site registration QR access, local-development test-guest removal, or an explicit not-managed-internally state for historical events without a campaign |
| `/organizer-console/events/:eventId/talks` | Compatibility URL that redirects to the Event Archive CFP step |
| `/organizer-console/events/:eventId/talks/cfp` | CFP status and organizer proposal review controls |
| `/organizer-console/events/:eventId/talks/proposals` | Talk and product-demo proposal review, organizer selection decisions, and selected-presenter Archive completion links |
| `/organizer-console/events/:eventId/talks/program` | Event Archive review and publishing for talks and product demos |
| `/organizer-console/events/:eventId/talks/backfill` | Archive Requests: multi-select eligible program speakers, email each person a private title/name/kind-locked form, and track it until used, expired, or removed |
| `/organizer-console/events/:eventId/speakers` | Compatibility route for the legacy speaker access allowlist; it is not the Event Archive and is no longer shown in event navigation |
| `/organizer-console/events/:eventId/attendance` | Event attendance readout and CSV import |
| `/organizer-console/events/:eventId/finance` | Owner-only GHS actual-expense ledger for monthly meetups; no budget entry required |
| `/organizer-console/events/:eventId/quiz` | Quiz builder and host controls |
| `/organizer-console/events/:eventId/system-design` | Saved System Design scenario workspace plus five-question generation/review and presentation launch; saved sources keep this available for completed meetups |
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
| `/api/events/:eventId/registrations*` | Organizer registration status/window/capacity, private guest list, check-in, Owner/Organizer-only `DELETE .../:registrationId/check-in` undo, cancellation with atomic oldest-waitlisted promotion, and a development/test-only permanent-delete endpoint that returns `404` in other runtimes. Monthly place allocation and overflow waitlisting are server policy, not mutable organizer settings. The authenticated GET discriminates native campaigns from existing historical events with `managed_internally`; unknown events remain `404`. |
| `GET /api/events/:eventId/finance` | Owner or Organizer access to the monthly meetup actual-expense summary and ledger; Volunteers are rejected and non-monthly events are rejected |
| `POST /api/events/:eventId/finance/expenses` | Owner-or-Organizer validated GHS expense creation with paid/unpaid/cancelled state and audit logging; Volunteers are rejected |
| `PATCH /api/events/:eventId/finance/expenses/:expenseId` | Owner-or-Organizer validated GHS expense editing with audit logging; the expense must belong to the monthly meetup and Volunteers are rejected |
| `POST /api/events/:eventId/registration-emails/process` | Organizer retry for failed transactional receipt, waitlist, or promotion deliveries |
| `GET /api/admin/venues/search?q=...` | Authenticated, rate-limited Ghana venue autocomplete backed by server-side Google Places (New) |
| `/api/talks*` | Compatibility routes for Event Archive item review, publishing, resources, and reminders |
| `POST /api/events/:eventId/speaker-intake-emails` | Authenticated Resend Batch send using stored program identities and validated one-off recipient emails; successful identities are suppressed from repeat UI/API sends |
| `GET /api/cfp/events/:eventId` | Minimal public event context for an open monthly CFP; avoids exposing organizer event records |
| `/api/cfp` and `/api/speaker-submissions*` | Turnstile/rate-limited public talk/product-demo proposals and organizer selection decisions |
| `/api/speakers*` | Speaker access workflows |
| `/api/attendance*` | Luma CSV import, removal, summaries, monthly ledger |
| `/api/feedback*` | App feedback, event campaigns, and anonymous public event-feedback submission. Session ratings accept 1–5 or `not_attended`; the latter is excluded from averages. |
| `POST /api/volunteer-applications` | Public December 2026 volunteer application submission, protected by mandatory production Turnstile, atomic per-client limits, and email de-duplication |
| `GET /api/admin/volunteer-applications` | Organizer-only December 2026 volunteer application read API |
| `GET /api/annual-conference/:year/work-plan` | Returns the edition plan and effective capability list; volunteers default to assigned tasks with internal notes removed, while explicit full-view or management grants expand the projection |
| `GET/POST /api/annual-conference/editions` | List editions or let the latest edition's planning owner create a future edition with an inherited or selected active-organizer owner |
| `POST /api/annual-conference/:year/work-plan` | Add a task; server-restricted to platform/planning owners or a member with delegated work-plan management, and requires one accountable owner |
| `PATCH /api/annual-conference/:year/work-plan/:taskId` | Assigned organizers may edit their tasks; volunteers default to assigned status-only changes, while delegated work-plan managers may edit every task |
| `POST/PATCH/DELETE /api/annual-conference/:year/phases*` | Capability-gated phase management with non-overlap and task target-date safeguards |
| `GET/PATCH /api/annual-conference/:year/access-grants*` | Owner-only responsibility matrix and audited per-member grant/revocation |
| `GET /api/annual-conference/:year/team` | Active volunteer names only; requires volunteer-team viewing and excludes applicant contact details |
| `GET /api/annual-conference/:year/task-members` | Active task assignees for organizers or delegated work-plan managers |
| `GET /api/annual-conference/:year/volunteer-applications` | Private applicant records requiring the separate application-review capability |
| `/api/quiz*` | Separate quiz and System Design learning-room sessions, reviewed questions, protected presenter controls/state, and anonymous join/answer state |
| `/api/public/meetups*` | Read-only website integration API |
| `GET /api/public/events` | Read-only generic event feed containing published DevCongress events and, behind an independent fail-closed discovery gate, approved and published public-submission listings |
| `POST /api/public/event-submissions` | Runtime-gated public proposal intake with strict schema validation, purpose-specific Turnstile hostname validation, and distributed client/email limits |
| `/api/admin/event-submissions*` | Organizer-only proposal inbox, transactional approve/reject actions, email delivery state, idempotent failed-email retry, and one-reply-at-a-time Slack notification retry with bounded provider diagnostics |
| `/api/admin/events-preview*` | Organizer-only, non-cacheable preview feed containing the complete published event collection, including private-beta submissions excluded from the public feed |
| `/api/auth/*` | Supabase Google OAuth exchange, app-owned organizer session, callback, and logout; no shared-password fallback |
| `/api/admin/organizers*` | Organizer email allowlist management; re-enable and permanent removal endpoints are Owner-only, and permanent removal requires a disabled membership |
| `/api/admin/audit-log` | Owner-only audit log read API, including the latest Resend quota observation and transactional outbox recovery summary |
| `/api/health` and `/api/health/supabase` | Minimal public readiness checks without internal error detail |
| `/api/health/data-sources`, `/api/health/supabase/community-events`, `/api/health/supabase/storage` | Owner-only persistence and storage diagnostics |
