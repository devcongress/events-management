# Task Plan: Archive material follow-up

## Goal

Let an Owner request missing archive materials from a presenter through a secure, one-time link that updates the existing archive record.

## Phases

- [x] Phase 1: Confirm current link, archive, email, and owner-role boundaries.
- [x] Phase 2: Add durable link metadata and delivery support.
- [x] Phase 3: Build the Owner workflow and presenter update form.
- [x] Phase 4: Add regression coverage, documentation, and verification.

## Key Questions

1. How can a new form be bound to an existing Talk without permitting a duplicate record?
2. How can only the requested fields be updated?
3. How do Owner-only issuance and public one-time completion remain enforced server-side?

## Decisions Made

- Reuse the existing private-link table and cryptographic claim/consume lifecycle, with a new `archive_materials_follow_up` purpose plus a `talk_id` binding.
- Preserve the current public route, but give the form a purpose-specific update contract that never creates a Talk.
- Send one transactional Resend message immediately, record provider acceptance/failure on the link, and show it in the organizer drawer.

## Errors Encountered

- A malformed read-only shell query was rejected before execution; reran it with safe quoting.

## Status

**Complete** - ready for the forward-only migration and normal feature-release workflow.

---

# Task Plan: Separate monthly and conference Calls for Speakers

## Goal

Ship one secure, shared speaker-call foundation with two clearly separate public forms, organizer review queues, short URLs, and communications.

## Phases

- [x] Phase 1: Confirm the monthly CFP, existing private speaker links, annual-conference boundaries, and public-site constraints.
- [x] Phase 2: Add forward-only campaign/proposal persistence and the server-side public/admin contracts.
- [x] Phase 3: Build the shared short proposal form, separate monthly and conference public routes, and isolated organizer queues.
- [x] Phase 4: Add delivery/notification hooks, tests, documentation, verification, and release handoff.

## Key Questions

1. How do monthly and conference calls share lifecycle code without mixing review records or URLs?
2. Which proposal information is essential at first submission, and which belongs in a secure selected-speaker follow-up?
3. How do public submission, review, and email/Slack notifications remain scoped, rate-limited, and auditable?

## Decisions Made

- A call has exactly one parent: one monthly Event or one Annual Conference edition. The public route decides the scope; presenters never choose it.
- Initial submission is intentionally short: name, email, title, and session summary; topic defaults to General and demo selection is lightweight.
- Monthly review stays inside the event Talks workspace. Conference review lives inside Annual Conference, never in a combined inbox.
- Existing monthly CFP links remain compatible while short canonical routes are added.
- The shared proposal, selected-speaker link, and public archive lifecycle is currently event-bound. An Annual Conference edition does not yet have an Event association.

## Status

**Complete** - ready for the normal feature-release workflow. The selected-presenter secure link now collects the fuller bio/resource details omitted from the short first form; the existing Owner-only archive-material follow-up is retained for later missing-material reminders.
