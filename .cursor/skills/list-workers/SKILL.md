---
name: list-workers
description: List agent worktrees created by create-worker, showing each worktree name and its checked-out branch. Use when the user asks to list workers, show worktrees, see active agents, or check which branches agents are on.
disable-model-invocation: true
---

# List Workers

Run the listing script from the repo root:

```bash
bash .cursor/skills/list-workers/scripts/list-workers.sh
```

Report the output to the user as-is.
