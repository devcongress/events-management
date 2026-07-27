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
| `VITE_TURNSTILE_SITE_KEY` | No | Yes | Optional browser-safe Cloudflare Turnstile sitekey override used to render the route-feedback human check on the floating bot and `/feedback` page |
| `PUBLIC_APP_URL` | No | Yes | Absolute browser-facing app origin used for server-generated auth and public integration links; production is `https://em.devcongress.org` |
| `PUBLIC_FRONTEND_ORIGIN` | Required on Worker when Pages and Worker use different origins | Yes | Allowed browser origin for credentialed API CORS and state-changing request checks; production is `https://em.devcongress.org` |
| `TURNSTILE_SECRET_KEY` | No | No | Server-only Cloudflare Turnstile secret used by `/api/feedback` to validate feedback-form tokens |
| `TURNSTILE_EXPECTED_HOSTNAME` | No | No | Optional strict hostname check for Turnstile verification, for example `em.devcongress.org` in production |
| `ENABLE_PDF_QUIZ_UPLOADS` | No | No | Set to `true` only in runtimes that support the PDF parser. Leave unset on Cloudflare Workers for phase one. |
| `RESEND_API_KEY` | Planned feature only | No | Server-only Resend API key for future speaker-link transactional email. Do not add until the delivery feature is implemented. |

## Rules

- Only variables prefixed with `VITE_` are exposed to browser code.
- Never prefix the Supabase service-role key with `VITE_`.
- Prefer the committed Cloudflare Pages `_worker.js` proxy for `/api/*` so organizer cookies stay on the Pages hostname.
- If `VITE_FORCE_API_BASE_URL=true`, keep `VITE_API_BASE_URL` pointed at the Worker origin only; do not include a trailing slash.
- `VITE_SHOW_ORGANIZER_LINK=false` only hides the public navigation button; it does not secure organizer routes.
- Route-feedback Turnstile can use a baked-in public sitekey, but `TURNSTILE_SECRET_KEY` must stay server-only on the Worker.
- Organizer auth requires `APP_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` on every organizer-capable runtime. Missing configuration fails closed; no shared-password fallback exists.
- Google OAuth client credentials live in the Supabase dashboard provider settings, not in this app repo.
- Keep `APP_DATA_SOURCE=supabase`, `PUBLIC_APP_URL`, and `PUBLIC_FRONTEND_ORIGIN` in `wrangler.toml` for Cloudflare Worker deploys; dashboard-only Worker variables can be removed by subsequent `wrangler deploy` runs.
- Luma event import uses public Luma event URLs and does not require a Luma API key. Supabase community events are required for saving imports.
- Use `/api/health/data-sources` to compare local and deployed persistence. The server falls back to `local-json` when local/dev runs omit `APP_DATA_SOURCE`, but the committed example selects `supabase` because organizer auth requires it. Matching `supabase.project_ref` values mean Supabase-backed domains are using the same project. Domains reported as `supabase-json` share the `app_json_documents` bridge table; domains reported as `local-json` still read from each runtime's local data files.
- Set `PUBLIC_FRONTEND_ORIGIN` on the Worker whenever the browser directly calls a different origin with `VITE_FORCE_API_BASE_URL=true`, otherwise credentialed API calls will be blocked by CORS.
- Rotate any real key that appears in git history, logs, screenshots, or public issues.
- Keep `.env.local` local and use deployment secret stores for hosted environments.
- `RESEND_API_KEY` is reserved for the planned speaker-link email feature. When that feature is implemented, configure it as a Cloudflare Worker secret only; never expose it through a `VITE_` variable or commit it to the repository.
