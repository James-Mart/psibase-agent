#!/usr/bin/env bash
set -euo pipefail

WORKTREES_DIR="/root/psibase.worktrees"

if [ ! -d "$WORKTREES_DIR" ]; then
  echo "No worktrees directory found at $WORKTREES_DIR"
  exit 0
fi

found=0
for dir in "$WORKTREES_DIR"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")
  branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(unknown)")
  printf "%-20s %s\n" "$name" "$branch"
  found=1
done

if [ "$found" -eq 0 ]; then
  echo "No worktrees found in $WORKTREES_DIR"
fi
