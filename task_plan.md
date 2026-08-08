# Task Plan: Integrity, delivery, and performance hardening

## Goal

Implement the repository-controlled recommendations from the combined security, correctness, and performance review without changing already-applied migrations or performing remote deployment actions.

## Phases

- [x] Phase 1: Confirm scope, current architecture, and safe forward-only migration design.
- [x] Phase 2: Harden transactional invariants, finance receipt idempotency, and document-write conflict detection.
- [ ] Phase 3: Harden audit and delivery recovery boundaries plus webhook limits. (Webhook and public delivery latency complete; scheduled outbox recovery and audit atomicity remain.)
- [ ] Phase 4: Reduce proven attendance, feedback, polling, and duplicate-fetch waste. (Feedback fan-out and polling overlap complete; attendance and workspace deduplication remain.)
- [ ] Phase 5: Add regression coverage, refresh project docs, verify, and deliver.

## Key Questions

1. Which controls can be completed in code and migrations, versus requiring platform configuration or operational access?
2. How can compatibility document writes fail safely before incremental relational migrations are complete?
3. Which performance changes are structurally justified before production cardinality measurements are available?

## Decisions Made

- Use forward-only migrations exclusively; already-applied migration files remain unchanged.
- Treat platform MFA, alerting, retention, and live backup restoration as operational verification items, not assumptions the application code can satisfy.
- Prioritize transactional integrity and durable recovery before broad server or UI refactors.
- Use a document version compare-and-swap RPC as the immediate compatibility-store guardrail; a conflict must surface rather than silently overwrite a newer remote document.
- Preserve the existing delivery tables and build recovery around atomic database claims, rather than introducing a second outbox abstraction.
- Keep existing phase/task triggers, then add concurrency-safe database enforcement only where the current trigger/read-validate-write model is insufficient.

## Errors Encountered

- None.

## Status

**Currently in Phase 3** - narrowing webhook exposure and defining the delivery/audit recovery slice.
