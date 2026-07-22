---
name: issue-tracker-plan-polish
disable-model-invocation: true
description: >-
  Polish an existing Epic or project-level Story plan tree with parallel
  check agents, then auto-apply when safe. Use when the user asks to polish
  a plan, clean up a tracker tree, or run plan-polish.
---

# Issue Tracker — Plan Polish

Polish one **work root** — an **Epic** or a **project-level Story** — already
in the tracker. You are the **coordinator**: spawn read-only check agents,
compose a full apply doc from their findings (keep it internal), auto-apply
when safe, then show a short findings + changes summary in chat. Behavioral
contract: Epic **auto-plan-polish-confirm** invariants (auto-apply +
post-summary; escalate only when unsafe) — do not restate that list here.

Use the `issue` binary. Do not set `ISSUES_DIR`. Never retarget `npm link` to
`/root/.cursor/plugins/local/...`. Cross-cutting CLI invariants:
[SPEC.md § CLI invariants](../../SPEC.md#cli-invariants).

## Argument

An **Epic** id (any `epicStatus` — not limited to `todo`) or a
**project-level Story** id (`partOf` the Project). If none is given:

1. Run `issue tree` (no-arg: all projects).
2. Resolve `<projectId>` from the `project <id>` lines (one → use it; many → ask which; none → stop).
3. Run `issue tree <projectId>` and ask which Epic or project-level Story.

Never bare `issue list`.

## Bootstrap

1. `issue summary <rootId>` — read `Project:` and `Workspace:`.
   - Take `<projectId>` from the id token on `Project: <projectId> — <title>`.
   - If `Workspace:` is absent, **stop and hand back to the user** to set it
     (`issue project set <projectId> workspace <path>`) before spawning
     anything. Check agents must Read shared-contract / authoring files via
     absolute paths under `Workspace:` — there is no plan-only fallback
     (SPEC § Project workspace: unset → escalate, never fall back).
   - Apply **Work-root kind gates** from
     [`agents/_issue-tracker-plan-polish-check-base.md`](../../agents/_issue-tracker-plan-polish-check-base.md)
     § Bootstrap (bind `<rootKind>`; do not restate that block here).
2. **Read** the absolute path formed by joining `Workspace:` from step 1 with
   `.cursor/plugins/issue-tracker/agents/_issue-tracker-consult-supporting-doc.md`,
   then consult `vision` per that file using the step-1 summary output.
3. `issue tree <rootId>` — full Story/Task outline (implementation
   order).
4. `issue <rootKind> view <rootId>` (and children as needed) when preparing the
   retained plan.

## Parallel check agents

Spawn **all five** agents **in parallel** (one Cursor Task each) via the
**Spawn stubs** below. Pass **only** the fields each stub lists — children own
static behavior in `agents/*.md`; do not paste agent workflow into the prompt.

| Agent (`subagent_type`) | Cursor Task `model` |
| --- | --- |
| `issue-tracker-plan-no-ambiguity` | `composer-2.5` |
| `issue-tracker-plan-dry` | `composer-2.5` |
| `issue-tracker-plan-authoring-conformance` | `composer-2.5` |
| `issue-tracker-plan-dependency-order` | `cursor-grok-4.5-high-fast` |
| `issue-tracker-plan-internal-consistency` | `composer-2.5` |

Each agent template is `readonly: true`. Shared CLI/bootstrap/JSON output
contract lives only in
[`agents/_issue-tracker-plan-polish-check-base.md`](../../agents/_issue-tracker-plan-polish-check-base.md)
— do not restate the findings schema here.

## Spawn stubs

Pass these as the Cursor Task `prompt`. Inline the work-root id/title. Children
own static behavior via their `agents/*.md` files — do not paste workflow
instructions here.

**Work-root context line** — shared prefix for all five check stubs:

> Work root: `<rootId>` (`<title>`).

**Findings return line** — append to every check stub (gate-critical; stubs
are re-read each spawn while agent injection may be frozen):

> Return only a JSON findings array per
> `agents/_issue-tracker-plan-polish-check-base.md` (detection-only — no
> fixes; no prose wrapper).

**No-ambiguity** — `subagent_type: issue-tracker-plan-no-ambiguity`
(`model: composer-2.5`)

> *(Work-root context line.)* *(Findings return line.)*

**DRY** — `subagent_type: issue-tracker-plan-dry` (`model: composer-2.5`)

> *(Work-root context line.)* *(Findings return line.)*

**Authoring conformance** —
`subagent_type: issue-tracker-plan-authoring-conformance`
(`model: composer-2.5`)

> *(Work-root context line.)* *(Findings return line.)*

**Dependency order** —
`subagent_type: issue-tracker-plan-dependency-order`
(`model: cursor-grok-4.5-high-fast`)

> *(Work-root context line.)* *(Findings return line.)*

**Internal consistency** —
`subagent_type: issue-tracker-plan-internal-consistency`
(`model: composer-2.5`)

> *(Work-root context line.)* *(Findings return line.)*

## Aggregate → apply → summary

After all five return:

1. Parse each result as a JSON findings array per
   [`agents/_issue-tracker-plan-polish-check-base.md`](../../agents/_issue-tracker-plan-polish-check-base.md).
   Deduplicate overlapping findings.
2. **Severity / remediation:** For every finding, invent concrete remediation
   from `problem` text plus tree context (`issue tree`, `<kind> view`). Fold
   clear fixes for every `error` and clear `warning` remediations into the
   retained apply plan. Any unresolved `error` means you **must not** treat
   the outcome as “no changes needed”.
   - **Escalate (do not apply)** when auto-apply is unsafe: conflicting errors
     or ambiguous fixes. Stop and ask the user how to resolve; do not guess.
     After the user resolves the escalate, incorporate their resolution,
     re-compose the retained plan if needed, then continue at step 4
     (auto-apply when safe) — escalate is not a terminal stop.
   - Clear error/warning fixes apply without asking.
3. **Compose and retain** one full apply YAML from the deduplicated findings
   and your invented fixes,
   matching the work-root kind, per issue-tracker-authoring and
   [SPEC.md § apply doc format](../../SPEC.md#apply-doc-format). Keep this
   YAML internal — do not paste it into chat.
   - **Epic** (`<rootKind>` = `epic`) — epic-form: `project: <projectId>`
     string + `epic:` object.
   - **project-level Story** (`<rootKind>` = `story`) — story-form:
     `project: <projectId>` string + `story:` object (**no** `epic:` key).
   - Or, when there are **zero** `error` findings and you are not adopting
     warning fixes, retain nothing (no apply). Warnings that remain must
     still appear in the step-5 summary.
4. **Auto-apply when safe.** When step 2 did not escalate and there is a
   retained YAML: write it to a temp file (or stdin) and run
   `issue apply <file>` (or equivalent) so tracker writes stay
   **single-threaded** through this coordinator. Do **not** ask yes/no to
   apply. Write path is the retained apply doc per issue-tracker-authoring
   (declarative apply) — epic-form or story-form per Bootstrap `<rootKind>`.
5. **Post-apply summary.** After a successful apply, or when there is nothing
   to apply, show in chat a **short informational** summary. Include **every
   non-escalated finding** (with severities) — including warnings whose fixes
   were not adopted — plus the plan changes applied when apply ran. State
   explicitly that **no changes are needed** only when there are **zero
   findings** (truly clean). Do **not** dump the apply YAML into chat. Show
   `apply` stdout (created/updated/deleted + subtree outline) when apply ran.

## Rules

- Check agents never write the tracker; only this coordinator writes, and only
  when auto-apply is safe (or after the user resolves an escalate).
- Do not ask the user to approve before `issue apply` when fixes are clear.
- Do not auto-chain into `issue-tracker-work` or other skills.
- Do not edit workspace source files as part of polish (tracker plan only).
