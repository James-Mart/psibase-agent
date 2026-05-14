# manage-agents

Web UI for managing agent worktrees and workers, plus a Review History Synthesis capability for turning a full ref-to-ref diff into a clean, reviewable commit history.

## Layout

- `app/` — Vite + Express web UI (frontend on `:8070`, backend on `:8071`).
- `skills/manage-agents/SKILL.md` — top-level skill that tells Cursor how to launch the UI.
- `skills/review-history/SKILL.md` — orchestration skill documenting the 7-step review-history-synthesis workflow.
- `agents/rhs-*.md` — five subagents the backend invokes via the Cursor SDK (change surveyor, semantic partitioner, node constructor, edge refinement planner, edge intermediate constructor).

## Run the dev server

```bash
cd .cursor/plugins/manage-agents/app && npm install && npm run dev
```

The Review History Synthesis features require `CURSOR_API_KEY` in the server's environment.

## Intent-level spec

See [SPEC.md](./SPEC.md) for the high-level mental model, invariants, and per-edge refinement workflow. Read it before making changes to the commit-review feature.
