# Scenario Atlas Local Tool

## Overview

Scenario Atlas is a local-only companion for exploring and recording exhaustive application workflows before release. It is intentionally not wired into the EMS organizer console or production build.

The prototype focuses on two seed workflows:

- an external person submitting an event for organizer review;
- an organizer approving or declining a pending event.

## Interaction model

- The Atlas shows one complete workflow graph at a time.
- Selecting a checkpoint replaces the graph with every derived scenario at that checkpoint.
- Selecting a scenario replaces the page again with that scenario's checkpoint path.
- Back and breadcrumb navigation return through the workflow hierarchy one level at a time.
- The first unresolved checkpoint records the actual failure or untested operation; later checkpoints are marked not reached.
- Coverage remains a separate summary rather than competing with the primary graph.

## Visual direction

- Inter is used for interface and workflow copy.
- JetBrains Mono is used for scenario IDs, checkpoint labels, statuses, and graph metadata when it is installed locally.
- The default theme is a restrained white Linear/Notion-style workspace, with an optional dark theme.
- Navigation transitions animate only opacity and transforms, remain under 300ms, and respect reduced-motion preferences.

## Run locally

```bash
pnpm atlas
```

Open `http://127.0.0.1:4178`. Set `SCENARIO_ATLAS_PORT` only when that local port is unavailable.

Workflow definitions live in `tools/scenario-atlas/catalog/workflows.json`. The catalog declares required coverage dimensions; validation fails if a declared actor, state, boundary, failure mode, or terminal outcome is neither covered nor explicitly excluded.

Scenario status and notes are stored in `.scenario-atlas/atlas.sqlite`. That directory is ignored and never becomes part of a commit or production build.

The approved static interaction study remains available at [`prototypes/scenario-atlas.html`](../../prototypes/scenario-atlas.html).

## Known boundary

The current implementation provides a tracked catalog, local SQLite state, first-unresolved propagation, Coverage, and manual result notes. Automatic code-impact generation, authenticated browser execution, evidence attachments, delegation, and safe email/Slack capture adapters remain later phases.

The server binds to `127.0.0.1`, refuses production and Cloudflare execution, rejects cross-origin mutations, and is absent from the EMS Vite and Bun production entrypoints.
