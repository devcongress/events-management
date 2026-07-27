# Feature Completion Summary

## Completed
- Rebuilt the home page as a community hub: featured event/CFP, live quiz entry, recent archive talks, and top members.
- Added archive discovery filters for year, search text, topic, and speaker.
- Strengthened speaker contribution flow with slide deadlines, upload state, and organizer reminder logging.
- Added local QR-code join support to the live quiz host lobby.
- Made quiz participation feed reputation by updating user event counts and total points.
- Added all-time/monthly leaderboard modes and claimed-profile indicators.
- Added prototype same-origin admin auth with `/admin/login`, route redirects, logout, and server-side guards on organizer mutations.
- Updated docs, ADRs, and changelog for the community-product pass.

## Verification
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Playwright browser smoke: `/`, `/archive`, `/leaderboard`, `/admin/login`
- Server auth tests: protected organizer access fails closed when Supabase is incomplete, and configured Google sessions are recognized without a password fallback

## Known Prototype Boundaries
- Organizer auth now requires Supabase Google OAuth, an active `admin_memberships` entry, and an app-owned HTTP-only session; there is no shared-password fallback.
- Slide upload remains URL-based in the active Vue/Hono path; file storage still belongs to the legacy reference/Supabase future path.
- JSON mock data remains the active persistence layer until the Supabase migration.
