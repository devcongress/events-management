# Quiz

## Status

Preview.

## Overview

The quiz flow is a separate Kahoot-style ice-breaker for meetup days. It is not the System Design learning room.

The current implementation remains a preserved preview and is not part of the System Design learning-room workflow.

Its nickname, timed reveal, scoring, and leaderboard behavior remain separate from anonymous System Design participation.

## User Flows

- Organizer creates or edits quiz questions for an event.
- Organizer opens a quiz lobby.
- Attendees join through `/play/:code`.

## Key Files

| File | Purpose |
|---|---|
| `src/views/admin/AdminQuizView.vue` | Quiz builder and host controls |
| `src/views/PlayView.vue` | Public quiz landing and inactive-session state |
| `src/views/PlayCodeView.vue` | Player join/play experience |
| `lib/scoring.ts` | Points and streak-bonus calculations |
| `server/app.ts` | Quiz API routes |
| `server/quiz-state.ts` | Read-only state response and explicit phase-advance helper |
| `data/questions.json` | Local seeded questions |
| `data/quiz-sessions.json` | Local quiz sessions |

## Known Gaps

- Polling is used instead of WebSockets or Supabase Realtime.

## Testing

```bash
pnpm test
pnpm typecheck
```

Manual checks:

- Create questions from the organizer console.
- Open a lobby.
- Join from a second browser or private window.
- Answer questions and verify scoring behavior.
