# Archive material follow-up delivery

Implemented an Owner-only, one-time presenter follow-up for missing archive materials.

- New private link purpose: `archive_materials_follow_up`.
- Link is scoped to one existing Talk and a validated set of requested fields.
- Presenter submission updates only that Talk and preserves its status.
- Delivery state, retryable failure, expiry, and completion are shown in the organizer archive preview.
- Required migration: `20260808150000_archive_materials_follow_up.sql`.

Verification: full suite (91 files, 428 tests), TypeScript typecheck, production build, and diff check.
