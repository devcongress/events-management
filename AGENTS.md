# AGENTS.md

## Codebase Index

This project has pre-generated docs. **At the start of every session, read `docs/INDEX.md` first** — it points to the relevant detail docs so you don't need to re-scan the whole codebase.

### Auto-update rules

After completing any feature or bugfix:
1. Update only the sections of `docs/` that changed — do not rewrite entire files.
2. Update `docs/changelog.md` with a dated entry describing what changed.
3. If an architectural decision was made, add a new ADR to `docs/decisions.md`.
4. Do not update docs after every small edit — only at natural checkpoints (before commit, before PR, or when explicitly asked).

## Feature This Workflow

When the user says **"feature this"** or **"feature-this"**, treat it as an explicit Git workflow request, not merely a request to implement a product feature.

1. Audit the current branch and complete worktree first. Unless the user narrows the scope, include all current intended changes and preserve unrelated user work.
2. Create a new branch from the current base branch using `feature/<concise-descriptive-slug>`. If the worktree is dirty, carry its changes onto the new branch without losing or rewriting them.
3. Run verification appropriate to the combined change before committing.
4. Stage all intended files and create exactly one detailed commit.
5. Use a concise conventional commit subject. In the commit body, list each logical sub-change as a bullet and finish with the verification performed.
6. Push the feature branch to `origin` and set its upstream.
7. Open a ready-for-review pull request against the base branch.
8. After creating the PR, replace any placeholder body with a polished description containing:
   - a concise summary;
   - user-facing changes grouped by logical sub-feature;
   - important implementation notes;
   - verification and check results.
9. Verify that the local and remote commit SHAs match, the worktree is clean, the PR targets the correct branches, and required checks pass. Report the branch, commit, PR link, and check status.

Do not merge the PR unless the user explicitly asks.

## Animation Standard

Use `$ui-animations` (`/Users/TT/.codex/skills/ui-animations/SKILL.md`) for all animation decisions in this app.

- Animate only when motion clarifies state, preserves spatial continuity, prevents jarring changes, or gives direct feedback.
- Prefer CSS transitions over keyframes for interactive UI so motion can be interrupted cleanly.
- Animate `transform` and `opacity` only; avoid layout-affecting properties such as width, height, margin, and padding.
- Use exact transition properties, not `transition: all`.
- Keep everyday UI motion under 300ms; use 100-160ms for press feedback and 150-250ms for small popovers/dropdowns.
- Use the UI animation curves: spring `cubic-bezier(0.34, 1.56, 0.64, 1)`, smooth `cubic-bezier(0.16, 1, 0.3, 1)`, and fast `cubic-bezier(0.4, 0, 0.2, 1)`.
- Add subtle `:active { transform: scale(0.97); }` feedback to pressable controls unless it would fight a larger interaction.
- Gate hover motion with `@media (hover: hover) and (pointer: fine)`.
- Respect `prefers-reduced-motion` by removing movement and disabling repeated motion.
