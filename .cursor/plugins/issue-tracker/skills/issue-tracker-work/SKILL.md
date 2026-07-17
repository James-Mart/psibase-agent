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

An Epic id. If none is given:

1. Run `issue projects`.
2. Resolve `<projectId>`:
   - If it returns zero rows, **stop and hand back to the user** — no project
     to coordinate.
   - If it returns more than one row, show the user the id/title list and ask
     which project.
   - If it returns exactly one row, use that project's id.
3. Run `issue tree --project <projectId>` to list Epics and ask which one.

Never bare `issue list`. This skill works exactly one Epic; to work several at once, start
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

### CLI checks

Run these three commands in order (use `<epicId>` throughout):

1. `issue tree --epic <epicId>`. This outline **is** your plan. It prints the
   Epic's Branches in **pure stacked depth-first** order over `stackedOn` alone —
   a Branch stacked on another is nested under it, and root Branches (and
   same-level siblings) follow their stored order. `blockedBy` is an Epic-level
   edge and plays **no part** in Branch ordering (it only gates whether the
   whole Epic may start — see Argument). Under each Branch its Commits print in
   sequence. Every Branch line carries chips; every Commit line carries `status=`
   and, once done, `sha=`. **Chip legend (coordinator use):**
   - Walk order and Commit sequence — top-to-bottom from this output; do not
     reorder by hand.
   - `base=<ref>` — human display of the Branch's stored `mergeBase` (or
     `base=(unset)` when empty). Informational only; do not copy into git
     spawn stubs — the git agent reads `mergeBase` from `issue show`.
   - `branch=<name>` — git branch name once recorded; do not copy into spawn
     stubs.
   - `branch=(unset)` — no git branch recorded yet; spawn start-branch (see
     Start a Branch). Do **not** invent or substitute a branch name — not the
     Branch id, not a guess from the title.
   - `pr=`, `merged`, `blocked` — progress signals only; ignore for spawn
     *inputs*. Exception: Completion’s retro gate (below) reads `merged` chips
     to decide whether to spawn retro — that is not a spawn-input.
2. `issue summary <epicId>` — read `Project:` and `Workspace:`.
   - Take `<projectId>` from the id token on `Project: <projectId> — <title>`
     (SPEC § Project workspace).
   - If `Workspace:` is absent, the Project has no workspace and every
     repo-touching subagent would immediately escalate, so **stop and hand back to
     the user** to set it (`issue set-workspace <projectId> <path>`) before
     spawning anything.
3. `issue list --project <projectId>` — read `problems` and
   `derived[<epicId>].blocked`.
   - If `problems` is non-empty, **stop and hand back to the user** — do not
     reason about or attempt fixes, and do not work a tree with integrity
     problems.
   - If `derived[<epicId>].blocked` is `true`, the Epic is `blockedBy` a
     blocker that has not fully merged, so — per Argument — it **cannot start**.
     Stop and hand back to the user rather than working any Commit.

## Setup

1. Mirror the Branches and their Commits, in `issue tree` order, into your own
   todo list so you can track progress; keep exactly one Commit `in_progress` at
   a time. This mirror is a cache of the outline — re-sync it from a fresh
   `issue tree --epic <epicId>` each time control returns to you (see The loop).
2. Spawn via Task `subagent_type` for the plugin agents below. Pass **only**
   the fields each spawn stub lists (see Spawn stubs). Never pass the workspace
   — each repo subagent resolves it from its own `issue summary` (SPEC § Project
   workspace). Do not gather descriptions, read diffs, or ingest reports into
   your own context.

### Resolve implementor model

Given a Commit id: run `issue assignee <commitId>`. If stdout is empty, raise
`issue attention <commitId> --reason "no implementor model assigned"` and stop
— do not spawn the implementor. Otherwise use stdout (trimmed) as Task `model`.
Never `show|head`, never infer from discriminator chat or prior Commits.

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
| Retro | `issue-tracker-retro` | Completion when every Branch in the Epic is `merged` | `cursor-grok-4.5-high-fast` (pass as Task `model`) | writes (`comment` / `apply` / `attention`) |

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

If the Branch tree chip shows `branch=(unset)`, spawn `issue-tracker-git` with
the start-branch stub before its first Commit. When `branch=(unset)`, do **not**
invent or substitute a branch name — pass only the stub fields; the git agent
creates and records the git branch.

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
   `issue-tracker-git` with the finish-branch stub. Git applies the Project
   merge policy — see SPEC § Project merge policy. Advance to the next Branch.

### Escalation

If a subagent is genuinely blocked (missing decision, ambiguous spec, external
dependency), have it raise `issue attention <id> --reason "..."` on the issue
instead of guessing, and surface the block to the user rather than forcing
progress.

## Completion

Completion has two phases. Phase 1 can finish while Phase 2 is still waiting
(e.g. under `pull-request` / `manual` before humans merge). Do not treat Phase 1
alone as “fully finished” for retro purposes.

### Phase 1 — Commit-done summary

The Branch walk ends when every Commit in the Epic is `done`. Give a short
final summary: which Branches were built, and anything still open or escalated
(`issue attention`). For validator findings and what the implementor accepted or
declined on revise, point the user at the tracker comments
(`issue show <id> --chat`) rather than collecting them into your context. Note
how finished Branches landed from the `issue tree` chips (`pr=` for an opened
PR, `merged` for a merged Branch, neither when left for the human).

### Phase 2 — Retro gate

Distinct coordinator hook after the Branch walk — **not** part of Close-Branch.
Re-read `issue tree --epic <epicId>` (or `issue show` Branch chips). Spawn
`issue-tracker-retro` only when **all** of the following hold:

1. The Epic has **at least one** Branch (a zero-Branch Epic must not spawn
   retro — same non-vacuous rule as derived Epic `done`).
2. **Every** Branch carries the `merged` chip. Detect from those chips only —
   do not guess from merge policy or finish-branch outcomes. Under `merge`
   policy this usually follows the last finish-branch; under `pull-request` /
   `manual` it runs only after humans (or later process) have set every Branch
   merged.
3. The source Epic’s chat has **no** prior comment with role `retro` (check
   `issue show <epicId> --chat`). If a `retro`-role comment already exists,
   skip — retro already ran for this Epic.

When the gate holds, spawn **once** with Task `model`
`cursor-grok-4.5-high-fast` (Models table) and the retro spawn stub (source
Epic id + title). Wait until the Task finishes (or raises `issue attention`).
Do **not** mine transcripts yourself, and do **not** expect or relay a retro
summary into your context. If the gate fails only because some Branch is not
`merged` yet, skip the spawn; a later re-run of this skill on the same Epic
re-evaluates Phase 2 once the chips show all merged (the `retro`-role comment
guard keeps that re-run from duplicating a completed retro).

Everything lives on disk and every derived fact is recomputed on read, so the
loop is fully **resumable**: re-running the skill on the Epic re-reads
`issue tree --epic <id>` and continues from the first not-`done` Commit (or,
when all Commits are already `done`, from Completion Phase 2 above).

## Spawn stubs

Pass these as the Task `prompt`. Inline the fields each stub lists. Children own
static behavior via their `agents/*.md` files — do not paste workflow
instructions here. Exception: append the **Plugin redeploy clause** (below) to
Implement and Revise prompts — that temporary injection is intentional.

**Plugin redeploy clause** — append to Implement and Revise prompts:

> If this Commit changes files under
> `<workspace>/.cursor/plugins/<plugin-name>/`, redeploy that plugin before
> finish/stop: `rm -rf /root/.cursor/plugins/local/<plugin-name> && cp -r <workspace>/.cursor/plugins/<plugin-name> /root/.cursor/plugins/local/<plugin-name>` (full directory replace — no symlink, no partial file copy). Resolve `<workspace>` from `issue summary` on the Commit.
>
> *(Temporary: once [visual-coordinator-loop](issue:visual-coordinator-loop)
> lands, move this redeploy instruction to a placement node instead of
> hard-coding it here.)*

Git stubs (`start-branch`, `finish-commit`, `finish-branch`): coordinator passes
**only** Mode + issue id — no Epic id, tree chips, or git facts (`base`,
`mergeBase`, `branchName`).

**Start Branch** — `subagent_type: issue-tracker-git`

> Mode: start-branch. Issue: `<branchId>`.

**Finish Commit** — `subagent_type: issue-tracker-git`

> Mode: finish-commit. Issue: `<commitId>`.

**Finish Branch** — `subagent_type: issue-tracker-git`

> Mode: finish-branch. Issue: `<branchId>`.

**Model discriminator** — `subagent_type: issue-tracker-model-discriminator`

> Epic: `<epicId>`. Commit: `<id>` (`<title>`).

**Implement** — `subagent_type: issue-tracker-implementor`

> Epic: `<epicId>`. Commit: `<id>` (`<title>`). Mode: implement. Comment role:
> `implementor`.
>
> *(Append the Plugin redeploy clause.)*

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
>
> *(Append the Plugin redeploy clause.)*

**Retro** — `subagent_type: issue-tracker-retro`

> Epic: `<epicId>` (`<title>`). Comment role: `retro`.

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
- Workspace is a subagent concern, not yours (SPEC § Project workspace): you never
  resolve or pass it — each repo-touching subagent and the model discriminator
  read it from their own `issue summary` (discriminator: read-only peek only; see
  SPEC § Model discriminator (read-only peek)). Your only workspace duty is the
  Preflight CLI checks step 2: if the Epic's Project has no `Workspace:` line,
  stop and hand back to the user instead of spawning.
