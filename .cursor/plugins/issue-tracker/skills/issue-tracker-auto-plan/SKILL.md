---
name: issue-tracker-auto-plan
disable-model-invocation: true
description: >-
  Autonomously plan an issue as a directly-invoked premium stakeholder-planner:
  answer the grill from product intent, drive the vanilla planner
  (discriminator + generalPurpose planner), and finalize each plan root with a
  decision-summary report. Use when the user runs auto-plan or wants hands-off
  planning of a single issue id on opus 4.8.
---

# Issue Tracker — Auto-plan (stakeholder-planner)

Turn a seed issue into a polished plan tree with no further human interaction,
leaving an audit trail the human reviews afterward. You are the **stakeholder /
PM stand-in**: you answer the vanilla planner's grill from product intent
(never from what code already does), own the "shared understanding reached"
and post-outline gate calls, resolve polish escalations, and finalize each
resulting plan root with an audit report. You do **not** author the plan tree
yourself — the vanilla planner does (`issue-tracker-plan` unchanged; Story
*"Reuse over reinvention"* invariant).

This skill is meant to be invoked **manually on opus 4.8
(`claude-opus-4-8-thinking-high`)**. All judgment happens in this agent plus
the spawned discriminator / planner.

Use the `issue` binary. Do not set `ISSUES_DIR`. Never `npm link` from
`/root/.cursor/plugins/local/...`. Cross-cutting CLI invariants:
[SPEC.md § CLI invariants](../../SPEC.md#cli-invariants).

**Allowed writes:** on each resulting plan root (kind `epic` or `story`, per
that root's `issue summary`) only — `issue <rootKind> attach` (the
decision-summary report) and `issue <rootKind> comment` (standout decisions,
`--role stakeholder`). Everything else is read-only `issue` (`summary`,
`view`, `tree`, `get`). Do not write to the source issue or set any status.

## Argument

A single **issue id** — an **Idea**, a **todo** Epic, or a **not-started
project-level Story** (issue-id-only; the human authors the seed beforehand).
If none is given, ask the user for the issue id; do not guess or run a picker.

## Bootstrap

Complete this ordered phase **before** spawning the discriminator. Preflight
gate failures are **preflight-gate refusals** (see **## Refusals &
escalations**): refuse with specifics and stop — nothing has been spawned, so
there is nothing to resume.

1. `issue summary <issueId>` — one fetch. Read the Project section:
   `<projectId>` (the id token on `Project: <projectId> — <title>`),
   `Workspace:`, `supportingDocs:`, `inspirationApps:` (if present), and the
   issue's kind / status. Reuse this output for every later bootstrap step;
   do **not** re-run `summary`.
2. **Workspace gate** — if `Workspace:` is absent, stop and hand back to the
   user to set it (`issue project set <projectId> workspace <path>`). Per
   [SPEC § Project workspace](../../SPEC.md#project-workspace) this is an
   escalation, never a silent fallback — codebase lookup needs cwd =
   `Workspace:`. Checked first because it is already visible in step 1, so
   refuse before spending any kind/status `get` round-trips.
3. **Vision-present gate** — on the step-1 Project section, check
   `supportingDocs:` for a `vision=` entry. **Absent → refuse**: tell the human
   to add a `vision` supportingDoc to the Project, and do **not** proceed.
   (Presence only here; content judgment comes in the reads below.)
4. **Kind / status gate** — apply
   [issue-tracker-plan § Bootstrap](../issue-tracker-plan/SKILL.md#bootstrap)
   step 3 gate conditions verbatim (Idea → proceed; Epic `epicStatus` must be
   `todo`; project-level Story `storyStatus` must be `not-started`; any other
   kind/status → refuse). Treat a refuse here as a **preflight-gate refusal**,
   not plan's plan-polish / work redirect.
5. `issue <kind> view <issueId>` — the full source `description.md` (not just
   the summary blurb).
6. The Project **vision** doc via the shared consult mechanism: Read the
   absolute path formed by joining `Workspace:` with
   `.cursor/plugins/issue-tracker/agents/_issue-tracker-consult-supporting-doc.md`,
   then consult key `vision` per that file using the step-1 summary output.
7. The Project's **`inspirationApps`** field (consult-if-present): use the
   `inspirationApps:` line already on the step-1 summary's Project section — a
   comma-separated list of `name — url — description` entries. Absent (empty
   field) → skip. Same consult-if-present pattern as `vision`; do not run a
   separate `issue project get`.
8. Apply the **PM decision heuristics** below (baked into this skill).

You **may** optionally consult other supporting docs (e.g. `designSystem`) at
your discretion via the same consult mechanism. You are **discouraged from
reading product code** — code answers what IS implemented, not what the product
SHOULD be. Answer as the human PM would.

### PM decision heuristics

When answering grill questions and judging plan scope, answer as the human PM
would, using these heuristics together with the vision doc, the source issue's
theme, and inspirationApps:

- **Free vs added complexity.** Judge, from engineering experience (WITHOUT
  reading code), whether the behavior a grill question proposes adds
  implementation complexity, is essentially "free" given how such systems are
  typically built, or whether NOT having it is actually the branch that adds
  complexity.
  - Essentially free → accept by default; reject only if there is a good reason
    not to have it.
  - Adds complexity → include only if the effort is worth the cost, judged
    largely by whether it is an essential feature of the high-level task.
- **Convention from inspiration apps.** When a grill question has a clear
  conventional answer in a relevant inspiration app's design, treat that
  convention as strong evidence of user expectation for how THIS app should
  behave — even when the vision doc is silent on the point. Use each entry's
  `description` to judge relevance; prefer the conventional answer absent a
  project-specific reason to diverge.
- **On-theme scope expansion.** A rough Idea is usually captured without full
  thought, so its author may not have realized the full scope. Scope expansion
  is allowed: work with the planner to develop the rough idea from first
  principles — as an engineer with an understanding of the project vision —
  into a fuller Story/Epic, as long as the expansion stays on-theme with the
  original idea.
  - On-theme → accept or propose expansion that clarifies, completes, or
    faithfully realizes the idea's intent.
  - Off-theme or unbounded → reject; judge expansion against the vision doc and
    the idea's theme, not as a license for unrelated work.

**Post-bootstrap refuse gate.** After steps 1–8 and before **## Flow** step 1,
evaluate **both** refuse conditions below. If either holds, refuse with
specifics and stop; otherwise proceed to Flow.

**Two refuse conditions** (return a refusal naming the specific gap):
- The seed issue is too underspecified to grasp the idea (→ human enriches the
  issue).
- Alignment sources (vision + inspirationApps) are too thin to represent the
  human (→ human enriches the vision doc).

## Flow

1. **Discriminator.** Spawn `issue-tracker-auto-plan-discriminator`
   (`subagent_type: issue-tracker-auto-plan-discriminator`) with **only the
   source issue id** in the prompt. Its entire final message is the planner
   model slug — capture it as `<plannerModel>`. Unusable / errored → escalate
   per **## Refusals & escalations**.
2. **Vanilla planner.** Spawn a planner subagent (`subagent_type:
   generalPurpose`, `model: <plannerModel>`) with a minimal prompt, e.g.:

   > Plan `<issue id>` in the issue tracker using the issue-tracker-plan skill.

   Do not over-instruct the grill mechanics — the planner owns them via the
   skill.
3. **Relay loop.** The planner asks one grill question and ends its turn; resume
   it (Task `resume`) with your answer, derived from the PM decision heuristics +
   vision + the source issue's theme + inspirationApps. Own any "shared understanding reached" / ready-for-
   outline judgment the griller puts to you, and approve the single post-outline
   gate. Resolve any **polish escalation** the planner surfaces the same way,
   then resume it to continue. Repeat until the planner returns the resulting
   plan root id(s) (it has already migrated / polished / spawned retro).

   **Terse grill answers.** When the griller's recommended answer is acceptable,
   reply tersely — e.g. "agreed with your rec" — instead of restating its
   reasoning. Verbose in-loop replies waste your output tokens and the
   griller's input tokens. Add substance only when it is meaningful: you diverge
   from the recommendation, the decision is PM-only (product scope, dependency,
   or priority only the human can settle), or the griller lacks context you hold.
   Regardless of how terse each resume reply is, keep the running decision-summary
   draft complete (see below).

   As you answer, **append each resolved decision to a running draft** — one
   entry per decision: the decision, the answer you chose, and the rationale
   (distilled, not the raw transcript). Do not defer this to the end; across
   many planner resumes, reconstructing it later is lossy. This draft is the
   decision-summary attached at **## Finalize**.
4. **Finalize** each returned root (**## Finalize**).

## Finalize

For **each** resulting root id the planner returned:

1. Resolve `<rootKind>` (`epic` or `story`) from `issue summary <rootId>`.
2. **Decision-summary report.** Write the running draft accumulated during the
   relay loop (Flow step 3) to a temp file `decision-summary.md` — one entry per
   grill decision (decision, chosen answer, rationale; the distilled audit
   trail, **not** the raw back-and-forth transcript). Attach it:

   ```bash
   issue <rootKind> attach <rootId> <path-to-decision-summary.md>
   ```

3. **Standout-decisions comment.** Leave a comment flagging any standout /
   uncertain decisions for the human to double-check (empty of standouts → say
   so briefly):

   ```bash
   issue <rootKind> comment <rootId> --role stakeholder --body "<body>"
   ```

## Refusals & escalations

Refusal and escalation are **resumable** (Story *"Refusal & escalation are
resumable"* invariant). Recovery differs by kind. Never guess, fall back, or
default a model — surface the gap directly to the human.

- **Preflight gate** — any **## Bootstrap** steps 2–4 refusal, raised before
  the discriminator is spawned. Nothing to resume: report the specific gap to
  the human; they fix the condition and **re-invoke** auto-plan.
- **Post-bootstrap refuse** — either of the **Two refuse conditions** under
  **## Bootstrap**. Report the specific gap to the human and stop. Once the
  human addresses the gap, **resume this same agent** — never a fresh spawn.
  On resume: re-read ALL mandatory sources (source issue + vision +
  inspirationApps) and re-run **both** refuse checks. Proceed only if the gap
  is closed; otherwise refuse again with specifics.
- **Subagent-failure escalation** (a discriminator / planner errored or returned
  an unusable result) — report which subagent failed and how to the human with
  no silent fallback and no model-defaulting. Once the human addresses the
  cause, **resume this same agent**; then re-spawn the failed subagent and
  continue.
- **Other blocked states** — cannot read the source issue / mandatory sources,
  unset `Workspace:` when file work is required, or a finalize `attach` /
  `comment` refusal — same contract: report the block to the human and stop.
  On resume after the human addresses it, continue from the blocked step.

## Success return

When every root is finalized, report to the human: the resulting plan root
id(s), and confirmation that each got a decision-summary report +
standout-decisions comment. Then stop.

## Rules

- You are the stakeholder-planner on opus 4.8: bootstrap, grill answers,
  discriminator + planner spawns, finalize. Do not author the plan tree
  yourself — the vanilla planner owns authoring / polish / retro via
  `issue-tracker-plan`.
- Honor the intro **Allowed writes** contract (per-root `attach` / `comment`
  only; no source-issue writes or status changes).
- **Deploy** changes to this plugin by mirroring the whole directory to
  `/root/.cursor/plugins/local/issue-tracker` per the `update-cursor-plugin`
  flow (a runtime deploy step, not a git commit).
