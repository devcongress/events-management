# Security Audit and OWASP Top 10 Review

**Audit date:** 2026-07-28

**Standard:** [OWASP Top 10:2025](https://owasp.org/Top10/)
**Scope:** Vue browser app, Hono API, Cloudflare Pages proxy/Worker configuration, Supabase schema and RLS, public workflows, organizer authentication, uploads, email integration, dependencies, GitHub Actions, secrets, tests, and generated public contracts.

## Executive Result

The codebase contained one critical public-data exposure and several high-risk authorization, token, abuse-control, supply-chain, and input-handling weaknesses. The remediations described below are implemented in the local worktree. The production system is **not remediated until the security migration, Worker, and Pages build are deployed and the old public response cache is purged**.

Post-remediation local evidence:

- all type checks, 192 tests, and the production build passed;
- `pnpm audit` reports zero known vulnerabilities;
- Gitleaks found no secret in 121 reachable Git commits;
- the ignored worktree contains expected local credentials, but no service-role, Cloudflare, or Resend secret was found in the browser bundle;
- regression coverage now exercises public PII exclusion, URL-scheme filtering, body limits, CORS, security headers, file signatures, registration enumeration resistance, and one-time token handling.

This was a code, configuration, migration, dependency, and local contract audit. It was not an external penetration test of the deployed Cloudflare/Supabase environment.

## Remediated Findings

| ID | Original severity | Finding and attack scenario | Remediation |
|---|---:|---|---|
| SEC-01 | Critical | `GET /api/public/home` returned attendee names, email-derived keys, attendance counts, and last-seen data. Anyone or a cached consumer could collect private attendance history. Draft registration endpoints also disclosed unpublished event details to anyone who guessed a slug or ID. | Public home now returns an empty compatibility field, never reads attendance, and uses `Cache-Control: no-store`. Draft registration and calendar routes return the same not-found contract as an unknown link. |
| SEC-02 | High | Supabase anonymous policies allowed direct feedback-tester reads and feedback inserts, bypassing the Hono validation, Turnstile, rate limits, and server logs. | The migration drops those policies and revokes `anon`/`authenticated` table privileges. Public writes now go through the server-only service role. |
| SEC-03 | High | An organizer session retained the role copied at login. A demoted owner could keep owner permissions until expiry. | Session reads join the current active membership and use its live role. Role/status changes explicitly revoke sessions and a database trigger provides a second enforcement layer. |
| SEC-04 | High | Speaker intake bearer tokens were stored in recoverable JSON and one-isolate locks could allow double use across Workers. | Only SHA-256 token hashes are persisted. Relational Supabase rows use atomic claim/consume/release RPCs, and raw tokens are returned only at issuance. Failed email retries receive fresh tokens. |
| SEC-05 | High | Registration, CFP, and event feedback lacked complete bot controls; old limits reset per process, and concurrent CFP writes could overwrite a proposal. | Production public forms fail closed without Turnstile verification. Action and hostname are verified, an atomic Supabase rate-limit bucket provides cross-instance limits, and CFP proposals use relational rows with database-enforced active-proposal uniqueness. |
| SEC-06 | Medium | Registration and CFP duplicate responses disclosed whether an email already existed. | New and duplicate submissions return the same generic `202` contract. Detailed status remains private to organizers and confirmation email. |
| SEC-07 | High | Public schedule, media, social, stream, registration, and recording URLs could retain executable schemes. Upload validation trusted MIME type and extension. | Writes use strict Zod allowlists, public serialization revalidates HTTP(S)/safe local paths, and image uploads must match JPEG/PNG/WebP/AVIF signatures. |
| SEC-08 | Medium | Responses lacked a complete security-header baseline; credentialed CORS preflight handling was broken; production allowed unsafe cookie/deployment combinations; detailed health responses aided reconnaissance. | Pages and API responses now set CSP, HSTS, frame, MIME, referrer, permissions, and opener policies. CORS preflights return correctly, production rejects localhost origins, and secure `__Host-`/`SameSite=Lax` cookies match the same-origin proxy design. Public health responses are minimal. |
| SEC-09 | High | Five dependency advisories affected PostCSS, Sharp/libvips, brace expansion, and Hono’s Node adapter. CI actions used mutable tags and there were no dependency, secret, or static-analysis gates. | Dependencies/transitives were upgraded or pinned to patched versions. CI now audits dependencies, runs Gitleaks and CodeQL, and pins actions to immutable SHAs. Dependabot covers npm and Actions. |
| SEC-10 | Medium | Oversized bodies, unbounded external fetches, raw exception messages, failed security dependencies, and silent stale-data fallbacks could lead to denial of service, information disclosure, or integrity loss. | Global and public-specific body limits, Google Slides timeout/stream limits, generic error responses, request IDs, fail-closed Turnstile/rate-limit behavior, and fail-closed configured Supabase/compatibility-store reads and writes were added. |
| SEC-11 | Medium | Event patching spread arbitrary JSON into persistence, enabling mass assignment and malformed nested public data. | A strict field-by-field update schema rejects unknown keys, bounds arrays/text, validates dates/types/URLs, and normalizes public structures. |
| SEC-12 | Medium | Security failures were inconsistently observable and dependency/secret regressions were not continuously checked. | Structured request/error, access-denial, rate-limit, health, and provider events were added while avoiding attendee/token content. Admin mutations continue to use the private audit ledger. CI adds continuous scanning. |

## OWASP Top 10:2025 Audit

### A01: Broken Access Control

**Scenario:** An unauthenticated user reads attendance identities from a public summary, calls Supabase directly to bypass API checks, reuses a demoted owner session, or supplies a server-fetch URL that reaches an internal host.

**Current controls:**

- public responses use narrow DTOs and explicitly exclude attendance PII;
- draft registration/calendar routes do not expose unpublished event details;
- all organizer routes deny by default through centralized middleware and enforce live membership roles;
- feedback and private workflow tables have RLS with no anonymous mutation grants;
- state-changing authenticated requests require an approved `Origin`;
- Google Slides imports reconstruct a fixed `docs.google.com` export URL instead of fetching an arbitrary submitted host;
- diagnostic data-source/storage routes require owner access.

**Keep preventing it:**

- add an authorization regression test for every new route and role;
- expose only purpose-built public DTOs, never persistence rows;
- review every new Supabase grant/policy in the migration diff;
- retain server-side ownership checks even when the UI hides controls.

**Status:** Remediated locally; migration/deployment required.

### A02: Security Misconfiguration

**Scenario:** A wildcard credentialed origin, missing CSP/HSTS, cross-site cookies, verbose health endpoint, or incomplete Turnstile pairing creates an avoidable attack path.

**Current controls:**

- explicit production origins; localhost is development-only;
- secure `__Host-` session cookie with `HttpOnly`, `Secure`, root path, and `SameSite=Lax`;
- defense headers on Pages assets and API responses;
- production public writes fail closed when Turnstile, rate-limit storage, or auth configuration is missing;
- owner-only detailed health routes and minimal public health output.

**Keep preventing it:**

- keep Pages as the same-origin `/api/*` proxy;
- set `TURNSTILE_SECRET_KEY` and `TURNSTILE_EXPECTED_HOSTNAME` in production;
- periodically test headers and CORS against the deployed domains;
- do not enable PDF uploads on runtimes that cannot safely parse them.

**Status:** Remediated locally; production configuration must be verified.

### A03: Software Supply Chain Failures

**Scenario:** A compromised or vulnerable transitive build package reads files, crashes CI/runtime tooling, or a mutable GitHub Action tag changes after review.

**Current controls:**

- zero known advisories in the current lockfile;
- immutable action SHAs;
- frozen-lockfile installs;
- CI dependency audit, CodeQL, and full-history Gitleaks;
- weekly Dependabot updates for npm and Actions.

**Keep preventing it:**

- require all security jobs before merge;
- review lockfile and action-SHA changes;
- avoid install scripts unless explicitly required and reviewed;
- maintain an SBOM/release inventory if deployments become regulated.

**Status:** Remediated.

### A04: Cryptographic Failures

**Scenario:** A database or local-file read exposes raw one-time links, app session tokens, service credentials, or unnecessary attendee data.

**Current controls:**

- app session and speaker tokens are random 256-bit values stored only as SHA-256 hashes;
- session cookies are HTTP-only and secure in hosted environments;
- secrets remain server-only and are absent from tracked history/browser output;
- public flows minimize returned personal data;
- Supabase/Cloudflare provide TLS in transit and managed encryption at rest.

**Keep preventing it:**

- rotate any credential copied into public logs, issues, chat, or screenshots;
- define and automate attendee/feedback retention and deletion periods;
- never place a service key under a `VITE_` name;
- do not log bearer tokens, OAuth tokens, email bodies, or full request payloads.

**Status:** Token handling remediated; retention automation remains an operational follow-up.

### A05: Injection

**Scenario:** An attacker submits `javascript:` links, unknown object fields, oversized text/arrays, malformed IDs, HTML-like uploads, or query fragments that become executable content or unsafe persistence updates.

**Current controls:**

- strict Zod schemas with size/count/type bounds and unknown-key rejection;
- HTTP(S) and safe-local-path allowlists at write and public-output boundaries;
- Vue text interpolation and explicit email HTML escaping;
- Supabase query builders/RPC parameters instead of string-built SQL;
- uploaded image signature checks;
- CSP blocks object embedding, framing, and unapproved scripts.

**Keep preventing it:**

- avoid `v-html`, `innerHTML`, dynamic code execution, and raw SQL;
- validate at the server even when the browser already validates;
- treat stored content as untrusted again when rendering or exporting it;
- add a regression case for every newly accepted URL/file format.

**Status:** Remediated for audited surfaces.

### A06: Insecure Design

**Scenario:** A bot consumes event capacity with many addresses, a public response confirms account existence, two Workers consume one token, or a security dependency silently fails open.

**Current controls:**

- Turnstile plus distributed client/email limits;
- generic registration/CFP acknowledgements;
- relational CFP rows with database-enforced duplicate prevention;
- atomic registration capacity allocation;
- atomic one-time link claim/consume;
- fail-closed security dependencies;
- public quiz/account prototype APIs remain behind organizer authentication until participant authorization is redesigned.

**Keep preventing it:**

- threat-model new workflows before implementation;
- add Cloudflare edge/WAF limits for volumetric attacks;
- move remaining multi-user compatibility documents to relational tables before adding higher-value workflows;
- design participant-scoped authorization before re-enabling public quiz/account mutations.

**Status:** High-risk paths remediated; edge controls and legacy persistence migration remain defense-in-depth work.

### A07: Authentication Failures

**Scenario:** A disabled/demoted organizer retains access, a forged cross-site request performs a mutation, or a stolen long-lived cookie remains valid.

**Current controls:**

- Supabase Google identity plus explicit active-membership allowlist;
- live role/status lookup and immediate revocation;
- hashed, revocable, 12-hour app sessions;
- origin checks for authenticated mutations;
- no shared-password fallback;
- login, denial, organizer, and logout audit events.

**Keep preventing it:**

- require MFA for Google accounts with owner access;
- consider Cloudflare Access as an outer organizer gate;
- alert on repeated denied logins and unusual owner changes;
- shorten session lifetime if organizer risk increases.

**Status:** Remediated in app; MFA/outer access are operational controls.

### A08: Software or Data Integrity Failures

**Scenario:** A mutable CI action changes, an untrusted public form overrides invitation-locked speaker identity, or concurrent writes corrupt one-time workflow state.

**Current controls:**

- action commits and dependency lockfile are pinned;
- invitation event, title, speaker, purpose, and kind come from server records, not browser overrides;
- relational constraints and atomic state transitions protect CFP proposals, one-time links, and registration allocation;
- accepted email identities and idempotency metadata suppress unintended repeats.

**Keep preventing it:**

- verify migrations in a staging project before production;
- require review for workflow, lockfile, and migration changes;
- use signed provider webhooks before trusting delivery/payment events;
- migrate compatibility JSON domains when concurrent mutation becomes business-critical.

**Status:** Remediated for current high-value transitions.

### A09: Security Logging and Alerting Failures

**Scenario:** Repeated rate-limit bypasses, auth denials, storage failures, or provider abuse occur without a searchable event or owner notification.

**Current controls:**

- request IDs and structured security/error events;
- persistent organizer audit ledger;
- logs intentionally omit bearer tokens, attendee content, and raw payloads;
- CodeQL, dependency, test, and secret findings block CI when branch protection requires them.

**Keep preventing it:**

- configure Cloudflare alerts for elevated `401`, `403`, `429`, `5xx`, Turnstile failures, and rate-limit-store outages;
- review owner/membership audit events regularly;
- set log retention and access controls;
- test alert delivery, not only log creation.

**Status:** Application logging improved; production alerts still require platform configuration.

### A10: Mishandling of Exceptional Conditions

**Scenario:** A malformed/oversized body, dependency timeout, unavailable database limiter, duplicate race, or raw database error crashes the request, leaks internals, or falls through insecurely.

**Current controls:**

- centralized generic exception handling;
- bounded bodies, files, arrays, strings, and external fetches;
- explicit timeout and unavailable responses for Turnstile/Google;
- rate-limit storage and auth fail closed;
- token claims are released on failure and created talks are compensated if token consumption fails;
- database allocation, CFP uniqueness, and token-claim operations serialize races.

**Keep preventing it:**

- define timeout, retry, idempotency, and compensation behavior for every external call;
- do not expose raw provider/database exception text to public callers;
- test unavailable, duplicate, stale, and concurrent paths;
- monitor failure rates after every deployment.

**Status:** Remediated for audited paths.

## Residual Risks and Required Follow-Up

| Priority | Residual risk | Required action |
|---|---|---|
| P0 rollout | The production app remains on the old behavior until migration and code deploy. Any cached PII response may outlive the code change. | Back up Supabase, apply `20260728020000_security_hardening.sql` and `20260729000000_fix_public_rate_limit_timestamp_ambiguity.sql`, deploy Worker and Pages together, purge `/api/public/home`, then run authenticated and unauthenticated smoke tests. |
| P0 config | Production public submissions intentionally fail closed without a matching Turnstile secret/sitekey/hostname. | Confirm the Cloudflare widget covers `em.devcongress.org`; store `TURNSTILE_SECRET_KEY`; verify every action. |
| P1 monitoring | Structured events exist, but alert rules are outside this repository. | Configure and test Cloudflare/Supabase alerting for auth, rate-limit, provider, and `5xx` events. |
| P1 privacy | Attendee and older feedback records do not have an automated retention/deletion schedule. | Approve retention periods, document lawful/operational purpose, and add a reviewed purge/export process. |
| P1 identity | Owner MFA is not enforced by this app. | Require MFA on privileged Google accounts and consider Cloudflare Access. |
| P2 persistence | Some prototype domains still use whole-document compatibility persistence. | Move a domain to relational Supabase before it gains sensitive, high-volume, or concurrent workflows. |
| P2 validation | No external DAST or deployed penetration test was performed in this local audit. | Run authenticated staging DAST/manual tests after rollout, without using production attendee data. |

## Release Gate

Do not call the production issue resolved until all of these are true:

1. Supabase backup completed and both the security migration and rate-limit repair migration applied successfully.
2. Turnstile secret and expected hostname verified.
3. Worker and Pages deployed from the same reviewed commit.
4. Public home returns no attendance identity and `Cache-Control: no-store`.
5. Anonymous Supabase feedback select/insert attempts are denied.
6. A demoted organizer loses owner access immediately.
7. Two concurrent submissions cannot consume one speaker token twice.
8. Registration/CFP duplicates return the same public contract as new submissions.
9. Concurrent identical CFP submissions leave exactly one active database row.
10. Production CORS, cookie, CSP, HSTS, and health responses match this audit.
11. CI dependency, secret, CodeQL, typecheck, test, and build jobs pass.
