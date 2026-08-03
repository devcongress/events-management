# Deployed Security Verification and Staging DAST

**Verification date:** 2026-08-03

**Production target:** `https://em.devcongress.org`

**Production method:** read-only HTTP requests only

**Staging DAST status:** runner implemented; execution blocked because no isolated staging target is configured or discoverable with the available Cloudflare token

## Production Result

The initial `pnpm verify:deployed-security` run completed 31 checks: 24 passed and 7 failed. Worker version `f3b487a8-3971-4cb2-8bde-a1a3b1cadd30` was then deployed with the private cache policy, cross-domain header, canonical origins, explicit production mode, and fail-closed localhost CORS behavior. The post-Worker canonical run passes 28 checks and fails only three Pages-layer assertions: the root cross-domain header plus the root and proxied-API media-frame CSP checks.

Confirmed live:

- the root, Worker health, Supabase health, anonymous-session, protected organizer, and public-meetup endpoints respond;
- unauthenticated organizer-directory access returns `401`;
- HSTS, CSP frame protection, COOP, permissions, referrer, MIME-sniffing, frame, and request-ID headers are present;
- the expected `https://em.devcongress.org` credentialed CORS origin is accepted;
- an unrelated HTTPS origin is not granted credentialed CORS;
- the public meetup API deliberately returns wildcard CORS and an explicit public cache policy.

Deployment drift or release gaps:

| Finding | Live evidence | Expected source behavior | Required action |
|---|---|---|---|
| Private API caching | Resolved: `/api/health` and `/api/auth/session` now send `Cache-Control: no-store`. | API responses default to `Cache-Control: no-store` | Keep the deployed verifier as a release gate. |
| Cross-domain policy | API responses now send `X-Permitted-Cross-Domain-Policies: none`; the static root still omits it. | Pages and API responses send `none` | Deploy the reviewed Pages build. |
| Credentialed localhost CORS | Resolved: production now rejects `http://localhost:5173`. The deployed app/frontend origins were already correct; the cause was missing `NODE_ENV` plus a permissive fallback. | Localhost is enabled only for explicit development mode. | Keep `NODE_ENV=production`; do not alter the separate intentional community-submission Turnstile hostname list. |
| CSP parity | The direct Worker now has the correct media-frame allowlist, while the Pages proxy still overwrites root and API CSP with its older narrower policy. | Both layers permit Turnstile plus the allowlisted YouTube/Vimeo players used by event previews. | Deploy the reviewed Pages build. |

The probe did not verify organizer cookie flags because the anonymous session endpoint does not issue a cookie. After staging authentication is available, inspect the actual `Set-Cookie` response for the `__Host-devcon_admin` name, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and absence of `Domain`.

## Repeatable Production Verification

```bash
pnpm verify:deployed-security
```

Override the canonical target only when verifying another deployed production route:

```bash
DEPLOYED_BASE_URL=https://worker.example.invalid \
DEPLOYED_EXPECTED_APP_ORIGIN=https://app.example.invalid \
pnpm verify:deployed-security
```

The command exits non-zero when any contract check fails and emits a machine-readable JSON report. It performs only `GET` and `OPTIONS` requests.

## Staging DAST Safety Contract

The DAST runner refuses every known production hostname, requires HTTPS for remote targets, and requires the operator to repeat the exact staging hostname as an explicit non-production confirmation. Mutation-capable probes are separately gated.

Before running it, provision a stable staging deployment with:

- a dedicated Supabase project containing synthetic data only;
- separate Worker secrets, OAuth callback URLs, Turnstile configuration, and email-provider test/sink behavior;
- no production service-role key, attendee data, email audience, storage bucket, queue, or webhook destination;
- at least one owner, organizer, volunteer, quiz room, and Annual Conference fixture created only for authorization testing;
- a stable hostname suitable for Google/Supabase callback allowlists rather than an ephemeral preview URL.

Passive staging checks:

```bash
STAGING_DAST_URL=https://staging.example.org \
DAST_CONFIRM_NON_PRODUCTION=staging.example.org \
pnpm dast:staging
```

Active low-impact staging checks:

```bash
STAGING_DAST_URL=https://staging.example.org \
DAST_CONFIRM_NON_PRODUCTION=staging.example.org \
DAST_ALLOW_ACTIVE=true \
pnpm dast:staging
```

The active runner sends only inputs designed to fail before persistence: oversized quiz JSON (`413`), malformed quiz JSON (`400`), an invalid event submission (`400`), and an unauthenticated organizer mutation (`401`). It does not submit valid events, send email, answer a real quiz, or alter organizer data.

## Authenticated Staging Test Matrix

Automation cannot safely infer credentials or create production-like fixtures. Once isolated staging exists, use test identities to verify:

1. owner-only email reveal and organizer/volunteer role changes;
2. immediate session revocation after role or status changes;
3. volunteer denial from organizer routes and access only to assigned conference tasks;
4. accountable/collaborator task-edit rules and internal-note redaction;
5. wrong-device quiz state and answer denial (`403`) while the owning device succeeds;
6. object-level authorization by replacing event, task, membership, registration, feedback, and quiz identifiers with another fixture's ID;
7. secure organizer cookie attributes on issuance and deletion;
8. generic `4xx`/`5xx` bodies with a correlated request ID and no stack, token, SQL, or provider detail.

## Current Blocker

No staging hostname or isolated staging bindings are committed in the repository. A read-only Cloudflare Pages deployment-list request also returned authentication error `10000`; the available API token can identify the account but cannot read Pages deployments. Worker version inspection did confirm that `PUBLIC_APP_URL` and `PUBLIC_FRONTEND_ORIGIN` are already correct; the localhost CORS drift came from the missing production-mode binding and a permissive fallback. Do not point the DAST runner at a preview until its data and secret bindings are independently confirmed as non-production.
