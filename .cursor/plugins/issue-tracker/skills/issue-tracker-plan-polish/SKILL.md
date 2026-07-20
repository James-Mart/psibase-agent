---
name: issue-tracker-plan-polish
description: >-
  Polish an existing issue-tracker Epic: spawn four parallel read-only check
  agents, aggregate findings into one epic-form apply proposal, and apply only
  after user approval. Use when the user asks to polish a plan, clean up an
  Epic tree, or run plan-polish checks.
---

# Issue Tracker — Plan Polish

Polish one **Epic** already in the tracker. You are the **coordinator**: spawn
read-only check agents, propose a single epic-form `apply` doc from their
findings, and write the tracker only after the user approves that doc.

Use the `issue` binary. Do not set `ISSUES_DIR`. Never retarget `npm link` to
`/root/.cursor/plugins/local/...`.

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
   changes needed”. Fold fixes for every `error` into the epic-form YAML (or
   ask the user how to resolve conflicting errors). `warning` findings should
   be listed in the chat summary; include their fixes in the YAML when the
   suggested change is clear, or call them out as optional for the user to
   accept/edit. Never treat a clean apply as OK while errors remain unaddressed
   in the proposal.
3. Build **one** proposal for the user:
   - An **epic-form** `apply` YAML (`project: <projectId>` string + `epic:`
     object) that is the **full desired Epic subtree after fixes** — every
     Story/Task that should remain, with corrected prose. `apply` is
     prune-by-default within that Epic root: a partial doc that omits siblings
     or tasks **deletes** them. Do not ship a patch-shaped subtree.
   - `apply` **preserves** runtime/progress fields (`status`, `qa`,
     `commitSha`, git facts, `specReview`, `retro`, chat, attachments, etc.);
     the proposal only authors plan-owned shape + prose (see
     issue-tracker-decompose / authoring **Declarative apply** /
     [SPEC.md § apply doc format](../../SPEC.md#apply-doc-format) and the
     declarative/imperative field seam).
   - Or, only when there are **zero** `error` findings (and you are not
     adopting warning fixes), state explicitly that **no changes are needed**
     (no YAML).
4. Show the proposal (and a short findings summary, including severities) in
   chat. Do **not** `issue apply` yet.

## Approve, then apply

On approval (the user may edit the YAML in chat):

1. Write the approved YAML to a temp file (or stdin).
2. Run `issue apply <file>` (or equivalent) so tracker writes stay
   **single-threaded** through this coordinator.
3. Show `apply` stdout (created/updated/deleted + subtree outline).

If the user rejects or asks for revisions, revise the proposal in chat and
wait again — do not apply unapproved docs. Never patch plan-owned fields with
imperative `issue <kind> add`/`set` for polish outcomes; the approved epic-form
doc is the write path.

## Rules

- Check agents never write the tracker; only this coordinator writes, and only
  after approval.
- Do not auto-chain into `issue-tracker-work` or other skills.
- Do not edit workspace source files as part of polish (tracker plan only).
