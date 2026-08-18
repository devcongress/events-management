# System Design Learning Rooms

## Status

Active organizer workflow built on the saved System Design artifact.

## Overview

Every meetup has one System Design session brief: title, one or more facilitators, a docs URL, and a description. Its questions live on the existing System Design workspace beside that brief; they do not replace it or move organizers into a second setup area.

At the end of the event day in the event timezone (falling back to Africa/Accra), the brief and questions become read-only. The archive publishes the brief, docs link, questions, correct answers, and explanations, never participant identities, answers, or scores.

A saved System Design source link also keeps the event's System Design tab available even if an older checklist record marked the monthly workflow unavailable. Persisted content is stronger evidence than that historical planning choice.

Removing that saved System Design session removes its linked learning room as well, including any live presentation, questions, responses, and room participants. A later System Design brief starts with a new empty learning room; it cannot inherit the removed room's state.

## Organizer Flow

1. Save the System Design brief with its docs URL and comma-separated facilitators.
2. Generate up to ten questions over the lifetime of the session, or add unlimited manual questions. Generated questions append only and never replace authored ones.
3. Review each multiple-choice question, its ideal-answer explanation, difficulty, category, and answer timer. The set stays editable through the event day and locks automatically when the event-day archive begins.
4. Open the separate presentation view in a new browser tab as soon as the room has a question. The System Design workspace remains open in the original tab.
5. Share the QR code or join code. Every attendee immediately receives a default room name and fixed Navii avatar, and may edit the name on their phone while the lobby is open.
6. Show each question to the presenter first. That action automatically begins a three-second shared runway on every screen; attendee phones receive no choices until the runway ends and then begin that question's configured answer timer together. The facilitator can then reveal the answer and teaching explanation or skip the question. Skips discard attempts and may be reopened fresh before the room ends.
7. Finish the run. The presenter shows the final leaderboard, while each phone shows only that participant's Navii avatar, room name, and position. Top-five participants receive a reduced-motion-safe confetti celebration.
8. The saved scenario and five questions remain available for another presentation.

Opening a completed room starts a fresh run: old participant labels and responses for that room are cleared, while the saved questions remain unchanged. An already waiting or active run is resumed.

The QR code opens the public standalone `/learn/system-design/:code` attendee page. That route accepts only System Design learning-room codes, never requires an organizer session, and never renders organizer navigation; only the separate presenter and facilitator controls remain protected. Joining immediately creates a validated, unique default room name and fixed avatar. The attendee may keep or edit that name before the facilitator starts; no account is created and the organizer has no naming-mode setting. PostgreSQL reserves normalized names per room, so simultaneous joins and edits cannot produce labels that differ only by case. Generated-name collisions retry automatically; an edited duplicate remains on the phone with a clear conflict message.

Every participant receives a deterministic Navii avatar tied to their session participant record, not to the room or their display-name text. While people vote, the presenter sees only neutral completion progress so the shared screen cannot steer late choices. After reveal, the summary switches to four compact vertical columns showing the option, number of people, and percentage; the correct answer is distinguished with the System Design yellow accent. The chart does not render or return an unbounded respondent list.

Before answers open, the presenter alone can see the prepared question while attendee state withholds its text and choices. Showing it creates one server-owned timestamp three seconds ahead, giving polling clients a shared runway; both views derive their countdown from that timestamp, then count down from the question's own configured limit. Direct session-detail reads are organizer-only, so attendee devices cannot bypass the private-presenter state. The final presenter board shows each participant's correct answers out of the authored total beside their points, with a legend explaining speed-weighted points and correct-streak bonuses.

At completion, the authenticated presenter receives the top-ten final leaderboard. Each attendee request receives only that attendee's own final standing, so their phone can show their avatar, name, and position without exposing the rest of the leaderboard. Confetti runs once for positions one through five and becomes a static celebratory treatment when reduced motion is enabled.

When a question timer reaches zero, the phone removes the answer controls and shows a clear **Time's up** state while it waits for the facilitator to reveal the answer. Late-answer failures remain question-level feedback and never replace the room with an unavailable-room error.

## Key Files

| File | Purpose |
|---|---|
| `src/views/admin/AdminSystemDesignView.vue` | Existing saved-artifact workspace and learning-room placement |
| `src/components/SystemDesignLearningRoomPanel.vue` | Question generation, review, editing, and presenter launch |
| `src/views/SystemDesignPresenterView.vue` | Standalone full-screen presenter experience with no admin chrome |
| `src/views/SystemDesignParticipantView.vue` | Public account-free attendee naming, waiting, answering, and reveal experience |
| `src/components/NaviiAvatar.vue` | Local deterministic participant avatars rendered from session participant IDs |
| `src/components/CelebrationConfetti.vue` | Top-five phone celebration with a reduced-motion fallback |
| `src/system-design-participant-route.ts` | Dedicated public route and QR destination helper |
| `lib/system-design-participant-identity.ts` | Display-name validation and unique default-name generation |
| `lib/mock-db/quiz-participants.ts` | Relational hosted participant repository with atomic local fallback |
| `supabase/migrations/20260801000000_quiz_participants.sql` | Participant backfill and room-scoped uniqueness constraints |
| `lib/mock-db/quiz-sessions.ts`, `questions.ts`, `responses.ts` | Relational hosted runtime repositories with local JSON fallbacks |
| `supabase/migrations/20260801010000_relational_quiz_runtime.sql` | Session/question/response backfill, constraints, atomic transitions, scoring, and aggregate state |
| `supabase/migrations/20260817010000_system_design_presenter_gate.sql` | Presenter-only question state and server-owned delayed answer start |
| `supabase/migrations/20260818010000_system_design_automatic_question_start.sql` | Automatic presenter-and-attendee shared runway for every question |
| `lib/mock-db/system-design-learning-room.ts` | Prepares a fresh presentation run without changing the questions |
| `server/app.ts` | Generation, presentation, join, release, reveal, and answer API routes |

## Current Constraints

- Generated questions are capped at ten per session lifetime; deleting one does not restore the generation allowance. Manual questions are unlimited.
- End-of-day archival is server-enforced for brief and question mutations; it is the only lock boundary for the System Design session.
- Removing a pre-archive System Design session is destructive: it deletes the linked learning-room runtime and its cascaded room data, rather than retaining orphaned questions or a live presentation.
- Source generation supports publicly readable Google Slides and Google Docs links.
- Live state uses polling rather than a production realtime channel.
- Room-scoped participant identities and responses from the previous run are cleared when a completed room starts again; historical run reporting is not yet retained.
- Edited display names are labels chosen by attendees, not verified real-world identities.
- Participant-specific state and answer submission require the random device identifier that created the participant; a public participant or user ID alone cannot read personal results or submit an answer.
- Join and answer payloads use the public 64 KiB limit and distributed rate-limit buckets. The limits are deliberately sized for many attendees sharing one venue network.
- The presenter leaderboard is capped at ten visible participants; attendee phones receive only their own standing.
- Hosted answer acceptance and scoring are one PostgreSQL transaction. One response per user/question, room phase, deadline, participant membership, score, and streak are checked together even when requests reach different Worker isolates.
- Presenter reset, private presentation, timer start, reveal, and question ordering are database-owned transitions. Aggregate chart and leaderboard data are computed in PostgreSQL; direct anonymous Realtime table access remains disabled until participant-scoped authorization exists.
- The standalone presenter route is organizer-protected even though it intentionally renders outside the admin shell. Facilitator mutations still require the HTTP-only organizer session.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```
