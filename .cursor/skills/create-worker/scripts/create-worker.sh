#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "Usage: $0 <new-branch> [source-branch]" >&2
    echo "  source-branch defaults to origin/main" >&2
    exit 1
fi

NEW_BRANCH="$1"
SOURCE_BRANCH="${2:-origin/main}"
WORKTREES_DIR="/root/psibase.worktrees"

if [ ! -d "$WORKTREES_DIR" ]; then
    echo "Worktrees parent directory not found: $WORKTREES_DIR" >&2
    exit 1
fi

# Pick the next available agentNN slot by scanning sibling worktrees.
# Only directories matching exactly /^agent[0-9][0-9]$/ count toward the slot;
# unrelated worktree names (like "agent" or feature-named ones) are ignored.
next_n=1
while :; do
    candidate=$(printf 'agent%02d' "$next_n")
    if [ ! -e "$WORKTREES_DIR/$candidate" ]; then
        WORKTREE_NAME="$candidate"
        break
    fi
    next_n=$((next_n + 1))
    if [ "$next_n" -gt 99 ]; then
        echo "No agentNN slots available (01-99 all taken)" >&2
        exit 1
    fi
done

WORKTREE_PATH="$WORKTREES_DIR/$WORKTREE_NAME"

echo "Creating worktree:"
echo "  path:          $WORKTREE_PATH"
echo "  new branch:    $NEW_BRANCH"
echo "  source branch: $SOURCE_BRANCH"
echo

# If the source is an origin/* ref, refresh it so the new branch starts from
# the latest commit on the remote.
if [[ "$SOURCE_BRANCH" == origin/* ]]; then
    remote_branch="${SOURCE_BRANCH#origin/}"
    echo "Fetching origin/$remote_branch ..."
    git fetch origin "$remote_branch"
fi

git worktree add --no-track -b "$NEW_BRANCH" "$WORKTREE_PATH" "$SOURCE_BRANCH"

echo
echo "Running env-setup.sh in $WORKTREE_PATH ..."
cd "$WORKTREE_PATH"
./.vscode/scripts/env-setup.sh

echo
echo "===== create-worker: ready ====="
echo "WORKTREE_NAME=$WORKTREE_NAME"
echo "WORKTREE_PATH=$WORKTREE_PATH"
echo "BRANCH=$NEW_BRANCH"
echo
echo "Next: start the worker (run as a background shell so you can see/cancel it):"
echo "  cd \"$WORKTREE_PATH\" && agent worker start --name \"$WORKTREE_NAME\""
