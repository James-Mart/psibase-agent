---
name: issue-tracker-decompose
description: >-
  Decompose a spec into a standalone Project > Epic > Story > Task tree in the
  issue-tracker by authoring one nested YAML doc and `apply`-ing it. Use when
  planning a stack of git PRs, deciding Story vs Task grain, or turning a plan
  doc into tracked issues. Assumes the CLI from issue-tracker-authoring; glossary
  in SPEC.md.
---

# Issue Tracker — Decompose a Spec into the Tree

Decomposing into the tracker is producing a **plan artifact**, so it is permitted
in **Plan mode** (the tree is the plan). The tree is the **entire design** — it
must replace any prior plan doc and stand alone. Companion material belongs
**with the issue that uses it** (prose in `description.md`, or opaque files as
attachments). Link/attach rules live in issue-tracker-authoring
(**Attachments**); the declarative/imperative field seam and other CLI verbs
live in issue-tracker-authoring and
[SPEC.md](../../SPEC.md#declarativeimperative-field-seam); do not restate them
here. Localize
prose to the tier where it belongs — don't dump the whole spec in the Epic and
leave children title-only, and don't enumerate in a parent the specific work its
children each cover
([SPEC.md](../../SPEC.md#parent-prose-must-not-restate-descendant-lists)).

## Author declaratively: one YAML doc, then `apply`

Write the **whole tree as a single nested YAML doc** and `apply` it — do not
build it up with imperative `create`/`add` calls and hand-threaded ids.

```bash
cd .cursor/plugins/issue-tracker/app && npx tsx cli.ts apply plan.yaml
```

- **Structure at Project vs below Epic.** Under a Project, each `children:`
  entry declares `kind: epic | idea` so Epics and Ideas can interleave (shared
  sibling order). Below an Epic, kind comes from child keys (`stories` →
  `tasks`, and `stacked` for a Story that forks off another Story). `partOf`
  and `stackedOn` are inferred from the nesting, never written by hand. The
  full doc shape is in [SPEC.md](../../SPEC.md#apply-doc-format).
- **Ids are author-chosen and stable.** Every node carries a required kebab `id`
  you pick (unique, slug-safe, title-independent). Because you choose them up
  front you can author `issue:<id>` cross-links and Epic-level `blockedBy` ids
  before anything exists — no create-order dependency, no id capture.
- **`blockedBy` is the only explicit cross-reference, and it lives on the
  Epic.** Containment (`partOf`) and the fork point (`stackedOn`) come from
  nesting; `blockedBy` is an **Epic-level** list of other same-Project Epic ids —
  the sole edge that crosses an Epic boundary. Model dependencies *within* an
  Epic as **stacks** (`stackedOn`), not `blockedBy`. When a unit needs code from
  two parallel Stories at once (a multi-parent / cross-stack dependency that a
  single fork point can't express), don't reach for a Story-level edge: split it
  into a **separate Epic that is `blockedBy` the first**, keeping Epics small
  (see the diamond in SPEC.md — keeps parallel stories parallel instead of
  linearizing them, at the cost of waiting for the blocking Epic to merge).
- **Re-apply as the plan evolves.** `apply` is an idempotent upsert that
  prunes-by-default: nodes you add appear, nodes you drop from the doc are
  deleted, and unchanged nodes are untouched. It is atomic (a doc that would
  break integrity changes nothing) and preserves runtime/progress fields and
  attachment bytes, so re-applying an edited doc mid-implementation is safe
  (see issue-tracker-authoring **Declarative apply** /
  [SPEC.md § Declarative/imperative field seam](../../SPEC.md#declarativeimperative-field-seam)).
  Re-`apply` the doc for plan-owned changes; do not patch plan-owned fields
  incrementally with `create`/`add` or kind `set`.
- **Scope the doc to a subtree.** Prune-by-default is bounded to the doc's root.
  To edit one epic or story without touching its siblings, root the doc there
  and reference the enclosing parents by id: an **epic form** (`project: <id>`
  string + `epic:` object) reconciles just that epic within the project, and a
  **story form** (`project: <id>` + `epic: <id>` strings + `story:` object)
  reconciles just that story and its task list within the epic. Epic/story forms
  leave Ideas untouched (Ideas are Project children only). A story doc owns only
  its own tasks (stacked children belong to the epic) and preserves the story's
  fork point. Full shapes in [SPEC.md](../../SPEC.md#apply-doc-format).

## Grain: Story vs Task

- **Project** — the top-level container that groups related Epics. Organizational
  only (no status); its `description.md` is a short overview of the whole product
  area. Every Epic must belong to a Project.
- **Epic** — overview + cross-cutting design principles/invariants only (what
  governs every phase). Not the full spec.
- **Story** = one PR / shippable unit: scope, approach, and any data-model or
  interface detail specific to it. Normally several tasks; one task's worth
  of work is a Task, not a Story.
- **Task** = one git commit: implementor-resolution detail (what to do + how to
  verify), no deeper than a good plan section. Must be a standalone vertical
  slice that leaves the tip buildable/testable ([SPEC.md](../../SPEC.md#kinds)).
  Tree nesting supplies context, so linking task → epic is unnecessary.
  **Tasks run in the order they appear in the doc** (top-to-bottom); authors
  never specify `order` — array position is implementation order.

**Each Story must be independently mergeable to `main`.** Stories merge to
`main` (stacked children after their fork-point Story, in stack order), and only
Stories merge — Tasks are internal steps that ship together as the Story's
one PR. So never split one cohesive change across Stories such that merging one
leaves `main` broken (e.g. a schema change in one Story and the code that
consumes it in another): keep it in a single Story as multiple Tasks. See the
stacked-PR merge model in [SPEC.md](../../SPEC.md).

### Interface seams

When a Task introduces or wires an interface, required API shape and field
names are owned by
[issue-tracker-authoring](../issue-tracker-authoring/SKILL.md#task-interface-seams);
do not restate the rule here.

### Task Change paths

When a Task Change names file paths, workspace-relative path rules are owned
by
[issue-tracker-authoring](../issue-tracker-authoring/SKILL.md#task-change-paths);
do not restate the rule here.

### Task shape: vertical slices, not horizontal layers

Normative rule lives in [SPEC.md](../../SPEC.md#kinds) (Task kind + stacked-PR
merge model): each Task must leave the Story tip **buildable and testable**.

**Prefer** vertical slices — one thin end-to-end cut of a capability (types +
implementation + a focused test) that stands alone.

**Avoid** horizontal layering that does not stand alone:

- **Bad:** Task 1 adds types/interfaces only; Task 2 "wires them up"; Task 3
  adds tests — or a half-migration Task that does not compile. Early Tasks do
  not prove anything on their own.
- **Good:** Task 1 adds one complete capability (types, implementation, and a
  focused test) that builds; Task 2 adds the next capability the same way.

A plan's *phases* are the Story grain, its *todos/steps* the Task grain. Group
related todos into one Story and land them as tasks; when mapping todos to
Tasks, reshape horizontal layering into vertical slices (split or merge until
each Task stands alone as above). Split only a genuinely oversized phase. One
todo → one Story (a stack of one-task PRs with an empty Task tier) means you
split at the wrong tier.

Completeness pass before done:

- Every part of the source design is represented.
- Companion material follows issue-tracker-authoring **Attachments** (no
  external workspace paths).
- No Story/Task is title-only; no Story holds just one task and the
  Story count isn't merely the bullet count.
- **Parent/child prose boundaries** — follow the localize guidance above
  ([SPEC.md](../../SPEC.md#parent-prose-must-not-restate-descendant-lists)):
  Epic holds no phase- or task-level detail that belongs in children; no
  Project/Epic/Story restates its children's per-unit list.
- Every Task that introduces or wires an interface spells out API shape and
  field names (see [Interface seams](#interface-seams)).
- Every Task Change that names file paths uses workspace-relative paths (see
  [Task Change paths](#task-change-paths)).
