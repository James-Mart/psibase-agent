#!/usr/bin/env bash
# Lists agent worktrees under /root/psibase.worktrees with current branch and
# whether agent worker start appears to be running (same heuristics as the
# manage-agents API server).
set -euo pipefail

WORKTREES_DIR="/root/psibase.worktrees"

if [ ! -d "$WORKTREES_DIR" ]; then
    echo "No worktrees directory: $WORKTREES_DIR" >&2
    exit 0
fi

declare -A DIR_TO_PID
while IFS= read -r line; do
    [[ "$line" == *agent* ]] || continue
    [[ "$line" == *worker* ]] || continue
    if [[ "$line" =~ ^[[:space:]]*([0-9]+)[[:space:]].*agent.*worker[[:space:]]+start.*--worker-dir[[:space:]]+([^[:space:]]+) ]]; then
        DIR_TO_PID["${BASH_REMATCH[2]}"]="${BASH_REMATCH[1]}"
        continue
    fi
    if [[ "$line" =~ ^[[:space:]]*([0-9]+)[[:space:]].*agent.*worker[[:space:]]+start.*--name[[:space:]]+([^[:space:]]+) ]]; then
        name="${BASH_REMATCH[2]}"
        DIR_TO_PID["$WORKTREES_DIR/$name"]="${BASH_REMATCH[1]}"
    fi
done < <(ps -eo pid,args 2>/dev/null || true)

printf "%-32s %-40s %s\n" "NAME" "BRANCH" "AGENT"
printf "%-32s %-40s %s\n" "----" "------" "-----"

shopt -s nullglob
dirs=("$WORKTREES_DIR"/*)
IFS=$'\n' sorted=($(printf '%s\n' "${dirs[@]}" | sort))
for full in "${sorted[@]}"; do
    [ -d "$full" ] || continue
    entry=$(basename "$full")
    branch="(unknown)"
    if branch_out=$(git -C "$full" rev-parse --abbrev-ref HEAD 2>/dev/null); then
        branch="$branch_out"
    fi
    pid="${DIR_TO_PID[$full]:-}"
    if [ -n "$pid" ]; then
        agent="running pid=$pid"
    else
        agent="stopped"
    fi
    printf "%-32s %-40s %s\n" "$entry" "$branch" "$agent"
done
