# DevCongress Community

[![CI](https://github.com/devcongress/events-management/actions/workflows/ci.yml/badge.svg)](https://github.com/devcongress/events-management/actions/workflows/ci.yml)
[![Status](https://img.shields.io/badge/status-active%20development-e8117f?style=flat-square)](docs/README.md)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-deployed-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://em.devcongress.org)
[![Cloudflare Worker](https://img.shields.io/badge/Cloudflare%20Worker-deployed-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://events-management.admins-a7d.workers.dev)

[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Hono](https://img.shields.io/badge/Hono-API-e36002?style=flat-square)](https://hono.dev/)
[![Bun](https://img.shields.io/badge/Bun-runtime-000000?style=flat-square&logo=bun&logoColor=white)](https://bun.sh/)
[![pnpm](https://img.shields.io/badge/pnpm-10-f69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-f5e642?style=flat-square)](LICENSE)

DevCongress Community is the practical backstage for DevCongress meetups: the place where a good idea becomes an event people can actually find, attend, and remember. It helps organizers publish events, review talks, follow up with speakers, import attendance, collect feedback, and run a live learning room without scattering the work across spreadsheets, inboxes, and “who has the latest link?” messages.

The app is a Vue 3 + Vite frontend with a Hono API. Cloudflare Pages/Workers and Supabase back the deployed path; JSON compatibility storage remains only for domains still being migrated to relational tables.

---

## Overview

**What it helps a small organizer team keep moving:**

- Give the community a trustworthy home for meetup details, CFPs, archives, and post-event feedback
- Keep event publishing, talk review, speaker follow-up, attendance, media, feedback, and quiz setup in one organizer workspace
- Turn Luma CSV exports into monthly attendance signals instead of another abandoned folder of spreadsheets
- Protect organizer work with Supabase-backed access, short-lived app sessions, and scoped Annual Conference responsibilities
- Serve the public and organizer experience through Cloudflare Pages/Workers with same-origin `/api/*` routing

### Production posture

The organizer and public-write boundaries are hardened, the forward-only hardening migrations are applied, and the repository checks run in CI. Production MFA, alerting, backup restoration, retention, live RLS verification, and runtime performance measurements are ongoing operational assurance—not unresolved application implementation work.

See the [technical-debt register](docs/reference/technical-debt.md) for evidence, impact, exit criteria, and the distinction between repository work and platform work.

For the full system shape, see [Architecture](docs/architecture.md) and [Implementation Notes](docs/implementation.md).

---

## Quick Start

### For Contributors

Bring your curiosity; the fastest way to understand the app is to seed it, make an event move through its lifecycle, and follow the data into the organizer workspace.

```bash
pnpm install
cp .env.example .env.local
pnpm seed
pnpm dev
```

The local Vite server starts the Vue app and same-origin Hono API, usually at `http://localhost:5173`.

See [Local Development](docs/technical/local-development.md) for environment variables, Supabase notes, seed data, and troubleshooting.

### Common Commands

```bash
pnpm dev                # Start local dev server
pnpm seed               # Reset JSON mock data
pnpm typecheck          # Run Vue/TypeScript checks
pnpm build              # Typecheck and build production assets
pnpm start              # Serve the built app with Bun
pnpm test               # Run Vitest tests
pnpm verify:public-api  # Verify public meetup API contract
```

---

## Documentation

Start with the centralized [Documentation Map](docs/README.md) if you are unsure where to go next.

### User Guides

| Guide | Description |
|---|---|
| [Community Guide](docs/user-guides/community-guide.md) | Public event, CFP, archive, feedback, and quiz flows |
| [Organizer Guide](docs/user-guides/organizer-guide.md) | Event operations, talks, speakers, attendance, feedback, and quiz hosting |

### Technical Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | App shape, route groups, API surface, persistence, realtime, and auth strategy |
| [Implementation Notes](docs/implementation.md) | Entry points, module breakdown, constants, and key flows |
| [Local Development](docs/technical/local-development.md) | Setup, scripts, seed data, environment variables, and troubleshooting |
| [Auth](docs/auth.md) | Supabase-only organizer auth, roles, sessions, and security notes |
| [Deployment Plan](docs/deployment-cloudflare-supabase.md) | Cloudflare Pages/Workers, Supabase, and production rollout notes |
| [Public Meetup API](docs/public-meetups-api.md) | Read-only meetup API contract for `devcongress.org` integration |
| [Technical Debt](docs/reference/technical-debt.md) | Evidence-backed production and architecture debt register |

### Reference

| Document | Description |
|---|---|
| [Environment Variables](docs/reference/environment-variables.md) | Local and production configuration reference |
| [Routes](docs/reference/routes.md) | Public, organizer, and API route map |
| [Patterns](docs/patterns.md) | Naming, folders, data access, UI tokens, and anti-patterns |
| [Technical Debt](docs/reference/technical-debt.md) | Production-readiness and contributor planning backlog |
| [Decisions](docs/decisions.md) | Architecture decision records |
| [Changelog](docs/changelog.md) | Feature-level project history |

### Features

| Feature | Status | Description |
|---|---|---|
| [Event Publishing](docs/features/event-publishing.md) | Active | Create, publish, and expose meetups to the public API |
| [Luma Attendance](docs/features/luma-attendance.md) | Active | Import Luma CSV exports and review attendance insights |
| [Feedback](docs/features/feedback.md) | Active | Route feedback and event-scoped post-event forms |
| [Quiz](docs/features/quiz.md) | Preview | Live quiz flow, builder, and rollout limits |

[How to document new features](docs/features/README.md)

---

## Technology Stack

- **Frontend:** Vue 3, Vite 6, TypeScript, Pinia, Tailwind CSS
- **API:** Hono served through Vite in development and Bun in production
- **Persistence:** JSON mock DB today, Supabase/Postgres migration path underway
- **Media:** Supabase Storage for meetup cover and photo uploads
- **Testing:** Vitest, vue-tsc, public API verification script
- **Deployment:** Cloudflare Pages, Cloudflare Workers, Supabase

---

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and update the relevant file under [docs/](docs/README.md) when a feature, workflow, route, or architecture boundary changes.

---

## Security

Do not commit real secrets. Use `.env.local` for local credentials and keep server-only keys out of browser-prefixed variables.

If you find a vulnerability, follow [SECURITY.md](SECURITY.md).

---

## License

This project is available under the [MIT License](LICENSE).
