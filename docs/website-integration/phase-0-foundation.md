# Phase 0: Foundation Decisions and Readiness Gate

## Purpose

Phase 0 turns the static-hosting migration into an approved, testable contract before any implementation touches the website repository. Its only goal is to move the existing Astro website from GitHub Pages to Cloudflare Workers with Static Assets, without changing visitor behavior.

## Current Scope

**In scope:** static Astro build, Cloudflare Worker with Static Assets, deploy workflow, custom-domain cutover, rollback, and measurable visitor parity.

**Explicitly deferred:** Supabase, organizer authentication, Organizer/Sign out UI, dynamic Worker routes, events-management API replacement, community features, Durable Objects, and all database/data migrations.

## Working Architecture

| Concern | Decision for the target product |
| --- | --- |
| Public website | The Astro website is the final public and organizer-facing product surface. |
| Static content | Editorial and marketing content remains pre-rendered and repository-owned. |
| Cloud runtime | A Cloudflare Worker serves the Astro `dist/` directory as static assets. No Worker script is required for this phase. |
| Dynamic product | Deferred. This cutover preserves the present static website behavior and data-refresh model. |
| Legacy app | Deferred. `events-management` remains unchanged and continues to provide its current public meetup feed. |

## Confirmed Constraints

- Do not change the website repository during Phase 0.
- Preserve the visitor-visible website before adding organizer/community behavior.
- Do not change public UI, routes, metadata, assets, content, or current meetup-data behavior during the cutover.
- Do not add Supabase credentials, runtime auth, Worker API routes, or database writes during this phase.
- The current build-time meetup fetch remains unchanged; its replacement is a later, separate decision.

## Decisions Requiring Owner Approval

| ID | Decision | Recommended default | Why it must be explicit |
| --- | --- | --- | --- |
| P0-01 | Static-hosting topology | Cloudflare Worker with Static Assets, rather than a new literal Pages project | This is the current Astro-supported way to combine static assets and Worker routes, but it changes deployment ownership and tooling. |
| P0-02 | Production repository | `devcongress/website` is the production deployment source; the local fork remains a development fork | The current local fork and production upstream are not the same commit. |
| P0-03 | Phase 1 parity baseline | Capture the current production `devcongress.org` site and select one approved source commit | A no-regression cutover needs a single authoritative content/UI baseline. |
| P0-04 | Static URL handling | Preserve Astro's existing trailing-slash and generated 404 behavior in the Worker asset configuration | Static asset routing must not alter SEO or existing links. |
| P0-05 | Cutover guardrail | Keep GitHub Pages deployable for the agreed soak window and roll back on parity regressions | A hosting-only move must be reversible without a data rollback. |

## Evidence Already Collected

- The website is an Astro static site with build-time meetup ingestion from `events-management`; public meetups can therefore be stale until a website deployment.
- The website domain already uses Cloudflare nameservers, allowing a Worker Custom Domain cutover once Phase 1 is approved.

## Phase 0 Exit Criteria

- [ ] P0-01 through P0-05 are explicitly approved or deliberately changed.
- [ ] One source commit and one production-parity reference are recorded.
- [ ] URL, visual, content, performance, and operational parity checks are accepted for Phase 1.
- [ ] A Worker static-assets configuration and CI deployment approach are reviewed against the current Astro build output.
- [ ] Rollback owner, rollback trigger, and soak-window duration are agreed before the custom-domain cutover.
- [ ] The website repository is explicitly authorized for Phase 1 implementation.

## What Phase 0 Does Not Do

- It does not deploy Cloudflare resources.
- It does not alter DNS, GitHub Pages, Supabase schema, Auth providers, Storage, secrets, or application data.
- It does not create a branch, commit, or pull request.
- It does not modify `/Users/TT/Documents/personal/forks/website`.

## Next Action

Once the five owner decisions are confirmed, capture the approved website baseline and begin the static-only Cloudflare migration in Phase 1. Supabase and product integration work resume only in their later phases.
