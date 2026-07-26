# Patterns

## Naming Conventions

- **Files:** `kebab-case` for utility files; Vue SFCs use `PascalCase.vue`
- **Components:** `PascalCase` (`DashboardView`, `TalkReviewCard`)
- **Composables:** `use-` prefix for future Vue composables
- **API routes:** Active APIs live in `server/app.ts` or `server/routes/*`; legacy Next APIs remain under `app/api`
- **Types:** `PascalCase` interfaces, `camelCase` properties (`QuizSession`, `event_date`)
- **DB helpers:** `verb + entity` pattern (`getAllEvents`, `getEventById`, `createEvent`, `updateEvent`)
- **Constants:** `SCREAMING_SNAKE_CASE` (`POLL_INTERVAL_MS`, `REVEALING_DURATION_MS`)

---

## Folder Conventions

- `src/` — active Vue app shell, routes, views, stores, and future composables
- `src/components/ui/` — active Vue shared primitives mounted or reused across views, such as the global Sonner toaster
- `src/lib/` — browser-side app helpers such as `notify`, alongside legacy-compatible shared modules
- `server/` — active Hono API and Bun production entrypoint
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
Use `dc-*` Tailwind classes for all brand colors. For programmatic style generation (e.g. status badges), use `getStatusBadge(status)` from `lib/design-system.ts`:
```ts
const { className, label } = getStatusBadge(talk.status);
```

The next rebrand should align public app surfaces with the `devcongress.org` light theme rather than preserving the dark companion palette:

- Background: `#F5F2E8`
- Ink/text: `#111111`
- Brand yellow: `#F5E642`
- Brand pink: `#E8117F`
- Subtle border: `#E0DDD4`
- Mid text: `#555555`
- Muted text: `#888888`

Keep `tailwind.config.ts`, `src/styles.css`, and `lib/design-system.ts` synchronized when applying the theme.

### Toast Notifications
Use `notify` from `src/lib/notify.ts` for app notifications so all messages target the globally mounted `AppToaster` and inherit the editorial/ops Sonner theme. Do not import `toast` from `vue-sonner` directly inside views unless a feature needs a deliberate separate toaster.

---

## Testing Conventions

- Seed script at `data/seed.ts` serves as the manual data setup mechanism.
- Run with: `pnpm seed`
- Run tests with: `pnpm test`

---

## Anti-Patterns Observed

- **No auth middleware** — active Hono APIs do not have server-side access control yet. Add session/role checks before exposing admin mutations.
- **Simulated delay in API routes** — `SIMULATED_DELAY_MS` `setTimeout` in every route. Remove before production.
