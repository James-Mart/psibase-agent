---
name: manage-agents
description: >-
  Launch a web UI for managing agent worktrees and workers, or use CLI scripts
  under this skill's scripts/ directory. Shows worktree names, branches, and
  running agent status; create worktrees, list workers, start/stop workers. Use
  when the user asks to manage agents, open the agent dashboard, launch the
  worker management UI, create a new agent worktree/worker, list workers, or run
  create-worker / list-workers from the terminal.
disable-model-invocation: true
---

# Manage Agents

## Web UI: start the dev server

```bash
cd .cursor/skills/manage-agents/app && npm install && npm run dev
```

This starts:

- Vite dev server on http://localhost:8070 (frontend)
- Express API server on http://localhost:8071 (backend)

Tell the user the UI is available at http://localhost:8070.

---

## CLI: list workers

From any worktree of the repo:

```bash
bash .cursor/skills/manage-agents/scripts/list-workers.sh
```

Prints each worktree under `/root/psibase.worktrees/`, its current git branch, and whether an `agent worker start` process appears to be running (with PID when found).

---

## CLI: create worker (new worktree + env setup)

Sets up a brand-new worktree on a new branch. The worktree directory name is derived from the **new branch name**: each `/` in the branch is replaced with `-` so the path is a single directory under `/root/psibase.worktrees/`. If that target path already exists, the script exits with an error and does not create a worktree (see stderr for the path).

### Inputs

- **new branch name** (required): the branch to create.
- **source branch** (optional): the branch to base it on. Defaults to `origin/main`.

If the user did not specify a new branch name, ask before running.

### Step 1: Run the bash script

From the current worktree, run:

```bash
bash .cursor/skills/manage-agents/scripts/create-worker.sh <new-branch> [source-branch]
```

The script will:

1. Compute the worktree directory name from `<new-branch>` (`/` → `-`). If `/root/psibase.worktrees/<that-name>` already exists, it exits with a short error and does nothing else.
2. Fetch the source branch if it's an `origin/*` ref.
3. `git worktree add -b <new-branch> /root/psibase.worktrees/<sanitized-name> <source-branch>`.
4. `cd` into the new worktree and run `./.vscode/scripts/env-setup.sh`.
5. Print a final block like:

   ```
   ===== create-worker: ready =====
   WORKTREE_NAME=<sanitized-name>
   WORKTREE_PATH=/root/psibase.worktrees/<sanitized-name>
   BRANCH=<new-branch>
   ```

Capture `WORKTREE_NAME` and `WORKTREE_PATH` from that block — you'll need them in step 2.

If the script fails, stop and report the error. Do not proceed to step 2.

### Step 2: Start the worker as a backgrounded shell

`agent worker start` runs indefinitely, so it must NOT be run inline. Start it
as a backgrounded shell (`block_until_ms: 0`) so:

- Its output streams into a Cursor terminal file the user can watch.
- The user (and you) can cancel it later via the printed PID.

Run it from the new worktree:

```bash
cd <WORKTREE_PATH> && echo "Branch: <new-branch>" && agent worker start --name "<WORKTREE_NAME>"
```

Use a descriptive shell description such as `"agent worker: <WORKTREE_NAME>"`
so it's easy to find in the terminals list.

### Step 3: Confirm and report

After backgrounding the worker, briefly poll the shell once to confirm it
started without crashing, then tell the user:

- The worktree name and path.
- The new branch and what it was based on.
- The terminal id / output file path for the running `agent worker start`,
  and its PID, so they can stop it when done (e.g. `kill <pid>`).
