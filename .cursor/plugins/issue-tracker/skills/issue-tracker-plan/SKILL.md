---
name: issue-tracker-plan
description: >-
  Grill an Idea, a pre-implementation (todo) Epic, or a not-started
  project-level Story until shared understanding, then migrate it into a
  detailed plan tree via apply (story-form or epic-form per Epic grain). Use
  when the user asks to plan an Idea, flesh out a todo Epic or not-started
  project-level Story, or run issue-tracker-plan / grill a tracker plan into
  Stories and Tasks.
---

# Issue Tracker — Plan (grill → plan tree)

Turn a rough capture into a detailed plan tree — either a **project-level
Story > Task** tree or an **Epic > Story > Task** tree, per authoring Epic
grain. You grill the user to shared understanding, propose the tree, get
explicit go-ahead, then write the tracker via `issue apply`
(issue-tracker-authoring). Do not implement product code; this skill only
authors the plan artifact.

Use the `issue` binary. Do not set `ISSUES_DIR`. Never retarget `npm link` to
`/root/.cursor/plugins/local/...`. Cross-cutting CLI invariants:
[SPEC.md § CLI invariants](../../SPEC.md#cli-invariants).

Grain, apply doc shape, parent-prose, and prune-by-default rules live in
issue-tracker-authoring and [SPEC.md](../../SPEC.md) — when proposing the
tree, apply those rules yourself; only ask the user when a product
or dependency choice remains after those rules. Do not restate them here.

## Argument

An **Idea** id, an **Epic** id whose derived
`issue epic get <id> epicStatus` is `todo`, or a **project-level Story** id
whose derived `issue story get <id> storyStatus` is `not-started`.

If none is given:

1. Run `issue tree` (no-arg: all projects).
2. Resolve `<projectId>` from the `project <id>` lines (one → use it; many → ask which; none → stop).
3. Run `issue tree <projectId>`. Offer only **Ideas**, Epics whose status
   chip is `todo` (or confirm with `issue epic get <id> epicStatus`), and
   **project-level** Stories whose status chip is `not-started` (or confirm
   with `issue story get <id> storyStatus`; project-level = `partOf` is the
   Project). **Do not offer** `in-progress` / `done` Epics, or Stories at
   `in-progress` / `pr-open` / `merged` — they fail §Bootstrap gates.

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
2. Consult `vision` per
   [`agents/_issue-tracker-consult-supporting-doc.md`](../../agents/_issue-tracker-consult-supporting-doc.md)
   using the step-1 summary output.
3. Kind / status gates:
   - **Idea** — proceed.
   - **Epic** — run `issue epic get <id> epicStatus`.
     - `todo` → proceed.
     - `in-progress` or `done` → **refuse** and stop. Tell the user this skill
       only rewrites pre-implementation Epics; for an existing tree use
       `issue-tracker-plan-polish` (or work it with `issue-tracker-work`).
   - **Story** — confirm it is **project-level** (`issue story get <id> partOf`
     equals `<projectId>` from step 1; refuse Epic-child Stories). Then run
     `issue story get <id> storyStatus`.
     - `not-started` → proceed.
     - `in-progress`, `pr-open`, or `merged` → **refuse** and stop. Tell the
       user this skill only rewrites not-started project-level Stories; for an
       existing tree use `issue-tracker-plan-polish` (or work it with
       `issue-tracker-work`).
   - Any other kind → refuse.
4. `issue <kind> view <id>` — load the full capture (`description.md`), not
   only the summary blurb (`idea`, `epic`, or `story` from step 3).
5. If the source is an **Epic** or **project-level Story**, also
   `issue tree <id>` so the existing subtree is in context before grilling.

## Grill-me protocol (inline)

Interview the user relentlessly about every aspect of the plan until you reach
a **shared understanding**. Walk down each branch of the design tree, resolving
dependencies between decisions one-by-one. For each question, provide your
recommended answer.

Do **not** ask the user to choose Story vs Task grain, Epic vs project-level
Story grain, or slice decomposition — apply issue-tracker-authoring grain
yourself. Reserve questions for product and dependency choices that remain
after those rules.

**Rules (mandatory):**

- Ask **one question at a time**, waiting for feedback before continuing.
  Multiple questions at once is bewildering.
- Each question should be **succinct**.
- Recommended answers must **not** be part of the question text. Express them
  only via a `(recommended)` prefix in the **list of answers** (not inside the
  question).
- If a fact can be found by exploring the codebase (cwd = Project
  `Workspace:`), **look it up** rather than asking. Product and dependency
  decisions remain the user's — put each one to them and wait.
- **Do not enact** the plan (no `apply`, no tracker writes that materialize the
  tree) until the user confirms you have reached a shared understanding.

This protocol is **inlined here**. Do **not** add or invoke a separate
plugin-local grill-me skill.

## Two-beat confirm, then migrate

Strict flow after shared understanding (exactly two beats — no extra confirm):

1. **Beat 1 — outline.** Show the proposed tree outline in chat with enough
   prose that the user can judge scope. Match the chosen migrate shape:
   story-form → root Story title + Task titles; epic-form → Epic title +
   Story/Task hierarchy (implementation order). Do **not** `apply` yet.
2. **Beat 2 — go-ahead.** Get an **explicit go-ahead** to write the tracker
   (e.g. approve the outline / say to apply). The user may edit the proposal
   in chat first.
3. Only then **Migrate** (below).

## Migrate

Choose **story-form** or **epic-form** per issue-tracker-authoring **Epic
grain** (do not restate that rule here). Follow authoring for apply-doc shape
and prune-by-default scope (never a project-root `apply` for this migration).

**Story-form** — `project: <projectId>` string + `story:` object (no `epic:`):

| Source | Story id in the doc | After successful `apply` |
| --- | --- | --- |
| **Idea** | Mint a **new** kebab id — **do not reuse the Idea id** | `issue idea delete <ideaId>` |
| **project-level Story** (`not-started`) | **Keep** the existing Story id | (none) |

**Epic-form** — `project: <projectId>` string + `epic:` object:

| Source | Epic id in the doc | After successful `apply` |
| --- | --- | --- |
| **Idea** | Mint a **new** kebab id — **do not reuse the Idea id** | `issue idea delete <ideaId>` |
| **Epic** (`todo`) | **Keep** the existing Epic id | (none) |
| **project-level Story** (`not-started`) | Mint a **new** kebab Epic id; **keep** the existing Story id as a child under that Epic | (none) |

Show `apply` stdout (and delete outcome on the Idea path). Report the
resulting Story or Epic id.

## After success

Offer to run **`issue-tracker-plan-polish`** on the resulting Story or Epic
id: ask **yes/no**. Do **not** auto-chain. If yes, follow that skill; if no,
stop.

## Rules

- Tracker writes for the migration happen only after both confirm beats.
- Do not edit workspace product source as part of planning (plan artifact /
  grill research reads only).
- Do not auto-start `issue-tracker-work` or polish without the yes/no offer
  answer.
