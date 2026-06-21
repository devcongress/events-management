# Repository Migration Checklist

Use this checklist while moving active development from `Elvis020/devCon-comm` to `devcongress/events-management`.

The highest-risk pieces are the Cloudflare Pages repo connection, `PUBLIC_APP_URL`, Supabase Site URL, and Google OAuth origins. Those can make deploys look healthy while organizer login is broken.

## Current State

- [x] Added `git@github.com:devcongress/events-management.git` as the `events-management` remote.
- [x] Created `main` in `devcongress/events-management`.
- [x] Set the new repository default branch to `main`.
- [x] Removed the temporary `migration/events-management` branch.
- [x] Set this checkout's local Git author to `Elvis020 <spaceyel3@gmail.com>`.
- [x] Cloudflare GitHub App access to `devcongress/events-management` approved by a DevCongress org owner.

## Must Update

### GitHub Repo Links

- [x] Update the root README CI badge from `Elvis020/devCon-comm` to `devcongress/events-management`.
- [x] Search for remaining old GitHub repo links and update only the ones that describe the current repository home.

### Cloudflare Pages

- [x] Reconnect the existing Pages project to `devcongress/events-management`, or create a new Pages project from the new repo.
- [x] Keep build command as `pnpm build`.
- [x] Keep build output directory as `dist`.
- [ ] Deploy the repo changes through Cloudflare Pages so the Pages `_worker.js` proxy uses `https://events-management.admins-a7d.workers.dev`.
- [ ] Re-add or verify Pages environment variables:
  - [x] `VITE_SUPABASE_URL`
  - [x] `VITE_SUPABASE_ANON_KEY`
  - [ ] `VITE_ADMIN_BASE_PATH`
  - [ ] `VITE_SHOW_ORGANIZER_LINK`
  - [ ] `VITE_SHOW_FEEDBACK_BOT`
  - [ ] `VITE_TURNSTILE_SITE_KEY`, if overriding the baked-in key
- [ ] Confirm preview and production branch settings match the new repo flow.

### Cloudflare Worker

- [x] Decide whether to keep the Worker name `devcongress-comm-api` or rename it.
- [x] If the Pages URL changes, update `wrangler.toml`:
  - [x] `PUBLIC_APP_URL`
  - [x] `PUBLIC_FRONTEND_ORIGIN`
- [x] If the Worker URL changes, update `public/_worker.js`.
- [x] Deploy the Worker from the new repo or from this checkout after the repo move is complete.
- [x] Verify `/api/health/supabase` on the deployed origin.
- [x] Verify `/api/auth/session` reports the expected hosted auth mode.

### Cloudflare Secrets

- [ ] Reconfirm Worker secrets after moving or redeploying:
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `ADMIN_PASSWORD`
  - [ ] `ADMIN_SESSION_SECRET`
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
  - [ ] `TURNSTILE_SECRET_KEY`, if Turnstile is enabled
  - [ ] `TURNSTILE_EXPECTED_HOSTNAME`, if strict hostname checking is enabled
- [ ] Keep server-only secrets off Cloudflare Pages environment variables.

### Supabase Auth

- [ ] If the public app URL changes, update Supabase Site URL.
- [ ] If the public app URL changes, update Supabase redirect URLs.
- [ ] Confirm organizer login still returns through `/api/auth/admin/callback`.
- [ ] Confirm the Worker has `PUBLIC_APP_URL` pointing at the browser-facing Pages origin.

### Google OAuth

- [ ] If the Cloudflare Pages domain changes, update Google Cloud Authorized JavaScript origins.
- [ ] Keep the Supabase callback URI as the Google Authorized redirect URI.
- [ ] Run an organizer Google sign-in smoke test after Cloudflare and Supabase URL changes.

## Should Update

### Turnstile

- [x] If the hostname changes, update Cloudflare Turnstile allowed domains.
- [x] If strict hostname checking is enabled, update `TURNSTILE_EXPECTED_HOSTNAME`.
- [ ] Test the floating feedback bot or `/feedback` page after deployment.

### Docs

- [ ] Update `docs/deployment-cloudflare-supabase.md` with the final repo and Cloudflare project names.
- [ ] Update `docs/auth.md` if the production app URL or OAuth setup changes.
- [ ] Update `docs/reference/environment-variables.md` if required variables change.
- [x] Update README badges and deployment links.
- [ ] Update `docs/changelog.md` when migration milestones land.

### Git Local Setup

- [ ] Once the new repo is the real home, change `origin`:

```bash
git remote set-url origin git@github.com:devcongress/events-management.git
```

- [ ] After changing `origin`, verify:

```bash
git remote -v
git branch -vv
```

- [ ] Until then, keep `origin` as the old repo and push new-repo branches explicitly:

```bash
git push -u events-management feature/some-work
```

## Probably Optional

### Package Name

- [ ] Decide whether to rename `package.json` from `devcon-comm` to `events-management`.
- [ ] If renamed, check generated artifacts, lockfile metadata, deployment dashboards, and docs for name references.

## Final Verification

- [ ] New repo `main` receives CI runs.
- [x] Cloudflare Pages deploys from `devcongress/events-management`.
- [ ] Cloudflare Pages frontend can call same-origin `/api/*` through the new `events-management` Worker proxy.
- [x] `/api/health/supabase` passes.
- [x] `/api/auth/session` reports hosted Supabase auth when deployed.
- [ ] Organizer Google login works.
- [x] Public meetup API returns `200` from the final Cloudflare URL.
- [ ] Public meetup API contract verifier passes against the final Cloudflare URL:

```bash
PUBLIC_API_BASE_URL=https://events-management.pages.dev pnpm verify:public-api
```

- [x] Public pages load from the final Cloudflare URL.
- [ ] Feedback bot or `/feedback` can submit when Turnstile is configured.
- [ ] Old repo/deploy path is intentionally archived, redirected, or left as a known fallback.
