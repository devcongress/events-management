# OWASP Top 10 and MITRE ATT&CK Security Review

**Audit date:** 2026-08-03

**Standards:** [OWASP Top 10:2025](https://owasp.org/Top10/) and [MITRE ATT&CK Enterprise](https://attack.mitre.org/matrices/enterprise/)

**Scope:** current local worktree, reachable Git history, Vue browser application, Hono API, organizer and volunteer authorization, public forms and quiz participation, Supabase migrations/RLS/RPCs, Cloudflare configuration, dependencies, CI, logs, and ignored build/environment artifacts.

## Executive Result

No tracked or historical secret and no known dependency advisory was found. The review found and remediated three application/configuration weaknesses introduced or left exposed after the 2026-07-28 audit:

| ID | Severity | Finding | Remediation |
|---|---:|---|---|
| SEC-13 | High | Public quiz answers trusted a caller-supplied `user_id`. A caller who obtained another participant identifier could submit on that participant's behalf. Personal quiz state also accepted `userId` without device ownership proof. | Answer and personal-state requests now require the random browser device identifier and verify it against the server-owned user record before reading or mutating participant state. Regression tests cover missing and wrong-device requests. |
| SEC-14 | Medium | Quiz join and answer endpoints inherited the 7 MiB API limit and did not use the distributed public rate limiter. | Both routes now use the 64 KiB public limit. Join has broad network and narrow device/session buckets; answer has a participant/session/device bucket. Hosted limits fail closed when their Supabase dependency is unavailable. |
| SEC-15 | Medium | Sensitive API responses relied on Cloudflare/browser defaults for caching, and several authenticated 500 paths returned underlying exception text. Quiz session patching also accepted a broad persistence-shaped object. | All API responses now default to `Cache-Control: no-store`; explicitly cacheable public reads override it. Internal failures log a safe error name and request ID while returning generic text. Quiz session updates use a strict field allowlist. |

This is a source, configuration, and local runtime review. It is not proof that the deployed Cloudflare, Supabase, Google, Resend, or Turnstile configuration matches the repository. The deployment verification gate below remains required.

## OWASP Top 10:2025

| Category | Result | Evidence and remaining risk |
|---|---|---|
| A01 Broken Access Control | Hardened | Organizer routes deny by default; live membership controls role access; volunteer responses are assignment-scoped and redact internal notes; RLS denies direct private-table access; quiz personal reads and answers now prove device ownership. Higher-value participant accounts should use scoped server-issued participant tokens rather than treating a browser device ID as a durable identity. |
| A02 Security Misconfiguration | Hardened with accepted exception | Production CORS and origins are explicit; public writes fail closed; CSP/HSTS/frame/MIME/referrer/permissions/cross-domain headers are set; and API responses default to `no-store`. The dedicated community event-submission widget intentionally accepts `devcongress.org`, `www.devcongress.org`, `localhost`, and `127.0.0.1` so local public-site testing can exercise the deployed moderation flow. Turnstile token, action, and distributed rate-limit checks remain mandatory, and other forms retain the separate `em.devcongress.org` hostname boundary. CSP still permits inline styles for the current UI/email-preview implementation. |
| A03 Software Supply Chain Failures | Verified | `pnpm audit --audit-level moderate` found no advisory. The lockfile is committed, CI installs frozen dependencies, actions are pinned to immutable commits, and Dependabot, CodeQL, and Gitleaks are configured. |
| A04 Cryptographic Failures | Verified | Organizer sessions and one-time speaker links use random tokens stored as SHA-256 hashes; organizer cookies are HTTP-only and secure when hosted; TLS is platform-managed; sensitive APIs are non-cacheable. Ignored local credentials remain high-impact and must stay machine-local. |
| A05 Injection | Hardened | Public and sensitive mutation payloads use strict schemas and bounded values; quiz updates reject unknown fields; URLs use HTTP(S)/host allowlists; email content is escaped; uploads use size/MIME/extension/signature checks; Supabase query builders and parameterized RPCs are used instead of string-built SQL. |
| A06 Insecure Design | Hardened, residual controls | Turnstile, distributed limits, generic enumeration-resistant responses, atomic registration/quiz/token transitions, device proof, and fail-closed dependencies cover current workflows. Edge volumetric limits, owner MFA, retention automation, and migration of remaining whole-document stores remain operational/design follow-up. |
| A07 Authentication Failures | Hardened | Supabase Google identity is followed by an active membership check; session cookies have 12-hour absolute and 30-minute idle limits; role/status changes revoke sessions; mutations check Origin; token exchange is distributed-rate-limited. Privileged Google-account MFA is not enforced by application code. |
| A08 Software or Data Integrity Failures | Hardened | CI actions/lockfile are pinned, high-value database transitions are atomic, invitation-owned values cannot be overridden, role changes are audited, and strict quiz session updates prevent mass assignment. Remaining JSON compatibility domains do not provide relational concurrency guarantees. |
| A09 Security Logging and Alerting Failures | Partial | Request IDs, safe structured failures, rate-limit events, auth events, and persistent admin mutation audits exist without raw tokens/payloads. Repository code cannot prove that Cloudflare/Supabase alert rules, retention, access controls, or alert delivery are configured. |
| A10 Mishandling of Exceptional Conditions | Hardened | Body/file/fetch bounds, provider timeouts, generic 500 contracts, fail-closed security dependencies, transaction conflicts, and compensating paths cover audited surfaces. Deployed dependency-failure and concurrency behavior still needs staging fault testing. |

## MITRE ATT&CK Mapping

ATT&CK describes adversary behavior rather than an application-compliance checklist. The table maps credible threats for this internet-facing application to prevention and detection evidence.

| Technique | Credible scenario | Prevention | Detection/evidence |
|---|---|---|---|
| [T1190 Exploit Public-Facing Application](https://attack.mitre.org/techniques/T1190/) | Crafted input, vulnerable dependency, SSRF, injection, unsafe upload, or authorization bypass reaches the Worker. | Strict schemas, URL reconstruction/allowlists, file signatures, RLS, body limits, patched dependencies, generic failures. | Request IDs; safe `4xx`/`5xx`, provider, Turnstile, and body-limit signals; CodeQL and dependency gates. |
| [T1078.004 Valid Accounts: Cloud Accounts](https://attack.mitre.org/techniques/T1078/004/) | A compromised Google organizer account signs in legitimately. | Membership allowlist, live status/role lookup, idle/absolute expiry, immediate session revocation; owner MFA remains an external requirement. | Login/denial and organizer audit events; Google/Supabase risky-sign-in alerts must be configured externally. |
| [T1110 Brute Force](https://attack.mitre.org/techniques/T1110/) | Repeated OAuth exchange, join-code guessing, or public-form automation. | Google OAuth, exchange rate limits, Turnstile, distributed public limits, six-character restricted join codes, generic responses. | `429` and Turnstile failure trends; identity-provider failed-login telemetry. |
| [T1098 Account Manipulation](https://attack.mitre.org/techniques/T1098/) | An attacker with organizer access grants or changes privileged membership. | Existing owner protection, owner-only role switching, last-owner checks, immediate session revocation. | Persistent membership-role/status audit events with actor, target, path, IP, and user agent. |
| [T1539 Steal Web Session Cookie](https://attack.mitre.org/techniques/T1539/) / [T1550.004 Web Session Cookie](https://attack.mitre.org/techniques/T1550/004/) | Script, browser compromise, or leaked cache captures/reuses an organizer cookie. | `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` cookie, Origin checks, hashed server token, idle/absolute expiry, `no-store`. | Session issuance/revocation and audit context; anomalous reuse alerts require platform correlation. |
| [T1552.001 Unsecured Credentials: Credentials In Files](https://attack.mitre.org/techniques/T1552/001/) | A service-role or provider credential is committed or bundled. | Ignored mode-0600 environment file, server-only variable names, browser-bundle comparison, empty examples. | Gitleaks blocks history leaks; the current 154-commit scan found none. |
| [T1565.001 Stored Data Manipulation](https://attack.mitre.org/techniques/T1565/001/) | Unauthorized changes alter schedules, registrations, quiz scores, conference tasks, or published content. | Server authorization, strict updates, relational constraints/RPCs, one-answer uniqueness, atomic moderation and role rules. | Mutation audit ledger, status/role change events, provider/outbox state. |
| [T1491.002 External Defacement](https://attack.mitre.org/techniques/T1491/002/) | Compromised organizer access publishes malicious or misleading public event content. | Authenticated publication routes, URL allowlists, public DTOs, CSP, owner/organizer boundaries. | Event/submission/talk audit events and deploy history; content-change alerting remains external. |
| [T1499.003 Endpoint Denial of Service: Application Exhaustion Flood](https://attack.mitre.org/techniques/T1499/003/) | Bots exhaust form, quiz, upload, database, or external-provider capacity. | Body/file limits, timeouts, Turnstile, distributed limits, bounded arrays/text, fail-closed security stores. | `413`, `429`, `503`, latency, Worker CPU, and provider-error trends; edge WAF/rate alerts remain external. |

## Secret and Supply-Chain Evidence

- Gitleaks scanned 154 reachable commits and found no historical secret.
- The complete working-tree scan reported six credential-shaped matches: five real local credentials in ignored `.env.local` and the expected public Supabase anonymous JWT in ignored `dist/`.
- `.env.local` is ignored and mode `0600`.
- Exact-value comparison confirmed that `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_API_TOKEN`, `RESEND_API_KEY`, and `GOOGLE_MAPS_PLACES_API_KEY` are absent from the browser build.
- All 26 current application tables enable RLS. Direct anonymous table access is limited to published `community_events`; its policy requires `publish_to_website = true`. Private tables and security-definer application functions are service-role-only.
- `pnpm audit --audit-level moderate` reports no known vulnerability.

## Deployment Verification Gate

Before treating this review as production evidence:

1. Deploy Worker and Pages from the same reviewed commit and confirm the community-submission hostname list contains exactly the four intentionally supported hosts, while `TURNSTILE_EXPECTED_HOSTNAME` remains `em.devcongress.org` for other forms.
2. Verify API `Cache-Control`, CSP, HSTS, CORS, cookie flags, and cross-domain policy at `https://em.devcongress.org`.
3. Confirm wrong-device quiz answer and personal-state requests return `403`, while the owning device still participates normally.
4. Confirm oversized quiz join/answer payloads return `413` and distributed limits return `429` without blocking expected event attendance behind a shared network.
5. Attempt anonymous Supabase reads/writes against every private table and execute-only function; confirm denial.
6. Require MFA for owner Google accounts and test immediate revocation after membership role/status changes.
7. Configure and exercise Cloudflare/Supabase/Google alerts for elevated `401`, `403`, `413`, `429`, `5xx`, provider failures, role changes, and risky sign-ins.
8. Run authenticated staging DAST/manual authorization tests without production attendee data.
9. Approve retention/deletion periods for attendee, feedback, volunteer, audit, and quiz identity data.

The deployed verification history is recorded in `docs/deployed-security-verification-2026-08-03.md`. The initial run found missing private `no-store` and cross-domain-policy headers, Pages CSP drift, and credentialed localhost CORS. Worker version `f3b487a8-3971-4cb2-8bde-a1a3b1cadd30` subsequently resolved private caching, API cross-domain policy, and localhost CORS while preserving the intentional community-submission Turnstile host list. The canonical origin now passes 28/31 checks; the remaining three failures are the older Pages root/proxy headers pending the reviewed Pages release. The staging DAST runner fails closed for known production hosts but cannot be executed until a stable deployment with isolated data and secrets exists.
