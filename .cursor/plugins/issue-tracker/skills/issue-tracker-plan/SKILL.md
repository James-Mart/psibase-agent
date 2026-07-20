---
name: issue-tracker-plan
description: >-
  Grill an Idea or a pre-implementation (todo) Epic until shared understanding,
  then migrate it into a detailed Epic tree via apply. Use when the user asks
  to plan an Idea, flesh out a todo Epic, or run issue-tracker-plan / grill a
  tracker plan into Stories and Tasks.
---

# Issue Tracker — Plan (grill → Epic tree)

Turn a rough capture into a detailed **Epic > Story > Task** plan. You grill the
user to shared understanding, propose the tree, get explicit go-ahead, then
write the tracker via `issue apply` (issue-tracker-authoring /
issue-tracker-decompose). Do not implement product code; this skill only
authors the plan artifact.

Use the `issue` binary. Do not set `ISSUES_DIR`. Never retarget `npm link` to
`/root/.cursor/plugins/local/...`. Cross-cutting CLI invariants:
[SPEC.md § CLI invariants](../../SPEC.md#cli-invariants).

Grain, apply doc shape, and parent-prose rules live in issue-tracker-decompose
and [SPEC.md](../../SPEC.md) — follow those when building the tree; do not
restate them here.

## Argument

An **Idea** id, or an **Epic** id whose derived
`issue epic get <id> epicStatus` is `todo`.

If none is given:

1. Run `issue tree` (no-arg: all projects).
2. Resolve `<projectId>` from the `project <id>` lines (one → use it; many → ask which; none → stop).
3. Run `issue tree <projectId>`. Offer only **Ideas** and Epics whose
   status chip is `todo` (or confirm with `issue epic get <id> epicStatus`).
   **Do not offer** `in-progress` / `done` Epics — they fail §Bootstrap gates.

Never bare `issue list`.

## Bootstrap

Before grilling:

1. `issue summary <id>` — confirm kind; read `Project:` and `Workspace:`.
   - Take `<projectId>` from the id token on `Project: <projectId> — <title>`.
   - If `Workspace:` is absent, **stop and hand back to the user** to set it
     (`issue project set <projectId> workspace <path>`) before continuing.
     Codebase lookup during the grill needs cwd = `Workspace:` — there is no
     plan-only fallback (SPEC § Project workspace: unset → escalate, never
     fall back).
2. Kind / status gates:
   - **Idea** — proceed.
   - **Epic** — run `issue epic get <id> epicStatus`.
     - `todo` → proceed.
     - `in-progress` or `done` → **refuse** and stop. Tell the user this skill
       only rewrites pre-implementation Epics; for an existing tree use
       `issue-tracker-plan-polish` (or work it with `issue-tracker-work`).
   - Any other kind → refuse.
3. `issue <kind> view <id>` — load the full capture (`description.md`), not
   only the summary blurb (`idea` or `epic` from step 2).
4. If the source is an **Epic**, also `issue tree <id>` so the existing
   Story/Task subtree is in context before grilling.

## Grill-me protocol (inline)

Interview the user relentlessly about every aspect of the plan until you reach
a **shared understanding**. Walk down each branch of the design tree, resolving
dependencies between decisions one-by-one. For each question, provide your
recommended answer.

**Rules (mandatory):**

- Ask **one question at a time**, waiting for feedback before continuing.
  Multiple questions at once is bewildering.
- Each question should be **succinct**.
- Recommended answers must **not** be part of the question text. Express them
  only via a `(recommended)` prefix in the **list of answers** (not inside the
  question).
- If a fact can be found by exploring the codebase (cwd = Project
  `Workspace:`), **look it up** rather than asking. Decisions remain the
  user's — put each one to them and wait.
- **Do not enact** the plan (no `apply`, no tracker writes that materialize the
  tree) until the user confirms you have reached a shared understanding.

This protocol is **inlined here**. Do **not** add or invoke a separate
plugin-local grill-me skill.

## Two-beat confirm, then migrate

Strict flow after shared understanding (exactly two beats — no extra confirm):

1. **Beat 1 — outline.** Show the proposed Epic tree outline in chat
   (Epic title + Story/Task titles in implementation order; enough prose that
   the user can judge scope). Do **not** `apply` yet.
2. **Beat 2 — go-ahead.** Get an **explicit go-ahead** to write the tracker
   (e.g. approve the outline / say to apply). The user may edit the proposal
   in chat first.
3. Only then **Migrate** (below).

## Migrate

Both paths use one **epic-form** `apply` (`project: <projectId>` string +
`epic:` object) — prune-by-default within that Epic root. Ship the **full**
desired subtree (title, description, Stories/Tasks); omitting children
**deletes** them. Prefer declarative `apply` over imperative
`issue epic|story|task add`. Never use a project-root `apply`
for this migration (a partial project doc would prune sibling Epics/Ideas).

| Source | Epic id in the doc | After successful `apply` |
| --- | --- | --- |
| **Idea** | Mint a **new** kebab id — **do not reuse the Idea id** | `issue idea delete <ideaId>` |
| **Epic** (`todo`) | **Keep** the existing Epic id | (none) |

Show `apply` stdout (and delete outcome on the Idea path). Report the
resulting Epic id.

## After success

Offer to run **`issue-tracker-plan-polish`** on the resulting Epic: ask
**yes/no**. Do **not** auto-chain. If yes, follow that skill; if no, stop.

## Rules

- Tracker writes for the migration happen only after both confirm beats.
- Do not edit workspace product source as part of planning (plan artifact /
  grill research reads only).
- Do not auto-start `issue-tracker-work` or polish without the yes/no offer
  answer.
