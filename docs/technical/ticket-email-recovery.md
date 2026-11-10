# Admission email recovery runner

The standalone Bun process recovers the existing admission email outbox, including pending rows that have never been attempted. It uses the existing claim, dispatch lease, recipient policy, frozen payload, provider idempotency key and acknowledgement functions. Initial event-triggered sends remain in the app. Payment recovery and Broadcast preparation remain on the Worker queue.

## Configuration and deployment

Apply and verify the associated database migration before enabling the process. Provision a dedicated host and restricted service account; no host or service is installed by this repository. Install Bun, the application and its dependencies on that host. The example `deploy/systemd/ticket-email-recovery.service` is a template: adjust paths and user for the host, protect the environment file (for example root-owned with access limited to the service account), and use the platform's secret provisioning. Restrict database credentials to the functions and read access this process needs. Use the project's verified Supabase endpoint and certificate trust chain.

Supply these environment variables explicitly:

- `ADMISSION_RECOVERY_RUNNER_ENABLED=true` and `ADMISSION_RECOVERY_OWNER=postgres`.
- `ADMISSION_RECOVERY_DATABASE_URL`: PostgreSQL direct or session-pooler URL on port 5432 with `sslmode=require`, no other URL parameters. Transaction-pooling endpoints such as port 6543 cannot preserve the required verified session settings. TLS certificate verification is enabled.
- `ADMISSION_RECOVERY_EXPECTED_HOST`: exact database hostname, and `ADMISSION_RECOVERY_EXPECTED_PROJECT_REF`: project reference. Set `ADMISSION_RECOVERY_DATABASE_ROLE` to a dedicated login role granted only the required functions and three table reads; it defaults to `postgres` for existing staging configuration. The direct host must be `db.<ref>.supabase.co` with that role as the user; a Supabase pooler host must use `<role>.<ref>`. Provision and grant the role separately before production.
- `DEVCON26_ADMISSION_EMAILS_ENABLED=true`, `RESEND_API_KEY`, `DEVCON26_ADMISSION_EMAIL_FROM`, `DEVCON26_ADMISSION_EMAIL_REPLY_TO`, and `PUBLIC_WEBSITE_ORIGIN`.
- `PAYSTACK_SECRET_KEY` and/or `PAYSTACK_TEST_SECRET_KEY` when needed for the corresponding live/test ticket badge links. Use the same trusted values as the app.

The command is `pnpm ticket-email-recovery`; `--once` runs one bounded batch for a controlled smoke test and exits nonzero on failure. It disables Bun's automatic `.env` loading. The runner sends real emails unless its provider is injected by a test harness; use a safe isolated project and provider for smoke tests. It logs counts, failure streak, last successful batch and sleep duration, never recipient data or credentials. It sleeps up to five minutes when idle, wakes sooner for a future due item, and continues productive batches after one second when work remains due. If an empty batch is followed by past-due work, it retries after one second; consecutive no-progress polls back off exponentially to five minutes. Failed batches respect the database cooldown, while a parked queue with no eligible work sleeps for five minutes. SIGTERM/SIGINT stops new batches and lets the current bounded batch finish before closing the pool. The systemd stop grace exceeds SQL and provider timeouts.

## Ownership and rollback

After verifying the migration and runner configuration, coordinate cutover: set the Worker `ADMISSION_RECOVERY_OWNER=postgres` and start the runner. This stops admission queue seeding, drains already queued admission messages without sending, and disables the old automatic admission retry endpoints. Worker payment and Broadcast jobs continue. A missing or `queue` Worker value preserves legacy behavior; other values suppress automatic admission recovery to fail closed. The database dispatch lease still serializes senders during transition.

For rollback, stop the runner and wait for its current batch and lease to finish, then set the Worker owner back to `queue` (or remove it). Verify queue seeding and normal recovery before considering rollback complete. Do not roll back the database migration while a runner or old delivery code depends on its functions. Investigate repeated failure logs, provider configuration and database connectivity without logging payloads or secrets.
