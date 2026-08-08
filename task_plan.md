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
