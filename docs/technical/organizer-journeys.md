# Organizer browser regression suite

Run `pnpm build`, `pnpm exec playwright install chromium`, then `pnpm test:journeys`.

The suite loads the production Vue build in headless Chromium and interacts with real controls. A static Vite preview runs on reserved port 4189. No backend runs. Every API request is intercepted; unknown API requests fail the test, and external network requests are blocked. Each journey gets a fresh browser context, fixed clock, synthetic data, and Africa/Accra timezone. Turnstile is replaced at the browser boundary with a deterministic test token; this does not test Cloudflare verification.

## Scope and budget

- Assignee navigation shows that person's tasks across phases; direct work-plan entry uses the current phase.
- Volunteer navigation hides edition creation and avoids organizer event/edition reads.
- Project Night recurrence enables, skips with confirmation and pauses, with phone and desktop panel screenshots.
- Volunteer intake submits one request and shows confirmation.
- An email-provider failure preserves form values and allows a successful retry.
- Check-in is disabled before and after the event date; event-day interaction sends a mutation and updates the guest state.

CI allows three minutes for the eight browser scenarios, within the existing 15-minute job budget. Build and browser installation are outside that step. Locator waits are bounded at eight seconds. `results.json` includes individual timings; failed journeys retain full-page screenshots and Playwright traces, and the static server log is always retained. Artifacts expire after seven days. Open a failure trace with `pnpm exec playwright show-trace artifacts/organizer-journeys/<name>.zip`.

## Reliability backlog and evidence limits

These tests protect frontend behavior against deterministic API contracts. They do not prove backend authorization, database correctness, real OAuth, email delivery, or live Turnstile behavior; existing server tests remain necessary.

Next coverage candidates are real staging OAuth/session expiry, server-side permission denial, check-in at timezone midnight, volunteer submission retry/idempotency, and Slack/email queue recovery. Add cases when an incident or changed workflow supplies a concrete failure to prevent; do not inflate this smoke suite into exhaustive browser coverage. WebKit and Android browser differences remain unverified by this Chromium suite.
