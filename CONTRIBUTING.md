# Contributing to DevCongress Community

Thank you for helping improve DevCongress Community. This app is built for a real community, so good contributions are practical, documented, and easy for another organizer or developer to understand later.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Orientation](#project-orientation)
- [Code Style](#code-style)
- [Branch and Commit Guidance](#branch-and-commit-guidance)
- [Pull Request Process](#pull-request-process)
- [Documentation Expectations](#documentation-expectations)
- [Testing](#testing)
- [Security and Secrets](#security-and-secrets)

---

## Development Setup

### Prerequisites

- Node.js 20 or newer
- pnpm 10 or newer
- Bun 1.1 or newer if you want to run the production server locally
- Git

### Install and Run

```bash
git clone <repository-url>
cd events-management
pnpm install
cp .env.example .env.local
pnpm seed
pnpm dev
```

The app runs as a Vue SPA with a same-origin Hono API. See [Local Development](docs/technical/local-development.md) for environment variables and common troubleshooting.

---

## Project Orientation

Start with these files before changing code:

| File | Why it matters |
|---|---|
| [README.md](README.md) | Product overview and contributor entry points |
| [docs/README.md](docs/README.md) | Human-friendly documentation map |
| [docs/architecture.md](docs/architecture.md) | System shape, data flow, auth strategy, and route groups |
| [docs/implementation.md](docs/implementation.md) | Entry points, modules, configuration, and non-obvious behavior |
| [docs/patterns.md](docs/patterns.md) | Naming, folder conventions, UI tokens, and anti-patterns |

The legacy Next/React implementation remains in `app/`, `components/`, and `hooks/` as migration reference. New active UI work should go under `src/` unless you are explicitly cleaning up migration leftovers.

---

## Code Style

### TypeScript and Vue

- Prefer explicit types at API and persistence boundaries.
- Keep Vue components focused on one screen or reusable primitive.
- Use `PascalCase.vue` for Vue components and `kebab-case.ts` for utilities.
- Use same-origin `fetch('/api/...')` from Vue views.
- Use typed mock DB helpers from `lib/mock-db/`; do not call generic read/write helpers directly from routes.

### UI and Design

- Preserve the DevCongress light visual system on public/community pages.
- Keep `tailwind.config.ts`, `src/styles.css`, and `lib/design-system.ts` aligned when changing tokens.
- Use `AppDropdown` instead of native selects where the app already uses custom dropdowns.
- Use `notify` from `src/lib/notify.ts` for app toasts.
- Avoid adding hover-only behavior that hides critical actions from touch users.

### Server and Data

- Active API routes live in `server/app.ts`.
- Keep server-only secrets out of browser code and out of `VITE_` variables.
- Treat JSON persistence as prototype infrastructure; keep new durable production work aligned with Supabase migrations.
- Admin mutations should stay behind organizer auth checks.

---

## Branch and Commit Guidance

Use a short, descriptive branch name:

```bash
git checkout -b feature/attendance-export-polish
```

Commit messages should explain the user-facing change first:

```text
feat: improve attendance import feedback

- Show CSV validation errors near the import action
- Preserve the previous import when a replacement fails
- Add documentation for Luma export formatting
```

Keep commits scoped. If a change includes UI, API, and docs, split it when that makes review easier.

---

## Pull Request Process

Before opening a PR:

1. Rebase or merge the latest main branch.
2. Run the relevant checks.
3. Update documentation for user-facing or architectural changes.
4. Include screenshots or short videos for UI changes.
5. Call out any migration, seed data, or environment variable changes.

Recommended checks:

```bash
pnpm typecheck
pnpm build
pnpm test
```

For public meetup API changes, also run:

```bash
pnpm verify:public-api
```

PR descriptions should include:

- Summary of the change
- Why it is needed
- Screenshots for UI work
- Testing performed
- Any follow-up work left intentionally out of scope

---

## Documentation Expectations

Documentation is part of the change, not an afterthought.

When adding or changing a feature:

1. Add or update a feature doc in `docs/features/`.
2. Link the doc from `docs/features/README.md`.
3. Update the relevant user guide in `docs/user-guides/` if behavior changes.
4. Update technical/reference docs if routes, env vars, persistence, or deployment changes.
5. Add a short entry to `docs/changelog.md` at a natural checkpoint.

Use [docs/features/_TEMPLATE.md](docs/features/_TEMPLATE.md) for new feature docs.

---

## Testing

### Automated Checks

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm verify:public-api
```

### Manual Testing

For UI changes, test at least:

- Desktop and mobile widths
- Keyboard navigation and visible focus states
- Empty/loading/error states
- The route you changed and one nearby route that shares the same component or API

For organizer changes, verify the action through the organizer console, not only the API.

---

## Security and Secrets

- Never commit real credentials.
- Keep `.env.local` local.
- Use `SUPABASE_SERVICE_ROLE_KEY` only on the server.
- Do not expose server-only keys through `VITE_` variables.
- Run a local secret scan before opening a large PR if you touched config, docs, or deployment files.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Conduct

Be clear, kind, and practical. This project serves a community, and the collaboration style should reflect that.
