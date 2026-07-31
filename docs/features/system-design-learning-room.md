# System Design Learning Rooms

## Status

Active organizer workflow built on the saved System Design artifact.

## Overview

Every meetup with a saved System Design source link can prepare a reusable set of five learning questions. The questions live on the existing System Design workspace beside the saved scenario and recap; they do not replace that artifact or move organizers into a second setup area.

Meetup completion does not close this capability. Past, current, and upcoming meetups can generate, review, and present their saved material. A live presentation is a temporary run of the persistent question set, not the lifecycle of the meetup itself.

A saved System Design source link also keeps the event's System Design tab available even if an older checklist record marked the monthly workflow unavailable. Persisted content is stronger evidence than that historical planning choice.

## Organizer Flow

1. Save a System Design scenario with a supported public Google Slides or Google Docs link.
2. Generate a five-question teaching sequence from the source.
3. Review and edit question wording, answers, order, timing, and reveal explanations on the same System Design page.
4. Open the separate presentation view in a new browser tab. The System Design workspace remains open in the original tab.
5. Share the QR code or join code and wait for anonymous attendees.
6. Start when the room is ready, release one question at a time, and reveal the answer and teaching explanation for discussion.
7. Finish the run. The saved scenario and five questions remain available for another presentation.

Opening a completed room starts a fresh run: old anonymous participants and responses for that room are cleared, while the saved questions remain unchanged. An already waiting or active run is resumed.

## Key Files

| File | Purpose |
|---|---|
| `src/views/admin/AdminSystemDesignView.vue` | Existing saved-artifact workspace and learning-room placement |
| `src/components/SystemDesignLearningRoomPanel.vue` | Question generation, review, editing, and presenter launch |
| `src/views/SystemDesignPresenterView.vue` | Standalone full-screen presenter experience with no admin chrome |
| `src/views/PlayCodeView.vue` | Anonymous attendee waiting and answer experience |
| `lib/mock-db/system-design-learning-room.ts` | Prepares a fresh presentation run without changing the questions |
| `server/app.ts` | Generation, presentation, join, release, reveal, and answer API routes |

## Current Constraints

- The first release uses exactly five questions.
- Source generation supports publicly readable Google Slides and Google Docs links.
- Live state uses polling rather than a production realtime channel.
- Anonymous responses from the previous run are cleared when a completed room starts again; historical run reporting is not yet retained.
- The standalone presenter route is organizer-protected even though it intentionally renders outside the admin shell. Facilitator mutations still require the HTTP-only organizer session.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```
