# Hardening Delivery Checklist

## Correctness and security

- [x] Use forward-only migrations only.
- [x] Add compare-and-swap protection to shared JSON documents.
- [x] Move shared user, attendance, and checklist mutations onto guarded updates.
- [x] Require idempotency keys for income receipts.
- [x] Make active-owner, role/grant, phase, and task-dependency invariants database-enforced.
- [x] Snapshot feedback question definitions with each response and freeze question sets after responses begin.
- [x] Narrow inbound webhook bodies before signature verification.
- [ ] Make mutation and admin-audit records atomic or queue audit records transactionally.

## Delivery and performance

- [x] Return public registration success before email-provider completion.
- [x] Keep community-submission delivery in the Worker lifetime.
- [ ] Add durable outbox claiming, leases, scheduled recovery, and reconciliation.
- [x] Batch monthly feedback data reads.
- [x] Prevent overlapping/background quiz polling.
- [x] Serve attendance summaries and repeat-attendee insights without raw historic CSV records.
- [x] Consolidate duplicate event-workspace reads through TanStack Query.
- [ ] Reduce finance mutation pre-read/refetch work without weakening audit/concurrency rules.

## Verification and operations

- [x] Full unit and integration suite passes.
- [x] Typecheck and production build pass.
- [ ] Apply the two new forward-only migrations.
- [ ] Verify production SQL/RLS, MFA, alert delivery, backup restore, retention, and deployed commit/schema version.
- [ ] Record production query counts, response sizes, latency, and Worker CPU before tuning further.

This document will record the implemented integrity, delivery, performance, and verification changes at completion.
