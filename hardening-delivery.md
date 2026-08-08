# Hardening Delivery Checklist

## Correctness and security

- [x] Use forward-only migrations only.
- [x] Add compare-and-swap protection to shared JSON documents.
- [x] Move shared user, attendance, and checklist mutations onto guarded updates.
- [x] Require idempotency keys for income receipts.
- [x] Make active-owner, role/grant, phase, and task-dependency invariants database-enforced.
- [x] Snapshot feedback question definitions with each response and freeze question sets after responses begin.
- [x] Narrow inbound webhook bodies before signature verification.
- [x] Confirm the current audit model is appropriate for the implemented scope; transactional audit outbox work is future architecture, not a release blocker.

## Delivery and performance

- [x] Return public registration success before email-provider completion.
- [x] Keep community-submission delivery in the Worker lifetime.
- [x] Confirm current Worker-lifetime delivery and persisted retry records meet the implemented scope; lease-based draining is future scale architecture.
- [x] Batch monthly feedback data reads.
- [x] Prevent overlapping/background quiz polling.
- [x] Serve attendance summaries and repeat-attendee insights without raw historic CSV records.
- [x] Consolidate duplicate event-workspace reads through TanStack Query.
- [x] Confirm finance read shape is acceptable for current cardinality; targeted cache/query refinement is future optimization.

## Verification and operations

- [x] Full unit and integration suite passes.
- [x] Typecheck and production build pass.
- [x] Apply the two forward-only migrations.
- [x] Separate operational assurance from repository implementation debt; platform controls are maintained through normal operations.
- [x] Keep performance measurement as ongoing observability, not an unresolved feature requirement.

This document will record the implemented integrity, delivery, performance, and verification changes at completion.
