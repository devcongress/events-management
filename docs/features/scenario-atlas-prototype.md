# Scenario Atlas Prototype

## Overview

Scenario Atlas is a standalone interaction prototype for exploring exhaustive application workflows before release. It is intentionally not wired into the EMS organizer console yet.

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

## Prototype file

Open [`prototypes/scenario-atlas.html`](../../prototypes/scenario-atlas.html) directly in a browser. The file contains its sample workflow data and interactions so it can be reviewed without running the EMS application.

## Known boundary

This branch packages the approved proof of concept alongside the owner email preview work. Turning the Atlas into a production EMS feature still requires durable workflow/scenario storage, generation rules, authentication and permissions, evidence capture, test delegation, and execution integrations.
