---
name: review-history
description: Synthesize a clean reviewable git history from the diff between two refs in a manage-agents worktree, by invoking the rhs-* subagents and the manage-agents backend in the order described below. The web UI is the canonical orchestrator; this skill exists for debugging and headless use.
disable-model-invocation: true
---

# Review History Synthesis

Drive the seven-step workflow from `ReviewHistorySynthesis.md` end to end. Each step calls one HTTP endpoint on the manage-agents backend (default `http://localhost:8071`) and, where indicated, invokes one of the `rhs-*` subagents via the Task tool. The backend owns all git, worktree, and checkpoint mechanics; this skill only orchestrates.

## Conventions

- `:name` = manage-agents worker (worktree) name.
- `:sessionId` = uuid returned by `POST /session`.
- All POST bodies are JSON. All responses are JSON unless noted.
- Every action requires `CURSOR_API_KEY` in the backend's environment. If `GET /api/review-history/api-key-status` returns `{ ok: false }`, stop and surface that to the user before doing anything else.
- One in-flight run per session: backend rejects overlapping run starts with HTTP 409. Wait for the previous run to finish, or cancel it, before starting a new one.

## Step-to-endpoint-to-subagent map

| Spec step | Endpoint | Subagent |
| --- | --- | --- |
| 1. Create session | `POST /api/workers/:name/review-history/session` `{ baseRef, sourceRef }` | — |
| 2. Survey the change | `POST /api/review-history/sessions/:sessionId/runs` `{ kind: "survey" }` | `rhs-change-surveyor` |
| 3. Accept survey | `POST /api/review-history/sessions/:sessionId/survey/accept` `{ runId }` | — |
| 4. Propose semantic plan | `POST /api/review-history/sessions/:sessionId/runs` `{ kind: "plan" }` | `rhs-semantic-partitioner` |
| 5. Accept plan | `POST /api/review-history/sessions/:sessionId/plan/accept` `{ runId }` | — |
| 6. Construct nodes | `POST /api/review-history/sessions/:sessionId/runs` `{ kind: "construct", itemId? }` | `rhs-node-constructor` |
| 7a. Mark canonical | `POST /api/review-history/sessions/:sessionId/nodes/:nodeId/canonical` `{ isCanonical }` | — |
| 7b. Validate canonical chain | `GET /api/review-history/sessions/:sessionId/validate-canonical-chain` | — |
| 7c. Export | `POST /api/review-history/sessions/:sessionId/export` `{ branchName }` | — |
| 7d. Verify export | `POST /api/review-history/sessions/:sessionId/verify` `{ branchName }` | — |

## Iterative refinement

Steps 2 and 4 can be repeated with feedback before the human accepts:

```
POST /api/review-history/sessions/:sessionId/runs
{ "kind": "survey" | "plan", "parentRunId": <prior>, "userFeedback": "..." }
```

The backend embeds the prior output and the feedback in the next prompt. Iterations link to their parent via `parent_run_id`.

## Edge refinement

When the user wants to split an existing edge `A -> B` into smaller commits:

```
POST /api/review-history/sessions/:sessionId/refinement/begin   { targetNodeId }
POST /api/review-history/sessions/:sessionId/runs               { kind: "refine-plan", targetNodeId, userConcern }   # invokes rhs-edge-refinement-planner
POST /api/review-history/sessions/:sessionId/refinement/accept  { runId }
POST /api/review-history/sessions/:sessionId/runs               { kind: "refine-construct", itemId? }                # invokes rhs-edge-intermediate-constructor (per item)
POST /api/review-history/sessions/:sessionId/refinement/complete { targetNodeId }
```

`completeEdgeRefinement` enforces `tree(B') == tree(B)` and reparents the original `B`'s children onto the last intermediate. The original `B` is kept alive as a leaf alternative; the user (or this skill) must mark the new chain canonical via `/nodes/:nodeId/canonical` for the canonical chain to switch to the new path.

## Inspection (read-only)

| Need | Endpoint |
| --- | --- |
| Current session for a worker | `GET /api/workers/:name/review-history/session` |
| Full node graph (includes `canonicalNodeIds` and `canonicalChainIds`) | `GET /api/review-history/sessions/:sessionId/graph` |
| Node's diff vs parent | `GET /api/review-history/sessions/:sessionId/nodes/:nodeId/diff` |
| Files changed in a node | `GET /api/review-history/sessions/:sessionId/nodes/:nodeId/changed-files` |
| One file at a node | `GET /api/review-history/sessions/:sessionId/nodes/:nodeId/files/<path>` |
| Live SDK events for a run | `GET /api/review-history/sessions/:sessionId/events` (SSE) |

## Subagent invocation

The backend invokes each subagent itself via `@cursor/sdk` (`Agent.prompt`) with `local.cwd` set to the synthesis worktree and `local.settingSources: ["plugins"]` so the subagent definitions in this plugin's `agents/` directory are auto-loaded. When driving the workflow manually from a Cursor IDE chat instead of the web UI, dispatch the same subagents via the Task tool with the same input contract.

## Hard rules

- Never edit the user's main worktree from this skill or from any subagent it invokes. Only the synthesis worktree owned by the backend is writable.
- Never push or fetch from the export step. `exportCanonicalHistoryToBranch` writes a local branch only.
- A failed validation (canonical chain does not reach a final-tree node, or `tree(B') != tree(B)`) is a stop condition. Surface the discrepancy and ask the user; do not retry construction blindly.
