# Migration Parity

Track the Next.js-to-Vue/Bun migration against user-visible product areas.

## Ported to active Vue/Hono

- Branded public shell and DEV::CON[] landing page
- Satoshi + IBM Plex Mono typography direction with editorial page primitives
- Role-aware top navigation and event-level admin tabs
- Public archive and event talk pages
- Public leaderboard and prototype account claim/merge tools
- CFP submission with speaker allowlist validation
- My Talks speaker lookup and slide URL update flow
- Quiz join and live player gameplay states
- Admin event list, create, detail, and status progression
- Admin talk review/status changes
- Admin speaker allowlist add/remove
- Admin quiz session creation, question builder, lobby, and live host controls
- Hono API parity for the above flows on the same origin

## Still intentionally legacy/reference

- Previous React/Next pages under `app/`, React components under `components/`, and hooks under `hooks/` remain as source-reference until the migration is fully hardened.
- File-upload mode for slides still uses the legacy Next route as reference; active Vue My Talks currently supports slide URL updates.
- The active Vue admin quiz builder is behavior-complete for basic CRUD/live flow, but does not yet reproduce every small UI affordance from the React version, such as drag-style question reordering.
