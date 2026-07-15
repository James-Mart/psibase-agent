---
name: issue-tracker
description: >-
  Launch the issue-tracker web UI: a dark shadcn app over a file-backed
  Project > Epic > Branch > Commit work tracker that maps onto git stacked PRs,
  with Markdown specs, per-issue chat, derived ready/blocked state, and a live
  Ready view. Use when the user asks to open the issue tracker, launch the
  tracker UI, see the Project/Epic/Branch/Commit tree, or watch agents work a
  stack of PRs live.
disable-model-invocation: true
---

# Issue Tracker

A local work tracker that replaces the giant "plan" doc: an agent decomposes a
spec into a **Project > Epic > Branch > Commit** tree that maps directly onto git
stacked PRs, then works the tree while a human watches live in the browser. A
**Project** is the top-level container (an organizational grouping of Epics); a
directory per issue on disk is the source of truth; the CLI (for agents) and
HTTP/SSE (for the UI) are thin adapters over one validated service layer.

Read [SPEC.md](../../SPEC.md) for the full glossary (Kinds, relationships,
derived state) and design rationale.

## Start the dev server

```bash
cd .cursor/plugins/issue-tracker/app && npm install && npm run dev
```

This starts:

- Vite dev server on http://localhost:8060 (frontend)
- Express API + SSE server on http://localhost:8061 (backend)

Tell the user the UI is available at http://localhost:8060.

## What it shows

- **Project sidebar** — a collapsible sidebar lists Projects; selecting one
  scopes the tree and Ready view to that Project. Create/rename/delete Projects
  from the sidebar (deleting a Project cascades to all its Epics/Branches/Commits).
- **Tree view** — collapsible Epic > Branch > Commit outline (scoped to the
  selected Project) with derived status badges, git/stack chips (branch, base,
  PR, merged, sha), assignee and needs-attention badges, and blocked rows dimmed.
- **Ready view** — a flat list of the issues that can be picked up right now.
- **Detail** — the issue's `description.md` rendered as GFM (with `issue:`
  cross-links), an edit form, a git/stack panel, assignee/attention badges, and
  (for Branches with `specReview` set) a spec-review chip (`passed` / `failed`;
  omitted when unset), (for Commits with `noDiff` set) a no-diff chip (omitted
  when unset), and a per-issue chat.
- Changes to `issues/` on disk (from the CLI or by hand) appear live over SSE
  without a refresh.

## When to use it

Open this UI when a human wants to watch or steer an agent working a stack of
PRs. Agents themselves do **not** use this UI — they drive the CLI.

## Agent skills (pick by task)

- **`issue-tracker-decompose`** — turning a spec/plan into a standalone
  Project > Epic > Branch > Commit tree declaratively: author the whole tree as
  one nested YAML doc and `apply` it (idempotent upsert, re-applied as the plan
  evolves); deciding Branch vs Commit grain.
- **`issue-tracker-work`** — coordinating implementation of one Epic:
  delegating each commit to fresh subagents (implement/validate/revise) and
  recording git progress through the CLI; inspect the stack with `tree`/`show`.
- **`issue-tracker-authoring`** — create/update/`apply` semantics and the new
  inspection verbs (`show`, `tree`), pointing at `cli.ts --help` as the
  authoritative command reference; the shared tool doc the other two build on.
