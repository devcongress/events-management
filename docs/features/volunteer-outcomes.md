# Volunteer selection decisions and outcome email delivery

Volunteer review status (`unreviewed`, `reviewed`, `needs_follow_up`) remains independent from the selection decision (`pending`, `accepted`, `not_selected`). Reviewers with `volunteers.review_applications` may save all three review fields together using an expected decision version. Saving never sends an email. The reviewer response contains only an outcome sent/not-sent indicator; campaign operations and detailed delivery diagnostics remain Owner-only.

## Owner-controlled sends

The Owner chooses Accepted or Not selected and requests a preview. The server stores a ten-minute cohort snapshot containing eligible recipient IDs, decision versions, and the exact personalized payload to send. The preview shows production-rendered sample HTML/text, eligible/excluded counts, and the complete frozen recipient list (name, email, and decision version) in a keyboard-scrollable disclosure. The sample is labelled so it cannot be mistaken for every personalized message. Confirmation revalidates the complete eligible cohort and versions and queues only that snapshot in one transaction. A stale preview fails instead of expanding or silently replacing its audience. Reconfirming a completed preview does not enqueue duplicates. Pending decisions are never eligible.

Outcome emails have separate pause/resume controls from the invitation campaign. Confirmation is the only path that queues them; saving a decision or review does not. A decision cannot change after any outcome attempt, provider acceptance, or ambiguous send; same-decision note/status edits remain allowed and do not change the decision version.

## Delivery safety

Outcome history is durable and version-specific. Payload and provider sender fields are frozen with the preview and retried with one stable idempotency key. The outcome worker shares the invitation lease and transactional daily counter, so 54 is a combined daily claim maximum, not a per-stream allowance; both streams respect the 35-message reserve and require complete, fresh quota observations. Pre-send quota observations come from Resend's read-only usage endpoint and accept only non-negative safe-integer daily/monthly `used` values; plan limit fields are not used for this guard. Claims validate the lease, current decision/version, and claim token before provider calls and again on finalization. Expired `sending` claims are included in drain discovery; inside the safe provider window they can be reclaimed with the same key, while claims past the 23-hour bound move to Owner attention. Webhook events are journaled/replayed against the durable delivery record.

Definite provider rate limits and transient failures use bounded backoff with the same key. Network errors, malformed successful provider responses, and server errors are treated as ambiguous: the attempted decision remains locked, and the same payload/key may be retried only within the provider's safe window and attempt limit. Otherwise the Owner sees needs-attention diagnostics. The campaign diagnostics list is scrollable and does not silently truncate later recipients. No automatic opposite-outcome email or conflict resolution is introduced.

## Failed-delivery retry and diagnostics

Owners can queue—not send—one failed invitation or outcome again only when Resend definitely rejected it before acceptance, it has no provider ID or webhook event, has no live claim or scheduled automatic retry, is below four attempts, and remains inside the original 23-hour idempotency window. Invitation retries also require an unsubmitted, deadline-eligible application inside the 14-day response window; outcome retries require the current decision/version and the frozen payload. The atomic database operation keeps the original payload, idempotency key, attempt count, and first-attempt timestamp; repeated or concurrent clicks queue no duplicate work.

Provider HTTP status, failure certainty, stage, and timestamp are stored separately from a sanitized message. Owner diagnostics distinguish EMS request/account checks, provider rejection, uncertain result, and provider event without claiming a bounce proves the root cause. Accepted, delivered, bounced, complained, suppressed, historical, and ambiguous records are never manually resent. Invitation pause state and outcome pause state remain independent: a queue action while its own queue is paused waits for a separate Owner resume and never changes campaign controls.

The Owner campaign view shows a safe contextual sender status beside progress and controls. It maps only recognized invitation/outcome drain results, always shows the recorded scheduler timestamp when available, gives Draft/Paused/Closed state precedence, and marks older or non-running results as historical. Raw provider or arbitrary scheduler strings never reach the UI. An accepted provider batch remains accepted even when its post-send response lacks quota headers; the next pre-send usage read controls whether additional work can start.

The scheduled worker gives this queue an isolated invocation every 15 minutes. One invocation processes one invitation or outcome queue only, retaining the existing lease, capacity, retry, and idempotency rules. When outcomes are due while invitations are running, deterministic 15-minute windows reserve every other invocation for outcomes; the 54/day campaign limit still applies. Pre-send failures record and emit only a safe drain stage plus `resource_limit` or `internal` category, never provider payloads, database messages, links, or recipient details.

## Key files

- Migration: `supabase/migrations/20260923120000_volunteer_outcome_decisions.sql`
- Retry diagnostics migration: `supabase/migrations/20260928120000_volunteer_delivery_retry_diagnostics.sql`
- API, drain, and provider events: `server/routes/volunteer-follow-up.ts`
- Supabase RPC wrappers: `lib/supabase/volunteer-follow-up.ts`
- Production template: `lib/email/templates/volunteer-follow-up.ts`
- Owner campaign UI: `src/components/VolunteerOutcomeCampaignPanel.vue`
- Reviewer decision UI: `src/components/VolunteerReviewsPanel.vue`
- Disposable Postgres runtime checks: `scripts/test-volunteer-outcomes.mjs`

The migration is required before enabling this feature in any environment. `scripts/test-volunteer-outcomes.mjs` is intentionally restricted to the named disposable local database. This implementation did not send live emails, apply a production migration, or deploy.
