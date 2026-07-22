---
name: issue-tracker-auto-plan
disable-model-invocation: true
description: >-
  Autonomously plan an issue by delegating the judgment-heavy work to premium
  stakeholder / planner subagents that stand in for the human project manager.
  Cheap bootstrap gates, then spawns the auto-plan stakeholder; relays and
  resumes on refusal / escalation. Use when the user runs auto-plan or wants
  hands-off planning of a single issue id kicked off from a weak model.
---

# Issue Tracker — Auto-plan (coordinator)

Turn a seed issue into a polished plan tree with no further human interaction,
leaving an audit trail the human reviews afterward. You are the **coordinator**:
a thin orchestrator that runs cheap bootstrap gates, spawns the auto-plan
**stakeholder**, and relays / resumes on refusal or escalation. You own **no**
grilling, authoring, polish, or retro — the stakeholder drives the vanilla
planner, which runs `issue-tracker-plan` unchanged (Story *"Reuse over
reinvention"* invariant).

This skill is meant to be invoked on **Composer 2.5 (`composer-2.5`)** — the
weak orchestrator. All judgment happens in the premium subagents.

Use the `issue` binary. Do not set `ISSUES_DIR`. Never `npm link` from
`/root/.cursor/plugins/local/...`. Cross-cutting CLI invariants:
[SPEC.md § CLI invariants](../../SPEC.md#cli-invariants).

## Argument

A single **issue id** — an **Idea**, a **todo** Epic, or a **not-started
project-level Story** (issue-id-only; the human authors the seed beforehand).
If none is given, ask the user for the issue id; do not guess or run a picker.

## Bootstrap gates

Run these cheap gates yourself **before** spawning anything. Each failure is a
**coordinator-gate refusal** (see **## Refusals & escalations**): refuse with
specifics and stop — nothing has been spawned, so there is nothing to resume.

1. `issue summary <id>` — read the Project section: `<projectId>` (the id token
   on `Project: <projectId> — <title>`), `Workspace:`, `supportingDocs:`, and
   the issue's kind / status.
2. **Workspace gate** — if `Workspace:` is absent, stop and hand back to the
   user to set it (`issue project set <projectId> workspace <path>`). Per
   [SPEC § Project workspace](../../SPEC.md#project-workspace) this is an
   escalation, never a silent fallback — the stakeholder / planner need cwd =
   `Workspace:` for codebase lookup. Checked first because it is already visible
   in step 1, so refuse before spending any kind/status `get` round-trips.
3. **Vision-present gate** — on the step-1 Project section, check
   `supportingDocs:` for a `vision=` entry. **Absent → refuse**: tell the human
   to add a `vision` supportingDoc to the Project, and do **not** spawn the
   stakeholder. (You only check *presence* here; the stakeholder reads and
   judges the vision content.)
4. **Kind / status gate** — apply
   [issue-tracker-plan § Bootstrap](../issue-tracker-plan/SKILL.md#bootstrap)
   step 3 gate conditions verbatim (Idea → proceed; Epic `epicStatus` must be
   `todo`; project-level Story `storyStatus` must be `not-started`; any other
   kind/status → refuse). Treat a refuse here as a **coordinator-gate refusal**,
   not plan's plan-polish / work redirect.

## Spawn the stakeholder

All gates passed → spawn one **stakeholder** Cursor Task and wait for it (do not
fire-and-forget):

**Stakeholder** — `subagent_type: issue-tracker-auto-plan-stakeholder`
(`model: claude-opus-4-8-thinking-high`)

> Source issue: `<id>` (`<title>`). Project: `<projectId>`. Workspace:
> `<workspace>`. Comment role: `stakeholder`.

The stakeholder (`../../agents/issue-tracker-auto-plan-stakeholder.md`) owns all
downstream planning, including spawning the discriminator
(`../../agents/issue-tracker-auto-plan-discriminator.md`). Do **not** re-instruct
its behavior here — it is defined in those agent files.

## Refusals & escalations

Refusal and escalation are **resumable** (Story *"Refusal & escalation are
resumable"* invariant). Recovery differs by kind:

- **Coordinator gate** — any **## Bootstrap gates** refusal, raised before a
  stakeholder is spawned. Nothing to resume: relay the specific gap to the
  human; they fix the condition and **re-invoke** auto-plan.
- **Stakeholder refusal** (seed issue too underspecified → human enriches the
  issue; alignment sources too thin → human enriches the vision doc) — relay
  the stakeholder's refusal message to the human. Once the human addresses the
  gap, **resume the same stakeholder Cursor Task** (`resume`) — never a fresh
  spawn.
- **Subagent-failure escalation** (a discriminator / planner errored or returned
  an unusable result, or another block the stakeholder reports) — relay it to
  the human with no silent fallback and no model-defaulting. Once the human
  addresses the cause, **resume the same stakeholder Cursor Task**; the
  stakeholder re-spawns the failed subagent.

## Success return

When the stakeholder returns success, relay its result to the human: the
resulting plan root id(s), and confirmation that each got a decision-summary
report + standout-decisions comment. Then stop.

## Rules

- Stay a **thin orchestrator**: gates + one spawn + relay / resume. Do not
  grill, author the tree, run polish, or spawn retro yourself.
- No tracker writes of your own — the stakeholder owns the only allowed writes
  (root `attach` / `comment`). You run read-only `issue` (`summary`, `get`).
- **Deploy** changes to this plugin by mirroring the whole directory to
  `/root/.cursor/plugins/local/issue-tracker` per the `update-cursor-plugin`
  flow (a runtime deploy step, not a git commit).
