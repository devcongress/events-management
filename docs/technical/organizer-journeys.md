# Organizer browser regression suite

Run `pnpm build`, `pnpm exec playwright install chromium`, then `pnpm test:journeys`.

The suite loads the production Vue build in headless Chromium and interacts with real controls. A static Vite preview defaults to port 4189; set `ORGANIZER_JOURNEY_PORT` to an unused port when another checkout is running tests. Startup requires the spawned preview process to announce its own listening URL, ignoring terminal colors, before accepting an HTTP response, so an unrelated preview cannot silently supply the tested build. No backend runs. Every API request is intercepted; unknown API requests fail the test, and external network requests are blocked. Each journey gets a fresh browser context, fixed clock, synthetic data, and Africa/Accra timezone. Turnstile is replaced at the browser boundary with a deterministic test token; this does not test Cloudflare verification. Set `ORGANIZER_JOURNEYS_ARTIFACTS` to keep local screenshots and traces outside the repository's default artifact directory.

## Scope and budget

- Owner and organizer desktop navigation retains a horizontal row at 1024, 1280, 1440, 1592, and 1920px. Overflow destinations remain ordered inside an anchored More disclosure, with Escape, Tab, outside-click dismissal, and resize focus coverage; the 960px layout retains the full-width menu.
- Underline navigation checks preserve at least 44px targets, a close label-to-divider gap, and one 2px active indicator. Coverage includes Ticketing, Annual Conference/Registration sections, and Audit Log/event Registration at 768, 1024, and 1440px, including selection changes. Geometry assertions wait for the active indicator transition to finish.
- Assignee navigation shows that person's tasks across phases; direct work-plan entry uses the current phase.
- Volunteer navigation hides edition creation and avoids organizer event/edition reads.
- The shared phone shell covers Owner, assigned-volunteer, and delegated-volunteer destinations. Narrow viewport checks cover aligned controls, touch targets, More focus and dismissal, same-year deep links and browser history, and the return to desktop navigation. Owner presentation display remains reachable without a phone redirect.
- Phone subsection pickers preserve URL selection and browser Back, retain short tab rows when they fit, and keep dropdown options within the viewport. Desktop subsection rows retain their existing layout.
- At 320px, each teleported volunteer-review filter menu waits for placement styles to settle across animation frames, then verifies it remains within the visual viewport used by the dropdown positioning logic and keeps an operable scroll region; failures report measured panel, scroll-region, and viewport bounds. A delayed route scroll reset must not override user interaction while the menu is open. Option coverage scrolls before selecting an off-screen option.
- Speakers filters wait for fonts and two layout frames after viewport changes before enforcing the unchanged 44px target and viewport-containment checks at 320, 375, 390, and 430px. Both speaker roles exercise Approved, Rejected, and Pending filters, drawer permissions, and pagination; desktop table checks remain at 768 and 1440px. Failures include filter identity and measured geometry.
- Phone speaker previews exercise the shared recipient picker, pointer-open and keyboard-open Escape behavior, frozen-preview selection, and viewport containment at narrow and short sizes. Delivery cards expose status, attempts, timestamps, and errors without requiring a drawer visit.
- Phone Programme journeys expand the relevant session before editing. The focused refinement case checks retained drafts, mixed validation errors in different collapsed rows, add/reorder/remove behavior, and conference menu dismissal and focus return.
- Project Night recurrence enables, skips with confirmation and pauses, with phone and desktop panel screenshots; its fixture also supplies the shared event-workspace checklist read.
- Volunteer intake submits one request and shows confirmation.
- An email-provider failure preserves form values and allows a successful retry.
- Check-in is disabled before and after the event date; event-day interaction sends a mutation and updates the guest state.

CI allows five minutes for the browser suite, within the existing 15-minute job budget. The runner logs each journey start and completion with elapsed time so a timeout identifies the active scenario. Build and the Playwright image pull are outside that step. Locator and controlled-save waits are bounded at eight seconds. At suite completion, `results.json` includes individual timings and the static server log is written; failed journeys retain full-page screenshots and Playwright traces. A forced job timeout can prevent those final files from being written, so use the console progress to identify the last active journey. Artifacts expire after seven days. Open a failure trace with `pnpm exec playwright show-trace artifacts/organizer-journeys/<name>.zip`.

CI uses the version-matched, digest-pinned Playwright Noble image for the checks job; update its tag, digest, and expected version together when changing the locked Playwright version. The image includes browser dependencies, avoiding per-run apt installation, while image pull time still counts against the job budget.

The local pre-push hook runs `pnpm build` and `pnpm test:journeys` before migration verification only when the pushed range changes the journey-sensitive UI or API contract: `src/`, `server/routes/`, shared `lib/` or `types/`, this script, Vite/Tailwind/index configuration, or package manifests. Documentation, migrations, tests, and presentation assets alone do not run the browser suite. New remote refs are compared from commits not already reachable from that remote; existing refs use the exact remote-to-local range. If the remote base cannot be inspected locally, the hook stops with a fetch-and-retry error instead of guessing.

## Reliability backlog and evidence limits

These tests protect frontend behavior against deterministic API contracts. They do not prove backend authorization, database correctness, real OAuth, email delivery, or live Turnstile behavior; existing server tests remain necessary.

Next coverage candidates are real staging OAuth/session expiry, server-side permission denial, check-in at timezone midnight, volunteer submission retry/idempotency, and Slack/email queue recovery. Add cases when an incident or changed workflow supplies a concrete failure to prevent; do not inflate this smoke suite into exhaustive browser coverage. WebKit and Android browser differences remain unverified by this Chromium suite.

## Focused runs

Set `ORGANIZER_JOURNEY_FILTER` to a journey-name substring to run a focused local check against the built app. For the full-height conference phase bar regression:

```bash
pnpm build
ORGANIZER_JOURNEY_FILTER=work-plan-sticky-header pnpm test:journeys
```

The normal command still runs every journey. The scroll regression checks organizer and volunteer layouts at 1024px and 1440px, verifies that navigation does not cover the phase controls, and keeps board headings below the controls at multiple scroll positions.
