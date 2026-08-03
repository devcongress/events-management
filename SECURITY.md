# Security Policy

DevCongress Community is currently a prototype moving toward production-ready community operations. Please report vulnerabilities responsibly and do not disclose them publicly before maintainers have had time to respond.

## Supported Scope

Security reports are welcome for:

- Authentication and organizer route bypasses
- Exposed secrets or unsafe environment variable usage
- Supabase service-role misuse
- Unsafe file upload handling
- Cross-site scripting or unsafe rendered user content
- Public API data leaks
- Attendance or feedback data exposure

## Reporting a Vulnerability

Please send a private report to the maintainers. If the repository host supports private vulnerability reporting, use that first. Otherwise, contact the DevCongress maintainers through the private channel listed on the organization profile.

Include:

- A short summary
- Affected route, API, or file path
- Reproduction steps
- Impact
- Suggested fix, if you have one

Do not include real secrets in public issues, pull requests, or chat logs.

## Secrets Policy

- Keep `.env.local` out of commits.
- Treat `SUPABASE_SERVICE_ROLE_KEY` as server-only.
- Browser variables must use only public/anon credentials.
- Rotate any key that appears in git history or public logs.
- Use masked values when documenting findings.

## Security Baseline

- Organizer APIs deny by default and resolve the current active membership role on every session check.
- Public writes use strict server schemas, production Turnstile verification, and distributed Supabase rate limits.
- Public quiz mutations prove ownership with the participant's random device identifier and use distributed abuse limits; browser-supplied user IDs are never sufficient authorization.
- Public responses must use purpose-built DTOs and must never expose attendee email, attendance history, session tokens, or private workflow records.
- One-time links and app sessions persist only cryptographic token hashes.
- New external URLs must be restricted to approved hosts or HTTP(S), depending on their purpose.
- Uploads require size, extension, MIME, and content-signature validation.
- Dependency audit, Gitleaks, CodeQL, tests, typecheck, and build are required security gates.

The current full review and rollout checklist are in [docs/security-audit-2026-08-03.md](docs/security-audit-2026-08-03.md). The original remediation baseline remains in [docs/security-audit-2026-07-28.md](docs/security-audit-2026-07-28.md).

## Maintainer Response

Maintainers should acknowledge valid reports, triage severity, patch privately where needed, and publish a short disclosure note after the fix is available.
