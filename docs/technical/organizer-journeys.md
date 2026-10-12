# Organizer browser regression suite

Run `pnpm build`, `pnpm exec playwright install chromium`, then `pnpm test:journeys`.

The suite loads the production Vue build in headless Chromium and interacts with real controls. A static Vite preview runs on reserved port 4189. No backend runs. Every API request is intercepted; unknown API requests fail the test, and external network requests are blocked. Each journey gets a fresh browser context, fixed clock, synthetic data, and Africa/Accra timezone. Turnstile is replaced at the browser boundary with a deterministic test token; this does not test Cloudflare verification. Set `ORGANIZER_JOURNEYS_ARTIFACTS` to keep local screenshots and traces outside the repository's default artifact directory.

## Scope and budget

- Assignee navigation shows that person's tasks across phases; direct work-plan entry uses the current phase.
- Volunteer navigation hides edition creation and avoids organizer event/edition reads.
- At 320px, each teleported volunteer-review filter menu waits for placement styles to settle across animation frames, then verifies it remains within the visual viewport used by the dropdown positioning logic and keeps an operable scroll region; failures report measured panel, scroll-region, and viewport bounds. A delayed route scroll reset must not override user interaction while the menu is open. Option coverage scrolls before selecting an off-screen option.
- Project Night recurrence enables, skips with confirmation and pauses, with phone and desktop panel screenshots; its fixture also supplies the shared event-workspace checklist read.
- Volunteer intake submits one request and shows confirmation.
- An email-provider failure preserves form values and allows a successful retry.
- Check-in is disabled before and after the event date; event-day interaction sends a mutation and updates the guest state.

CI allows three minutes for the eight browser scenarios, within the existing 15-minute job budget. Build and browser installation are outside that step. Locator and controlled-save waits are bounded at eight seconds. `results.json` includes individual timings; failed journeys retain full-page screenshots and Playwright traces, and the static server log is always retained. Artifacts expire after seven days. Open a failure trace with `pnpm exec playwright show-trace artifacts/organizer-journeys/<name>.zip`.

The local pre-push hook runs `pnpm build` and `pnpm test:journeys` before migration verification only when the pushed range changes the journey-sensitive UI or API contract: `src/`, `server/routes/`, shared `lib/` or `types/`, this script, Vite/Tailwind/index configuration, or package manifests. Documentation, migrations, tests, and presentation assets alone do not run the browser suite. New remote refs are compared from commits not already reachable from that remote; existing refs use the exact remote-to-local range. If the remote base cannot be inspected locally, the hook stops with a fetch-and-retry error instead of guessing.

## Reliability backlog and evidence limits

These tests protect frontend behavior against deterministic API contracts. They do not prove backend authorization, database correctness, real OAuth, email delivery, or live Turnstile behavior; existing server tests remain necessary.

Next coverage candidates are real staging OAuth/session expiry, server-side permission denial, check-in at timezone midnight, volunteer submission retry/idempotency, and Slack/email queue recovery. Add cases when an incident or changed workflow supplies a concrete failure to prevent; do not inflate this smoke suite into exhaustive browser coverage. WebKit and Android browser differences remain unverified by this Chromium suite.
