---
name: issue-tracker-decompose
description: >-
  Decompose a spec into a standalone Project > Epic > Branch > Commit tree in the
  issue-tracker. Use when planning a stack of git PRs, deciding Branch vs Commit
  grain, or turning a plan doc into tracked issues. Assumes the CLI from
  issue-tracker-authoring; glossary in SPEC.md.
---

# Issue Tracker — Decompose a Spec into the Tree

The tree is the **entire design** — it must replace any prior plan doc and stand
alone. No `description.md` may reference an external file; inline companion
material (schemas, diagrams, API specs) into the Branch/Commit that uses it.
Localize prose to the tier where it belongs — don't dump the whole spec in the
Epic and leave children title-only.

- **Project** — the top-level container that groups related Epics. Organizational
  only (no status); its `description.md` is a short overview of the whole product
  area. Every Epic must belong to a Project.
- **Epic** — overview + cross-cutting design principles/invariants only (what
  governs every phase). Not the full spec. Belongs to a Project (`--part-of`).
- **Branch** = one PR / shippable unit: scope, approach, and any data-model or
  interface detail specific to it. Normally several commits; one commit's worth
  of work is a Commit, not a Branch.
- **Commit** = one git commit: implementor-resolution detail (what to do + how to
  verify), no deeper than a good plan section. Tree nesting supplies context, so
  linking commit → epic is unnecessary.

Grain: a plan's *phases* are the Branch grain, its *todos/steps* the Commit
grain. Group related todos into one Branch and land them as commits; split only a
genuinely oversized phase. One todo → one Branch (a stack of one-commit PRs with
an empty Commit tier) means you split at the wrong tier.

Build order:

0. `create-project` (or reuse an existing one via `projects`) — the Epic's
   `--part-of` target.
1. `create-epic --part-of <project>` — seed `--description` with overview +
   cross-cutting invariants.
2. `add-branch` for each Branch seam; write each Branch's `description.md` with
   that unit's full prose. Independent Branches off one base can run in parallel.
3. `add-commit` for each atomic step in landing order; write each Commit's
   implementor-resolution detail.
4. Wire deps: `--stacked-on`/`set-stacked-on` = the one Branch you physically
   fork from (git base; omit = `main`); `block --by` = other Branches whose PRs
   must merge first but that you do **not** fork from (see the diamond in
   SPEC.md — keeps parallel branches parallel instead of linearizing them).

Completeness pass before done: every part of the source design is represented; no
description references an external file; no Branch/Commit is title-only; no
Branch holds just one commit and the Branch count isn't merely the bullet count;
the Epic holds no phase- or commit-level detail that belongs in children.
