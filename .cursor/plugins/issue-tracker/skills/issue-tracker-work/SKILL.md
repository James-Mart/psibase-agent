---
name: issue-tracker-work
description: >-
  Coordinate implementation of one tracked Epic without doing the work yourself:
  walk its Branch > Commit tree depth-first, delegating each commit to fresh
  subagents (implement, validate, revise) and recording git facts through the
  CLI. Use when an agent works a tracked Epic to completion. Assumes the CLI from
  issue-tracker-authoring; glossary in SPEC.md.
---

# Issue Tracker — Work the Stack

Coordinate the implementation of one **Epic** without doing the implementation
yourself. You (the agent invoked with the Epic) are the **coordinator**. Your
context is precious: delegate all implementation, verification, and review to
subagents that start with fresh context.

The coordinator does no real reasoning — it reads tracker state, runs git and the
CLI, and spawns subagents in a fixed order — so it should itself run on the cheap
model, **Composer 2.5 (`composer-2.5`)**, not a premium model. Reserve the senior
model for the implementation/revision subagents that actually write code.

**You do not write code, run the app, or verify the work yourself.** You read
tracker state, run git, record facts through the CLI, spawn subagents, and decide
when to advance. The tracker is metadata-only: **you** run git, then record the
result. Never set status on a Branch or Epic — Branch/Epic status derives
automatically (see SPEC.md).

## Argument

An Epic id. If none is given, run `list`, show the user the Epics, and ask which
one. This skill works exactly one Epic; to work several at once, start several
agents. Use the default `issues/` dir (do not set `ISSUES_DIR`) so the human sees
changes live in the UI.

## Preflight: confirm the coordinator model

Before doing anything else, check what model you are. If you are **not** Composer
2.5 (`composer-2.5`), stop and ask the user whether they really want to proceed
with the coordinator running as `<your current model>` — the coordinator is meant
to be dumb and cheap. If they do not confirm, have them re-invoke this skill with
the recommended `composer-2.5` model instead of continuing.

## Setup

1. Read the whole tree once with `list`. If it reports `problems`, resolve them
   first (see issue-tracker-authoring) — do not work a tree with integrity
   problems. To self-verify without piping the `list` JSON through a script, use
   `tree --epic <id>` for a readable outline of the stack (it already prints in
   the canonical depth-first branch order with status/base/branch chips) and
   `show <id>` to inspect a single issue's metadata + description
   (`show <id> --chat` to include its comments).
2. From `list`, take the Epic's Branches and their `stackedOn`/`blockedBy` edges
   and compute a **depth-first branch order**: root Branches (no `stackedOn`)
   first, each immediately followed by the Branches stacked on it, ties broken by
   creation order (`createdAt` ascending, then `id`). This order is derived
   directly from the tree — this skill does **not** use the derived `ready` set,
   whose merged-gated readiness is wrong here (you do not merge during the run).
3. Mirror the Branches and their Commits into your own todo list so you can track
   progress; keep exactly one Commit `in_progress` at a time.
4. Every subagent starts fresh — always pass it the **Epic id**, the **specific
   issue id + its title**, and an instruction to rebuild its own context from
   `list`, the issue's `description.md`, and the SPEC.md glossary.

A dependency counts as **satisfied when its commits are all `done`**, not when
merged (nothing merges during the run). Because traversal is depth-first and
finishes each Branch before its stacked children, a stacked Branch's parent
already has its git branch and `done` commits by the time you start the child.

## Models and subagent roles

| Role | When | Model | Mode |
|------|------|-------|------|
| Coordinator (you) | Drive the whole run: git, CLI, spawn subagents | Composer 2.5 (`composer-2.5`) | writes (git/CLI only) |
| Implementation subagent | Build one Commit's work in the working tree (uncommitted) | Opus 4.8 High (`claude-opus-4-8-thinking-high`) | writes |
| Code-quality validator | After a Commit's implementation reports done | Composer 2.5 (`composer-2.5`) | read-only |
| Revision subagent | Address a validator's feedback (per commit and per branch) | Opus 4.8 High (`claude-opus-4-8-thinking-high`) | writes |
| Spec-conformance validator | After a Branch's last Commit lands | Composer 2.5 (`composer-2.5`) | read-only |

The Opus implementation/revision agents are the senior engineers. The Composer
validators are advisory — they surface issues but are **not** in charge. A
validator is read-only in spirit (it never edits code); it reports its feedback
by running the `comment` CLI verb, which keeps findings out of your context and
visible in the UI.

## The loop

Walk the Branches in the depth-first order from Setup. For each Branch, work its
`todo` Commits in sequence to completion before moving to the Branches stacked on
it.

### Start a Branch

If the Branch has no git branch yet, create it before its first commit: its base
is its `stackedOn` Branch's `branchName` (else `main` — never fork from a
`blockedBy` branch). Run `git checkout <base>`, then `git checkout -b <name>`,
then record it with `set-branch-name <branch> <name>`.

### Per-Commit cycle (for each Commit, in sequence)

1. **Mark in-progress.** `set-status <commit> in-progress`.
2. **Implement.** Spawn one implementation subagent (Opus 4.8 High). It edits the
   working tree, **leaves the changes uncommitted**, verifies its work per the
   Commit's own `description.md` (whatever "how to verify" it specifies — tests,
   build, manual check), and reports what it did. Wait for it to finish.
3. **Validate (code quality).** Spawn one code-quality validator (Composer 2.5,
   read-only). It reviews the **uncommitted** diff for introduced redundancy and
   poor abstraction/encapsulation and posts only **actionable problems** as a
   `comment` on the Commit issue — no "this is correct/fine" confirmations, since
   the implementor treats anything unmentioned as acceptable.
4. **Revise (one pass).** Spawn one revision subagent (Opus 4.8 High). Tell it to
   read the Commit issue's comments to find the feedback and address it. As the
   senior model it may **push back** (with reasoning) on findings it disagrees
   with. It posts a succinct `comment` on the Commit issue replying to the
   validator (what it changed, what it declined and why). This is a single pass —
   do not re-run the validator or loop. You do not expect any particular reply
   from the subagent; the response lives on the issue.
5. **Commit + record.** `git add` the work and `git commit -m "<Commit title>"`
   (the commit message is the Commit issue's title). Then `set-status <commit>
   done` and `set-commit <commit> <sha>`.
6. **Advance** to the next Commit.

### Close a Branch

After a Branch's last Commit is `done`:

1. **Validate (spec conformance).** Spawn one spec-conformance validator
   (Composer 2.5, read-only). It reviews the whole Branch against its spec in the
   tree (the Branch's `description.md` and its Commits) and posts gaps,
   deviations, and missing behavior as a `comment` on the Branch.
2. **Revise (one pass).** Spawn one revision subagent (Opus 4.8 High) to read the
   Branch's comments and address the feedback — a single pass; it may push back
   with reasoning, and posts a succinct `comment` on the Branch replying to the
   validator (what it changed, what it declined and why). If it lands new work,
   commit it as above. You do not expect any particular reply from the subagent;
   the response lives on the issue.
3. **Advance** to the next Branch. **Do not open a PR** — the human opens and
   merges PRs manually.

### Escalation

If a subagent is genuinely blocked (missing decision, ambiguous spec, external
dependency), have it raise `attention <id> --reason "..."` on the issue instead
of guessing, and surface the block to the user rather than forcing progress.

## Completion

The loop ends when every Commit in the Epic is `done`. Give a short final
summary: which Branches were built, any validator findings a revision agent
explicitly declined (with its reasoning), and anything still open or escalated.
Remind the user that PRs are theirs to open and merge.

Everything lives on disk and every derived fact is recomputed on read, so the
loop is fully **resumable**: re-running the skill on the Epic re-reads `list`,
recomputes the order, and continues from the first not-`done` Commit.

## Subagent prompt templates

Adapt these; always inline the Epic id and the specific issue id + title.

**Implementation subagent**
> Rebuild your context from `list`, the issue's `description.md`, and SPEC.md's
> glossary. Implement Commit `<id>` (`<title>`) in Epic `<epicId>`. Edit the
> working tree but **do not commit or stage** — leave your changes uncommitted so
> a reviewer can inspect the live diff. Verify your work as the Commit's
> `description.md` specifies. Report what you did.

**Code-quality validator (read-only)**
> Inspect the current **uncommitted** working-tree diff for Commit `<id>`
> (`<title>`). Review it for introduced redundancy and poor
> abstraction/encapsulation. Post **only actionable problems** as a concrete list
> by running `comment <id> --role agent --body "..."` — do not list things you
> judge correct or acceptable; the implementor assumes anything you don't mention
> is fine. If you find nothing actionable, post a single line saying so. Do not
> edit any files.

**Spec-conformance validator (read-only)**
> Read `list` and the Branch `<id>` (`<title>`) subtree in Epic `<epicId>`.
> Verify the Branch's implemented commits match its spec (the Branch's and its
> Commits' `description.md`). Post any gaps, deviations, or missing behavior as a
> concrete list by running `comment <id> --role agent --body "..."`. Do not edit
> any files.

**Revision subagent**
> Read the comments on issue `<id>` (`<title>`) to find the review feedback.
> Address the findings you agree with. You are the senior engineer — push back
> (with reasoning) on any finding you think is wrong or not worth doing. Post a
> succinct reply to the validator's comment by running `comment <id> --role agent
> --body "..."` (what you changed, what you declined and why). Leave your changes
> uncommitted. This is a single improvement pass.

## Rules

- Never implement, verify, or run the app yourself — always delegate. You own
  only git, the CLI, and coordination.
- Work one Epic, one Commit at a time, in depth-first Branch order; finish a
  Branch before the Branches stacked on it.
- The implementor leaves work uncommitted; **you** commit (message = Commit
  title) only after the per-commit cycle passes.
- Exactly one revision pass per validator tier (code-quality per commit,
  spec-conformance per branch); never loop reviews. The reviser may decline
  findings with reasoning.
- Validators are read-only and report via `comment`; never let a validator edit
  code.
- Never set status on a Branch or Epic; never open or merge PRs.
- Act only through the CLI for tracker writes; never hand-edit `issue.json`.
