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
| `ADMIN_PASSWORD` | No locally, yes for deployments | No | Prototype organizer login password |
| `ADMIN_SESSION_SECRET` | No locally, yes for deployments | No | Prototype organizer cookie/session secret |
| `PUBLIC_APP_URL` | No | No | Absolute base URL used in API payloads when request origin is unavailable |
| `PUBLIC_FRONTEND_ORIGIN` | Required on Worker when Pages and Worker use different origins | No | Allowed browser origin for credentialed API CORS, for example the Cloudflare Pages URL |
| `ENABLE_PDF_QUIZ_UPLOADS` | No | No | Set to `true` only in runtimes that support the PDF parser. Leave unset on Cloudflare Workers for phase one. |

## Rules

- Only variables prefixed with `VITE_` are exposed to browser code.
- Never prefix the Supabase service-role key with `VITE_`.
- Prefer the committed Cloudflare Pages `_worker.js` proxy for `/api/*` so organizer cookies stay on the Pages hostname.
- If `VITE_FORCE_API_BASE_URL=true`, keep `VITE_API_BASE_URL` pointed at the Worker origin only; do not include a trailing slash.
- `VITE_SHOW_ORGANIZER_LINK=false` only hides the public navigation button; it does not secure organizer routes.
- `VITE_SHOW_FEEDBACK_BOT=false` hides only the floating launcher; `/feedback` remains directly reachable.
- Set `PUBLIC_FRONTEND_ORIGIN` on the Worker whenever the browser directly calls a different origin with `VITE_FORCE_API_BASE_URL=true`, otherwise credentialed API calls will be blocked by CORS.
- Rotate any real key that appears in git history, logs, screenshots, or public issues.
- Keep `.env.local` local and use deployment secret stores for hosted environments.
