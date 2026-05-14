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

- Each **node** is a full cumulative tree state plus a commit sha pointing at that tree, plus a per-node `is_canonical` bit the user can toggle.
- Each **edge** is the diff between a node and its parent.
- A session always has a `base` node (tree of `baseRef`) and starts with a single `final` node (tree of `sourceRef`) parented on `base`. No node is canonical at session creation.
- The **canonical chain** is the unique linear path obtained by walking from `base` and, at each step, advancing to the single canonical child if there is exactly one. The walk stops on zero or ambiguous canonical children.
- Export collapses the canonical chain (from `base` to the chain's last node) into a fresh branch with one commit per non-base node, in chain order. Export is gated on the chain ending at a node whose `tree == finalTree`.

The user's job is to **refine edges** and **mark canonical nodes** until the chain from `base` to a final-tree node reads like a good PR.

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

1. **begin**: insert a `rhs_edge_refinements` row keyed by `(session_id, target_node_id)` with `status = 'in_progress'` and `synthesis_head_node_id = NULL`. Reset the synthesis worktree to the parent commit.
2. **survey / plan**: run the appropriate subagent. Accept the result to lock it into the refinement row.
3. **construct**: for each plan item in order, dispatch a constructor subagent against the synthesis worktree, then checkpoint the worktree as a new intermediate node parented on the current `synthesis_head_node_id` (or `before` if NULL). After each successful checkpoint, `synthesis_head_node_id` advances to the new intermediate.
4. **complete**: reparent any children of the original target node onto the last intermediate. **Keep the original target node alive as a leaf alternative.** Flip the refinement row to `status = 'completed'`. The user must mark whichever path they want canonical themselves.
5. **abandon**: walk from `synthesis_head_node_id` up parent links to `before` and delete each intermediate row. Hard-reset the synthesis worktree to `before.commit`. Delete the refinement row.

`synthesis_head_node_id` is purely internal to the in-progress refinement; it is never exposed to users and is meaningless once the refinement is `completed`.

After completion the refinement leaves the row in `status = 'completed'`; that edge is "consumed" and cannot be refined again. The user refines downstream edges to make further changes.

### Concurrency

The synthesis worktree is shared per session, so **only one refinement may be `in_progress` per session at a time**. `POST /edges/:targetNodeId/begin` returns 409 if any other refinement is in flight. Only one agent run may be in progress per session at any time.

## Invariants the system relies on

- Marking a node N canonical clears `is_canonical` on every other node in the session that shares N's tree (same-tree dedup; the "competition" rule). No two canonical nodes ever share the same tree.
- The base node is never marked canonical: it is always implicitly the start of the canonical chain.
- The canonical chain ends at a node whose tree equals `finalTree` is the **export gate**. Until this holds, exporting refuses.
- A successful refinement preserves the option to satisfy the gate via the new chain: the last intermediate has the same tree as the original target, and the original target's downstream chain is reparented onto the last intermediate.
- The original target is kept alive as a leaf alternative; it is the user's job to mark whichever path they want canonical.
- Run rows always carry `(session_id, target_node_id)` so the SSE stream and the per-edge UI can stay correctly scoped.
- The schema is single-DB SQLite (`app/manage-agents.db`); cascades are implemented in the helper functions, not via FK ON DELETE, because rows live on disk-coupled worktree state.

## What goes in `rhs_*` tables

- `rhs_sessions`: one row per `(worker, worker_branch)`. Holds `base_tree`, `final_tree`, `base_node_id`, `synthesis_worktree`, `model_id`.
- `rhs_nodes`: every virtual node. Tree, commit sha, parent, title, `is_canonical`, optional metadata.
- `rhs_edge_refinements`: keyed by `(session_id, target_node_id)`. Holds `mode`, `user_concern`, accepted survey/plan JSON, status (`in_progress` | `completed`), and `synthesis_head_node_id` (NULL or the most recent in-progress intermediate node).
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
- delete the original target node when a refinement completes,
- reintroduce a session-level "active head" pointer in addition to `is_canonical`,

stop and re-read this file. Those shapes were considered and explicitly rejected during the design.
