# Notes: Archive material follow-up

## Confirmed current behavior

- `archive_backfill` links create a new Talk and intentionally allow empty abstract, bio, and slides URL fields.
- `selected_speaker_confirmation` links require only the resource URL and create a new Talk from the selected proposal.
- The current reminder endpoint records a counter but does not send email.
- Published Talks are publicly derived from the `published` status, so the follow-up must preserve that status while only updating content fields.

## Follow-up contract

- One link belongs to one event and one existing Talk.
- The link carries an explicit list of requested fields: `abstract`, `bio`, and/or `slides_url`.
- GET returns only the existing values and requested fields needed for the form.
- POST validates only requested fields, updates the existing Talk, then consumes the link. A failed consume triggers restoration of the original Talk fields.
- Owner-only issue/retry APIs send a new single-use link; raw tokens remain unpersisted.

## Implemented evidence

- `20260808150000_archive_materials_follow_up.sql` adds `talk_id`, `requested_fields`, shape validation, and an active-link lookup index to the private link table.
- Owner issuance persists pending delivery before Resend, records provider acceptance/failure, and audits successful sends.
- Completion keeps a published Talk published, updates only the selected fields, and consumes the link after the record update.

---

# Notes: Separate Calls for Speakers

## Confirmed current behaviour

- The public monthly form is `src/views/CfpView.vue`, posts to `/api/cfp`, and is strictly limited to upcoming monthly Events.
- It currently requires name, email, presentation type, title, topic, summary, and bio. The server stores proposals through the mock speaker-submission adapter.
- Selected monthly proposals already have secure private completion links; archive-material follow-up can request bio, summary, and/or slides without creating a duplicate Talk.
- The Annual Conference has speaker-planning tasks but no public CFP form, campaign, proposal store, or review inbox.
- Public pages ultimately belong to `devcongress.org`; EMS owns private organizer operations and write APIs.

## Proposed shape

- Add a relational speaker-call campaign and proposal store, with an exclusive Event-or-edition parent constraint and indexed parent/status reads.
- Add canonical short routes for monthly and conference calls while retaining `/cfp/:eventId` as a compatible monthly alias.
- Add campaign-scoped Turnstile, public rate limits, duplicate resistance, organizer authorization, audit events, and RLS/service-role-only persistence.
- Reuse the selected-speaker and materials follow-up workflows after acceptance.

## Material architecture boundary

- `speaker_submissions`, `speaker_intake_links`, and `Talk` are all event-bound through `event_id`.
- Annual Conference editions are currently independent of `community_events`.
- Recommended model: add a private, one-to-one `conference_event_id` relationship from each edition to an internal Event with `series_type = special` and `format = conference`. The Annual Conference Speakers UI remains edition-scoped, but it uses that event only as durable programme identity.
- Alternative: a separate conference proposal/selection/archive schema. This would duplicate the existing lifecycle and create a second implementation to maintain.

---

# Notes: EMS Architecture Deepening

## Read-only findings

- `server/app.ts` is 9,708 lines and currently mixes app composition, transport, authorization, validation, persistence selection, provider orchestration, and domain decisions.
- Community submissions span public intake, amendment links, organizer review, publication, removal, audit rows, outbox records, Resend, and Slack across separate route regions.
- Event workspace views reassemble event-scoped query/cache behavior independently.
- Privileged routes combine global admission, local role/capability checks, and manual audit calls.
- Audit Log combines audit history, email delivery health, quota, outbox recovery, blasts, and short links.
- Compatibility stores still require a clear repository boundary before any relational migration programme.

## Chosen lifecycle shape

- Prefer explicit `submit`, `review`, and `management` operations over a broad untyped dispatcher.
- Keep Hono parsing, Turnstile, fixed-window limits, signed-capability extraction, and `waitUntil` scheduling at the transport edge.
- Keep owned transition/outbox/audit intent in the lifecycle/store boundary; mock only Resend and Slack at their external edges.

## Candidate dependency categories

- Community submission lifecycle: owned persistence plus mocked external providers.
- Route composition and protected mutations: primarily local-substitutable/in-process.
- Event workspace client data: owned remote HTTP boundary with TanStack Query cache adapter.
- Operations read model: owned read data plus mocked provider observation.
- Persistence migration: local-substitutable adapter contracts with owned Supabase production adapter.

---

# Notes: Large-File Architecture Audit 2026-09-07

## Scope

- Audit source files by physical lines, exported/public surface, responsibility count, dependency fan-out, and test seams.
- Prioritize `server/app.ts`, while comparing other TypeScript and Vue hotspots so the recommendation is repository-wide rather than anecdotal.
- Preserve route behavior, middleware ordering, organizer authorization, rate limits, and persistence selection.

## Findings

- `server/app.ts`: 12,453 lines, 191 registered HTTP routes, roughly 4,000 lines of imports/middleware/schemas/helpers before the first route, and about 8,000 lines of route registrations. It changes in at least the latest 50 commits and is both the HTTP composition root and the implementation home for many domains.
- Server production TypeScript outside `server/app.ts` totals only about 2,000 lines. The entry point is therefore over six times larger than all other server production modules combined.
- `src/views/admin/AdminAuditLogView.vue` (2,568), `AdminRegistrationsView.vue` (2,466), `AdminTalksView.vue` (1,991), and `AdminEventView.vue` (1,740) each coordinate multiple independently meaningful panels/workflows and merit later component/controller extraction.
- `src/views/SystemDesignPresenterView.vue` (1,433) is long but comparatively cohesive: one presenter workflow plus substantial template/style content. It is a lower priority than the multi-workflow admin views.
- `src/lib/api.ts` (1,222) has a broad export surface but low per-function complexity. Domain client modules with a compatibility barrel would improve discovery, but splitting it before the server boundary would deliver less risk reduction.
- `lib/annual-conference-work-plan.ts` (1,103) mixes sizeable 2026 seed data with reusable validation/read-model logic. Moving seeds into a fixture module is safe, but this file is not a runtime orchestration hotspot.

## Working recommendation

- Use a ratcheted, responsibility-aware audit rather than a universal maximum line count.
- First extraction: move the complete Annual Conference speaker HTTP surface (public CFP, organizer review, acceptance delivery, and private logistics workspace) behind one feature router. This is a cohesive vertical slice with fresh end-to-end coverage and removes new growth from the monolithic composition root.
- Keep app-wide middleware in `server/app.ts`; do not duplicate auth, body limits, CORS, request IDs, or error handling in feature routers.
- Follow with feature routers in risk-contained slices: Annual Conference planning/finance, registrations/blasts, event submissions, feedback, quiz, then remaining event/archive operations.
- For Vue, extract stable child workflows and composables from the four multi-workflow admin views; do not split template/style purely to satisfy a line threshold.

## Implemented first slice

- Registered all nine Annual Conference speaker endpoints through `registerAnnualConferenceSpeakerRoutes(app)`.
- Split the route registrar (629 lines), Zod schemas (53), and acceptance delivery (62) by responsibility.
- Moved shared request behavior into `server/http/` and Annual Conference request composition into `server/annual-conference-request.ts`.
- Preserved the global unauthenticated-route classifier and middleware installation order in `server/app.ts`.
- Reduced `server/app.ts` from 12,453 to 11,627 lines without changing route paths or product behavior.
- Added a route-registration test and passed the focused proposal/security suite plus TypeScript compilation.

## Independent review

- A senior-engineer agent reviewed the uncommitted architecture diff against `ba9cd89`, including exact route/response parity, middleware and authorization order, circular dependencies, local locking, token/email security, tests, and documentation.
- The review found no P0-P3 issues. It confirmed that all nine routes preserve their prior contracts, global middleware still precedes registration, the shared lock remains module-scoped, and the 629-line registrar is a cohesive workflow boundary rather than an arbitrary shallow split.
