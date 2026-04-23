---
name: create-worker
description: >-
  Creates a new git worktree under /root/psibase.worktrees/ named agentNN
  (next available slot, e.g. agent01, agent02), checks out a new branch from
  a source branch (defaults to origin/main), runs the workspace env-setup.sh,
  and then starts an `agent worker` bound to that worktree. Use when the user
  asks to create a new worker, spin up a new agent worktree, set up an agentNN
  worktree, or start an `agent worker start` for a fresh branch.
---

# Create Worker

Sets up a brand-new agentNN worktree on a new branch and starts an `agent worker` for it.

## Inputs

- **new branch name** (required): the branch to create.
- **source branch** (optional): the branch to base it on. Defaults to `origin/main`.

If the user did not specify a new branch name, ask before running.

## Step 1: Run the bash script

From the current worktree, run:

```bash
bash .cursor/skills/create-worker/scripts/create-worker.sh <new-branch> [source-branch]
```

The script will:

1. Pick the next available `agentNN` name by scanning `/root/psibase.worktrees/`.
2. Fetch the source branch if it's an `origin/*` ref.
3. `git worktree add -b <new-branch> /root/psibase.worktrees/agentNN <source-branch>`.
4. `cd` into the new worktree and run `./.vscode/scripts/env-setup.sh`.
5. Print a final block like:

   ```
   ===== create-worker: ready =====
   WORKTREE_NAME=agentNN
   WORKTREE_PATH=/root/psibase.worktrees/agentNN
   BRANCH=<new-branch>
   ```

Capture `WORKTREE_NAME` and `WORKTREE_PATH` from that block — you'll need them in step 2.

If the script fails, stop and report the error. Do not proceed to step 2.

## Step 2: Start the worker as a backgrounded shell

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

## Step 3: Confirm and report

After backgrounding the worker, briefly poll the shell once to confirm it
started without crashing, then tell the user:

- The worktree name and path.
- The new branch and what it was based on.
- The terminal id / output file path for the running `agent worker start`,
  and its PID, so they can stop it when done (e.g. `kill <pid>`).
