---
name: issue-tracker-decompose
description: >-
  Decompose a spec into a standalone Project > Epic > Branch > Commit tree in the
  issue-tracker by authoring one nested YAML doc and `apply`-ing it. Use when
  planning a stack of git PRs, deciding Branch vs Commit grain, or turning a plan
  doc into tracked issues. Assumes the CLI from issue-tracker-authoring; glossary
  in SPEC.md.
---

# Issue Tracker — Decompose a Spec into the Tree

Decomposing into the tracker is producing a **plan artifact**, so it is permitted
in **Plan mode** (the tree is the plan). The tree is the **entire design** — it
must replace any prior plan doc and stand alone. No `description.md` may reference
an external file; inline companion material (schemas, diagrams, API specs) into
the Branch/Commit that uses it. Localize prose to the tier where it belongs —
don't dump the whole spec in the Epic and leave children title-only.

## Author declaratively: one YAML doc, then `apply`

Write the **whole tree as a single nested YAML doc** and `apply` it — do not
build it up with imperative `create`/`add` calls and hand-threaded ids.

```bash
cd .cursor/plugins/issue-tracker/app && npx tsx cli.ts apply plan.yaml
```

- **Nesting is the structure.** Kind comes from where a node sits
  (`project` → `epics` → `branches` → `commits`, and `stacked` for a Branch that
  forks off another Branch); `partOf` and `stackedOn` are inferred from the
  nesting, never written by hand. The full doc shape is in
  [SPEC.md](../../SPEC.md#apply-doc-format).
- **Ids are author-chosen and stable.** Every node carries a required kebab `id`
  you pick (unique, slug-safe, title-independent). Because you choose them up
  front you can author `issue:<id>` cross-links and Epic-level `blockedBy` ids
  before anything exists — no create-order dependency, no id capture.
- **`blockedBy` is the only explicit cross-reference, and it lives on the
  Epic.** Containment (`partOf`) and the fork point (`stackedOn`) come from
  nesting; `blockedBy` is an **Epic-level** list of other same-Project Epic ids —
  the sole edge that crosses an Epic boundary. Model dependencies *within* an
  Epic as **stacks** (`stackedOn`), not `blockedBy`. When a unit needs code from
  two parallel Branches at once (a multi-parent / cross-stack dependency that a
  single fork point can't express), don't reach for a Branch-level edge: split it
  into a **separate Epic that is `blockedBy` the first**, keeping Epics small
  (see the diamond in SPEC.md — keeps parallel branches parallel instead of
  linearizing them, at the cost of waiting for the blocking Epic to merge).
- **Re-apply as the plan evolves.** `apply` is an idempotent upsert that
  prunes-by-default: nodes you add appear, nodes you drop from the doc are
  deleted, and unchanged nodes are untouched. It is atomic (a doc that would
  break integrity changes nothing) and never touches runtime/progress state
  (status, git facts, assignee, attention, chat), so re-applying an edited doc
  mid-implementation is safe. Keep the doc as the editable source and re-`apply`
  rather than patching the tree with one-off imperative verbs.
- **Scope the doc to a subtree.** Prune-by-default is bounded to the doc's root.
  To edit one epic or branch without touching its siblings, root the doc there
  and reference the enclosing parents by id: an **epic form** (`project: <id>`
  string + `epic:` object) reconciles just that epic within the project, and a
  **branch form** (`project: <id>` + `epic: <id>` strings + `branch:` object)
  reconciles just that branch and its commit list within the epic. A branch doc
  owns only its own commits (stacked children belong to the epic) and preserves
  the branch's fork point. Full shapes in [SPEC.md](../../SPEC.md#apply-doc-format).

## Grain: Branch vs Commit

- **Project** — the top-level container that groups related Epics. Organizational
  only (no status); its `description.md` is a short overview of the whole product
  area. Every Epic must belong to a Project.
- **Epic** — overview + cross-cutting design principles/invariants only (what
  governs every phase). Not the full spec.
- **Branch** = one PR / shippable unit: scope, approach, and any data-model or
  interface detail specific to it. Normally several commits; one commit's worth
  of work is a Commit, not a Branch.
- **Commit** = one git commit: implementor-resolution detail (what to do + how to
  verify), no deeper than a good plan section. Tree nesting supplies context, so
  linking commit → epic is unnecessary. **Commits run in the order they appear in
  the doc** (top-to-bottom); authors never specify `order` — array position is
  implementation order.

**Each Branch must be independently mergeable to `main`.** Branches merge to
`main` (stacked children after their fork-point Branch, in stack order), and only
Branches merge — Commits are internal steps that ship together as the Branch's
one PR. So never split one cohesive change across Branches such that merging one
leaves `main` broken (e.g. a schema change in one Branch and the code that
consumes it in another): keep it in a single Branch as multiple Commits. See the
stacked-PR merge model in [SPEC.md](../../SPEC.md).

A plan's *phases* are the Branch grain, its *todos/steps* the Commit grain. Group
related todos into one Branch and land them as commits; split only a genuinely
oversized phase. One todo → one Branch (a stack of one-commit PRs with an empty
Commit tier) means you split at the wrong tier.

Completeness pass before done: every part of the source design is represented; no
description references an external file; no Branch/Commit is title-only; no
Branch holds just one commit and the Branch count isn't merely the bullet count;
the Epic holds no phase- or commit-level detail that belongs in children.
