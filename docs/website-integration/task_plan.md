# Task Plan: Website and Events Management Integration

## Goal

Make the Astro website the single public and organizer-facing DevCongress product on Cloudflare while preserving its static-first visitor experience and progressively absorbing the dynamic community capabilities from `events-management`.

## Program Phases

- [ ] Phase 0: Lock the product, data, deployment, and cutover decisions; establish measurable parity and readiness gates.
- [ ] Phase 1: Migrate the existing static website to Cloudflare with visitor-visible parity and no organizer feature changes.
- [ ] Phase 2: Reconcile and harden the Supabase foundation before adding new dynamic writers.
- [ ] Phase 3: Move organizer authentication, access control, and the initial read-only organizer UI into the website.
- [ ] Phase 4: Relationalize event-owned content and remove the website's external events-management dependency.
- [ ] Phase 5: Pull community features into the website one verified vertical slice at a time.
- [ ] Phase 6: Build new community features directly in the website repository.
- [ ] Phase 7: Retire superseded compatibility storage, routes, credentials, and deployments after production parity is verified.

## Key Questions

1. Can the website remain pre-rendered by default while using Astro server routes only for organizer and dynamic community paths?
2. Which `events-management` backend modules are Cloudflare-compatible as-is, and which still depend on Bun or local filesystem behavior?
3. Should dynamic services run inside the Astro Worker, as a same-zone service-bound Worker, or in a temporary compatibility Worker during migration?
4. Which data is already durable in Supabase, and which JSON-backed prototype data must be migrated before organizer parity is possible?
5. What exact UI and URL parity defines a no-regression website cutover?

## Decisions Made

- The website is the parent product and repository for the final user-facing experience.
- Public pages remain static-first; runtime rendering is introduced only where freshness, authentication, or writes require it.
- The Cloudflare migration is completed and verified before organizer/community feature movement begins.
- Phase 0 and Phase 1 are hosting-only: they do not add Supabase, organizer authentication, dynamic Worker routes, or a replacement for the existing meetup-data path.
- Features move as end-to-end vertical slices with rollback points, not as a one-shot repository merge.
- Proposed for user approval: use Cloudflare Worker with Static Assets as the current Astro 6 implementation of the requested static-hosting-plus-Workers model.
- During migration, unextracted backend routes may be reached only through a private Cloudflare Service Binding; the final browser contract remains same-origin.
- Supabase Postgres is the durable source of truth for all dynamic organizer/community data; Supabase Auth and Storage remain the identity/media services, while repository YAML remains limited to stable editorial website content.
- Durable Objects may coordinate live sessions but do not replace Supabase for durable quiz definitions, participation, results, or history.

## Errors Encountered

- A zsh glob for optional `.env.*.example` files aborted the environment-key inventory; reran against the two known env files explicitly.
- `status` is a read-only zsh parameter, so the anonymous REST status probe failed on its first pass; renamed the loop variable to `http_code` and reran successfully.

## Status

**Phase 0 in progress** - The immediate scope is limited to migrating the current static Astro website from GitHub Pages to Cloudflare Workers with Static Assets. Supabase, organizer UI/auth, and community migration remain documented future phases and are not part of this cutover. The website repository remains read-only while the existing deployment configuration is reviewed.
