# Environment Variables

Use `.env.local` for local development. Do not commit real credentials.

| Variable | Required | Browser-safe | Purpose |
|---|---:|---:|---|
| `VITE_SUPABASE_URL` | Optional locally | Yes | Supabase project URL used by browser and server helpers |
| `VITE_SUPABASE_ANON_KEY` | Optional locally | Yes | Public Supabase anon key for browser-safe operations |
| `VITE_API_BASE_URL` | No | Yes | Optional Worker origin used only when `VITE_FORCE_API_BASE_URL=true`; the Pages `_worker.js` proxy is preferred for organizer auth |
| `VITE_FORCE_API_BASE_URL` | No | Yes | Set to `true` only for public-read smoke tests that intentionally bypass the Pages `/api/*` proxy |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional locally, required for server Supabase writes | No | Server-only key for privileged Supabase operations |
| `SUPABASE_DB_URL` | Required only for backups | No | Percent-encoded Session Pooler PostgreSQL URL used by `pnpm backup:supabase`; keep only in `.env.backup.local` or a secret store |
| `SUPABASE_BACKUP_DIR` | Required only for backups | No | Absolute private destination outside the repository for encrypted backup archives |
| `SUPABASE_BACKUP_AGE_RECIPIENT` | Required only for backups | No | Public `age` recipient used to encrypt backup archives; the corresponding identity must remain outside the repository |
| `SUPABASE_BACKUP_BUCKETS` | No | No | Comma-separated Storage buckets included in backups; defaults to `meetup-media` |
| `SUPABASE_BACKUP_STORAGE_CONCURRENCY` | No | No | Storage download concurrency from 1 through 16; defaults to 4 |
| `APP_DATA_SOURCE` | Yes for organizer access and deployed Worker | No | Data-source mode for server helpers: use `supabase` for every organizer-capable runtime; use `local-json` only for public-only local work |
| `PUBLIC_EVENT_SUBMISSIONS_ENABLED` | Required to accept public event proposals | No | Server-side launch gate for `POST /api/public/event-submissions`. Only an explicit `true` accepts submissions; missing, false, or invalid values return a stable unavailable response before validation, Turnstile, rate limits, email, or persistence. |
| `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED` | Required to list approved public submissions publicly | No | Fail-closed gate for promoted `public_submission` events in `GET /api/public/events`. Missing, false, or invalid values keep them out of devcongress.org while retaining them in the authenticated EMS preview. |
| `VITE_ADMIN_BASE_PATH` | No | Yes | Organizer route prefix; defaults to `/organizer-console` |
| `VITE_SHOW_ORGANIZER_LINK` | No | Yes | Public header visibility for the Organizer entry point; set to `false` to hide the button in production |
| `VITE_TURNSTILE_SITE_KEY` | Required for production public writes | Yes | Browser-safe Cloudflare Turnstile sitekey used by route feedback, event feedback, volunteer, registration, and CFP forms |
| `PUBLIC_APP_URL` | No | Yes | Absolute browser-facing app origin used for server-generated auth and public integration links; production is `https://em.devcongress.org` |
| `SHORT_LINK_PUBLIC_ORIGIN` | Required when short links are enabled | Yes | Public short-link origin shown to organizers; production is `https://go.devcongress.org`. |
| `SHORT_LINK_RESOLVER_TOKEN` | Required when short links are enabled | No | Shared high-entropy secret used only between the isolated `go.devcongress.org` Pages Function and the EMS internal short-link resolver. Store it as a secret in EMS and the short-link Pages project. |
| `EMS_RESOLVER_ORIGIN` | Required on the isolated short-link Pages project | No | EMS public origin used only for the authenticated server-to-server short-link resolver; production is `https://em.devcongress.org`. |
| `PUBLIC_APP_ORIGIN` | Required on the isolated short-link Pages project | No | The trusted EMS public origin used to turn a resolver path into the browser redirect; production is `https://em.devcongress.org`. |
| `PUBLIC_FRONTEND_ORIGIN` | Required on Worker when Pages and Worker use different origins | Yes | Allowed browser origin for credentialed API CORS and state-changing request checks; production is `https://em.devcongress.org` |
| `PUBLIC_WEBSITE_ORIGIN` | Required for community submission email links | Yes | Public DevCongress website origin. Production uses `https://devcongress.org`; isolated preview deployments can point emails at the preview website. |
| `TURNSTILE_SECRET_KEY` | Required for production public writes | No | Server-only Cloudflare Turnstile secret used to validate every protected public submission |
| `TURNSTILE_EXPECTED_HOSTNAME` | Required in production | No | Strict hostname check for Turnstile verification; production uses `em.devcongress.org` |
| `EVENT_SUBMISSION_TURNSTILE_EXPECTED_HOSTNAMES` | Required for production community submissions | No | Comma-separated strict hostname allowlist for the `devcongress.org` submission widget, for example `devcongress.org,www.devcongress.org`; it does not weaken the `em.devcongress.org` check used by other forms |
| `ENABLE_PDF_QUIZ_UPLOADS` | No | No | Set to `true` only in runtimes that support the PDF parser. Leave unset on Cloudflare Workers for phase one. |
| `RESEND_API_KEY` | Required for transactional registration, community-submission, and speaker email sends | No | Server-only, sending-restricted Resend API key used by registration delivery, community-listing decisions, and the authenticated speaker email batch endpoint. |
| `RESEND_DAILY_EMAIL_QUOTA` | No | No | Daily Resend plan limit used by the owner-only Audit Log capacity monitor. Defaults to 100 (Free plan) when omitted; update it if the plan changes. |
| `RESEND_MONTHLY_EMAIL_QUOTA` | No | No | Monthly Resend plan limit used by the owner-only Audit Log capacity monitor. Defaults to 3,000 (Free plan) when omitted; update it if the plan changes. |
| `RESEND_BROADCASTS_API_KEY` | Required to send or schedule event blasts | No | Separate server-only Resend key restricted to Contacts, Segments, and Broadcasts. The app saves a friendly capacity state when it is missing or the provider rejects the send for plan/quota reasons. |
| `RESEND_BLAST_TRANSACTIONAL_RESERVE` | No | No | Number of daily Resend sends reserved for registration and organizer-decision email before an immediate blast can send. Defaults to 35; values must be 0–99. |
| `RESEND_WEBHOOK_SECRET` | Planned outbound delivery feature only | No | Reserved server-only signing secret for a future Resend delivery webhook; it is separate from `RESEND_INBOUND_WEBHOOK_SECRET`. |
| `SPEAKER_EMAIL_REPLY_TO` | Required for Archive Request email sends | No | Monitored DevCongress mailbox that receives speaker replies; production is `hello@updates.devcongress.org`. |
| `REGISTRATION_EMAIL_REPLY_TO` | Required for registration receipts and event blasts | No | Monitored mailbox for attendee replies; production is `hello@updates.devcongress.org`. |
| `EVENT_EMAIL_REPLY_TO` | Required for community submission emails | No | Monitored mailbox for public event submitter replies. Falls back to `REGISTRATION_EMAIL_REPLY_TO` during migration. |
| `EVENT_SUBMISSION_REPLY_DOMAIN` | Required for EMS-routed submission replies | No | Resend receiving subdomain, production is `updates.devcongress.org`. Use a subdomain so the existing Zoho MX records for `devcongress.org` remain unchanged. |
| `EVENT_SUBMISSION_REPLY_TOKEN_SECRET` | Required for EMS-routed submission replies | No | Server-only HMAC secret used to create and verify submission-specific Reply-To addresses. Never expose or commit it. |
| `EVENT_SUBMISSION_MANAGEMENT_TOKEN_SECRET` | Required for approved community-listing amendment links | No | Server-only HMAC secret that signs the revocable no-login management links issued after a community event is approved. Never expose or commit it. |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Required for EMS-routed submission replies | No | Server-only Resend/Svix webhook signing secret used to verify the raw `email.received` payload before retrieval. |
| `SLACK_EVENT_SUBMISSION_WEBHOOK_URL` | Optional for submission alerts | No | Server-only Slack incoming webhook URL for the private submission/review channel. New submissions and email replies are posted there; EMS remains the source of truth if Slack is unavailable. |
| `SLACK_EVENTS_CHANNEL_WEBHOOK_URL` | Optional for event announcements | No | Server-only Slack incoming webhook URL for the `#events` channel. Published organizer-created and approved public-submission events are announced there; Slack remains best-effort. |
| `SLACK_EVENTS_RETRY_SECRET` | Required for scheduled Slack retries | No | Secret used only by the Worker scheduled trigger to authorize the internal retry drain. Set with `wrangler secret put SLACK_EVENTS_RETRY_SECRET`; do not expose it to the frontend. |
| `GOOGLE_MAPS_PLACES_API_KEY` | Required for organizer venue autocomplete | No | Server-only Google Maps Platform key restricted to Places API (New); venue predictions are proxied through the authenticated API and restricted to Ghana. |

## Rules

- Only variables prefixed with `VITE_` are exposed to browser code.
- Never prefix the Supabase service-role key with `VITE_`.
- Prefer the committed Cloudflare Pages `_worker.js` proxy for `/api/*` so organizer cookies stay on the Pages hostname.
- If `VITE_FORCE_API_BASE_URL=true`, keep `VITE_API_BASE_URL` pointed at the Worker origin only; do not include a trailing slash.
- `VITE_SHOW_ORGANIZER_LINK=false` only hides the public navigation button; it does not secure organizer routes.
- The browser sitekey and Worker secret must belong to the same Turnstile widget. Keep the secret server-only and verify the production hostname.
- The public website's Turnstile widget must cover every hostname in `EVENT_SUBMISSION_TURNSTILE_EXPECTED_HOSTNAMES`. Community submissions fail closed when this dedicated allowlist is missing in production; they never fall back to an unchecked hostname.
- Production public writes fail closed if Turnstile or the atomic Supabase rate-limit store is unavailable. Validate all public form actions after every key/widget change.
- Organizer auth requires `APP_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on every organizer-capable runtime. Missing configuration fails closed; no shared-password fallback exists.
- Google OAuth client credentials live in the Supabase dashboard provider settings, not in this app repo.
- Keep stable runtime configuration such as `APP_DATA_SOURCE=supabase`, `PUBLIC_APP_URL`, and `PUBLIC_FRONTEND_ORIGIN` in `wrangler.toml`. Launch gates may remain dashboard-managed because this project sets `keep_vars = true`, which preserves dashboard variables across subsequent Wrangler deploys.
- Keep `SHORT_LINK_RESOLVER_TOKEN` out of browser code and out of `wrangler.toml`; it is a secret in EMS and the short-link Pages project. `SHORT_LINK_PUBLIC_ORIGIN`, `EMS_RESOLVER_ORIGIN`, and `PUBLIC_APP_ORIGIN` are safe normal variables in their respective runtimes.
- Native creation is the only active event-creation path. Historical Luma metadata and attendance CSVs remain readable, but the app no longer fetches public Luma event pages.
- `EVENT_TEST_MODE` is retired for new event creation. Keep legacy `[TEST]` rows available to the cleanup workflow; use the independent public-submission intake and discovery gates to control dummy/public-beta records.
- Keep `PUBLIC_EVENT_SUBMISSIONS_ENABLED=false` or unset outside an approved beta or launch window. The website build gate controls discovery; this separate Worker runtime gate prevents direct API submissions when intake is closed.
- Keep `PUBLIC_EVENT_SUBMISSIONS_PUBLIC_DISCOVERY_ENABLED=false` or unset throughout private beta. Delete and verify all beta submissions and their promoted events before setting it to `true` for public launch.
- Owners can use `/api/health/data-sources` to compare local and deployed persistence. The server falls back to `local-json` when local/dev runs omit `APP_DATA_SOURCE`, but the committed example selects `supabase` because organizer auth requires it. Matching `supabase.project_ref` values mean Supabase-backed domains are using the same project. Domains reported as `supabase-json` share the `app_json_documents` bridge table; domains reported as `local-json` still read from each runtime's local data files.
- Set `PUBLIC_FRONTEND_ORIGIN` on the Worker whenever the browser directly calls a different origin with `VITE_FORCE_API_BASE_URL=true`, otherwise credentialed API calls will be blocked by CORS.
- Rotate any real key that appears in git history, logs, screenshots, or public issues.
- Keep `.env.local` local and use deployment secret stores for hosted environments.
- Store `RESEND_API_KEY` and `RESEND_BROADCASTS_API_KEY` as separate Cloudflare Worker secrets; never expose either through a `VITE_` variable or commit them. Store `EVENT_SUBMISSION_REPLY_TOKEN_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET`, `SLACK_EVENT_SUBMISSION_WEBHOOK_URL`, and `SLACK_EVENTS_CHANNEL_WEBHOOK_URL` as Worker secrets too.
- Sender identities are code-owned in `lib/email/scenarios.ts`: attendee and event communications use `DevCongress Events <events@updates.devcongress.org>`, while all speaker communications use `DevCongress Speakers <speakers@updates.devcongress.org>`. Changing either identity requires updating the policy registry, its tests, the verified Resend domain, and ADR-037 rather than overriding a deployment variable.
- Point `SPEAKER_EMAIL_REPLY_TO`, `REGISTRATION_EMAIL_REPLY_TO`, and `EVENT_EMAIL_REPLY_TO` at mailboxes the DevCongress team actively monitors. Production uses the `updates.devcongress.org` domain; registration never falls back to the speaker-program identity.
- Configure Resend receiving and the signed submission Reply-To variables together. If the signed routing pair is absent, community-submission emails retain the existing `EVENT_EMAIL_REPLY_TO` fallback and replies continue to land in that monitored mailbox.
- Keep `GOOGLE_MAPS_PLACES_API_KEY` server-only, restrict it to Places API (New), and store it in `.env.local` or the Cloudflare Worker secret store. The browser must never receive this key.
