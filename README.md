# DevCongress Community

[![CI](https://github.com/Elvis020/devCon-comm/actions/workflows/ci.yml/badge.svg)](https://github.com/Elvis020/devCon-comm/actions/workflows/ci.yml)
[![Status](https://img.shields.io/badge/status-prototype-e8117f?style=flat-square)](docs/README.md)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-deployed-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://devcon-comm.pages.dev)
[![Cloudflare Worker](https://img.shields.io/badge/Cloudflare%20Worker-deployed-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://devcongress-comm-api.elvis-yt211.workers.dev)

[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![Hono](https://img.shields.io/badge/Hono-API-e36002?style=flat-square)](https://hono.dev/)
[![Bun](https://img.shields.io/badge/Bun-runtime-000000?style=flat-square&logo=bun&logoColor=white)](https://bun.sh/)
[![pnpm](https://img.shields.io/badge/pnpm-10-f69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-f5e642?style=flat-square)](LICENSE)

DevCongress Community is an open-source event operations app for running DevCongress meetups. It helps organizers publish events, manage CFP and speaker follow-up, import attendance, collect feedback, and prepare live quiz sessions.

The app is a Vue 3 + Vite frontend served by a Bun/Hono API, with Cloudflare and Supabase support being introduced gradually as the prototype moves toward production use.

---

## Overview

**Key capabilities:**

- Public meetup pages, archive pages, CFP entry, and post-event feedback forms
- Organizer workflows for event publishing, talk review, speaker access, attendance, media, feedback, and quiz setup
- Luma CSV attendance import with monthly event-window checks and attendance summaries
- Supabase-backed organizer auth and public data paths where production persistence is already active
- Cloudflare Pages and Worker deployment path with same-origin `/api/*` routing

For the full system shape, see [Architecture](docs/architecture.md) and [Implementation Notes](docs/implementation.md).

---

## Quick Start

### For Contributors

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
| [Auth](docs/auth.md) | Supabase organizer auth, local fallback, roles, sessions, and security notes |
| [Deployment Plan](docs/deployment-cloudflare-supabase.md) | Cloudflare Pages/Workers, Supabase, and production rollout notes |
| [Public Meetup API](docs/public-meetups-api.md) | Read-only meetup API contract for `devcongress.org` integration |

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
