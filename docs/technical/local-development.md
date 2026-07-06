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

The dev server runs Vite and the Hono API on the same origin. Open the local URL printed by Vite, usually `http://localhost:5173`.

## Environment Variables

The app defaults to JSON mock data in local/dev runs, even when Supabase credentials exist in `.env.local`. Leave `APP_DATA_SOURCE` unset locally unless you are intentionally testing deployed-style Supabase persistence.

See [Environment Variables](../reference/environment-variables.md) for the full table.

## Seed Data

```bash
pnpm seed
```

The seed script resets JSON mock data under `data/`. Use it when you want a known local state after testing organizer actions.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start Vite and same-origin Hono API |
| `pnpm seed` | Reset JSON mock data |
| `pnpm typecheck` | Run `vue-tsc --noEmit` |
| `pnpm build` | Typecheck and build production assets |
| `pnpm start` | Serve `dist/` and `/api/*` with Bun |
| `pnpm test` | Run Vitest tests |
| `pnpm verify:public-api` | Validate public meetup API shape and headers |

## Organizer Login

Hosted organizer routes use Supabase Google OAuth and app-owned HTTP-only sessions. In local development, the login screen falls back to a shared password unless you explicitly set `APP_DATA_SOURCE=supabase`. Set these values in `.env.local` if you do not want defaults:

```bash
VITE_SHOW_ORGANIZER_LINK=true
ADMIN_PASSWORD=devcon-admin
ADMIN_SESSION_SECRET=replace-this-locally
```

Do not use development defaults in a public deployment. Configure `APP_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for hosted admin auth, then bootstrap the first owner as described in [Admin Auth](../auth.md).
Set `VITE_SHOW_ORGANIZER_LINK=false` in public deployments when you want to hide the Organizer button from the public header. This is only a visibility toggle; organizer routes remain directly reachable and require auth.

## Common Troubleshooting

### Google sign-in returns to the wrong origin

Local Google sign-in is intentionally pinned to `http://localhost:5173`. If you open the app on `127.0.0.1`, `localhost` with another port, or any other local origin, the login screen now blocks OAuth and tells you to restart on `http://localhost:5173` instead of letting Supabase fall back to the deployed Site URL.

Keep the Supabase and Google OAuth allowlists focused on the canonical local origin:

- `http://localhost:5173`
- `http://localhost:5173/api/auth/admin/callback`

### Supabase health checks fail

Local/dev runs intentionally use JSON unless `APP_DATA_SOURCE=supabase` is set. If you are testing deployed-style Supabase locally, check `APP_DATA_SOURCE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must not have a `VITE_` prefix.

### Organizer changes disappear

Run `pnpm seed` only when you intentionally want to reset local JSON data.

### Public meetup API shows fallback data

That is expected in local/dev mode. The server uses JSON event data unless `APP_DATA_SOURCE=supabase` is set with valid Supabase credentials.

### Production start fails

Run `pnpm build` before `pnpm start`. The Bun server serves the `dist/` directory.
