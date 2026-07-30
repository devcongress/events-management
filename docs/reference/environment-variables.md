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
| `VITE_ADMIN_BASE_PATH` | No | Yes | Organizer route prefix; defaults to `/organizer-console` |
| `VITE_SHOW_ORGANIZER_LINK` | No | Yes | Public header visibility for the Organizer entry point; set to `false` to hide the button in production |
| `VITE_TURNSTILE_SITE_KEY` | Required for production public writes | Yes | Browser-safe Cloudflare Turnstile sitekey used by route feedback, event feedback, volunteer, registration, and CFP forms |
| `PUBLIC_APP_URL` | No | Yes | Absolute browser-facing app origin used for server-generated auth and public integration links; production is `https://em.devcongress.org` |
| `PUBLIC_FRONTEND_ORIGIN` | Required on Worker when Pages and Worker use different origins | Yes | Allowed browser origin for credentialed API CORS and state-changing request checks; production is `https://em.devcongress.org` |
| `TURNSTILE_SECRET_KEY` | Required for production public writes | No | Server-only Cloudflare Turnstile secret used to validate every protected public submission |
| `TURNSTILE_EXPECTED_HOSTNAME` | Required in production | No | Strict hostname check for Turnstile verification; production uses `em.devcongress.org` |
| `ENABLE_PDF_QUIZ_UPLOADS` | No | No | Set to `true` only in runtimes that support the PDF parser. Leave unset on Cloudflare Workers for phase one. |
| `RESEND_API_KEY` | Required for Archive Request email sends | No | Server-only, sending-restricted Resend API key used by the authenticated speaker email batch endpoint. |
| `RESEND_BROADCASTS_API_KEY` | Required to send or schedule event blasts | No | Separate server-only Resend key restricted to Contacts, Segments, and Broadcasts. The app saves a friendly capacity state when it is missing or the provider rejects the send for plan/quota reasons. |
| `RESEND_WEBHOOK_SECRET` | Planned feature only | No | Server-only signing secret used to verify Resend delivery webhooks against the raw request body. |
| `SPEAKER_EMAIL_FROM` | Required for Archive Request email sends | No | Approved monthly sender: `DevCongress Monthly Speakers <speakers@updates.devcongress.org>`. Reserve `DevCongress Conference Speakers` for the future annual-conference outreach flow. |
| `SPEAKER_EMAIL_REPLY_TO` | Required for Archive Request email sends | No | Monitored DevCongress mailbox that receives replies; production is `hello@devcongress.org`. |
| `REGISTRATION_EMAIL_FROM` | Required for registration receipts and event blasts | No | Approved attendee-facing sender: `DevCongress Events <events@updates.devcongress.org>`. It is deliberately independent from the speaker-program sender. |
| `REGISTRATION_EMAIL_REPLY_TO` | Required for registration receipts and event blasts | No | Monitored mailbox for attendee replies; production is `hello@devcongress.org`. |

## Rules

- Only variables prefixed with `VITE_` are exposed to browser code.
- Never prefix the Supabase service-role key with `VITE_`.
- Prefer the committed Cloudflare Pages `_worker.js` proxy for `/api/*` so organizer cookies stay on the Pages hostname.
- If `VITE_FORCE_API_BASE_URL=true`, keep `VITE_API_BASE_URL` pointed at the Worker origin only; do not include a trailing slash.
- `VITE_SHOW_ORGANIZER_LINK=false` only hides the public navigation button; it does not secure organizer routes.
- The browser sitekey and Worker secret must belong to the same Turnstile widget. Keep the secret server-only and verify the production hostname.
- Production public writes fail closed if Turnstile or the atomic Supabase rate-limit store is unavailable. Validate all public form actions after every key/widget change.
- Organizer auth requires `APP_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on every organizer-capable runtime. Missing configuration fails closed; no shared-password fallback exists.
- Google OAuth client credentials live in the Supabase dashboard provider settings, not in this app repo.
- Keep `APP_DATA_SOURCE=supabase`, `PUBLIC_APP_URL`, and `PUBLIC_FRONTEND_ORIGIN` in `wrangler.toml` for Cloudflare Worker deploys; dashboard-only Worker variables can be removed by subsequent `wrangler deploy` runs.
- Native creation is the only active event-creation path. Historical Luma metadata and attendance CSVs remain readable, but the app no longer fetches public Luma event pages.
- Owners can use `/api/health/data-sources` to compare local and deployed persistence. The server falls back to `local-json` when local/dev runs omit `APP_DATA_SOURCE`, but the committed example selects `supabase` because organizer auth requires it. Matching `supabase.project_ref` values mean Supabase-backed domains are using the same project. Domains reported as `supabase-json` share the `app_json_documents` bridge table; domains reported as `local-json` still read from each runtime's local data files.
- Set `PUBLIC_FRONTEND_ORIGIN` on the Worker whenever the browser directly calls a different origin with `VITE_FORCE_API_BASE_URL=true`, otherwise credentialed API calls will be blocked by CORS.
- Rotate any real key that appears in git history, logs, screenshots, or public issues.
- Keep `.env.local` local and use deployment secret stores for hosted environments.
- Store `RESEND_API_KEY` and `RESEND_BROADCASTS_API_KEY` as separate Cloudflare Worker secrets; never expose either through a `VITE_` variable or commit them. `RESEND_WEBHOOK_SECRET` remains reserved for the future verified delivery-webhook route.
- Keep `SPEAKER_EMAIL_FROM` on the verified Resend sending subdomain and point `SPEAKER_EMAIL_REPLY_TO` at a mailbox the DevCongress team actively monitors.
- Keep `REGISTRATION_EMAIL_FROM` on the same verified Resend sending subdomain, with the attendee-facing `DevCongress Events` identity. Registration never falls back to the speaker-program sender.
