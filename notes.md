# Notes: Integrity, delivery, and performance hardening

## Confirmed starting points

- All Annual Conference migrations are already applied; migration application is not part of this task.
- Annual Conference finance lifecycle RPCs already lock the target entry and enforce receipt totals atomically.
- Annual Conference phase/task validation exists in database triggers, while dependency graph validation is application-side and not atomic across concurrent edits.
- Registration and event-submission delivery have durable pending/accepted/failed records, but no scheduled claim/lease recovery executor.
- Admin audit writes are best effort after mutations and log failures rather than coupling them to mutation success.
- Existing delivery records are durable but are selected and updated without a claim/lease, so concurrent workers can dispatch the same pending record.
- Phase overlap and task-date validation already run in PostgreSQL triggers. Dependency graph validation, membership/grant transitions, and compatibility JSON writes remain non-atomic across concurrent requests.

## Scope boundary

- Implement repository-controlled code, migration, test, and documentation changes.
- Record platform-only controls such as owner MFA, alerts, retention, deployed commit/schema evidence, and backup restore verification as operational gates.
