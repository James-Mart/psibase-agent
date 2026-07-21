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

A local work tracker that replaces the giant "plan" doc: an agent authors a
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
  selected Project) with derived status badges, git/stack chips (branch,
  mergeBase, PR, merged, sha), Task `assignee` and Epic/Story/Task
  `needsAttention` badges, and blocked rows
  dimmed. Archived Epic / Story / Task rows are hidden by default; a "Show
  archived" toggle (client preference, next to search) reveals them. Row hover
  offers Archive / Unarchive (same cascade as CLI).
- **Detail** — the issue's `description.md` rendered as GFM (with `issue:`
  cross-links and relative links to that issue's `attachments/`), an edit form
  (Task `assignee`, Epic/Story/Task `needsAttention`, Task `status`, git facts),
  Archive / Unarchive in the header (Epic / Story / Task), attachment
  list/upload/download, a git/stack panel, Task `assignee` and Epic/Story/Task
  `needsAttention` badges (`attentionReason` when
  set), and (for Stories with `specReview` set) a spec-review chip (`passed` /
  `failed`; omitted when unset), (for Tasks with `noDiff` set) a no-diff chip
  (omitted when unset), and a per-issue chat.
- Changes to `issues/` on disk (from the CLI or by hand) appear live over SSE
  without a refresh.

## When to use it

Open this UI when a human wants to watch or steer an agent working a stack of
PRs. Agents themselves do **not** use this UI — they drive the CLI.

## Agent skills (pick by task)

- **`issue-tracker-authoring`** — turn a spec/plan into a standalone
  Project > (Epic | project-level Story) > Task tree: Epic grain, Story vs Task
  grain, vertical slices, blockedBy/diamond, localized prose, and a completeness
  pass — then author the whole tree as one nested YAML doc and `apply` it.
  Glossary and apply-doc shape: SPEC.md. Work it: issue-tracker-work.
- **`issue-tracker-work`** — Implement <epic-or-story-id>: load this skill to coordinate the work.
- **`issue-tracker-plan`** — grill an Idea, a pre-implementation (`todo`)
  Epic, or a not-started project-level Story to shared understanding, show an
  outline, then on one post-outline yes migrate into one or more plan trees via
  `apply`, auto-run `issue-tracker-plan-polish` on every resulting root, then
  spawn `issue-tracker-retro` per root after polish succeeds (story-form or
  epic-form per Epic grain; multi-root when authoring split criteria apply —
  N applies, mint new root ids, delete source only after all succeed;
  single-root keeps Idea → new id + delete, or in-place rewrite).
- **`issue-tracker-plan-polish`** — polish an existing Epic or
  project-level Story: spawn five parallel read-only check agents
  (`plan-no-ambiguity`, `plan-dry`, `plan-authoring-conformance`,
  `plan-dependency-order`, `plan-internal-consistency`), aggregate findings
  into one apply proposal (epic-form or story-form by root kind), auto-apply
  when safe, summarize after, escalate only when unsafe.
- **`issue-tracker-project-docs`** — author or revise one Project supporting
  doc (vision, coding standards, or design system) at a time: grill for
  goals/content, write as a Project attachment or workspace file, and record
  its location in `supportingDocs`.
