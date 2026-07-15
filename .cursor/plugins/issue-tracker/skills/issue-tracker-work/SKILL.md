---
name: issue-tracker-work
description: >-
  Coordinate implementation of one tracked Epic without doing the work yourself:
  walk its `tree --epic <id>` outline top-to-bottom, delegating each commit to
  plugin subagents (implementor, validators; revise = implementor resume) and
  recording git facts through the CLI. Use when an agent works a tracked Epic to
  completion. Assumes the CLI from issue-tracker-authoring; glossary in SPEC.md.
---

# Issue Tracker — Work the Stack

Coordinate the implementation of one **Epic** without doing the implementation
yourself. You (the agent invoked with the Epic) are the **coordinator**. Your
context is precious: delegate all implementation, verification, and review to
plugin subagents (`agents/*.md`).

The coordinator does no real reasoning — it reads tracker state, runs git and the
CLI, and spawns subagents in a fixed order — so it should itself run on the cheap
model, **Composer 2.5 (`composer-2.5`)**, not a premium model. The implementor
writes code; validators are advisory Composer 2.5 agents.

**You do not write code, run the app, or verify the work yourself.** You read
the plan with `issue tree`, run git, record facts through the CLI, and spawn
subagents. Do **essentially no reasoning**: every coordinator step below is a
CLI invocation, a git command, or a fixed linear action — this skill is meant to
be replaced by a deterministic script. The tracker is metadata-only: **you** run
git, then record the result. Never set status on a Branch or Epic — Branch/Epic
status derives automatically (see SPEC.md).

Use the `issue` binary for all tracker commands (do not set `ISSUES_DIR`).

## Argument

An Epic id. If none is given, run `issue list`, show the user the Epics, and ask
which one. This skill works exactly one Epic; to work several at once, start
several agents. An Epic that is `blockedBy` another Epic cannot start until that
blocker is **fully merged** (all the blocker's Branches merged) — its Branches
and Commits stay out of the Ready set until then, so only pick a blocked Epic
once its blockers have landed. Because blockers clear at a human-paced Epic
boundary (a merge round-trip), this fits the one-Epic-at-a-time model. Use the
default `issues/` dir (do not set `ISSUES_DIR`) so the human sees changes live in
the UI.

## Preflight: confirm before starting

Before doing anything else, stop and ask the user to confirm they want you to
coordinate this Epic now. State that **Composer 2.5 (`composer-2.5`) is the
recommended coordinator**. Do not attempt to detect or print the current model
id. If they do not confirm, have them re-invoke this skill with `composer-2.5`
instead of continuing.

## Setup

1. Read the plan with `issue tree --epic <id>`. This one outline **is** your
   plan. It prints the Epic's Branches in **pure stacked depth-first** order over
   `stackedOn` alone — a Branch stacked on another is nested under it, and root
   Branches (and same-level siblings) follow their stored order. `blockedBy` is
   an Epic-level edge and plays **no part** in Branch ordering (it only gates
   whether the whole Epic may start — see Argument). Under each Branch its
   Commits print in sequence. Every Branch line carries `base=<base>` and
   `branch=<branchName>` chips; every Commit line carries `status=` and, once
   done, `sha=`. The branch order (walk top-to-bottom), each branch's git base
   and name, and each commit sequence all come straight from this output — do
   **not** derive any of them by hand.
2. Run `issue list` once and read its `problems` array. If `problems` is
   non-empty, **stop and hand back to the user** — do not reason about or attempt
   fixes, and do not work a tree with integrity problems. In the same `issue
   list` output, check `derived[<epicId>].blocked`: if it is `true` the Epic is
   `blockedBy` a blocker that has not fully merged, so — per Argument — it
   **cannot start**. Stop and hand back to the user rather than running
   `issue tree` or working any Commit.
3. Mirror the Branches and their Commits, in `issue tree` order, into your own
   todo list so you can track progress; keep exactly one Commit `in_progress` at
   a time. This mirror is a cache of the outline — re-sync it from a fresh
   `issue tree --epic <id>` each time control returns to you (see The loop).
4. Spawn via Task `subagent_type` for the plugin agents below. Pass **only**
   dynamic fields in the Task `prompt`: Epic id, issue id + title, comment role,
   and (for the implementor) mode `implement` or `revise`. Do not gather
   descriptions, read diffs, or ingest reports into your own context.

Because `issue tree` lists each Branch after the Branch it is stacked on,
walking the outline top-to-bottom always reaches a stacked Branch only after its
parent's git branch and `done` commits already exist: a stacked child's
dependency is satisfied — and it may proceed — once its parent's Commits are all
`done` (it forks the parent's tip, so there is no merge gate).

## Models and subagent roles

| Role | `subagent_type` | When | Model | Mode |
|------|-----------------|------|-------|------|
| Coordinator (you) | — | Drive the whole run: git, CLI, spawn subagents | Composer 2.5 (`composer-2.5`) | writes (git/CLI only) |
| Implementor | `issue-tracker-implementor` | Implement a Commit; per-commit revise via Task **resume**; branch-level revise as a **fresh** spawn | Inherit — pass Task `model` `cursor-grok-4.5-high-fast` until assignee wiring lands | writes |
| Code-quality validator | `issue-tracker-code-quality-validator` | After a Commit's implementation signals finished | Composer 2.5 (pinned in agent frontmatter) | read-only |
| Spec-conformance validator | `issue-tracker-spec-conformance-validator` | After a Branch's last Commit lands | Composer 2.5 (pinned in agent frontmatter) | read-only |

Implement and revise are the **same** implementor agent. Validators are advisory
— they surface issues but are **not** in charge. They report via `issue comment`
(with the comment role you pass), which keeps findings out of your context and
visible in the UI.

## The loop

Walk the Branches in the order `issue tree` printed them (top-to-bottom). For
each Branch, work its not-`done` Commits in the sequence `issue tree` lists
them, to completion, before moving to the Branches nested under it.

**Re-read `issue tree --epic <id>` every time control returns to you** — after
every subagent finishes and before you choose the next action — and re-sync your
todo list to it. The tree is the live plan, not a one-time snapshot: Branches or
Commits can be injected into the in-progress Epic mid-run (for example when
someone applies an epic- or branch-rooted doc), and only a fresh `issue tree`
picks them up. Never act from a cached outline.

### Start a Branch

If the Branch has no git branch yet, create it before its first commit. Read the
Branch's `base=<base>` and `branch=<branchName>` chips straight from
`issue tree` — do not re-derive the base. Run `git checkout <base>`, then
`git checkout -b <branchName>`, then record it with
`issue set-branch-name <branchId> <branchName>`.

### Per-Commit cycle (for each Commit, in sequence)

1. **Mark in-progress.** `issue set-status <commit> in-progress`.
2. **Implement.** Spawn `issue-tracker-implementor` (Task `model`:
   `cursor-grok-4.5-high-fast`). Use the implement spawn stub. Remember the
   Task agent id for resume. Wait for finished or blocked
   (`issue attention <id>`). Do not read its diff or ingest a report.
3. **Validate (code quality).** Spawn `issue-tracker-code-quality-validator`
   (read-only) with the code-quality spawn stub.
4. **Revise (one pass).** **Resume** the implementor Task from step 2 (same
   session). Use the revise spawn stub. Always one resume pass, even if the
   validator posted "nothing actionable". Do not re-run the validator or loop.
5. **Commit + record.** `git add` the work and `git commit -m "<Commit title>"`
   (the commit message is the Commit issue's title). Then
   `issue set-status <commit> done` and `issue set-commit <commit> <sha>`.
6. **Advance** to the next Commit.

### Close a Branch

After a Branch's last Commit is `done`:

1. **Validate (spec conformance).** Spawn
   `issue-tracker-spec-conformance-validator` (read-only) with the
   spec-conformance spawn stub.
2. **Revise (one pass).** Spawn a **fresh** `issue-tracker-implementor` (same
   Task `model` as implement) with the revise spawn stub targeting the
   **Branch**. Always one pass for now (may no-op). If it lands new work,
   commit it as above.
3. **Advance** to the next Branch. **Do not open a PR** — the human opens and
   merges PRs manually.

### Escalation

If a subagent is genuinely blocked (missing decision, ambiguous spec, external
dependency), have it raise `issue attention <id> --reason "..."` on the issue
instead of guessing, and surface the block to the user rather than forcing
progress.

## Completion

The loop ends when every Commit in the Epic is `done`. Give a short final
summary: which Branches were built, and anything still open or escalated
(`issue attention`). For validator findings and what the implementor accepted or
declined on revise, point the user at the tracker comments
(`issue show <id> --chat`) rather than collecting them into your context. Remind
the user that PRs are theirs to open and merge.

Everything lives on disk and every derived fact is recomputed on read, so the
loop is fully **resumable**: re-running the skill on the Epic re-reads
`issue tree --epic <id>` and continues from the first not-`done` Commit.

## Spawn stubs

Pass these as the Task `prompt`. Always inline the Epic id, issue id + title,
and comment role (plus Mode for the implementor). Children own static behavior
via their `agents/*.md` files — do not paste workflow instructions here.

**Implement** — `subagent_type: issue-tracker-implementor`

> Epic: `<epicId>`. Commit: `<id>` (`<title>`). Mode: implement. Comment role:
> `implementor`.

**Code-quality validator** — `subagent_type: issue-tracker-code-quality-validator`
(read-only)

> Epic: `<epicId>`. Commit: `<id>` (`<title>`). Comment role:
> `code-quality-validator`.

**Spec-conformance validator** — `subagent_type: issue-tracker-spec-conformance-validator`
(read-only)

> Epic: `<epicId>`. Branch: `<id>` (`<title>`). Comment role:
> `spec-conformance-validator`.

**Revise** — resume implementor (per-commit) or fresh `issue-tracker-implementor`
(branch-level)

> Epic: `<epicId>`. Issue: `<id>` (`<title>`). Mode: revise. Comment role:
> `implementor`.

## Rules

- Never implement, verify, or run the app yourself — always delegate. You own
  only git, the CLI, and coordination.
- Work one Epic, one Commit at a time, in the Branch order `issue tree` prints;
  finish a Branch before the Branches stacked on it.
- Re-read `issue tree --epic <id>` every time control returns to you and re-sync
  your todo list, so Branches or Commits injected into the in-progress Epic
  mid-run are picked up. Never act from a cached outline.
- The implementor leaves work uncommitted; **you** commit (message = Commit
  title) only after the per-commit cycle passes.
- Exactly one revision pass per validator tier (code-quality per commit via
  **resume**, spec-conformance per branch via **fresh** implementor); never loop
  reviews. The implementor may decline findings with reasoning.
- Validators are read-only and report via `issue comment`; never let a validator
  edit code.
- Never set status on a Branch or Epic; never open or merge PRs.
- Act only through the CLI for tracker writes; never hand-edit `issue.json`.
