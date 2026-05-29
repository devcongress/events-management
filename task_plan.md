# Task Plan: DevCon-Comm Feature Completion Pass

## Goal
Turn the migrated Vue/Bun prototype into a community-driven DevCongress hub: discovery, contribution, participation, reputation, and organizer operations, while keeping the current mock-DB stack stable, tested, and documented.

## Tickets
- [x] T1: Community product planning and parity audit
- [x] T2: Community landing hub: next event, open CFP, active quiz, recent talks, top members
- [x] T3: Public discovery: archive search/filter by event, speaker, topic
- [x] T4: Contribution loop: CFP discovery, speaker dashboard, slide upload/reminders
- [x] T5: Participation loop: quiz QR join, active play affordances, final results
- [x] T6: Reputation loop: leaderboard modes, claimed profile, player history
- [x] T7: Organizer operations: editable events, talks/speakers/slides dashboard, quiz builder polish
- [x] T8: Trust layer: prototype auth/session and server-side admin guards
- [x] T9: Validation hardening, tests, docs, and final commit

## Decisions Made
- Keep Vue/Vite + Bun/Hono + pnpm as the active migration target.
- Keep JSON flat-file mock DB for this pass; do not introduce Supabase yet.
- Prioritize community loops before organizer-only polish.
- Implement prototype auth with same-origin Hono cookies and server-side guards for admin mutations after community-facing flows are coherent.
- Preserve editorial direction: Satoshi for primary UI, IBM Plex Mono only for system labels/codes/status.

## Errors Encountered
- Archive search initially referenced `Talk.description`; corrected to the canonical `Talk.abstract`.
- Playwright was not installed in the workspace; added it and installed Chromium for visual smoke checks.

## Status
**Complete** - Community-facing discovery/contribution/participation/reputation loops are implemented, organizer mutations are session-guarded, and verification passed.
