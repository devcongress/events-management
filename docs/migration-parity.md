# Migration Parity

Track the Next.js-to-Vue/Bun migration against user-visible product areas.

## Ported to active Vue/Hono

- Branded public shell and DEV::CON[] landing page
- Satoshi + IBM Plex Mono typography direction with editorial page primitives
- Role-aware top navigation and event-level admin tabs
- Public archive and event talk pages
- CFP submission with speaker allowlist validation
- Private selected-speaker/archive intake links for slide and talk-detail collection
- System Design learning-room join and live participant states
- Admin event list, create, detail, and status progression
- Admin talk review/status changes
- Admin speaker allowlist add/remove
- System Design learning-room question authoring, lobby, and presenter controls
- Hono API parity for the above flows on the same origin

## Still intentionally legacy/reference

- Previous React/Next pages under `app/`, React components under `components/`, and hooks under `hooks/` remain as source-reference until the migration is fully hardened.
- File-upload mode for slides still uses the legacy Next route as reference; active Vue speaker intake links currently support slide URL updates.
- The retained System Design learning-room workflow is documented separately in `docs/features/system-design-learning-room.md`.
