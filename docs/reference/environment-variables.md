# Environment Variables

Use `.env.local` for local development. Do not commit real credentials.

| Variable | Required | Browser-safe | Purpose |
|---|---:|---:|---|
| `VITE_SUPABASE_URL` | Optional locally | Yes | Supabase project URL used by browser and server helpers |
| `VITE_SUPABASE_ANON_KEY` | Optional locally | Yes | Public Supabase anon key for browser-safe operations |
| `VITE_API_BASE_URL` | No | Yes | Optional Worker origin used only when `VITE_FORCE_API_BASE_URL=true`; the Pages `_worker.js` proxy is preferred for organizer auth |
| `VITE_FORCE_API_BASE_URL` | No | Yes | Set to `true` only for public-read smoke tests that intentionally bypass the Pages `/api/*` proxy |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional locally, required for server Supabase writes | No | Server-only key for privileged Supabase operations |
| `VITE_ADMIN_BASE_PATH` | No | Yes | Organizer route prefix; defaults to `/organizer-console` |
| `VITE_SHOW_ORGANIZER_LINK` | No | Yes | Public header visibility for the Organizer entry point; set to `false` to hide the button in production |
| `VITE_SHOW_FEEDBACK_BOT` | No | Yes | Public feedback launcher visibility; set to `false` to hide the route-aware feedback bot |
| `VITE_TURNSTILE_SITE_KEY` | No | Yes | Optional browser-safe Cloudflare Turnstile sitekey override used to render the route-feedback human check on the floating bot and `/feedback` page |
| `ADMIN_PASSWORD` | No | No | Local-development fallback organizer password when Supabase admin auth is not configured |
| `ADMIN_SESSION_SECRET` | No locally, yes for local fallback deployments | No | Secret used to sign the local fallback organizer cookie |
| `PUBLIC_APP_URL` | No | Yes | Absolute public app origin used for server-generated auth and public integration links |
| `PUBLIC_FRONTEND_ORIGIN` | Required on Worker when Pages and Worker use different origins | Yes | Allowed browser origin for credentialed API CORS, for example the Cloudflare Pages URL |
| `TURNSTILE_SECRET_KEY` | No | No | Server-only Cloudflare Turnstile secret used by `/api/feedback` to validate feedback-form tokens |
| `TURNSTILE_EXPECTED_HOSTNAME` | No | No | Optional strict hostname check for Turnstile verification, for example `events-management.pages.dev` in production |
| `ENABLE_PDF_QUIZ_UPLOADS` | No | No | Set to `true` only in runtimes that support the PDF parser. Leave unset on Cloudflare Workers for phase one. |

## Rules

- Only variables prefixed with `VITE_` are exposed to browser code.
- Never prefix the Supabase service-role key with `VITE_`.
- Prefer the committed Cloudflare Pages `_worker.js` proxy for `/api/*` so organizer cookies stay on the Pages hostname.
- If `VITE_FORCE_API_BASE_URL=true`, keep `VITE_API_BASE_URL` pointed at the Worker origin only; do not include a trailing slash.
- `VITE_SHOW_ORGANIZER_LINK=false` only hides the public navigation button; it does not secure organizer routes.
- `VITE_SHOW_FEEDBACK_BOT=false` hides only the floating launcher; `/feedback` remains directly reachable.
- Route-feedback Turnstile can use a baked-in public sitekey, but `TURNSTILE_SECRET_KEY` must stay server-only on the Worker.
- Hosted organizer auth requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on the API runtime; `ADMIN_PASSWORD` is only a fallback when Supabase admin auth is not configured.
- Google OAuth client credentials live in the Supabase dashboard provider settings, not in this app repo.
- Keep `PUBLIC_APP_URL` and `PUBLIC_FRONTEND_ORIGIN` in `wrangler.toml` for Cloudflare Worker deploys; dashboard-only Worker variables can be removed by subsequent `wrangler deploy` runs.
- Luma event import uses public Luma event URLs and does not require a Luma API key. Supabase community events are required for saving imports.
- Use `/api/health/data-sources` to compare local and deployed persistence. Matching `supabase.project_ref` values mean Supabase-backed domains are using the same project. Domains reported as `supabase-json` share the `app_json_documents` bridge table; domains reported as `local-json` still read from each runtime's local data files.
- Set `PUBLIC_FRONTEND_ORIGIN` on the Worker whenever the browser directly calls a different origin with `VITE_FORCE_API_BASE_URL=true`, otherwise credentialed API calls will be blocked by CORS.
- Rotate any real key that appears in git history, logs, screenshots, or public issues.
- Keep `.env.local` local and use deployment secret stores for hosted environments.
