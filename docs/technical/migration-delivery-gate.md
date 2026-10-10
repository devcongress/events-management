# Migration delivery gate

Migration verification is a delivery check, not an EMS screen or a migration runner. It never applies SQL, repairs history, invokes application RPCs, starts a payment, or reads customer records.

## Commands and local hook

| Command | Scope |
|---|---|
| `pnpm verify:migrations:offline` | Validate SQL hashes, contract coverage, and migration-version collisions without credentials |
| `pnpm verify:migrations` | Offline validation plus read-only verification of the configured Supabase target |
| `pnpm verify:migrations --revision "$(git rev-parse HEAD)"` | Verify SQL and contract blobs from the actual committed revision |
| `pnpm hooks:install` | Enable repository-local pre-push verification while composing existing pre-commit/pre-push hooks |
| `pnpm hooks:uninstall` | Remove only this repository's hook override; leave previous hook files untouched |
| `pnpm deploy:worker` | Verify the required target schema before invoking Wrangler |

Hook installation is explicit, not a package-install lifecycle side effect. Installation refuses an existing unrelated local hooksPath or unsupported inherited hooks. The current global identity-doctor pre-commit hook is delegated unchanged. Reinstall after moving the checkout or changing the inherited hook directory.

Before a normal push or `feature-this` delivery, commit the intended gate inputs and run verification against HEAD. The hook refuses dirty migration/gate inputs and non-HEAD pushes; unrelated dirty presentation files are allowed. Deletion-only pushes do not need schema verification. Git hooks are locally bypassable, so CI and deployment checks remain necessary. Do not silently bypass a failed gate.

## Configuration and safety

Install `psql` and keep a percent-encoded Supabase direct or Session Pooler connection URL in `SUPABASE_SCHEMA_AUDIT_DB_URL`. Set `VITE_SUPABASE_URL` to the matching project. Use a dedicated catalog-only login for CI; do not give it application-table writes or use a service-role/backup credential. Creating or granting that role is a separately approved database operation.

For local use, copy `.env.schema-audit.example` to ignored `.env.schema-audit.local` and set its file mode to `600`. Existing shell variables take precedence. Local checks may fall back to the existing `SUPABASE_DB_URL` in `.env.local`; CI deliberately does not. CI also does not load local env files.

Connections force TLS and project identity matching. Credentials are passed through child-process environment variables, never CLI arguments. Fixed catalog-only SQL runs inside an explicit `BEGIN READ ONLY` transaction with bounded statement/connection/process timeouts and ends with `ROLLBACK`. Raw driver errors, URLs, credentials, catalog dumps, and function bodies are not printed. Missing credentials, unavailable database/client, malformed contracts, or schema mismatches all return a nonzero exit status.

## CI/CD boundary

- PR and main CI run the offline contract check, focused tests as part of Vitest, script typechecking, and lint without database credentials.
- The full-history Gitleaks scan retains all default rules. Its rule-specific exception requires both the exact contract path and a complete timestamped-SQL-to-SHA-256 inventory row; the offline gate independently validates those hashes. Other credential-shaped lines in the same file and identical rows elsewhere remain scanned.
- `Supabase schema verification` runs the live check only on main pushes or a manual dispatch on main. Configure the `production-schema-audit` GitHub Environment with `SUPABASE_SCHEMA_AUDIT_DB_URL` and `VITE_SUPABASE_URL`, and restrict it to main with appropriate approval rules. No live credentials are provided to PR/fork code, `pull_request_target`, or feature-ref dispatches.
- Missing environment secrets fail the live check; an offline pass is never described as target-database verification.
- The repository currently has no GitHub deployment job. A main-push live check is post-merge, not a pre-merge live PR gate. The manual Worker deploy command is guarded, but Cloudflare's independently configured automatic deployments are **not** blocked merely by adding this workflow. Before claiming CI/CD enforcement there, configure the actual deployment path to wait for successful checks or route deployment through a job that depends on schema verification. Hosting configuration, environment secrets, and branch-protection settings are not changed by this source implementation.

## Coverage and adding migrations

`supabase/migration-verification-contract.json` pins all 98 current SQL files. Six migrations have explicit checks: feedback archive, registration waitlist promotion, public registration description, task-board ordering, task dependency cleanup, and test-checkout coupons. The 92 older files are a frozen hash inventory, **not proof they were applied fully**. A successful gate verifies the required contracts, not every historical backfill or all application behavior.

Checks cover column types/nullability/defaults, index and constraint definitions/validity, table RLS and effective public privileges, exact function overload/body/return-type/language/security/search-path/privileges, and enabled trigger binding to the correct function schema. This catches partial schema changes where an object name exists but its required definition does not.

For each new migration:

1. Use a unique timestamp and a forward-only SQL file. Do not rename/replay old migrations to work around duplicate historical versions.
2. Add a `verified` entry with the file's exact SHA-256 and nonempty reviewed typed checks. Generate hashes with `shasum -a 256 supabase/migrations/<file>.sql`; function body hashes use `functionDigest` on the content between its dollar-quote delimiters. Do not put new files in the legacy exemption.
3. Check all user-facing requirements, including security and any data invariants. Only known catalog probe types are supported; a data-only migration must extend the verifier with a separately reviewed, read-only typed invariant rather than arbitrary SQL. Catalog checks cannot prove arbitrary backfills or historical execution.
4. When a later migration intentionally replaces a definition, update the expected final-state contract and tests in the same change, documenting supersession. Never treat an intentional replacement as a reason to skip verification.
5. Run the offline checks/tests; apply the migration through a separately approved database rollout; run live verification before pushing/deploying.

The two exact historical duplicate-version pairs are tolerated only for inventory validation: `20260616000000_admin_auth.sql` / `20260616000000_luma_event_imports.sql`, and `20260808150000_archive_materials_follow_up.sql` / `20260808150000_integrity_hardening.sql`. New collisions fail. This does not make a blanket Supabase CLI push safe.

The target has no Supabase migration-history table. The gate reports that fact and does not invent execution timestamps. Hosted extra fixes in `claim_event_slack_announcement` and `hard_delete_community_event` remain outside the six body contracts; reconcile them through forward changes before broadening coverage. Nothing is replayed automatically.
