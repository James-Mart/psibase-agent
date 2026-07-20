---
name: issue-tracker-plan-polish
description: >-
  Polish an existing issue-tracker Epic: spawn four parallel read-only check
  agents, aggregate findings into a retained epic-form apply plan, present a
  short chat summary for approval, and apply the retained YAML only after the
  user approves. Use when the user asks to polish a plan, clean up an Epic
  tree, or run plan-polish checks.
---

# Issue Tracker — Plan Polish

Polish one **Epic** already in the tracker. You are the **coordinator**: spawn
read-only check agents, compose a full epic-form `apply` from their findings
(keep it internal), present a short findings + changes summary in chat, and
write the tracker only after the user approves that summary.

Use the `issue` binary. Do not set `ISSUES_DIR`. Never retarget `npm link` to
`/root/.cursor/plugins/local/...`. Cross-cutting CLI invariants:
[SPEC.md § CLI invariants](../../SPEC.md#cli-invariants).

## Argument

An Epic id (any `epicStatus` — not limited to `todo`). If none is given:

1. Run `issue tree` (no-arg: all projects).
2. Resolve `<projectId>` from the `project <id>` lines (one → use it; many → ask which; none → stop).
3. Run `issue tree <projectId>` and ask which Epic.

Never bare `issue list`.

## Bootstrap

1. `issue summary <epicId>` — confirm it is an Epic; read `Project:` and
   `Workspace:`.
   - Take `<projectId>` from the id token on `Project: <projectId> — <title>`.
   - If `Workspace:` is absent, **stop and hand back to the user** to set it
     (`issue project set <projectId> workspace <path>`) before spawning
     anything. Check agents must read the shared contract (and authoring
     SKILL files) from disk with cwd = `Workspace:` — there is no
     plan-only fallback (SPEC § Project workspace: unset → escalate, never
     fall back).
2. `issue tree <epicId>` — full Story/Task outline (implementation
   order).
3. `issue epic view <epicId>` (and children as needed) when preparing the
   proposal.

## Parallel check agents

Spawn **all four** agents **in parallel** (one Cursor Task each) via the
**Spawn stubs** below. Pass **only** the fields each stub lists — children own
static behavior in `agents/*.md`; do not paste agent workflow into the prompt.

| Agent (`subagent_type`) | Cursor Task `model` |
| --- | --- |
| `issue-tracker-plan-no-ambiguity` | `composer-2.5` |
| `issue-tracker-plan-dry` | `composer-2.5` |
| `issue-tracker-plan-authoring-conformance` | `composer-2.5` |
| `issue-tracker-plan-dependency-order` | `cursor-grok-4.5-high-fast` |

Each agent template is `readonly: true`. Shared CLI/bootstrap/JSON output
contract lives only in
[`agents/_issue-tracker-plan-polish-check-base.md`](../../agents/_issue-tracker-plan-polish-check-base.md)
— do not restate the findings schema here.

## Spawn stubs

Pass these as the Cursor Task `prompt`. Inline the Epic id/title. Children own
static behavior via their `agents/*.md` files — do not paste workflow
instructions here.

**Epic context line** — shared prefix for all four check stubs:

> Epic: `<epicId>` (`<title>`).

**Findings return line** — append to every check stub (gate-critical; stubs
are re-read each spawn while agent injection may be frozen):

> Return only a JSON findings array per
> `agents/_issue-tracker-plan-polish-check-base.md` (no prose wrapper).

**No-ambiguity** — `subagent_type: issue-tracker-plan-no-ambiguity`
(`model: composer-2.5`)

> *(Epic context line.)* *(Findings return line.)*

**DRY** — `subagent_type: issue-tracker-plan-dry` (`model: composer-2.5`)

> *(Epic context line.)* *(Findings return line.)*

**Authoring conformance** —
`subagent_type: issue-tracker-plan-authoring-conformance`
(`model: composer-2.5`)

> *(Epic context line.)* *(Findings return line.)*

**Dependency order** —
`subagent_type: issue-tracker-plan-dependency-order`
(`model: cursor-grok-4.5-high-fast`)

> *(Epic context line.)* *(Findings return line.)*

## Aggregate → proposal

After all four return:

1. Parse each result as a JSON findings array. Deduplicate overlapping
   findings; prefer concrete `suggestedFix` text.
2. **Severity:** any unresolved `error` means you **must not** propose “no
   changes needed”. Fold fixes for every `error` into the retained apply plan
   (or ask the user how to resolve conflicting errors). List `warning`
   findings in the chat summary; include their fixes in the retained plan when
   the suggested change is clear, or call them out as optional for the user to
   accept/edit. Never treat a clean outcome as OK while errors remain
   unaddressed in the proposal.
3. **Compose and retain** one full epic-form `apply` YAML
   (`project: <projectId>` string + `epic:` object) from the deduplicated
   findings, per issue-tracker-authoring and
   [SPEC.md § apply doc format](../../SPEC.md#apply-doc-format). Keep this
   YAML internal — do not paste it into chat.
4. Build **one** user-facing proposal for chat, derived from that retained
   plan:
   - A **short summary** of findings (with severities) and the proposed plan
     changes — not the full epic-form `apply` YAML.
   - Or, only when there are **zero** `error` findings (and you are not
     adopting warning fixes), state explicitly that **no changes are needed**
     (no retained YAML).
5. Show that summary in chat. Do **not** dump the epic-form apply doc into
   chat. Do **not** `issue apply` yet.

## Approve, then apply

On approval (the user may request revisions to the summary):

1. Apply the **retained** epic-form YAML from Aggregate. If the user edited
   the summary, revise that retained YAML to match those edits first — do not
   rebuild it from the short summary alone. Write it to a temp file (or
   stdin).
2. Run `issue apply <file>` (or equivalent) so tracker writes stay
   **single-threaded** through this coordinator.
3. Show `apply` stdout (created/updated/deleted + subtree outline).

If the user rejects or asks for revisions, revise the retained plan and the
chat summary together, then wait again — do not apply unapproved changes.
Write path is the approved epic-form `apply` per issue-tracker-authoring
(declarative apply).

## Rules

- Check agents never write the tracker; only this coordinator writes, and only
  after approval.
- Do not auto-chain into `issue-tracker-work` or other skills.
- Do not edit workspace source files as part of polish (tracker plan only).
