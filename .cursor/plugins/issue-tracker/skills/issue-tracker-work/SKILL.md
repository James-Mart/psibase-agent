---
name: issue-tracker-work
description: >-
  Coordinate implementation of one tracked Epic without doing the work yourself:
  walk its `tree --epic <id>` outline top-to-bottom, delegating each commit to
  plugin subagents (model discriminator, implementor, validators, git; revise =
  implementor resume). Use when an agent works a tracked Epic to completion.
  Assumes the CLI from issue-tracker-authoring; glossary in SPEC.md.
---

# Issue Tracker — Work the Stack

Coordinate the implementation of one **Epic** without doing the implementation
yourself. You (the agent invoked with the Epic) are the **coordinator**. Your
context is precious: delegate all implementation, verification, review, model
assignment, and git to plugin subagents (`agents/*.md`).

The coordinator does no real reasoning — it reads tracker state, runs a thin set
of CLI commands, and spawns subagents in a fixed order — so it should itself run
on the cheap model, **Composer 2.5 (`composer-2.5`)**, not a premium model. The
model discriminator assigns an implementor model onto each Commit; the
implementor writes code; the code-quality validator is advisory (read-only
comments); the spec-conformance validator records the Branch gate (`specReview`,
optional remediation Commit) without editing workspace source; the git subagent
owns branch create, Commit finalize, and Branch finish.

**You do not write code, run the app, or verify the work yourself.** You read the
plan with `issue tree`, mark Commits in-progress, and spawn subagents. Do
**essentially no reasoning**: every coordinator step below is a CLI invocation
or a fixed linear action — this skill is meant to be replaced by a deterministic
script. Never set status on a Branch or Epic — Branch/Epic status derives
automatically (see SPEC.md). Git and git-fact recording are delegated — see
Rules. Commit `assignee` is overloaded as the implementor **model id** (set by
the model discriminator via `issue assign`). Before each implementor spawn,
**Resolve implementor model** (below) and pass the result as Task `model`.

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
3. **Workspace preflight.** Run `issue summary <epicId>` and check for the
   `Workspace:` line under the Project. If it is absent, the Project has no
   workspace and every repo-touching subagent would immediately escalate, so
   **stop and hand back to the user** to set it
   (`issue set-workspace <projectId> <path>`) before spawning anything. See
   SPEC § Project workspace.
4. Mirror the Branches and their Commits, in `issue tree` order, into your own
   todo list so you can track progress; keep exactly one Commit `in_progress` at
   a time. This mirror is a cache of the outline — re-sync it from a fresh
   `issue tree --epic <id>` each time control returns to you (see The loop).
5. Spawn via Task `subagent_type` for the plugin agents below. Pass **only**
   dynamic fields in the Task `prompt`: Epic id, issue id + title, comment role
   (validators/implementor), and Mode where required (`implement` / `revise` for
   the implementor; `start-branch` / `finish-commit` / `finish-branch` for git).
   For `start-branch` and `finish-branch`, also pass `base` and `branchName`
   from the tree chips. Never
   pass the workspace — each repo subagent resolves it from its own
   `issue summary` (SPEC § Project workspace). Do not gather descriptions, read
   diffs, or ingest reports into your own context.

### Resolve implementor model

Given a Commit id: run `issue show <commitId>`, take the `assignee` field, and
use it as Task `model`. If `assignee` is absent or empty, raise
`issue attention <commitId> --reason "no implementor model assigned"` and stop
— do not spawn the implementor.

Because `issue tree` lists each Branch after the Branch it is stacked on,
walking the outline top-to-bottom always reaches a stacked Branch only after its
parent's git branch and `done` commits already exist: a stacked child's
dependency is satisfied — and it may proceed — once its parent's Commits are all
`done` (it forks the parent's tip, so there is no merge gate).

## Models and subagent roles

| Role | `subagent_type` | When | Model | Mode |
|------|-----------------|------|-------|------|
| Coordinator (you) | — | Drive the whole run: thin CLI + spawn subagents | Composer 2.5 (`composer-2.5`) | writes (`set-status in-progress` only) |
| Git | `issue-tracker-git` | Start a Branch; finish a Commit after revise; finish a Branch | Composer 2.5 (pinned in agent frontmatter) | writes |
| Model discriminator | `issue-tracker-model-discriminator` | After `in-progress`, before implement — assigns implementor model onto Commit `assignee` | Composer 2.5 (pinned in agent frontmatter) | writes (`issue assign` only) |
| Implementor | `issue-tracker-implementor` | Implement a Commit; per-commit revise via Task **resume** | From Commit `assignee` (Resolve implementor model) | writes |
| Code-quality validator | `issue-tracker-code-quality-validator` | After a Commit's implementation signals finished | Composer 2.5 (pinned in agent frontmatter) | read-only |
| Spec-conformance validator | `issue-tracker-spec-conformance-validator` | Close-Branch when Branch `specReview` is unset | Composer 2.5 (pinned in agent frontmatter) | writes (`set-spec-review` / `add-commit` / `comment`) |

Implement and revise are the **same** implementor agent. Code-quality is
advisory (read-only `issue comment`) — it surfaces issues but is **not** in
charge. Spec-conformance is the Branch gate recorder: it sets `specReview` and
may append a remediation Commit (tracker writes only; never workspace source).
Both keep findings out of your context via comments / machine-readable fields.

## The loop

Walk the Branches in the order `issue tree` printed them (top-to-bottom). For
each Branch: start it if needed, work its not-`done` Commits in the sequence
`issue tree` lists them, then **Close a Branch** (specReview gate +
finish-branch) before moving to Branches nested under it.

**Re-read `issue tree --epic <id>` every time control returns to you** — after
every subagent finishes and before you choose the next action — and re-sync your
todo list to it. The tree is the live plan, not a one-time snapshot: Branches or
Commits can be injected into the in-progress Epic mid-run (for example when
someone applies an epic- or branch-rooted doc), and only a fresh `issue tree`
picks them up. Never act from a cached outline.

### Start a Branch

If the Branch has no git branch yet, spawn `issue-tracker-git` with the
start-branch stub before its first Commit (chips from Setup §1 / §5).

### Per-Commit cycle (for each Commit, in sequence)

1. **Mark in-progress.** `issue set-status <commit> in-progress`.
2. **Assign model.** Spawn `issue-tracker-model-discriminator` with the
   model-discriminator spawn stub. Wait until it finishes (or raises
   `issue attention`). Do not read its result.
3. **Implement.** Resolve implementor model for `<commit>`. Spawn
   `issue-tracker-implementor` with Task `model` set to that value. Use the
   implement spawn stub. Remember the Task agent id for resume. Wait for
   finished or blocked (`issue attention <id>`). Do not read its diff or
   ingest a report.
4. **Validate (code quality).** Spawn `issue-tracker-code-quality-validator`
   (read-only) with the code-quality spawn stub.
5. **Revise (one pass).** **Resume** the implementor Task from step 3 (same
   session; same model). Use the revise spawn stub. Always one resume pass,
   even if the validator posted "nothing actionable". Do not re-run the
   validator or loop.
6. **Commit + record.** Spawn `issue-tracker-git` with the finish-commit stub.
7. **Advance** to the next Commit.

### Close a Branch

Repeat until finish-branch:

1. **Re-sync.** Re-read `issue tree --epic <id>` and re-sync your todo list.
2. **Not-done Commits.** If any Commit on the Branch is not `done` (including a
   validator-injected remediation Commit), **run** the full Per-Commit cycle
   for each in tree order (fresh implement spawn; resume only for the revise
   step). Then continue from step 1.
3. **`specReview` gate.** Read `specReview` with `issue show <branchId>` —
   never by parsing chat. If unset, spawn
   `issue-tracker-spec-conformance-validator` with the spec-conformance spawn
   stub. Wait until it finishes (or raises `issue attention`); do not ingest
   its report. Then continue from step 1.
4. **Finish and advance.** All Commits are `done` and `specReview` is set
   (`passed` or `failed`) — do **not** run the validator again. Spawn
   `issue-tracker-git` with the finish-branch stub (Branch id + title, and its
   `base` / `branchName` chips). Git applies the Project merge policy — see
   SPEC § Project merge policy. Advance to the next Branch.

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
(`issue show <id> --chat`) rather than collecting them into your context. Note
how finished Branches landed from the `issue tree` chips (`pr=` for an opened
PR, `merged` for a merged Branch, neither when left for the human).

Everything lives on disk and every derived fact is recomputed on read, so the
loop is fully **resumable**: re-running the skill on the Epic re-reads
`issue tree --epic <id>` and continues from the first not-`done` Commit.

## Spawn stubs

Pass these as the Task `prompt`. Always inline the Epic id, issue id + title,
and (where listed) comment role / Mode / base / branchName. Children own static
behavior via their `agents/*.md` files — do not paste workflow instructions here.

**Start Branch** — `subagent_type: issue-tracker-git`

> Epic: `<epicId>`. Branch: `<id>` (`<title>`). Mode: start-branch. base:
> `<base>`. branchName: `<branchName>`.

**Finish Commit** — `subagent_type: issue-tracker-git`

> Epic: `<epicId>`. Commit: `<id>` (`<title>`). Mode: finish-commit.

**Finish Branch** — `subagent_type: issue-tracker-git`

> Epic: `<epicId>`. Branch: `<id>` (`<title>`). Mode: finish-branch. base:
> `<base>`. branchName: `<branchName>`.

**Model discriminator** — `subagent_type: issue-tracker-model-discriminator`

> Epic: `<epicId>`. Commit: `<id>` (`<title>`).

**Implement** — `subagent_type: issue-tracker-implementor`

> Epic: `<epicId>`. Commit: `<id>` (`<title>`). Mode: implement. Comment role:
> `implementor`.

**Code-quality validator** — `subagent_type: issue-tracker-code-quality-validator`
(read-only)

> Epic: `<epicId>`. Commit: `<id>` (`<title>`). Comment role:
> `code-quality-validator`.

**Spec-conformance validator** — `subagent_type: issue-tracker-spec-conformance-validator`

> Epic: `<epicId>`. Branch: `<id>` (`<title>`). Comment role:
> `spec-conformance-validator`.

**Revise** — resume implementor (per-commit only)

> Epic: `<epicId>`. Commit: `<id>` (`<title>`). Mode: revise. Comment role:
> `implementor`.

## Rules

- Never implement, verify, or run the app yourself — always delegate. You own
  only coordination and `issue set-status <commit> in-progress`.
- Never run `git`/`gh` or the git-fact record commands (`set-branch-name` /
  `set-status done` / `set-commit` / `open-pr` / `set-merged`) yourself — spawn
  `issue-tracker-git` for Branch start, Commit finalize, and Branch finish only.
- Work one Epic, one Commit at a time, in the Branch order `issue tree` prints;
  finish a Branch before the Branches stacked on it.
- Re-read `issue tree --epic <id>` every time control returns to you and re-sync
  your todo list, so Branches or Commits injected into the in-progress Epic
  mid-run are picked up. Never act from a cached outline.
- The implementor leaves work uncommitted; the **git** subagent finalizes per
  its Finish Commit matrix (the authority for these outcomes): a normal Commit
  is committed (message = Commit title) and recorded `done` with its sha, while
  a Commit the implementor deliberately marked `noDiff` is recorded `done` with
  **no** git commit and no sha. Either way the coordinator just spawns
  finish-commit — it never inspects the tree or the `noDiff` flag, and an empty
  tree alone is never a completion signal.
- Exactly one revision pass after the code-quality validator (via **resume**);
  never loop reviews. Spec-conformance remediation is Close-Branch's job (see
  that section) — no branch-level revise. The implementor may decline findings
  with reasoning.
- Never let a validator edit workspace source (write scopes: Models table).
- Never set status on a Branch or Epic. Do not decide whether to open or merge a
  PR — that is the Project's `mergePolicy`, applied by `issue-tracker-git` on
  finish-branch. Always spawn finish-branch; never read or branch on the policy.
- Act only through the CLI for tracker writes; never hand-edit `issue.json`.
- Workspace is a subagent concern, not yours (SPEC § Project workspace): you and
  the model discriminator do no repo work, so you never resolve or pass it — each
  repo subagent reads it from its own `issue summary`. Your only workspace duty
  is the Setup §3 preflight: if the Epic's Project has no `Workspace:` line, stop
  and hand back to the user instead of spawning.
