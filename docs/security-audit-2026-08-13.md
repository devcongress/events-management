# Security Audit — 2026-08-13

**Audited baseline:** `47cb5a3a3002c359a99fd633a6e857c99be7a9b3` (`main`)

**Hardening implementation:** `feature/security-audit-hardening` (verification recorded before commit)

**Production target:** `https://em.devcongress.org`

**Framework:** [OWASP Top 10:2025](https://owasp.org/Top10/)

## Executive result

The newly added workflows have strong security foundations: organizer APIs deny by default, delegated conference permissions are rechecked server-side, sensitive Supabase tables are RLS-protected and service-role-only, public writes use bounded schemas plus distributed limits and Turnstile, capability links are signed and revocable, inbound email verifies the raw Svix signature, and server-side credentials were not found in Git history or the browser build.

The source hardening is ready for security sign-off: both medium findings and all four low findings were remediated on `feature/security-audit-hardening`, with regression coverage. No public API route, response DTO, persistence source, or integration origin was changed.

Production sign-off remains conditional on deploying the verified revision, applying migration `20260813010000_security_audit_privilege_hardening.sql`, confirming the four protected shared secrets meet the 32-byte minimum, and rerunning the live perimeter/database checks. Those are deployment-verification requirements, not unresolved source vulnerabilities.

No critical or high-severity vulnerability was confirmed. Isolated staging DAST, authenticated role/object tests, and deployed-SHA/schema-version proof remain assurance gaps.

## Scope and evidence

This review covered the 272-file delta since the 2026-08-03 audit, including annual/monthly finance, delegated conference access, public event amendment links and cover uploads, inbound Resend email, Slack delivery/retries, short links, encrypted backups, public event reads, archive/restore, and Google Places venue lookup.

Evidence collected:

- full source and migration review, including public route allowlists, authorization middleware, input schemas, upload validation, outbound fetch targets, HMAC/signature checks, logs, backup paths, and public DTOs;
- live read-only PostgreSQL catalog checks of sensitive tables, RLS flags, ACLs, and RPC execute privileges;
- Gitleaks scan of 201 reachable commits: **0 findings**;
- ignored working-tree scan: 11 credential-shaped findings confined to `.env.local` and the expected public Supabase anonymous JWT in ignored `dist/`;
- browser-bundle comparison: no service-role, Cloudflare, Resend, Slack, Turnstile, HMAC, or Google Places secret value was found;
- dependency audit: **no known vulnerabilities** at moderate-or-higher threshold;
- test suite: **113 files, 505 tests passed**;
- production build and TypeScript check: **passed**;
- deployed passive security verification: **31/31 checks passed**;
- live health endpoint: `200`, `Cache-Control: no-store`, request ID, HSTS, CSP, clickjacking, permissions, referrer, and MIME-sniffing controls present;
- live database: all 13 checked new sensitive tables have RLS enabled and ACLs limited to `postgres` and `service_role`.

## Findings and remediation

### SEC-16 — Production Turnstile hostname binding includes localhost

**Severity:** Medium
**OWASP:** A02 Security Misconfiguration, A06 Insecure Design
**Status:** Remediated in source; deploy and update the Turnstile widget hostname list

`wrangler.toml` commits `EVENT_SUBMISSION_TURNSTILE_EXPECTED_HOSTNAMES` as:

```text
devcongress.org,www.devcongress.org,localhost,127.0.0.1
```

The documented production policy says this dedicated allowlist should contain the public website hosts. Since the public submission API intentionally permits cross-origin POSTs, a valid Turnstile token issued for an allowed local hostname can also be presented to production. The attacker still needs to solve or obtain a valid Turnstile token and remains subject to distributed IP/email limits, so this is not a full bot-control bypass; it does defeat the intended production hostname binding.

**Attack scenario:** An attacker runs a submission client on an allowed local hostname, obtains valid widget tokens there, and sends them to the production submission endpoint. Production treats those tokens as originating from an approved submission surface.

**Implemented prevention:**

- remove `localhost` and `127.0.0.1` from the production `wrangler.toml` value;
- keep local hosts only in `.env.local` or an explicit development/staging environment;
- a configuration test now asserts that the committed production host list contains only `devcongress.org,www.devcongress.org`;
- deployment and isolated staging verification remain operational steps.

### SEC-17 — Finance RPC retains default public execute permission

**Severity:** Medium, latent rather than presently exploitable
**OWASP:** A01 Broken Access Control, A02 Security Misconfiguration, A08 Software or Data Integrity Failures
**Status:** Remediated by forward-only migration; apply and verify in production

The seven-argument overload of `record_annual_conference_income_receipt(..., p_idempotency_key uuid)` was added without the explicit revoke/grant statements applied to the older overload. Live catalog evidence shows `anon` and `authenticated` currently have execute permission through PostgreSQL's default function privileges.

The function is `SECURITY INVOKER`, and both underlying finance tables currently deny these roles, so an anonymous caller cannot presently mutate finance data. This is still a dangerous dormant permission: a later table grant or RLS policy could turn the RPC into an unauthenticated finance write, and the RPC accepts a caller-provided actor email.

**Attack scenario:** A future migration grants limited insert/update access to an authenticated role but overlooks this RPC. That role calls the already-public function directly, records receipts, changes finance status, and supplies a misleading actor email outside the app's owner-only service layer.

**Implemented prevention:**

- migration `20260813010000_security_audit_privilege_hardening.sql` revokes the audited overload from `public`, `anon`, and `authenticated`, preserves `service_role`, and removes the default `PUBLIC` grant for future functions;
- a migration regression test covers the full overload signature and future default privilege statement;
- continue deriving actor identity in the authenticated server layer rather than trusting RPC input from browser roles.

### SEC-18 — Environment template is incomplete and contains a stale reply domain

**Severity:** Low
**OWASP:** A02 Security Misconfiguration, A10 Mishandling of Exceptional Conditions
**Status:** Remediated

The environment reference documents `EVENT_SUBMISSION_MANAGEMENT_TOKEN_SECRET`, `SHORT_LINK_RESOLVER_TOKEN`, and `SLACK_EVENTS_RETRY_SECRET`, but `.env.example` does not include them. `.env.example` also uses `inbox.devcongress.org` while the production configuration and reference use `updates.devcongress.org` for `EVENT_SUBMISSION_REPLY_DOMAIN`.

Current code generally fails closed when these secrets are absent, limiting the impact to unavailable links/retries or fallback mail routing rather than unauthorized access.

**Implemented prevention:** the example and reference now agree, include all server-only placeholders, document fail-closed minimum-strength rules, and expose non-sensitive `missing` / `weak` / `ready` states through the owner-only data-source preflight.

### SEC-19 — Application HMAC/shared secrets have no minimum-strength validation

**Severity:** Low
**OWASP:** A04 Cryptographic Failures
**Status:** Remediated in source; deployed secret strength must be confirmed

Management-link, reply-routing, short-link resolver, and scheduled-retry secrets are checked for presence but not minimum entropy. The inspected local HMAC/retry secrets are at least 32 characters; production secret strength could not be read and must remain secret.

**Attack scenario:** An operator configures a short human-readable secret. An attacker guesses it offline from a known link identifier and forges a community-event management capability or internal request signature.

**Implemented prevention:** the four affected boundaries reject secrets below 32 UTF-8 bytes, tests cover weak-secret failure, and the runbook provides `openssl rand -base64 32`. Already-strong secrets should not be rotated unnecessarily because some signed links would be invalidated.

### SEC-20 — OAuth provider error text briefly survives in a same-origin URL

**Severity:** Low
**OWASP:** A07 Authentication Failures, A09 Security Logging and Alerting Failures
**Status:** Remediated

The server copies `error_description` into the SPA callback query. The client immediately maps every value to generic `oauth_failed` copy and does not render the provider text, preventing a direct XSS or account-enumeration leak. The raw string can still briefly enter browser history, client telemetry, or same-origin diagnostics.

**Implemented prevention:** the server and client now map provider failures to `oauth_failed`; regression coverage proves provider details and email-shaped text are absent from the redirect.

### SEC-21 — CSP still permits inline styles

**Severity:** Low
**OWASP:** A02 Security Misconfiguration, A05 Injection
**Status:** Remediated

Production CSP correctly disallows inline scripts and restricts script sources, but `style-src` retains `'unsafe-inline'`. This does not enable JavaScript execution by itself, and reviewed HTML/email rendering paths escape user data, but it weakens defense in depth against CSS injection and UI redress.

**Implemented prevention:** first-paint and short-link styles are same-origin stylesheet assets, app and short-link CSPs no longer allow `'unsafe-inline'`, and `style-src-attr 'none'` is enforced with regression tests.

## OWASP Top 10:2025 audit

| Category | App-specific attack scenario | Current controls | What must still be done |
|---|---|---|---|
| **A01 Broken Access Control** | A volunteer changes an event ID, finance ID, task ID, or membership ID to read or mutate another resource. | Deny-by-default API middleware; live membership sessions; owner/organizer/volunteer roles; edition-scoped capabilities; assigned-task filtering and internal-note redaction; owner-only finance writes; RLS/service-role tables; audited role/grant changes; explicit finance-RPC grants. | Apply and catalog-verify SEC-17's migration. Run authenticated staging BOLA tests across owner, organizer, volunteer, capability-link, event, registration, finance, task, and archived-event identifiers. |
| **A02 Security Misconfiguration** | A local Turnstile token is accepted by production, or a deployment omits a new shared secret and silently loses a protection/workflow. | Fail-closed public security dependencies; production-only hostname regression guard; strict production CORS; security headers; non-cacheable private APIs; complete environment template. | Deploy SEC-16/18 changes; remove local hosts from the production widget; verify Worker and Pages configuration after deploy. |
| **A03 Software Supply Chain Failures** | A compromised package or mutable CI action injects code or steals deployment secrets. | Frozen pnpm lockfile; `pnpm audit`; checksummed Gitleaks install; GitHub Actions pinned to full commit SHAs; CodeQL; weekly grouped security updates. | Keep dependency/CodeQL/secret jobs required; review security update PRs; periodically verify pinned action SHAs and provenance. |
| **A04 Cryptographic Failures** | A weak capability-link secret is guessed, or a database backup is left plaintext. | SHA-256 HMAC; timing-safe comparisons; 32-byte shared-secret minimum; signed/revocable/expiring links; Svix timestamp/signature verification; encrypted `age` backups; local env files mode `0600`; plaintext backup cleanup. | Confirm deployed secret strength without exposing values; rotate only weak values with the documented coordination/invalidations; continue restore drills. |
| **A05 Injection** | A malicious venue URL, cover file, email body, event description, or Google document URL injects script, SQL, SSRF, or unsafe markup. | Zod/bounded validation; parameterized Supabase queries/RPCs; fixed/allowlisted upstreams; safe HTTP URL rules; file size/MIME/extension/magic-byte checks; escaped templates; no inline scripts or style attributes under CSP; no shell-built subprocess command. | Add regression tests around the `v-html` encoding boundary and malformed multipart payloads. |
| **A06 Insecure Design** | Bots exhaust registration/submission/email capacity, replay a management link, or race a moderation/finance transition. | Turnstile action/production-hostname checks; distributed rate limits that fail closed; body limits; one-time/revocable links; event-end expiry; idempotency keys; advisory locks/transactions; queued provider delivery and retry state. | Provision isolated staging; add edge/WAF quotas and cost alerts; define retention/deletion periods for attendee, applicant, reply, audit, and quiz data. |
| **A07 Authentication Failures** | An attacker reuses a session after role removal, forces an OAuth redirect, or signs in from an unapproved account. | Supabase Google OAuth; app-owned `__Host-` HttpOnly Secure SameSite session; safe internal redirects; provider errors reduced to internal codes; origin checks; session revocation; no shared-password fallback. | Verify real issued/deleted cookie attributes and immediate revocation with staging identities; require/verify owner MFA operationally. |
| **A08 Software or Data Integrity Failures** | Concurrent requests double-record a payment, approve stale amendments, replace event data, or tamper with short-link state. | Database constraints; atomic service-role RPCs; idempotency; immutable amendment/reply history; service-side canonical destination resolution; encrypted backups; audit events. | Apply the privilege migration; add live migration/ACL assertions to release checks; complete periodic restore drills and document recovery objectives. |
| **A09 Security Logging and Alerting Failures** | Repeated auth denials, capability guesses, Turnstile failures, or webhook signature failures go unnoticed, while logs accidentally contain PII/provider details. | Request IDs; structured access-denial/rate-limit/provider logs; protected mutation audit ledger; redacted generic internal errors; no secret values observed in build/history. | Define alert thresholds and retention; protect/export audit logs; review stored provider error strings; alert on repeated token/signature failures and privileged access changes. |
| **A10 Mishandling of Exceptional Conditions** | A provider, database, or rate-limit outage causes an unsafe fallback, duplicate delivery, orphaned upload, or partial event mutation. | Public security dependencies and weak protected-workflow secrets fail closed; generic `500` responses; timeouts and response-size limits; idempotent outboxes; compensating event/cover cleanup; backup `finally` cleanup. | Test failure paths in isolated staging; add reconciliation for orphaned covers and stuck provider deliveries; monitor compensation failures. |

## Production and verification gaps

The 31 passive deployed checks prove the public perimeter at the time of this audit, not the entire application. The health response exposes no build SHA or schema version, so source-to-deployment revision parity remains unproven. The database objects themselves were inspected live, but this project does not have an application migration ledger from which to prove the complete applied migration sequence.

Active DAST was not run because no isolated non-production hostname/data/secrets are configured. Authenticated role/object tests were not run against production because doing so safely requires controlled owner, organizer, volunteer, event, and finance fixtures.

Before final **production** security sign-off:

1. deploy this verified hardening revision and apply the new privilege migration;
2. remove local hosts from the production Turnstile widget, confirm the four protected secrets meet the minimum, and rerun the 31 passive checks plus live RPC ACL query;
3. expose a non-sensitive build revision and schema/migration marker in an owner-only diagnostic or deployment manifest;
4. provision isolated staging and run the repository's active DAST plus the authenticated BOLA/role matrix;
5. verify Cloudflare WAF/rate rules, Supabase backups/restores, secret rotation, OAuth/MFA policy, audit retention, and alerts in their provider consoles.

## Release recommendation

The hardening branch is approved for release: all confirmed medium and low source findings are remediated without changing public data contracts. Do not mark the deployed environment fully signed off until the migration/configuration/deployment checks above are complete. Isolated staging and authenticated verification remain assurance work rather than confirmed vulnerabilities.
