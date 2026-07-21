---
name: issue-tracker-plan-polish
description: >-
  Polish an existing issue-tracker work root (Epic or project-level Story):
  spawn five parallel read-only check agents, aggregate findings into a
  retained apply plan (epic-form or story-form), present a short chat summary
  for approval, and apply the retained YAML only after the user approves. Use
  when the user asks to polish a plan, clean up an Epic or project-level Story
  tree, or run plan-polish checks.
---

# Issue Tracker — Plan Polish

Polish one **work root** — an **Epic** or a **project-level Story** — already
in the tracker. You are the **coordinator**: spawn read-only check agents,
compose a full apply doc from their findings (keep it internal), present a
short findings + changes summary in chat, and write the tracker only after the
user approves that summary.

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
     anything. Check agents must read the shared contract (and authoring
     SKILL files) from disk with cwd = `Workspace:` — there is no
     plan-only fallback (SPEC § Project workspace: unset → escalate, never
     fall back).
   - Apply **Work-root kind gates** from
     [`agents/_issue-tracker-plan-polish-check-base.md`](../../agents/_issue-tracker-plan-polish-check-base.md)
     § Bootstrap (bind `<rootKind>`; do not restate that block here).
2. **Read**
   `.cursor/plugins/issue-tracker/agents/_issue-tracker-consult-supporting-doc.md`
   from disk (cwd = `Workspace:` from step 1), then consult `vision` per that
   file using the step-1 summary output.
3. `issue tree <rootId>` — full Story/Task outline (implementation
   order).
4. `issue <rootKind> view <rootId>` (and children as needed) when preparing the
   proposal.

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

## Aggregate → proposal

After all five return:

1. Parse each result as a JSON findings array per
   [`agents/_issue-tracker-plan-polish-check-base.md`](../../agents/_issue-tracker-plan-polish-check-base.md).
   Deduplicate overlapping findings.
2. **Severity:** any unresolved `error` means you **must not** propose “no
   changes needed”. For every finding, **you** invent concrete remediation
   from `problem` text plus tree context (`issue tree`, `<kind> view`) and
   fold fixes for every `error` into the retained apply plan (or ask the user
   how to resolve conflicting errors). List `warning` findings in the chat
   summary; include their fixes in the retained plan when the remediation is
   clear, or call them out as optional for the user to accept/edit. Never
   treat a clean outcome as OK while errors remain unaddressed in the proposal.
3. **Compose and retain** one full apply YAML from the deduplicated findings
   and your invented fixes,
   matching the work-root kind, per issue-tracker-authoring and
   [SPEC.md § apply doc format](../../SPEC.md#apply-doc-format). Keep this
   YAML internal — do not paste it into chat.
   - **Epic** (`<rootKind>` = `epic`) — epic-form: `project: <projectId>`
     string + `epic:` object.
   - **project-level Story** (`<rootKind>` = `story`) — story-form:
     `project: <projectId>` string + `story:` object (**no** `epic:` key).
4. Build **one** user-facing proposal for chat, derived from that retained
   plan:
   - A **short summary** of findings (with severities) and the proposed plan
     changes — not the full apply YAML.
   - Or, only when there are **zero** `error` findings (and you are not
     adopting warning fixes), state explicitly that **no changes are needed**
     (no retained YAML).
5. Show that summary in chat. Do **not** dump the apply doc into chat. Do
   **not** `issue apply` yet.

## Approve, then apply

On approval (the user may request revisions to the summary):

1. Apply the **retained** YAML from Aggregate. If the user edited the summary,
   revise that retained YAML to match those edits first — do not rebuild it
   from the short summary alone. Write it to a temp file (or stdin).
2. Run `issue apply <file>` (or equivalent) so tracker writes stay
   **single-threaded** through this coordinator.
3. Show `apply` stdout (created/updated/deleted + subtree outline).

If the user rejects or asks for revisions, revise the retained plan and the
chat summary together, then wait again — do not apply unapproved changes.
Write path is the approved apply doc per issue-tracker-authoring
(declarative apply) — epic-form or story-form per Bootstrap `<rootKind>`.

## Rules

- Check agents never write the tracker; only this coordinator writes, and only
  after approval.
- Do not auto-chain into `issue-tracker-work` or other skills.
- Do not edit workspace source files as part of polish (tracker plan only).
