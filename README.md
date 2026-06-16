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

DevCongress Community is an open-source event operations app for running DevCongress meetups. It helps organizers publish community events, collect talk submissions, manage speaker follow-up, review attendance, gather post-event feedback, and prepare live quiz sessions.

The current app is a Vue 3 + Vite frontend served by a Bun/Hono API. It is still prototype-stage in a few places, but the public event API, organizer workflows, attendance analysis, and feedback flows are actively being shaped for real community use.

---

## Feature Highlights

- **Mobile-first community experience** with compact phone layouts, sticky header navigation, route-aware feedback entry, and iOS-safe input behavior across public and organizer flows.
- **Event publishing and archive management** for upcoming meetups, past meetup archives, public slide links, and website-facing event metadata that can feed `devcongress.org`.
- **Organizer operations workspace** for event creation, talk review, speaker follow-up, event checklists, media management, and a prototype admin console backed by same-origin auth.
- **Attendance operations and month gating** with Luma CSV imports, attendance summaries, no-show/check-in analysis, and calendar rules that prevent uploads before the allowed meetup window opens.
- **Two-layer feedback protection** with a public floating feedback bot, standalone mobile feedback page, organizer feedback inbox, server-side rate limiting, and Cloudflare Turnstile verification on route feedback.
- **Cloudflare-ready deployment path** with a live Pages frontend, Worker API deployment, same-origin `/api/*` proxying, and focused production checks around auth, feedback, and public meetup reads.

---

## What You Can Do

**For community members**

- Browse upcoming and past meetups
- Submit CFP talks for open events
- View published talk archives and slide links
- Join live quiz sessions when a host opens one
- Send protected route-level app feedback while testing
- Complete post-event feedback forms

**For organizers**

- Create and publish meetup events
- Manage CFP status, talk review, and speaker access
- Track event run-sheet milestones
- Import Luma attendance CSV exports during the allowed month window
- Review no-shows, check-in rates, and monthly attendance trends
- Review route feedback in the Feedback Hub and manage post-event feedback forms
- Prepare quiz sessions from manual questions or uploaded papers

---

## Quick Start

### Prerequisites

- Node.js 20 or newer
- pnpm 10 or newer
- Bun 1.1 or newer for the production server

### Run Locally

```bash
pnpm install
cp .env.example .env.local
pnpm seed
pnpm dev
```

The Vite dev server starts the Vue app and same-origin Hono API. Open the printed local URL, usually `http://localhost:5173`.

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

See [Local Development](docs/technical/local-development.md) for environment variables, Supabase notes, and troubleshooting.

---

## Documentation

### Start Here

| Document | Description |
|---|---|
| [Documentation Map](docs/README.md) | A guided index for contributors, organizers, and integrators |
| [Local Development](docs/technical/local-development.md) | Setup, scripts, env vars, seed data, and troubleshooting |
| [Contributing](CONTRIBUTING.md) | How to propose changes, structure PRs, and document features |
| [Security Policy](SECURITY.md) | How to report vulnerabilities and handle secrets |

### User Guides

| Guide | Description |
|---|---|
| [Community Guide](docs/user-guides/community-guide.md) | Public event, CFP, archive, feedback, and quiz flows |
| [Organizer Guide](docs/user-guides/organizer-guide.md) | Event operations, talks, speakers, attendance, feedback, and quiz hosting |

### Technical Documentation

| Document | Description |
|---|---|
| [Architecture](docs/architecture.md) | App shape, route groups, API surface, persistence, and auth strategy |
| [Implementation Notes](docs/implementation.md) | Entry points, module breakdown, config, and key flows |
| [Deployment Plan](docs/deployment-cloudflare-supabase.md) | Cloudflare and Supabase deployment direction |
| [Public Meetup API](docs/public-meetups-api.md) | Read-only API contract for devcongress.org integration |
| [Migration Parity](docs/migration-parity.md) | Notes for the Next-to-Vue migration checkpoint |

### Reference

| Document | Description |
|---|---|
| [Environment Variables](docs/reference/environment-variables.md) | Local and production configuration reference |
| [Routes](docs/reference/routes.md) | Public, organizer, and API route map |
| [Patterns](docs/patterns.md) | Naming, folders, data access, UI tokens, and anti-patterns |
| [Decisions](docs/decisions.md) | Architecture decision records |
| [Changelog](docs/changelog.md) | Feature-level project history |

### Features

| Feature | Status | Description |
|---|---|---|
| [Event Publishing](docs/features/event-publishing.md) | Active | Create, publish, and expose meetups to the public API |
| [Luma Attendance](docs/features/luma-attendance.md) | Active | Import Luma CSV exports and review attendance insights |
| [Feedback](docs/features/feedback.md) | Active | Route feedback and event-scoped post-event forms |
| [Quiz](docs/features/quiz.md) | Preview | Live quiz flow, builder, and current rollout limits |

[How to document new features](docs/features/README.md)

---

## Project Status

This repository is being prepared for open-source collaboration. The public/community UI and organizer workflows are usable, but a few production concerns are still being finalized:

- JSON mock data is still used for several workflows during prototyping.
- Supabase is being introduced as the durable source for public meetup data and feedback.
- Admin auth is a same-origin prototype cookie flow, not a full role-based production auth system.
- Live quiz realtime currently uses polling and is marked as a later rollout area.
- Public deployments can hide the Organizer header button with `VITE_SHOW_ORGANIZER_LINK=false`.

The full debt register is tracked in [Technical Debt](docs/reference/technical-debt.md).

If you are contributing, please read [Contributing](CONTRIBUTING.md) and check [Architecture](docs/architecture.md) before changing data or route boundaries.

---

## Tech Stack

- **Frontend:** Vue 3, Vite 6, TypeScript, Pinia, Tailwind CSS
- **API:** Hono served through Vite in development and Bun in production
- **Persistence:** JSON mock DB today, Supabase/Postgres migration path underway
- **Media:** Supabase Storage for meetup cover and photo uploads
- **Feedback:** Supabase-backed app feedback plus event feedback schema
- **Testing:** Vitest, vue-tsc, public API verification script

---

## Contributing

Contributions are welcome. Good first contributions include docs cleanup, route polish, accessibility fixes, test coverage, and small feature hardening.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

---

## Security

Do not commit real secrets. Use `.env.local` for local credentials and keep server-only keys out of browser-prefixed variables.

If you find a vulnerability, follow [SECURITY.md](SECURITY.md).

---

## License

This project is available under the [MIT License](LICENSE).
