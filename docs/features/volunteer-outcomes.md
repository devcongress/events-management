# Volunteer selection decisions and outcome email delivery

Volunteer review status (`unreviewed`, `reviewed`, `needs_follow_up`) remains independent from the selection decision (`pending`, `accepted`, `not_selected`). Reviewers with `volunteers.review_applications` may save all three review fields together using an expected decision version. Saving never sends an email. The reviewer response contains only an outcome sent/not-sent indicator; campaign operations and detailed delivery diagnostics remain Owner-only.

## Owner-controlled sends

The Owner chooses Accepted or Not selected and requests a preview. The server stores a ten-minute cohort snapshot containing eligible recipient IDs, decision versions, and the exact personalized payload to send. The preview shows production-rendered sample HTML/text, eligible/excluded counts, and the complete frozen recipient list (name, email, and decision version) in a keyboard-scrollable disclosure. The sample is labelled so it cannot be mistaken for every personalized message. Confirmation revalidates the complete eligible cohort and versions and queues only that snapshot in one transaction. A stale preview fails instead of expanding or silently replacing its audience. Reconfirming a completed preview does not enqueue duplicates. Pending decisions are never eligible.

Outcome emails have separate pause/resume controls from the invitation campaign. Confirmation is the only path that queues them; saving a decision or review does not. A decision cannot change after any outcome attempt, provider acceptance, or ambiguous send; same-decision note/status edits remain allowed and do not change the decision version.

## Delivery safety

Outcome history is durable and version-specific. Payload and provider sender fields are frozen with the preview and retried with one stable idempotency key. The outcome worker shares the invitation lease and transactional daily counter, so 54 is a combined daily claim maximum, not a per-stream allowance; both streams respect the 35-message reserve and require complete, fresh quota observations. Claims validate the lease, current decision/version, and claim token before provider calls and again on finalization. Expired `sending` claims are included in drain discovery; inside the safe provider window they can be reclaimed with the same key, while claims past the 23-hour bound move to Owner attention. Webhook events are journaled/replayed against the durable delivery record.

Definite provider rate limits and transient failures use bounded backoff with the same key. Network errors, malformed successful provider responses, and server errors are treated as ambiguous: the attempted decision remains locked, and the same payload/key may be retried only within the provider's safe window and attempt limit. Otherwise the Owner sees needs-attention diagnostics. The campaign diagnostics list is scrollable and does not silently truncate later recipients. No automatic opposite-outcome email or conflict resolution is introduced.

## Key files

- Migration: `supabase/migrations/20260923120000_volunteer_outcome_decisions.sql`
- API, drain, and provider events: `server/routes/volunteer-follow-up.ts`
- Supabase RPC wrappers: `lib/supabase/volunteer-follow-up.ts`
- Production template: `lib/email/templates/volunteer-follow-up.ts`
- Owner campaign UI: `src/components/VolunteerOutcomeCampaignPanel.vue`
- Reviewer decision UI: `src/components/VolunteerReviewsPanel.vue`
- Disposable Postgres runtime checks: `scripts/test-volunteer-outcomes.mjs`

The migration is required before enabling this feature in any environment. `scripts/test-volunteer-outcomes.mjs` is intentionally restricted to the named disposable local database. This implementation did not send live emails, apply a production migration, or deploy.
