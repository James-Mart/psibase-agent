---
name: issue-tracker
description: >-
  Launch the issue-tracker web UI: a dark shadcn app over a file-backed
  Project > Epic > Story > Task work tracker that maps onto git stacked PRs,
  with Markdown specs, per-issue chat, and derived blocked/status state. Use
  when the user asks to open the issue tracker, launch the tracker UI, see the
  Project/Epic/Story/Task tree, or watch agents work a stack of PRs live.
disable-model-invocation: true
---

# Issue Tracker

A local work tracker that replaces the giant "plan" doc: an agent decomposes a
spec into a **Project > Epic > Story > Task** tree that maps directly onto git
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
  scopes the tree to that Project. Create/rename/delete Projects from the
  sidebar (deleting a Project cascades to all its Epics/Stories/Tasks).
- **Tree view** — collapsible Epic > Story > Task outline (scoped to the
  selected Project) with derived status badges, git/stack chips (branch, base,
  PR, merged, sha), `assignee` and `needsAttention` badges, and blocked rows
  dimmed. Archived Epic / Story / Task rows are hidden by default; a "Show
  archived" toggle (client preference, next to search) reveals them. Row hover
  offers Archive / Unarchive (same cascade as CLI).
- **Detail** — the issue's `description.md` rendered as GFM (with `issue:`
  cross-links and relative links to that issue's `attachments/`), an edit form
  (`assignee`, `needsAttention`, `status`, git facts), Archive / Unarchive in
  the header (Epic / Story / Task), attachment list/upload/download, a
  git/stack panel, `assignee` / `needsAttention` badges (`attentionReason` when
  set), and (for Stories with `specReview` set) a spec-review chip (`passed` /
  `failed`; omitted when unset), (for Tasks with `noDiff` set) a no-diff chip
  (omitted when unset), and a per-issue chat.
- Changes to `issues/` on disk (from the CLI or by hand) appear live over SSE
  without a refresh.

## When to use it

Open this UI when a human wants to watch or steer an agent working a stack of
PRs. Agents themselves do **not** use this UI — they drive the CLI.

## Agent skills (pick by task)

- **`issue-tracker-decompose`** — turning a spec/plan into a standalone
  Project > Epic > Story > Task tree declaratively: author the whole tree as
  one nested YAML doc and `apply` it (idempotent upsert, re-applied as the plan
  evolves); deciding Story vs Task grain. Companion attachments: defer to
  issue-tracker-authoring.
- **`issue-tracker-work`** — coordinating implementation of one Epic:
  delegating each task to subagents in a per-task QA loop (implementor →
  code-quality gate on `qa` → revise/resume until `passed` or escalate) and
  recording git progress through the CLI; inspect the stack with `tree`/`show`.
  The coordinator only reads gates and spawns/resumes — it does not write
  Task `status`/`qa` or count revise rounds. Completion spawns
  **`issue-tracker-retro`** once when every Story in the Epic is `merged`
  and Epic `retro` is unset — post-implement confusion retro: mine the work
  run for tracker/work-loop meta confusion and apply a residual Epic under
  Project `issue-tracker` (or comment clean on the source Epic); not invoked
  directly.
- **`issue-tracker-authoring`** — create/update/`apply` semantics, kind-scoped
  `get`/`set`, the **Attachments** model + verbs (`attach` / `attachments` /
  `detach`), and inspection (`show`/`summary`/`tree`), pointing at
  `cli.ts --help` as the authoritative command reference; the shared tool doc
  the other skills build on.
- **`issue-tracker-plan`** — grill an Idea or a pre-implementation (`todo`)
  Epic to shared understanding, then migrate into a detailed Epic tree via
  `apply` (new Epic id + delete Idea, or in-place epic-form rewrite); offers
  `issue-tracker-plan-polish` afterward (yes/no, no auto-chain).
- **`issue-tracker-plan-polish`** — polish an existing Epic: spawn four
  parallel read-only check agents (`plan-no-ambiguity`, `plan-dry`,
  `plan-authoring-conformance`, `plan-dependency-order`), aggregate findings
  into one epic-form `apply` proposal, and `issue apply` only after user
  approval.
