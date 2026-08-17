# Local Development

This guide gets DevCongress Community running locally and explains the files most contributors touch first.

## Prerequisites

- Node.js 20 or newer
- pnpm 10 or newer
- Bun 1.1 or newer for `pnpm start`
- Git

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm seed
pnpm dev
```

The dev server runs Vite and the Hono API on the same origin at `http://localhost:5173`. `pnpm dev` explicitly selects the Supabase data source and refuses to move to another port, so local launchers can discover one stable organizer-capable entry point from `package.json`.

## Environment Variables

The server falls back to JSON mock data when local/dev runs omit `APP_DATA_SOURCE`, even when Supabase credentials exist in `.env.local`. The committed example selects `APP_DATA_SOURCE=supabase` because organizer access now uses Supabase in every environment; choose `local-json` only for public-only local work where organizer routes are not needed.

See [Environment Variables](../reference/environment-variables.md) for the full table.

For local Turnstile flows, use Cloudflare's published dummy sitekey and matching dummy secret rather than adding `localhost` or `127.0.0.1` to the production widget. Application HMAC and internal-request secrets must be at least 32 random bytes; generate a local value with:

```bash
openssl rand -base64 32
```

Keep generated values only in `.env.local`. A missing or weak secret fails its protected workflow closed.

## Seed Data

```bash
pnpm seed
```

The seed script resets JSON mock data under `data/`. Use it when you want a known local state after testing organizer actions.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the Supabase-backed Vite and same-origin Hono API on strict port `5173` |
| `pnpm atlas` | Start the local-only Scenario Atlas on `127.0.0.1:4178` |
| `pnpm atlas:test` | Validate Atlas catalog completeness, status propagation, and production isolation |
| `pnpm seed` | Reset JSON mock data |
| `pnpm cleanup:test-events` | Preview hosted submissions and events marked with `[TEST]`; deletion requires the documented explicit confirmation |
| `pnpm cleanup:private-beta-events` | Preview every closed-beta public submission and promoted event; use only before public launch and require the documented private-beta confirmation to delete |
| `pnpm typecheck` | Run `vue-tsc --noEmit` |
| `pnpm build` | Typecheck and build production assets |
| `pnpm start` | Serve `dist/` and `/api/*` with Bun |
| `pnpm test` | Run Vitest tests |
| `pnpm verify:public-api` | Validate public meetup API shape and headers |

### Scenario Atlas

Scenario Atlas is a separate local companion, not an EMS route. `pnpm atlas` creates mutable run state in ignored `.scenario-atlas/atlas.sqlite`; workflow definitions remain reviewable in `tools/scenario-atlas/catalog/workflows.json`. The process refuses production/Cloudflare environments and accepts mutations only from its own loopback origin.

## Organizer Login

Organizer routes use Supabase Google OAuth and app-owned HTTP-only sessions in every environment. Set these values in `.env.local`:

```bash
APP_DATA_SOURCE=supabase
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SHOW_ORGANIZER_LINK=true
```

Bootstrap the first owner as described in [Admin Auth](../auth.md). There is no local password fallback; incomplete Supabase configuration produces a visible configuration error and does not grant organizer access.
Set `VITE_SHOW_ORGANIZER_LINK=false` in public deployments when you want to hide the Organizer button from the public header. This is only a visibility toggle; organizer routes remain directly reachable and require auth.

## Common Troubleshooting

### The local app shows an enormous logo with no layout

The application has mounted, but Vite's generated development styles were blocked. Current local responses allow Vite's inline bootstrap and style elements only in `NODE_ENV=development`; production keeps the strict CSP. Restart `pnpm dev` after updating so the server picks up the corrected response policy.

### Google sign-in returns to the wrong origin

Local Google sign-in is intentionally pinned to `http://localhost:5173`. If you open the app on `127.0.0.1`, `localhost` with another port, or any other local origin, the login screen now blocks OAuth and tells you to restart on `http://localhost:5173` instead of letting Supabase fall back to the deployed Site URL.

Keep the Supabase and Google OAuth allowlists focused on the canonical local origin:

- `http://localhost:5173`
- `http://localhost:5173/api/auth/admin/callback`

### Supabase health checks fail

Local/dev runs intentionally use JSON unless `APP_DATA_SOURCE=supabase` is set. If you are testing deployed-style Supabase locally, check `APP_DATA_SOURCE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must not have a `VITE_` prefix.

### Organizer changes disappear

Run `pnpm seed` only when you intentionally want to reset local JSON data.

### Archive Request email says sending is not configured

Cloudflare Worker secrets are not available to `pnpm dev`. Add `RESEND_API_KEY` plus the relevant `SPEAKER_EMAIL_REPLY_TO` or `REGISTRATION_EMAIL_REPLY_TO` mailbox to `.env.local`, then restart Vite. Sender identities are code-owned in `lib/email/scenarios.ts`. Keep the API key server-only without a `VITE_` prefix, and never commit its value.

### Public meetup API shows fallback data

That is expected in local/dev mode. The server uses JSON event data unless `APP_DATA_SOURCE=supabase` is set with valid Supabase credentials.

### Production start fails

Run `pnpm build` before `pnpm start`. The Bun server serves the `dist/` directory.
