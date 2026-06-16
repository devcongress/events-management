# Changelog

_Update this file at natural checkpoints: before a commit, before a PR, or when explicitly asked._
_Format: `## YYYY-MM-DD — [Feature / Fix / Refactor]` followed by bullet points._

---

## 2026-06-15 — Mobile route fit and feedback UX

- Added an app-wide mobile keyboard dismiss control for focused inputs, textareas, and selects so iOS users can intentionally blur fields without relying on Safari's form accessory behavior.
- Refined mobile keyboard dismissal with tap-outside blur behavior and a smaller 44px edge fallback button so the control no longer blocks active form content.
- Compactly redesigned the mobile archive event detail page, including the detail card, description copy, presentation count, and empty state.
- Restored the floating public feedback bot now that mobile community pages use document scrolling.
- Tightened public mobile typography, cards, header controls, and My Talks placement so phone routes feel less oversized and the speaker email form starts in the first viewport.
- Moved mobile community pages back to normal document scrolling instead of the nested app `<main>` scroller so real phone browsers own visual-viewport and address-bar scroll behavior.
- Locked the app shell to the visual viewport so document/body overscroll no longer creates phantom vertical scrolling after route content ends.
- Tightened the route-stack height contract so short mobile pages fill the app scroll area instead of leaving blank space below their content.
- Replaced the desktop-style mobile nav strip with a compact hamburger header and full-screen mobile menu while preserving accessible 44px+ navigation targets.
- Tightened the full-screen mobile menu with denser navigation rows and a bottom feedback/footer area so the panel no longer ends with unused empty space.
- Compactly fitted the mobile My Talks and empty Leaderboard routes within common small-device heights, with My Talks centered on roomy phones and kept top-safe on short screens.
- Made the mobile route-feedback page center after launcher taps on roomy phones while falling back to top-safe placement when the form is taller than the viewport.
- Simplified the mobile 404 route into a centered recovery card without the desktop suggestion stack, keeping unknown routes non-scrollable on common phone sizes.
- Hard-paused the public leaderboard for phase one so seeded prototype rows and account tools cannot appear from hosted environment drift.
- Reset the internal app scroll container on route changes so feedback opens at the form instead of inheriting scroll position from a previous long page.
- Reduced feedback launcher prominence with route-view interval gating and mobile routing to a standalone `/feedback` page instead of an overlay.
- Added the `/feedback` route to documentation and noted the mobile feedback behavior for community testers.
- Made the header sticky at the top on mobile viewports only, leaving larger layouts non-sticky.
- Hardened organizer sign-in so failed JSON/session checks no longer leave the button stuck, and compacted the mobile sign-in card typography and password field.

## 2026-06-15 — CI badge and workflow

- Added a GitHub Actions CI workflow that runs typecheck, tests, and production build on pushes to `main` and pull requests.
- Split the README badge block into clearer groups and added the real CI workflow badge plus Cloudflare Pages and Worker deployment badges.

## 2026-06-15 — Cloudflare Worker API deploy path

- Added a Cloudflare Worker entrypoint for the Hono API with Wrangler config and a `pnpm deploy:worker` script.
- Added `VITE_API_BASE_URL` support so the Cloudflare Pages frontend can call a separate Worker API origin before same-domain `/api/*` routing exists.
- Added credentialed API CORS support for split Pages/Worker origins, controlled by `PUBLIC_FRONTEND_ORIGIN`.
- Deferred hosted PDF-to-quiz generation behind `ENABLE_PDF_QUIZ_UPLOADS` and removed the PDF parser from the Worker top-level import path so Cloudflare can validate the API bundle.
- Documented the split Cloudflare Pages + Worker deploy steps and clarified that server-only secrets belong on the Worker, not in the Pages frontend environment.

## 2026-06-15 — Open-source documentation foundation

- Added a concise open-source README that explains the product, quick start, documentation map, project status, stack, contribution path, security posture, and license without overcrowding the landing page.
- Added root contribution, security, code-of-conduct, and MIT license files for public collaboration readiness.
- Added structured contributor docs under user guides, technical docs, reference docs, and feature docs so community members, organizers, integrators, and maintainers can enter at the right level of detail.
- Added a technical debt register and linked it from the README and documentation map so open-source contributors can see production-readiness risks without crowding the README.
- Added `VITE_SHOW_ORGANIZER_LINK` so public deployments can hide the Organizer header button without changing route or auth behavior.
- Hardened JSON mock persistence so missing files still behave as empty collections, invalid/non-array JSON fails loudly, and writes replace files through temp-file rename.
- Moved quiz phase advancement out of `GET /api/quiz/state` into explicit `POST /api/quiz/state/advance`, with shared quiz-state helpers and focused tests.
- Added focused tests for mock DB persistence, Luma attendance parsing/summarization, and quiz state advancement/read behavior.

## 2026-06-15 — Browser metadata polish

- Added standard 16px and 32px favicon assets so browser tabs can render the DevCongress icon instead of falling back to the default icon.
- Updated the static and production HTML titles to `DevCongress | Community`.
- Added route-aware document titles so organizer-console routes show `DevCongress | Organizers`.

## 2026-06-15 — Archive header polish

- Removed the event, talk, and year count cards from the public archive masthead.
- Removed the masthead count cards from the public leaderboard and My Talks pages for the same cleaner header treatment.
- Constrained the leaderboard mode-switch underline to the same width as the leaderboard table.
- Replaced the separate leaderboard coming-soon banner with a small angled masthead ribbon.
- Matched the homepage Top Members preview to the same angled coming-soon ribbon treatment.
- Removed the homepage Players coming-soon summary card and moved the Top Members preview higher.
- Removed Praise from the route feedback kind picker, replaced tester-name selection with a typed name plus Anonymous checkbox, and improved route-path contrast.
- Added capped auto-growth, internal textarea overflow, and a character counter to the route feedback textarea so longer notes are easier to write without scrolling the whole feedback panel.
- Hid the feedback launcher while the feedback panel is open so its bubble cannot overlap the submit button.
- Added a Supabase-backed App Feedback Inbox to the organizer Feedback Hub, including route-feedback tagging and admin-only status updates.

## 2026-06-15 — Community events UI polish

- Removed the count tiles from the public Events masthead so the page opens with a simpler archive-style header.

## 2026-06-15 — Supabase community events source

- Added a Supabase `community_events` migration modeled from the current `devcongress.org` Astro meetup schema and seeded it with the existing website meetup YAML content.
- Added a Supabase community-event repository so `/api/events` can read/write Supabase events when configured while preserving JSON fallback during local development.
- Updated `/api/public/meetups*` to prefer Supabase-published community events before falling back to the local JSON event stream.
- Updated fallback public meetup mapping so event photo links flow through as website-compatible `photos[]` instead of substituting the cover image.
- Added `/api/health/supabase/community-events` as a focused readiness check for the new event-source table.
- Extended organizer event creation with website-facing fields and a publish toggle so new rows can be tested through the public meetup endpoint.
- Added organizer event media management for direct photo links and shared gallery/folder links.
- Added Supabase Storage support for organizer-uploaded event covers and selected event photos through a public `meetup-media` bucket.
- Added browser-side image compression before Supabase Storage uploads, targeting 1600px/WebP/2MB while keeping the server-side 5MB validation cap.
- Added `/api/health/supabase/storage` for checking the media bucket before testing uploads.
- Documented the Supabase event-source contract and recorded the decision to make this app the meetup data owner before the Astro website repo consumes it.

## 2026-06-15 — Free-first launch scope

- Marked quiz and leaderboard as phase-one coming-soon features while preserving their route/UI paths for later rollout.
- Kept the homepage leaderboard preview visible but de-emphasized it with coming-soon treatment.
- Kept attendance CSV imports active and added a 2MB file-size policy for Luma exports.
- Reframed speaker slide handling as link-only so the app stores public slide URLs instead of files.
- Revised the hosting recommendation around the reduced phase-one scope: Cloudflare Pages/Worker plus Supabase as target, Render plus Supabase as a temporary bridge, and Durable Objects reserved for future quiz work.

## 2026-06-14 — Cloudflare/Supabase deployment planning

- Added a deployment runbook for the proposed Cloudflare Pages/Workers, Durable Objects, and Supabase production shape.
- Documented the current app blockers before Cloudflare deployment: JSON persistence, Bun-specific serving, local filesystem assumptions, and in-request PDF processing.
- Captured a starter cost posture showing that early testing can begin on free tiers, while public launch should budget for Cloudflare Workers Paid and Supabase Pro.
- Added a free-first deployment posture for a non-funded community group, including upload caps, delayed quiz realtime, and a Firebase cost/fit comparison.

## 2026-06-14 — Organizer attendance analysis

- Added a reusable `ViewSkeleton` loader system with page-shaped variants for dashboards, tables, cards, forms, ledgers, event overview, quiz builder, and quiz entry states.
- Replaced full-page `LOADING...` placeholders across active public and organizer Vue views with layout-preserving skeletons that respect reduced-motion preferences.
- Added contextual breadcrumbs under the app shell navigation for public and organizer routes, including event-level organizer pages, so deep pages have a clear way back without relying only on the top navbar.
- Added restrained breadcrumb hover, press, and current-route motion that respects reduced-motion preferences.
- Added directional organizer event subsection transitions and a gliding active tab indicator so Overview, Talks, Speakers, Attendance, Quiz, and Feedback behave like one continuous tabbed workspace.
- Reworked the organizer event overview into a compact dashboard layout so the overview subsection fits the desktop viewport without requiring page scroll at the target wide layout.
- Refined the organizer event overview workstream UI into a compact operations list with calmer sans-serif numeric stats.
- Added a compact event lifecycle key to the organizer event list with plain-language speaker-submission and program-set stages instead of unexplained CFP/upcoming labels.
- Reworked pagination footers into a shared compact control pattern so page counts read as status text instead of a third button.
- Added a monthly attendance ledger at `[adminBase]/attendance` with import coverage, month-by-month metrics, best-month readouts, and venue-planning guidance.
- Added an organizer-only attendance page at `[adminBase]/events/[eventId]/attendance` for post-event Luma attendance readouts.
- Added a Vue Sonner toast foundation with a globally mounted DevCongress-themed toaster and typed `notify` helper for future view-level usage.
- Added a single-action CSV import control with real file-read and upload progress states for replacing an event's Luma guest export.
- Added a remove-file action for clearing a stored Luma attendance import from an event.
- Added JSON-backed Luma CSV import storage and summary metrics for approved registrations, check-ins, approved no-shows, check-in rate, source breakdowns, and ticket breakdowns.
- Added admin-only Hono routes for monthly attendance insights plus fetching, importing, and removing per-event Luma attendance data.
- Kept the top organizer nav focused on global sections, and moved event-specific navigation back into nested event tabs with Attendance and Feedback included.
- Preserved Attendance Hub and Feedback Hub return context when organizers open event subpages from monthly hub actions, breadcrumbs, tabs, and nested event links.
- Added Attendance to organizer event overview action rows.
- Polished the event overview operations area with consistent ops panels, aligned card tops, fixed metric/action columns, and tighter typography hierarchy.
- Moved app toasts to the bottom-right corner.
- Fixed event sub-section route changes so the event tab strip stays mounted and routed content transitions in a stacked slot instead of collapsing through a loading placeholder.
- Reworked the attendance hub ledger around the selected year, month filters, status filters, and paginated full-width rows so monthly CSV actions stay visible.
- Simplified attendance hub month rows so CSV state, action, and attendance summary read as one compact decision instead of repeated metric cards.
- Added an organizer event checklist with chronological milestones, shared JSON persistence, progress state, and milestone-driven event status updates.
- Reframed the event status dropdown as a manual correction control while the checklist becomes the primary coordination surface for monthly event work.

## 2026-06-13 — Event feedback campaigns

- Added event-scoped feedback campaigns with default post-event questions, local JSON persistence, and Supabase migration support.
- Added organizer feedback management at `[adminBase]/events/[eventId]/feedback` with campaign status, auto-open behavior, question editing, public link copy, and recent response review.
- Added public community feedback forms at `/feedback/[eventId]` that render campaign questions and submit structured event answers.
- Added Hono routes for feedback campaign management, public campaign lookup, and event feedback submission.
- Added feedback to the event overview and organizer event navigation.
- Time-boxed event feedback so forms auto-open from the event date and close after 3 days by default.
- Added a community archive CTA that appears only while feedback is open, and kept manual `active` campaigns open for testing regardless of the auto window.
- Polished the feedback form UI by replacing native selects with the app dropdown and adding trigger-origin dropdown motion plus question-card enter/hover motion.
- Added restrained info/success design tokens and applied them to secondary status surfaces, archive stats, feedback state chips, and form focus rings.
- Added lighter operational panel/table primitives and applied them to dense organizer event, talk, speaker, and attendance surfaces.
- Reworked the organizer quiz builder and live-host screens with stronger control grouping, option labels, stage contrast, and a dedicated finished-session view.
- Added an organizer Feedback Hub with month-by-month switching, combined monthly response metrics, and event-level form status links.

## 2026-06-13 — DevCongress.org integration notes

- Recorded the decision to align public app surfaces with the `devcongress.org` light theme instead of keeping the dark companion theme.
- Added the initial website palette notes to the design-token usage guidance.
- Added read-only `/api/public/meetups*` endpoints for the `.org` website integration contract.
- Added `pnpm verify:public-api` to validate the read-only meetup API before touching the `devcongress.org` Astro integration.
- Added `docs/public-meetups-api.md` as the local contract note for future website consumption.
- Tightened the public meetup DTO against the current `devcongress.org` Astro meetup schema: offset datetimes, `location.url`, full CTA/archive URLs, non-null speaker images, and draft-event exclusion.
- Added a public `/events` page that lists all website-publishable meetups from `/api/public/meetups`.
- Aligned the public `/events` page with the `devcongress.org` All Meetups layout: listing header, two-column cards, cover images, status badges, photo counts, date/location meta, and meetup CTAs.
- Synced organizer pages to the `.org` light theme across event management, event overview, talks, speakers, quiz builder/live host, login, tabs, and shared number steppers.
- Switched the active design tokens, app shell, feedback UI, and landing page foundation to the `.org` light palette.
- Updated public dynamic routes so archive detail, CFP, and quiz-code pages use the `.org` light palette instead of legacy dark accents.
- Added Inter font assets for the light-theme UI pass.
- Added a shared archive-style community masthead and applied it to Events, Leaderboard, My Talks, and Play while leaving Home distinct.

## 2026-05-30 — Supabase feedback foundation

- Added Supabase JS client configuration with browser anon and server service-role helpers.
- Loaded `.env.local` into the Hono dev server so server routes can access Supabase secrets locally.
- Added environment placeholders for Supabase URL, anon key, and server-only service role key.
- Added a Supabase migration for name-selected tester feedback without Supabase sessions or user auth.
- Added `/api/health/supabase` to verify server-side Supabase connectivity.
- Added a public feedback bot that loads tester names from Supabase and submits route-aware feedback without tester sessions.

## 2026-05-30 — Temporary mode switch

- Added a simple masthead switch for testing between the public community experience and the organizer console.

## 2026-05-30 — Admin overview polish

- Reworked the event overview operations area into a calmer program pulse and compact next-action rail.
- Reduced the stretched metric-card feel so counts, status, and actions scan together on wide screens.
- Replaced remaining native Vue dropdowns with the shared app-themed dropdown component across archive filters, event status, and quiz answer selection.
- Added an app-themed number stepper and replaced native quiz builder number inputs.
- Softened generated quiz question cards with calmer typography, lighter answer rows, and quieter edit/delete controls.
- Fixed admin shell nav highlighting so only the deepest matching event section is marked active.
- Removed redundant event back links from admin event child pages now covered by shell navigation.

## 2026-05-29 — Quieter admin event overview

- Replaced the dominant event lifecycle panel with a compact header status selector.
- Added a calmer organizer overview for talk pipeline, speaker access, quiz state, and event-specific next actions.

## 2026-05-29 — Editorial page scroll fix

- Changed shared editorial pages to fill the available app shell height instead of forcing full viewport height inside the header-offset scroll area.
- Removed the phantom vertical scrollbar on admin pages when content fits the visible area.
- Added contextual admin shell navigation so event routes and the event list expose Overview, Talks, Speakers, Quiz, and Live links for the current/default event.
- Removed duplicate in-page admin event tabs now that event operations live in the admin shell navigation.
- Hid the admin Live nav item unless the selected/default event has a waiting or active quiz session.

## 2026-05-29 — Live quiz nav visibility

- Updated the app header to show the public `Play` navigation item only when `/api/quiz/active` reports a waiting or active quiz session.
- Added periodic quiz availability refresh so the `Play` link can appear during a meetup without reloading the page.
- Removed the redundant "Back to events" link from the admin event detail page because Events is already reachable from the admin navbar.

## 2026-05-29 — Local Navii leaderboard avatars

- Added `@usenavii/core` and a Vue `NaviiAvatar` component so leaderboard avatars render locally as deterministic data URI images.
- Seeded avatars from stable leaderboard identifiers (`user_id`, `device_id`, then nickname/rank fallback) instead of using display names alone.
- Added static 48px mascot avatars to leaderboard rows without enabling repeated avatar animation.

## 2026-05-29 — Motion system pass

- Switched the app motion standard to `$ui-animations` and added shared spring, smooth, and fast motion tokens.
- Replaced active Vue `transition-all` usage with transform/opacity-only motion utilities for press, surface, icon, page, spinner, and quiz answer interactions.
- Removed repeated decorative pulse motion, avoided layout-property transitions, and kept hover movement pointer-gated with reduced-motion fallbacks.

## 2026-05-29 — Landing hero meetup photo

- Replaced the single landing hero image with a three-photo automatic meetup stack.
- Refined the meetup stack into a contact-sheet style zig-zag pile with paper borders, staggered rear prints, external captioning, and transform-only motion.
- Simplified the automatic photo rotation so only the front print shifts to the back before the stack order advances.
- Added a previous meetup photo to the landing hero's "Right now" feature panel.
- Removed the redundant current-event summary from the photo panel so the hero only shows one meetup image.
- Updated the hero photo caption to identify it as the April meetup.
- Renamed the landing leaderboard eyebrow from "Community board" to "Community Kahoot board".

## 2026-05-29 — Configurable organizer route

- Moved organizer-facing Vue routes from the predictable `/admin` prefix to a configurable `VITE_ADMIN_BASE_PATH`, defaulting to `/organizer-console`.
- Updated admin navigation, auth redirects, event tabs, and admin back links to build URLs through the shared route helper.
- Added a catch-all client route so old or unknown paths recover through the branded 404 instead of exposing an admin entry point.

## 2026-05-29 — Branded 404 page

- Added a Vue catch-all route for unknown client paths.
- Added a branded 404 page with the missing path, quick recovery links, and organizer-aware primary navigation.
- Removed the oversized hero glow so the 404 background stays quiet at wide viewport sizes.

## 2026-05-29 — Softer interaction states

- Reworked the app header into a compact app bar with grouped navigation and aligned status/actions.
- Simplified the header into an editorial masthead with plain text navigation and subtle active underlines.
- Removed the public "Community" header label; the masthead now only shows an organizer indicator on admin routes.
- Removed the decorative nav group separator from the public masthead.
- Reworked the public navigation active state from a solid yellow fill to a lighter tinted selection with subtler hover, press, and focus states.
- Reduced the intensity of shared editorial action button hover/active states while preserving the yellow DevCon-Comm accent.
- Removed the nav item hover lift that could clip the selected border inside the horizontal scroller.

## 2026-05-29 — Archive redesign

- Redesigned the public archive from a sparse timeline into event cards with clear titles, descriptions, topic chips, and talk previews.
- Reworked year selection, summary metrics, and filters so desktop and mobile archive browsing are easier to scan.
- Replaced native archive topic/speaker selects with app-themed custom dropdown popovers.
- Removed the redundant "View issue" chip from archive cards because the full card already opens the event.

## 2026-05-29 — Softer admin UI polish

- Reduced hard-edged admin chrome with softer shared panels, controls, tabs, and inputs.
- Removed terminal-style event status decoration from the admin event overview.
- Softened quick action cards and top navigation while keeping the editorial DevCon-Comm identity.
- Simplified the event overview so tabs stay in a consistent position across Overview/Talks/Speakers and the overview no longer repeats navigation as cards.
- Simplified talk review cards into a quieter list with muted metadata and one primary action.
- Redesigned archive event details as a quieter editorial list with restrained slide links and no terminal symbols.
- Added pagination to the public leaderboard table.

## 2026-05-29 — Kahoot-from-paper prototype

- Added an admin-only PDF upload endpoint for quiz sessions that validates PDF type/size, extracts text locally, and appends rule-based draft questions to the existing quiz flow.
- Added Quiz Builder UI for uploading a paper/resource PDF, choosing draft count, viewing generation status, and editing generated questions before opening the lobby.
- Added local PDF extraction dependency and documented the new quiz-generation API surface.

## 2026-05-29 — Community product hardening

- Reframed the Vue landing page as a community hub with CFP/live quiz actions, recent published talks, and top members.
- Added archive search and filters across event text, talk titles, topics, and speakers.
- Improved speaker slide workflow with visible deadlines, upload state, and organizer reminder logging.
- Added local QR-code generation to the live quiz lobby.
- Updated reputation tracking so new quiz participation increments event counts and answers add to user totals.
- Added all-time/monthly leaderboard modes and claimed-profile badges.
- Added same-origin prototype admin cookie auth with `/admin/login`, route redirects, logout, and server-side guards for organizer mutations.
- Added planning/status files for the autonomous community-product pass.

## 2026-05-29 — Stack migration foundation

- Added Satoshi + IBM Plex Mono typography direction and removed the old Lato/JetBrains Mono pairing.
- Introduced editorial UI primitives for page headers, panels, labels, inputs, and actions.
- Made top navigation role-aware and added event-level admin tabs for Overview/Talks/Speakers/Quiz/Live.
- Refined major public/admin surfaces toward a more cohesive editorial tech-conference look.
- Switched package management from npm lockfile to pnpm and added `pnpm-lock.yaml`.
- Added Vue 3 + Vite app shell under `src/` and restored the DEV::CON[] branded landing page with Lato/JetBrains Mono fonts.
- Added Hono API app and Bun production server under `server/` so the UI and `/api/*` run on one same-origin port.
- Ported public Vue routes for archive, event talks, leaderboard, CFP, My Talks, quiz join, and live player gameplay.
- Ported admin Vue routes for event management, event status, talks, speakers, quiz builder, and live quiz controls.
- Added matching Hono endpoints for event CRUD, speaker allowlists, CFP, talks/slides, leaderboard/account tools, quiz sessions/questions, join/state/answer.
- Updated TypeScript, Vite, Tailwind, and docs for the new migration target while keeping the legacy Next implementation as reference.

## 2026-05-01 — Docs sync to current app/api surface

- Updated architecture docs with current public/admin route inventory and complete API route list.
- Updated implementation docs to reflect active route-to-module mappings for CFP, speakers, talks/slides, and quiz workflows.
- Corrected API contract examples to current snake_case payloads (`/api/cfp`, `/api/quiz/join`, `/api/quiz/answer`).
- Added missing major endpoint coverage in docs: speaker management endpoints, quiz question `PATCH`/`DELETE`/`reorder`, and `/api/talks/[talkId]/upload`.

## 2026-03-23 — Initial index

- First scan of codebase; generated all 5 docs
- Project: DevCon-Comm (Next.js 14, JSON mock DB, quiz system)

---

_Future entries go above this line._
