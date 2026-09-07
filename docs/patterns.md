# Patterns

## Naming Conventions

- **Files:** `kebab-case` for utility files; Vue SFCs use `PascalCase.vue`
- **Components:** `PascalCase` (`DashboardView`, `TalkReviewCard`)
- **Composables:** `use-` prefix for future Vue composables
- **API routes:** Active feature routes live in cohesive registrars under `server/routes/*`; `server/app.ts` owns app-wide middleware and composition while legacy Next APIs remain under `app/api`
- **Types:** `PascalCase` interfaces, `camelCase` properties (`QuizSession`, `event_date`)
- **DB helpers:** `verb + entity` pattern (`getAllEvents`, `getEventById`, `createEvent`, `updateEvent`)
- **Constants:** `SCREAMING_SNAKE_CASE` (`POLL_INTERVAL_MS`, `REVEALING_DURATION_MS`)

---

## Folder Conventions

- `src/` — active Vue app shell, routes, views, stores, and future composables
- `src/components/ui/` — active Vue shared primitives mounted or reused across views, such as the global Sonner toaster
- `src/lib/` — browser-side app helpers such as `notify`, alongside legacy-compatible shared modules
- `server/` — active Hono API and Bun production entrypoint
- `server/routes/` — cohesive Hono route families; keep schemas and feature-only transport adapters beside their owning registrar
- `server/http/` — shared HTTP policies and request helpers used by more than one route family
- `app/(public)/` — legacy Next public routes kept as migration reference
- `app/(admin)/admin/` — legacy Next admin routes kept as migration reference
- `app/api/` — legacy Next API routes kept as migration reference
- `components/` — legacy React components split by domain (`admin/`, `archive/`, `slides/`) + `ui/`
- `lib/mock-db/` — one file per entity, all exported functions are async
- `hooks/` — legacy React hooks only; future Vue state should use composables under `src/`, adding a state library only when an active shared store requires it

---

## Recurring Code Patterns

### Data Fetching in Vue Views
Active Vue views call Hono APIs with same-origin `fetch`:
```ts
const response = await fetch('/api/overview');
const overview = await response.json();
```

### Error Handling in API Routes
Use Hono context responses from active API handlers:
```ts
app.get('/api/events', async (c) => c.json(await getAllEvents()));
```

### Route Module Boundaries

Register one coherent route family through a single typed function. Keep global request IDs, security headers, body limits, CORS, and authentication in `server/app.ts`; route registrars assume those policies have already been installed.

Line count is a review trigger, not an automatic split. Extract a file only when the new module owns a capability, workflow, policy, adapter, or transformation. Avoid endpoint-per-file layouts and generic service containers.

New feature routes should extend a domain registrar under `server/routes/` rather than add another handler directly to `server/app.ts`.

### Mock DB Access
Always use typed entity helpers from `lib/mock-db/` — never call `readData`/`writeData` directly from routes:
```ts
import { getAllEvents, createEvent } from '@/lib/mock-db/events';
const events = await getAllEvents();
```

### Quiz State Progression
Keep quiz state reads and phase changes separate:
```ts
await fetch('/api/quiz/state/advance', { method: 'POST', body: JSON.stringify({ session_id }) });
const state = await fetch(`/api/quiz/state?sessionId=${session_id}`);
```

`GET /api/quiz/state` should stay read-only. Hide `correct_index` from `current_question`; reveal player-specific correctness through `player_result.correct_index` only after a player has answered.

### Role Checks
Auth and role checks have not been migrated yet. Add them in the Hono server first so the Vue app can rely on same-origin session cookies.

### Design Token Usage

#### Shared form presentation

`src/styles/forms.css`, loaded after legacy styles, owns regular field geometry and focus/error/disabled treatment. Existing `.editorial-input` controls inherit it; new/custom native text-entry fields use `.app-form-control`. The baseline is 50px minimum height, 8px corners, a one-pixel border, and 16px body text. Shared dropdown/date triggers use the same appearance while preserving their compact densities.

Keep file/checkbox/radio inputs, calendar time inputs, composite quiz options, compact search/allocation controls, and inline editors specialized. Dropdown portals remain opt-in (`teleport`) because DOM placement affects drawer focus boundaries; enabled portals use the calculated viewport-clamped width.

Shared textareas are not manually resizable (`resize: none`); longer content remains accessible through vertical scrolling (`overflow-y: auto`).

Use `.app-form-help` for neutral requirements and actionable disabled-submit explanations. Preserve short single-page forms; the conference CFP uses the same three steps on desktop and mobile. `LearningOutcomesEditor` owns the speaker-specific 3–5 completed-outcome requirement, retains at least one input row, and manages stable identity, add/remove focus, and reduced-motion-aware entry feedback. The broader form audit is deferred in `form-polish-backlog.md`.

Verification: `pnpm test`, `pnpm build`, `node scripts/verify-shared-forms.mjs`, and `node scripts/verify-public-form-styles.mjs`. With the local app running, also run `node scripts/verify-cfp-stepper.mjs`. The shared/public-route checks start isolated frontend servers. Browser fixtures block API writes; they do not certify production submissions.

#### Brand tokens
Use `dc-*` Tailwind classes for all brand colors. For programmatic style generation (e.g. status badges), use `getStatusBadge(status)` from `lib/design-system.ts`:
```ts
const { className, label } = getStatusBadge(talk.status);
```

The active app aligns with the `devcongress.org` light theme:

- Background: `#F5F2E8`
- Ink/text: `#111111`
- Brand yellow: `#F5E642`
- Brand pink: `#E8117F`
- Subtle border: `#E0DDD4`
- Mid text: `#555555`
- Muted text: `#888888`

Use the established cream, yellow, pink, and ink treatment consistently across organizer routes. Keep `tailwind.config.ts`, `src/styles.css`, and `lib/design-system.ts` synchronized when applying the theme.

#### Typography hierarchy

Keep the established type pairing and assign weight by information role:

| Role | Family | Weight |
|---|---|---:|
| Body and prose | Inter | 400 |
| Form values, supporting emphasis | Inter | 500 |
| Eyebrows, labels, navigation, statuses, buttons | IBM Plex Mono | 600 |
| Section titles, card titles, major metrics | Inter | 700 |
| Page titles and hero statements | Inter | 800 |

Use IBM Plex Mono only for compact operational language, technical values, and live codes; names, titles, descriptions, abstracts, and other human-written content stay in Inter. Never request IBM Plex Mono above 700, use `font-black`, or introduce one-off 650/750/850/950 weights. Shared weight tokens live in `src/styles.css` and are mirrored by Tailwind and `lib/design-system.ts`.

### Toast Notifications
Use `notify` from `src/lib/notify.ts` for app notifications so all messages target the globally mounted `AppToaster` and inherit the editorial/ops Sonner theme. Do not import `toast` from `vue-sonner` directly inside views unless a feature needs a deliberate separate toaster.

### Copy-Link Feedback
Use `src/components/ui/AppCopyButton.vue` for organizer actions that copy a public or private link and `src/lib/clipboard.ts` for the write itself. The owning view drives the shared `idle -> copying -> copied -> idle` state only after the helper confirms success. Keep record-scoped feedback keyed to its record, keep the copied result visible briefly, reset failures immediately, and avoid one-off labels, icons, or success colors that cause the control to resize.

---

## Testing Conventions

- Seed script at `data/seed.ts` serves as the manual data setup mechanism.
- Run with: `pnpm seed`
- Run tests with: `pnpm test`

---

## Anti-Patterns Observed

- **Composition-root growth** — `server/app.ts` still contains many domain handlers and orchestration helpers. Continue extracting cohesive route families in behavior-preserving commits; do not solve this with endpoint-per-file fragmentation.
- **Source-string UI tests** — several large organizer views are asserted through source text. Prefer mounted workflow tests before decomposing those views so behavior remains protected across component extraction.
