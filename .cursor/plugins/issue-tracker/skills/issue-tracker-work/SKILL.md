---
name: issue-tracker-work
description: >-
  Coordinate implementation of one tracked Epic without doing the work yourself:
  walk its `tree --epic <id>` outline top-to-bottom, delegating each task to
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
model discriminator assigns an implementor model onto each Task; the
implementor writes code; the code-quality validator owns Task `qa` (writes the
gate, resumes across rounds, three-strike escalate); the spec-conformance
validator records the Story gate (`specReview`, optional remediation Task)
without editing workspace source; the git subagent owns branch create, Task
finalize, and Story finish.

**You do not write code, run the app, or verify the work yourself.** You read the
plan with `issue tree` and spawn subagents. Do **essentially no reasoning**:
every coordinator step below is a CLI invocation or a fixed linear action —
this skill is meant to be replaced by a deterministic script. Never set status
on a Story or Epic — Story/Epic status derives automatically (see SPEC.md).
Task `status` / `qa` and Epic `retro` writes are subagent-owned — see **Field
ownership**. Git and git-fact recording are delegated — see Rules. Task
`assignee` is overloaded as the implementor **model id** (set by the model
discriminator via `issue task set <taskId> assignee …`). Before each
implementor spawn, **Resolve implementor model** (below) and pass the result
as Cursor Task `model`.

**Nomenclature:** **Task** / **Story** are issue-tracker kinds. **Cursor Task**
is the subagent spawn/resume tool (`model`, `prompt`, `subagent_type`, resume).

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

Never bare `issue list`. This skill works exactly one Epic; to work several at
once, start several agents. There is no pick-up list — work starts only when
the user chooses an Epic. An Epic that is `blockedBy` another Epic cannot start
until that blocker is **fully merged** (all the blocker's Stories merged) —
only start an Epic once `issue epic get <epicId> blocked` prints `false`.
Because blockers clear at a human-paced Epic boundary (a merge round-trip), this
fits the one-Epic-at-a-time model. Use the default `issues/` dir (do not set
`ISSUES_DIR`) so the human sees changes live in the UI.

## Preflight: confirm before starting

Before doing anything else, stop and ask the user to confirm they want you to
coordinate this Epic now. State that **Composer 2.5 (`composer-2.5`) is the
recommended coordinator**. Do not attempt to detect or print the current model
id. If they do not confirm, have them re-invoke this skill with `composer-2.5`
instead of continuing.

### CLI checks

Run these four commands in order (use `<epicId>` throughout):

1. `issue tree --epic <epicId>`. This outline **is** your plan. It prints the
   Epic's Stories in **pure stacked depth-first** order over `stackedOn` alone —
   a Story stacked on another is nested under it, and root Stories (and
   same-level siblings) follow their stored order. `blockedBy` is an Epic-level
   edge and plays **no part** in Story ordering (it only gates whether the
   whole Epic may start — see Argument). Under each Story its Tasks print in
   sequence. Every Story line carries chips; every Task line carries `status=`
   and, once done, `sha=`. **Chip legend (coordinator use):**
   - Walk order and Task sequence — top-to-bottom from this output; do not
     reorder by hand.
   - `base=<ref>` — human display of the Story's stored `mergeBase` (or
     `base=(unset)` when empty). Informational only; do not copy into git
     spawn stubs — the git agent reads `mergeBase` from
     `issue story get <storyId> mergeBase`.
   - `branch=<name>` — git branch name once recorded; do not copy into spawn
     stubs.
   - `branch=(unset)` — no git branch recorded yet; spawn start-branch (see
     Start a Story). Do **not** invent or substitute a branch name — not the
     Story id, not a guess from the title.
   - `pr=`, `merged`, `blocked` — progress signals only; ignore for spawn
     *inputs*. Exception: Completion’s retro gate (below) reads `merged` chips
     to decide whether to spawn retro — that is not a spawn-input.
2. `issue summary <epicId>` — read `Project:` and `Workspace:`.
   - Take `<projectId>` from the id token on `Project: <projectId> — <title>`
     (SPEC § Project workspace).
   - If `Workspace:` is absent, the Project has no workspace and every
     repo-touching subagent would immediately escalate, so **stop and hand back to
     the user** to set it (`issue project set <projectId> workspace <path>`) before
     spawning anything.
3. `issue list --project <projectId>` — read `problems`. If `problems` is
   non-empty, **stop and hand back to the user** — do not reason about or
   attempt fixes, and do not work a tree with integrity problems. (`list` /
   `tree` hide archived rows by default; pass `--show-archived` when you need
   them — see [SPEC.md](../../SPEC.md#archived-visibility).)
4. `issue epic get <epicId> blocked` — if stdout is `true`, the Epic is
   `blockedBy` a blocker that has not fully merged, so — per Argument — it
   **cannot start**. Stop and hand back to the user rather than working any
   Task.

## Setup

1. Mirror the Stories and their Tasks, in `issue tree` order, into your own
   todo list so you can track progress; keep exactly one Task `in_progress` at
   a time. This mirror is a cache of the outline — re-sync it from a fresh
   `issue tree --epic <epicId>` each time control returns to you (see The loop).
2. Spawn via Cursor Task `subagent_type` for the plugin agents below. Pass
   **only** the fields each spawn stub lists (see Spawn stubs). Never pass the
   workspace — each repo subagent resolves it from its own `issue summary`
   (SPEC § Project workspace). Do not gather descriptions, read diffs, or ingest
   reports into your own context.

### Resolve implementor model

Given a Task id: run `issue task get <taskId> assignee`. If stdout is empty, raise
`issue task set <taskId> needsAttention true --reason "no implementor model assigned"` and stop
— do not spawn the implementor. Otherwise use stdout (trimmed) as Cursor Task
`model`. Never `show|head`, never infer from discriminator chat or prior Tasks.

Because `issue tree` lists each Story after the Story it is stacked on,
walking the outline top-to-bottom always reaches a stacked Story only after its
parent's git branch and `done` tasks already exist: a stacked child's
dependency is satisfied — and it may proceed — once its parent's Tasks are all
`done` (it forks the parent's tip, so there is no merge gate).

## Models and subagent roles

| Role | `subagent_type` | When | Model | Mode |
|------|-----------------|------|-------|------|
| Coordinator (you) | — | Drive the whole run: thin CLI + spawn subagents | Composer 2.5 (`composer-2.5`) | spawn/CLI only (see Field ownership) |
| Git | `issue-tracker-git` | Start a Story; finish a Task after revise; finish a Story | Composer 2.5 (pinned in agent frontmatter) | writes |
| Model discriminator | `issue-tracker-model-discriminator` | Before implement — assigns implementor model onto Task `assignee` | Composer 2.5 (pinned in agent frontmatter) | writes (`issue task set … assignee` only) |
| Implementor | `issue-tracker-implementor` | Implement a Task; per-task revise via Cursor Task **resume** | From Task `assignee` (Resolve implementor model) | writes (see Field ownership) |
| Code-quality validator | `issue-tracker-code-quality-validator` | After implementor finishes: **spawn** when `qa` unset; **resume** when `qa` is `changes-requested` or stuck `reviewing` | Composer 2.5 (pinned in agent frontmatter) | writes (`issue task set … qa` / `needsAttention`; `comment`) |
| Spec-conformance validator | `issue-tracker-spec-conformance-validator` | Close-Story when Story `specReview` is unset | Composer 2.5 (pinned in agent frontmatter) | writes (`issue story set … specReview` / `add-task` / `comment`) |
| Retro | `issue-tracker-retro` | Completion when every Story in the Epic is `merged` | `cursor-grok-4.5-high-fast` (pass as Cursor Task `model`) | writes (`comment` / `apply` / `issue <kind> set … needsAttention`) |

### Field ownership

Coordinator writes **none** of Task `status`, Task `qa`, or Epic `retro`.

| Field | Owner | When |
|-------|-------|------|
| Task `status` `in-progress` | Implementor | on first implement entry |
| Task `status` `fixing` | Implementor | on every revise entry |
| Task `status` `done` | Git (finish-commit) | Task finalize |
| Task `qa` | Code-quality | on each entry `reviewing`, then terminal `passed` / `changes-requested` (three-strike → `needsAttention`); never the coordinator |
| Epic `retro` | Retro | owned by that agent (not the coordinator) |

Implement and revise are the **same** implementor agent. Code-quality is a
**writer** of Task `qa`: fresh **spawn** when `qa` is unset; **resume** the
same Cursor Task when re-entering with `qa=changes-requested` or stuck
`qa=reviewing` (prior entry never reached a terminal qa). Remember the
code-quality Cursor Task agent id for that resume. Code-quality counts its own
`changes-requested` rounds from the resumed session (no stored counter; you do
**not** count). On the 3rd `changes-requested` it sets `needsAttention` itself.
Spec-conformance is the Story gate recorder: it sets `specReview` and may
append a remediation Task (tracker writes only; never workspace source). Both
keep findings out of your context via comments / machine-readable fields.

## The loop

Walk the Stories in the order `issue tree` printed them (top-to-bottom). For
each Story: start it if needed, work its not-`done` Tasks in the sequence
`issue tree` lists them, then **Close a Story** (specReview gate +
finish-branch) before moving to Stories nested under it.

**Re-read `issue tree --epic <id>` every time control returns to you** — after
every subagent finishes and before you choose the next action — and re-sync your
todo list to it. The tree is the live plan, not a one-time snapshot: Stories or
Tasks can be injected into the in-progress Epic mid-run (for example when
someone applies an epic- or story-rooted doc), and only a fresh `issue tree`
picks them up. Never act from a cached outline.

### Start a Story

If the Story tree chip shows `branch=(unset)`, spawn `issue-tracker-git` with
the start-branch stub before its first Task. When `branch=(unset)`, do **not**
invent or substitute a branch name — pass only the stub fields; the git agent
creates and records the git branch.

### Per-Task cycle (for each Task, in sequence)

Status transitions during this cycle are owned by subagents — see **Field
ownership**. Do not set Task `status` yourself.

1. **Assign model.** Spawn `issue-tracker-model-discriminator` with the
   model-discriminator spawn stub. Wait until it finishes (or raises
   needsAttention). Do not read its result.
2. **Implement.** Resolve implementor model for `<task>`. Spawn
   `issue-tracker-implementor` with Cursor Task `model` set to that value. Use
   the implement spawn stub. Remember the Cursor Task agent id for resume. Wait
   for finished or blocked (needsAttention on `<id>`). Do not read its diff or
   ingest a report.
3. **Validate (code quality).** Read `issue task get <task> qa`. Branch on
   the value (do not count QA rounds yourself):
   - unset → **spawn** `issue-tracker-code-quality-validator` with the
     code-quality spawn stub; remember its Cursor Task agent id.
   - `changes-requested` or `reviewing` → **resume** that same code-quality
     Cursor Task with the code-quality resume stub (`reviewing` means a prior
     entry did not reach a terminal qa — resume, do not spawn a second agent).
   - `passed` → skip to step 5 (Finalize); do not spawn or resume
     code-quality again.
   Wait until a spawn/resume finishes (or raises needsAttention) before
   step 4.
4. **Gate after code-quality.** Read both
   `issue task get <task> needsAttention` and `issue task get <task> qa`
   (in that order). Branch:
   - `needsAttention` is `true` → stop (Escalation). Check this **before**
     `qa`, because three-strike leaves terminal `qa=changes-requested` **and**
     `needsAttention` — do not resume the implementor in that case.
   - `qa` is `passed` → step 5.
   - `qa` is `changes-requested` and `needsAttention` is `false` →
     **resume** the implementor from step 2 with the revise stub, then
     return to step 3.
5. **Finalize.** Spawn `issue-tracker-git` with the finish-commit stub.
6. **Advance** to the next Task.

### Close a Story

Repeat until finish-branch:

1. **Re-sync.** Re-read `issue tree --epic <id>` and re-sync your todo list.
2. **Not-done Tasks.** If any Task on the Story is not `done` (including a
   validator-injected remediation Task), **run** the full Per-Task cycle
   for each in tree order (fresh implement spawn; resume only for the revise
   step). Then continue from step 1.
3. **`specReview` gate.** Read `specReview` with
   `issue story get <storyId> specReview` — never by parsing chat or `show`.
   If unset, spawn `issue-tracker-spec-conformance-validator` with the
   spec-conformance spawn stub. Wait until it finishes (or raises
   needsAttention); do not ingest
   its report. Then continue from step 1.
4. **Finish and advance.** All Tasks are `done` and `specReview` is set
   (`passed` or `failed`) — do **not** run the validator again. Spawn
   `issue-tracker-git` with the finish-branch stub. Git applies the Project
   merge policy — see SPEC § Project merge policy. Advance to the next Story.

### Escalation

If a subagent is genuinely blocked (missing decision, ambiguous spec, external
dependency), have it raise `issue <kind> set <id> needsAttention true --reason "..."` on the issue
instead of guessing, and surface the block to the user rather than forcing
progress.

## Completion

Completion has two phases. Phase 1 can finish while Phase 2 is still waiting
(e.g. under `pull-request` / `manual` before humans merge). Do not treat Phase 1
alone as “fully finished” for retro purposes.

### Phase 1 — Task-done summary

The Story walk ends when every Task in the Epic is `done`. Give a short
final summary: which Stories were built, and anything still open or escalated
(needsAttention escalation). For validator findings and what the implementor accepted or
declined on revise, point the user at the tracker comments
(`issue show <id> --chat`) rather than collecting them into your context. Note
how finished Stories landed from the `issue tree` chips (`pr=` for an opened
PR, `merged` for a merged Story, neither when left for the human).

### Phase 2 — Retro gate

Distinct coordinator hook after the Story walk — **not** part of Close-Story.
Re-read `issue tree --epic <epicId>`. Spawn
`issue-tracker-retro` only when **all** of the following hold:

1. The Epic has **at least one** Story (a zero-Story Epic must not spawn
   retro — same non-vacuous rule as derived Epic `done`).
2. **Every** Story carries the `merged` chip. Detect from those chips only —
   do not guess from merge policy or finish-branch outcomes. Under `merge`
   policy this usually follows the last finish-branch; under `pull-request` /
   `manual` it runs only after humans (or later process) have set every Story
   merged.
3. The source Epic’s chat has **no** prior comment with role `retro` (check
   `issue show <epicId> --chat`). If a `retro`-role comment already exists,
   skip — retro already ran for this Epic.

When the gate holds, spawn **once** with Cursor Task `model`
`cursor-grok-4.5-high-fast` (Models table) and the retro spawn stub (source
Epic id + title). Wait until the Cursor Task finishes (or raises
needsAttention). Do **not** mine transcripts yourself, and do **not** expect
or relay a retro summary into your context. If the gate fails only because some
Story is not `merged` yet, skip the spawn; a later re-run of this skill on the
same Epic re-evaluates Phase 2 once the chips show all merged (the
`retro`-role comment guard keeps that re-run from duplicating a completed
retro).

Everything lives on disk and every derived fact is recomputed on read, so the
loop is fully **resumable**: re-running the skill on the Epic re-reads
`issue tree --epic <id>` and continues from the first not-`done` Task (or,
when all Tasks are already `done`, from Completion Phase 2 above).

## Spawn stubs

Pass these as the Cursor Task `prompt`. Inline the fields each stub lists.
Id labels in spawn prompts must be `Issue:` (or `Epic:` where noted) — never
kind nouns (`Task:`, `Story:`, `Commit:`, `Branch:`). Children own static
behavior via their `agents/*.md` files — do not paste workflow instructions
here. Exception: append the **Plugin redeploy clause** (below) to Implement
and Revise prompts — that temporary injection is intentional.

**Issue context line** — shared prefix for discriminator, implement,
code-quality, spec-conformance, and revise stubs:

> Epic: `<epicId>`. Issue: `<id>` (`<title>`).

**Plugin redeploy clause** — append to Implement and Revise prompts:

> If this Task changes files under
> `<workspace>/.cursor/plugins/<plugin-name>/`, redeploy that plugin before
> finish/stop: `rm -rf /root/.cursor/plugins/local/<plugin-name> && cp -r <workspace>/.cursor/plugins/<plugin-name> /root/.cursor/plugins/local/<plugin-name>` (full directory replace — no symlink, no partial file copy). Resolve `<workspace>` from `issue summary` on the Task. Do **not** run `npm link` as part of redeploy, and never `npm link` from `/root/.cursor/plugins/local/...`.
>
> *(Temporary: once [visual-coordinator-loop](issue:visual-coordinator-loop)
> lands, move this redeploy instruction to a placement node instead of
> hard-coding it here.)*

Git stubs (`start-branch`, `finish-commit`, `finish-branch`): coordinator passes
**only** Mode + issue id — no Epic id, tree chips, or git facts (`base`,
`mergeBase`, `branchName`).

**Start branch** — `subagent_type: issue-tracker-git`

> Mode: start-branch. Issue: `<storyId>`.

**Finish commit** — `subagent_type: issue-tracker-git`

> Mode: finish-commit. Issue: `<taskId>`.

**Finish branch** — `subagent_type: issue-tracker-git`

> Mode: finish-branch. Issue: `<storyId>`.

**Model discriminator** — `subagent_type: issue-tracker-model-discriminator`

> *(Issue context line.)*

**Implement** — `subagent_type: issue-tracker-implementor`

> *(Issue context line.)* Mode: implement. Comment role:
> `implementor`.
>
> *(Append the Plugin redeploy clause.)*

**Code-quality validator** — `subagent_type: issue-tracker-code-quality-validator`
(spawn when `qa` unset; remember Cursor Task agent id for resume)

> *(Issue context line.)* Mode: review. Comment role:
> `code-quality-validator`.

**Code-quality validator (resume)** — resume code-quality when
`qa` is `changes-requested` or stuck `reviewing` (same Cursor Task agent id
from the spawn above)

> *(Issue context line.)* Mode: resume. Comment role:
> `code-quality-validator`. Verify that previously requested changes were
> fixed.

**Spec-conformance validator** — `subagent_type: issue-tracker-spec-conformance-validator`

> *(Issue context line.)* Comment role:
> `spec-conformance-validator`.

**Revise** — resume implementor (per-task only)

> *(Issue context line.)* Mode: revise. Comment role:
> `implementor`.
>
> *(Append the Plugin redeploy clause.)*

**Retro** — `subagent_type: issue-tracker-retro`

> Epic: `<epicId>` (`<title>`). Comment role: `retro`.

## Rules

- Never implement, verify, or run the app yourself — always delegate. You own
  only coordination (thin CLI reads + spawn/resume). Field write scopes:
  **Field ownership**.
- Prefer `issue <kind> get` for scalar field reads — do not parse `show` /
  `summary` / `tree` for a single field (except `summary`'s `Workspace:`
  bootstrap line and `tree` chips for walk order).
- Never write Task `status`, Task `qa`, or Epic `retro` yourself (Field
  ownership).
- Never run `git`/`gh` or the git-fact record commands (`issue story set …
  branchName` / `issue task set … commitSha` / `issue story set … prUrl` /
  `issue story set … merged`) yourself — spawn `issue-tracker-git` for Story
  start, Task finalize, and Story finish only. Git sets Task `status` `done`
  on finish-commit; implementor owns `in-progress` / `fixing`.
- Work one Epic, one Task at a time, in the Story order `issue tree` prints;
  finish a Story before the Stories stacked on it.
- Re-read `issue tree --epic <id>` every time control returns to you and re-sync
  your todo list, so Stories or Tasks injected into the in-progress Epic
  mid-run are picked up. Never act from a cached outline.
- The implementor leaves work uncommitted; the **git** subagent finalizes per
  its Finish Commit matrix (the authority for these outcomes): a normal Task
  is committed (message = Task title) and recorded `done` with its sha, while
  a Task the implementor deliberately marked `noDiff` is recorded `done` with
  **no** git commit and no sha. Either way the coordinator just spawns
  finish-commit — it never inspects the tree or the `noDiff` flag, and an empty
  tree alone is never a completion signal.
- Code-quality loop: spawn when `qa` unset; resume code-quality when
  `qa` is `changes-requested` or stuck `reviewing`; after code-quality,
  read `needsAttention` before `qa` and stop if true (three-strike leaves
  both). Resume implementor only when `qa=changes-requested` and
  `needsAttention` is false. You never count QA rounds — code-quality owns
  the three-strike escalate. Spec-conformance remediation is Close-Story's
  job (see that section) — no story-level revise. The implementor may decline
  findings with reasoning.
- Never let a validator edit workspace source (write scopes: Models table).
  Code-quality may write Task `qa` / `needsAttention` and comments only.
- Never set status on a Story or Epic. Do not decide whether to open or merge a
  PR — that is the Project's `mergePolicy`, applied by `issue-tracker-git` on
  finish-branch. Always spawn finish-branch; never read or branch on the policy.
- Act only through the CLI for tracker writes; never hand-edit `issue.json`.
- Workspace is a subagent concern, not yours (SPEC § Project workspace): you never
  resolve or pass it — each repo-touching subagent and the model discriminator
  read it from their own `issue summary` (discriminator: read-only peek only; see
  SPEC § Model discriminator (read-only peek)). Your only workspace duty is the
  Preflight CLI checks step 2: if the Epic's Project has no `Workspace:` line,
  stop and hand back to the user instead of spawning.
