# manage-agents: intent-level spec

This document captures the *why* and the *invariants* of the manage-agents plugin's Commit Review feature (Review History Synthesis, "RHS"). Read it before touching commit-review code so you understand the mental model the system depends on. Implementation details live in `app/server/services/reviewHistory/*` and `app/src/features/review-history/*`; this file describes intent.

## What manage-agents is for

A small web UI for orchestrating local agent worktrees:

- One worker = one git worktree under `WORKTREES_DIR`, on its own branch.
- Per worker we run builds, chains, agents, and **Commit Review** (RHS).
- The detail pane is a single Tabs control: Build, Chain, Commit Review, Diff (working-tree status of the worker's primary worktree), Note. The Tabs control fills the pane.

## What Commit Review (RHS) is for

The goal: turn a worker's `baseRef → sourceRef` diff into a clean, *reviewable* commit history without losing fidelity to the final tree.

We represent this work as a **virtual node graph**:

- Each **node** is a full cumulative tree state plus a commit sha pointing at that tree.
- Each **edge** is the diff between a node and its parent.
- A session always has a `base` node (tree of `baseRef`) and an `active head`.
- A session is initialised with `base → final`, where `final` is `tree(sourceRef)`. `active_head_id = finalNodeId` on creation.
- Export collapses the active chain (from `base` to `active_head`) into a fresh branch with one commit per non-base node, in chain order.

The user's job is to **refine edges** until the chain from `base` to `active_head` reads like a good PR.

## The single primitive: edge refinement

Every change to the graph after `createSession` is **an edge refinement**.

An edge is identified by its **target node** (the child of the edge). The user clicks a node in the graph; the inner Diff tab inside Commit Review shows `parent.tree → node.tree`; the inner Refine tab opens the edge-refinement workflow for that incoming edge.

A refinement is started by `POST /edges/:targetNodeId/begin` with a **mode** and (for synthesis mode) a **userConcern**.

### Two modes

1. **Semantic partitioning** (`mode = "partition"`)
   - "This single diff really *is* multiple semantic changes; help me see them as separate commits."
   - Runs `rhs-change-surveyor` then `rhs-semantic-partitioner`.
   - Each plan item describes a subset of the *existing* diff. Applying items in order from `parent` produces `target.tree` exactly. The surveyor MUST be accepted before the partitioner runs.

2. **Intermediate synthesis** (`mode = "synthesis"`, `userConcern` required)
   - "This single diff is *one* logical change, but two concerns are unfortunately coupled inside it; help me synthesise a sensible intermediate step."
   - Runs `rhs-edge-refinement-planner` then `rhs-edge-intermediate-constructor` for each intermediate item.
   - The surveyor is optional context; the planner is driven by the user's prose.

Both modes converge to the same shape: an ordered list of plan items, each constructed in turn into an intermediate node.

### Lifecycle of a refinement

1. **begin**: insert a `rhs_edge_refinements` row keyed by `(session_id, target_node_id)` with `status = 'in_progress'`. Reset the synthesis worktree to the parent commit. Set `active_head_id = parent`.
2. **survey / plan**: run the appropriate subagent. Accept the result to lock it into the refinement row.
3. **construct**: for each plan item in order, dispatch a constructor subagent against the synthesis worktree, then checkpoint the worktree as a new intermediate node parented on the current active head. After each successful checkpoint, `active_head_id` advances to the new intermediate.
4. **complete**: reparent any children of the original target node onto the last intermediate, **delete the original target node row**, set `active_head_id` to the last intermediate.
5. **abandon**: delete all intermediate node rows created during this refinement, reset `active_head_id` to the original target, hard-reset the synthesis worktree to the target's commit, delete the refinement row.

After completion the refinement leaves the row in `status = 'completed'`; that edge is "consumed" and cannot be refined again. The user refines downstream edges to make further changes.

### Concurrency

The synthesis worktree is shared per session, so **only one refinement may be `in_progress` per session at a time**. `POST /edges/:targetNodeId/begin` returns 409 if any other refinement is in flight. Only one agent run may be in progress per session at any time.

## Invariants the system relies on

- `active_head_id` is always either the base node or a node reachable from the base by walking child links.
- `tree(active_head) == finalTree` is the **export gate**. Until this holds, exporting refuses.
- A successful refinement preserves the export gate: the last intermediate has the same tree as the deleted target, and any downstream chain unchanged from the target onward is reparented intact.
- Run rows always carry `(session_id, target_node_id)` so the SSE stream and the per-edge UI can stay correctly scoped.
- The schema is single-DB SQLite (`app/manage-agents.db`); cascades are implemented in the helper functions, not via FK ON DELETE, because rows live on disk-coupled worktree state.

## What goes in `rhs_*` tables

- `rhs_sessions`: one row per `(worker, worker_branch)`. Holds `base_tree`, `final_tree`, `base_node_id`, `active_head_id`, `synthesis_worktree`, `model_id`.
- `rhs_nodes`: every virtual node. Tree, commit sha, parent, title, optional metadata.
- `rhs_edge_refinements`: keyed by `(session_id, target_node_id)`. Holds `mode`, `user_concern`, accepted survey/plan JSON, status (`in_progress` | `completed`).
- `rhs_runs`: every subagent run. Carries `session_id`, `target_node_id`, `kind` (`survey` | `plan` | `construct`), `status`, `item_id`, `result_json`.

If you add data, add it here, not to ad-hoc tables.

## What does *not* belong in this system

- Anything keyed on session-wide "current step" or session-level survey/plan. The session-level workflow stepper was removed; the user navigates the graph instead.
- Anything that mutates `main` or any user-visible branch. RHS only writes to `refs/internal/...` worktrees and finally to an explicit export branch the user chose.
- Anything that bypasses the per-edge `rhs_edge_refinements` row for survey/plan state. There is exactly one place to look up "is this edge being refined and how far has it gotten".

## Subagent contract summary

- `rhs-change-surveyor`: takes `BeforeTree`, `TargetTree`. Returns a structured ChangeSurvey JSON.
- `rhs-semantic-partitioner`: takes `BeforeTree`, `TargetTree`, accepted `ChangeSurveyJson`. Returns a SemanticPlan whose items collectively reproduce `TargetTree` from `BeforeTree`.
- `rhs-node-constructor`: takes the synthesis worktree, `PreviousCommit`, `TargetTree`, and one `PlanItemJson`. Edits the worktree to apply just that item. Returns `OK` or `BLOCKED: <reason>`.
- `rhs-edge-refinement-planner`: takes `BeforeCommit`, `TargetCommit`, `UserConcern`, and produces a small ordered list of synthesised intermediate items.
- `rhs-edge-intermediate-constructor`: takes the synthesis worktree, `PreviousCommit`, `TargetCommit`, and one intermediate item. Edits the worktree toward the target. Returns `OK` or `BLOCKED: <reason>`.

If a constructor cannot honour an item without pulling in changes from a later item, it returns `BLOCKED`; the loop halts so the user can decide.

## When to break the model

If you find yourself wanting to:

- attach survey/plan state to a session instead of an edge,
- mutate nodes in place,
- run multiple refinements concurrently in one session,
- introduce a separate "preserved" copy of the target node on completion,

stop and re-read this file. Those shapes were considered and explicitly rejected during the design.
