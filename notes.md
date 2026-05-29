# Notes: DevCon-Comm Feature Completion Pass

## Current Stack
- Vue 3 + Vite frontend in `src/`
- Bun/Hono same-origin server in `server/`
- JSON mock DB in `data/*.json` through `lib/mock-db/*`
- pnpm package manager

## Community Pass Outcome
- Community landing hub now answers "what is happening next, how do I join, how do I contribute?"
- Archive supports search/filter by event, speaker, and topic.
- Member reputation has all-time/monthly modes, claimed badges, and quiz scoring now updates user totals.
- Speaker dashboard shows status, slide deadlines, uploaded state, and organizer reminder counts.
- Participation includes QR join in the live host lobby plus existing active play/final score affordances.
- Organizer operations now include slide reminder logging and guarded mutation endpoints.
- Admin routes and organizer mutations use same-origin prototype cookie auth.

## Implementation Constraints
- No Supabase credentials or production infra in this repo, so Supabase-specific auth/storage/realtime should remain simulated behind compatible boundaries.
- Mock JSON files are ignored by Git; seed script remains the reproducible source for sample state.
- Admin protection can be prototype-grade but must be server-enforced for mutation endpoints.

## Product Principle
- Lead with community energy and participation, not internal administration.
- Every home/public surface should make the next meaningful action obvious: attend, submit, browse, play, or claim reputation.
