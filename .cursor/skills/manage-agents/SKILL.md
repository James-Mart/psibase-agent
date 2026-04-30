---
name: manage-agents
description: Launch a web UI for managing agent worktrees and workers. Shows worktree names, branches, and running agent status with controls to create, start, and stop workers. Use when the user asks to manage agents, open the agent dashboard, or launch the worker management UI.
disable-model-invocation: true
---

# Manage Agents

## Start the dev server

```bash
cd .cursor/skills/manage-agents/app && npm install && npm run dev
```

This starts:
- Vite dev server on http://localhost:8070 (frontend)
- Express API server on http://localhost:8071 (backend)

Tell the user the UI is available at http://localhost:8070.
