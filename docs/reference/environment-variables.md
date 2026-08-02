# Environment Variables

Use `.env.local` for local development. Do not commit real credentials.

| Variable | Required | Browser-safe | Purpose |
|---|---:|---:|---|
| `VITE_SUPABASE_URL` | Optional locally | Yes | Supabase project URL used by browser and server helpers |
| `VITE_SUPABASE_ANON_KEY` | Optional locally | Yes | Public Supabase anon key for browser-safe operations |
| `VITE_API_BASE_URL` | No | Yes | Optional Worker origin used only when `VITE_FORCE_API_BASE_URL=true`; the Pages `_worker.js` proxy is preferred for organizer auth |
| `VITE_FORCE_API_BASE_URL` | No | Yes | Set to `true` only for public-read smoke tests that intentionally bypass the Pages `/api/*` proxy |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional locally, required for server Supabase writes | No | Server-only key for privileged Supabase operations |
| `APP_DATA_SOURCE` | Yes for organizer access and deployed Worker | No | Data-source mode for server helpers: use `supabase` for every organizer-capable runtime; use `local-json` only for public-only local work |
| `EVENT_TEST_MODE` | No | No | Temporary pre-launch switch. `true` prefixes every newly created event and public event submission with `[TEST]`; `false` or unset leaves new titles live. Invalid values fail event creation instead of silently creating live data. |
| `VITE_ADMIN_BASE_PATH` | No | Yes | Organizer route prefix; defaults to `/organizer-console` |
| `VITE_SHOW_ORGANIZER_LINK` | No | Yes | Public header visibility for the Organizer entry point; set to `false` to hide the button in production |
| `VITE_TURNSTILE_SITE_KEY` | Required for production public writes | Yes | Browser-safe Cloudflare Turnstile sitekey used by route feedback, event feedback, volunteer, registration, and CFP forms |
| `PUBLIC_APP_URL` | No | Yes | Absolute browser-facing app origin used for server-generated auth and public integration links; production is `https://em.devcongress.org` |
| `PUBLIC_FRONTEND_ORIGIN` | Required on Worker when Pages and Worker use different origins | Yes | Allowed browser origin for credentialed API CORS and state-changing request checks; production is `https://em.devcongress.org` |
| `PUBLIC_WEBSITE_ORIGIN` | Required for community submission email links | Yes | Public DevCongress website origin. Production uses `https://devcongress.org`; isolated preview deployments can point emails at the preview website. |
| `TURNSTILE_SECRET_KEY` | Required for production public writes | No | Server-only Cloudflare Turnstile secret used to validate every protected public submission |
| `TURNSTILE_EXPECTED_HOSTNAME` | Required in production | No | Strict hostname check for Turnstile verification; production uses `em.devcongress.org` |
| `EVENT_SUBMISSION_TURNSTILE_EXPECTED_HOSTNAMES` | Required for production community submissions | No | Comma-separated strict hostname allowlist for the `devcongress.org` submission widget, for example `devcongress.org,www.devcongress.org`; it does not weaken the `em.devcongress.org` check used by other forms |
| `ENABLE_PDF_QUIZ_UPLOADS` | No | No | Set to `true` only in runtimes that support the PDF parser. Leave unset on Cloudflare Workers for phase one. |
| `RESEND_API_KEY` | Required for transactional registration, community-submission, and speaker email sends | No | Server-only, sending-restricted Resend API key used by registration delivery, community submission receipts and decisions, and the authenticated speaker email batch endpoint. |
| `RESEND_BROADCASTS_API_KEY` | Required to send or schedule event blasts | No | Separate server-only Resend key restricted to Contacts, Segments, and Broadcasts. The app saves a friendly capacity state when it is missing or the provider rejects the send for plan/quota reasons. |
| `RESEND_WEBHOOK_SECRET` | Planned feature only | No | Server-only signing secret used to verify Resend delivery webhooks against the raw request body. |
| `SPEAKER_EMAIL_REPLY_TO` | Required for Archive Request email sends | No | Monitored DevCongress mailbox that receives replies; production is `hello@devcongress.org`. |
| `REGISTRATION_EMAIL_REPLY_TO` | Required for registration receipts and event blasts | No | Monitored mailbox for attendee replies; production is `hello@devcongress.org`. |
| `EVENT_EMAIL_REPLY_TO` | Required for community submission emails | No | Monitored mailbox for public event submitter replies. Falls back to `REGISTRATION_EMAIL_REPLY_TO` during migration. |
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
- Keep `APP_DATA_SOURCE=supabase`, `PUBLIC_APP_URL`, and `PUBLIC_FRONTEND_ORIGIN` in `wrangler.toml` for Cloudflare Worker deploys; dashboard-only Worker variables can be removed by subsequent `wrangler deploy` runs.
- Native creation is the only active event-creation path. Historical Luma metadata and attendance CSVs remain readable, but the app no longer fetches public Luma event pages.
- Use `EVENT_TEST_MODE=true` only for a controlled pre-launch test window. Run the documented dry-run and cleanup command before returning it to `false`; switching it off does not modify existing test records.
- Owners can use `/api/health/data-sources` to compare local and deployed persistence. The server falls back to `local-json` when local/dev runs omit `APP_DATA_SOURCE`, but the committed example selects `supabase` because organizer auth requires it. Matching `supabase.project_ref` values mean Supabase-backed domains are using the same project. Domains reported as `supabase-json` share the `app_json_documents` bridge table; domains reported as `local-json` still read from each runtime's local data files.
- Set `PUBLIC_FRONTEND_ORIGIN` on the Worker whenever the browser directly calls a different origin with `VITE_FORCE_API_BASE_URL=true`, otherwise credentialed API calls will be blocked by CORS.
- Rotate any real key that appears in git history, logs, screenshots, or public issues.
- Keep `.env.local` local and use deployment secret stores for hosted environments.
- Store `RESEND_API_KEY` and `RESEND_BROADCASTS_API_KEY` as separate Cloudflare Worker secrets; never expose either through a `VITE_` variable or commit them. `RESEND_WEBHOOK_SECRET` remains reserved for the future verified delivery-webhook route.
- Sender identities are code-owned in `lib/email/scenarios.ts`: attendee and event communications use `DevCongress Events <events@updates.devcongress.org>`, while all speaker communications use `DevCongress Speakers <speakers@updates.devcongress.org>`. Changing either identity requires updating the policy registry, its tests, the verified Resend domain, and ADR-037 rather than overriding a deployment variable.
- Point `SPEAKER_EMAIL_REPLY_TO` and `REGISTRATION_EMAIL_REPLY_TO` at mailboxes the DevCongress team actively monitors. Registration never falls back to the speaker-program identity.
- Keep `GOOGLE_MAPS_PLACES_API_KEY` server-only, restrict it to Places API (New), and store it in `.env.local` or the Cloudflare Worker secret store. The browser must never receive this key.
