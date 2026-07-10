---
name: issue-tracker-work
description: >-
  Work an issue-tracker stack: record git progress and fan out parallel subagents
  over the ready set. Use when an agent implements a tracked stack, records
  branch/PR/commit/merged facts, or a main agent dispatches subagents across one
  Epic. Assumes the CLI from issue-tracker-authoring; glossary in SPEC.md.
---

# Issue Tracker — Work the Stack

The tracker is metadata-only: **you** run git/gh, then record the result. Never
set status on a Branch or Epic — Branch/Epic status and ready/blocked derive
automatically (see SPEC.md).

- branch created → `set-branch-name <branch> <name>`
- commit start → `set-status <commit> in-progress`
- commit landed → `set-status <commit> done` + `set-commit <commit> <sha>`
- PR opened → `open-pr <branch> <url>`
- PR merged → `set-merged <branch>`

## Fan out parallel subagents

The **ready set** (`ready`, or the `ready` array from `list`) lets a main agent
decide what to dispatch with no external memory: the `todo` Commits whose Branch
is started and whose earlier siblings are done, plus the not-started Branches
whose base and blockers are satisfied.

1. `ready` → dispatch one subagent per item. Items map to distinct issue ids, so
   their writes touch different files. The service layer serializes writes only
   **within one process**; separate CLI invocations are not mutually locked, so
   parallelism is safe because each subagent owns a distinct issue — keep each
   subagent to its own Branch to avoid collisions.
2. Each subagent works, records progress via the CLI, and escalates with
   `attention --reason`/`comment` instead of guessing. A ready not-started Branch
   has no `branchName` yet — the subagent creates the git branch and records it
   with `set-branch-name`.
3. On return, run `ready` again for the next wave. Repeat until `nothing ready`
   and `list` → `derived[<epicId>].epicStatus === "done"`.

All state lives on disk and every derived fact is recomputed on read, so the loop
is fully **resumable**: any agent or human can run `list`/`ready` to reconstruct
where the stack stands. Give each subagent its issue id (and non-default
`ISSUES_DIR`); it rebuilds its own context from `list` and the issue's
`description.md`/chat.
