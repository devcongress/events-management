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

The app can run with empty Supabase values for many local prototype flows because JSON mock data is still available. Supabase is required for features that use browser/server Supabase helpers.

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

Hosted organizer routes use Supabase Google OAuth and app-owned HTTP-only sessions. In local development, if Supabase admin auth is not configured, the login screen falls back to a shared password. Set these values in `.env.local` if you do not want defaults:

```bash
VITE_SHOW_ORGANIZER_LINK=true
ADMIN_PASSWORD=devcon-admin
ADMIN_SESSION_SECRET=replace-this-locally
```

Do not use development defaults in a public deployment. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for hosted admin auth, then bootstrap the first owner as described in [Admin Auth](../auth.md).
Set `VITE_SHOW_ORGANIZER_LINK=false` in public deployments when you want to hide the Organizer button from the public header. This is only a visibility toggle; organizer routes remain directly reachable and require auth.

## Common Troubleshooting

### Google sign-in returns to the wrong origin

In non-production, localhost requests use the current dev-server origin for browser-facing auth redirects, even when `PUBLIC_APP_URL` or `PUBLIC_FRONTEND_ORIGIN` points at a deployed Pages URL. If local Google sign-in still fails, make sure the Supabase redirect allowlist matches the port printed by Vite. For the default dev server, allow `http://localhost:5173/api/auth/admin/callback` and `http://localhost:5173/**`; if you run on port `3000`, add the same entries for `http://localhost:3000`.

### Supabase health checks fail

Check `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must not have a `VITE_` prefix.

### Organizer changes disappear

Run `pnpm seed` only when you intentionally want to reset local JSON data.

### Public meetup API shows fallback data

That is expected when Supabase community events are not configured. The server falls back to JSON event data for local development.

### Production start fails

Run `pnpm build` before `pnpm start`. The Bun server serves the `dist/` directory.
