# Large-File Architecture Audit — 2026-09-07

## Purpose

This audit treats line count as a discovery signal rather than a quality verdict. A large file is a refactor priority when it also owns several unrelated workflows, has a wide dependency surface, changes frequently, or forces tests to load more of the application than the behavior under test.

The preferred direction is more cohesive files with deep, typed boundaries—not one function per file, arbitrary line-count compliance, generic repositories, or a dependency-injection framework.

## Current hotspots

| Priority | File | Lines before this refactor | Assessment | Recommended boundary |
|---:|---|---:|---|---|
| 1 | `server/app.ts` | 12,453 | Critical responsibility hotspot: 107 imports, 191 routes, 223 named top-level functions, global middleware, schemas, data-source selection, provider orchestration, domain transformations, and handlers | Domain routers; keep only app-wide middleware and composition in the root |
| 2 | `src/views/admin/AdminTalksView.vue` | 1,991 | Four workflows plus proposal decisions, email preparation, private links, archive publication, and follow-ups | Talk-management controller plus CFP, review, archive, and backfill panels |
| 3 | `src/views/admin/AdminRegistrationsView.vue` | 2,466 | Five tabs covering guests, capacity, messaging, blasts, and check-in lifecycle | Registration workspace controller plus tab-owned components |
| 4 | `src/views/admin/AdminEventView.vue` | 1,740 | Publication, checklist, profile, outline, shared links, media, and Slack operations | Event overview shell with capability-owned panels and a tested outline domain module |
| 5 | `src/views/admin/AdminAuditLogView.vue` | 2,568 | Five operational products, although 1,370 lines are scoped CSS | Activity, delivery, preview, short-link, and archive-recovery panels with colocated styles |
| 6 | `src/lib/api.ts` | 1,222 | Cohesive transport concern but a broad 137-export discovery surface with 39 consumers | Domain API clients behind a temporary compatibility barrel |
| 7 | `src/App.vue` | 937 | Session lifecycle, idle expiry, viewport routing, navigation, mobile keyboard behavior, and quiz polling affect every route | Extract session and viewport controllers only after domain routing is stable |

## Large files that are not first-order problems

- `src/views/SystemDesignPresenterView.vue` is 1,433 lines but only about 174 lines are script; most of the file is cohesive presenter markup and scoped styling.
- `src/views/EventRegistrationView.vue` is 1,048 lines but only about 111 lines are script.
- `src/views/admin/AdminAnnualConferenceView.vue` is 1,107 lines but only about 135 lines are script.
- `types/supabase.ts` should eventually be generated from the database schema rather than hand-split.
- `lib/annual-conference-work-plan.ts` is 1,103 lines largely because it contains the 2026 seed plan. The seed can move to a data module later while planning invariants remain together.
- Large scenario tests may be grouped by workflow for navigation, but production coupling takes precedence over test-file line counts.

## Guardrails

These are review triggers, not failing limits:

- Review a production TypeScript module above roughly 700 lines for responsibility count, public API size, dependency fan-out, and change frequency.
- Review a Vue view above roughly 1,200 lines or 600 script lines for independently testable panels and controller state.
- Do not extract a module unless it can own a coherent capability, policy, workflow, adapter, or transformation.
- Prefer one domain router per meaningful route family; do not create one file per endpoint.
- Keep Zod schemas at the transport boundary, domain invariants in services/domain modules, and Supabase/mock selection behind repositories or request adapters.
- Keep app-wide request IDs, security headers, body limits, CORS, and authentication ordered once in the composition root.
- Preserve exact HTTP contracts during structural extraction and keep full-app characterization tests until isolated module tests provide equivalent coverage.
- New feature routes should not be added directly to `server/app.ts`; extend an existing domain router or introduce a cohesive new one.

## First extraction completed

The complete Annual Conference speaker HTTP surface moved from `server/app.ts` into `server/routes/annual-conference-speakers.ts`:

- public conference CFP read and submission;
- organizer inbox, call state, logistics deadline, decision, and email retry;
- private accepted-speaker workspace read and update.

Supporting boundaries now own Annual Conference request composition, speaker transport schemas, acceptance delivery, public-intake protection, public-origin resolution, safe internal errors, same-process speaker locking, and Hono application bindings.

Global middleware and path-based public/protected classification remain in `server/app.ts`, preserving their established ordering. Cross-instance proposal correctness remains in the atomic database operations; the extracted keyed lock is explicitly only a same-process coordination aid.

Result: `server/app.ts` is now 11,627 lines, 826 fewer than the audited baseline. The feature router is 629 lines; its schemas and delivery adapter are 53 and 62 lines respectively.

## Recommended sequence

1. Extract the remaining Annual Conference planning, volunteer-access, and finance routes using the existing request service, repositories, and typed services.
2. Extract quiz routes and colocate their paper parsing, leaderboard, and runtime helpers behind the existing quiz-state boundary.
3. Extract registrations and blasts as separate but cooperating route modules; preserve the transactional-email capacity reserve between them.
4. Complete the existing event-submission extraction by moving its transport handlers beside the lifecycle/request adapter.
5. Extract feedback routes, then event/archive/attendance routes.
6. Split `src/lib/api.ts` by domain while retaining a re-export barrel during consumer migration.
7. Refactor the four multi-workflow admin views behind mounted workflow tests, starting with Talks and Registrations.

Each step should be its own behavior-preserving commit with focused route tests, full typecheck/tests/build, and a line-count/responsibility audit of the new module so the monolith is not merely renamed.
