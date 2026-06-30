#!/usr/bin/env bash
#
# create-hotfix-pr.sh — deterministic mechanics for the `hotfix` skill.
#
# Creates a temporary git worktree branched off origin/main, applies a
# pre-resolved patch, commits, pushes, opens a draft PR, cleans up the worktree
# and local branch, and (in move mode) reverse-applies the patch to the source
# branch working tree (left unstaged).
#
# This script never infers scope or invents PR text. The agent must produce the
# exact patch and all message files. The script never force-pushes, never runs
# `git reset --hard` or `git clean`, and never stages outside the resolved paths.

set -euo pipefail

# ---------------------------------------------------------------------------
# Tracked state (for traps + failure reporting)
# ---------------------------------------------------------------------------
WORKTREE_CREATED=0
LOCAL_BRANCH_CREATED=0
REMOTE_BRANCH_CREATED=0
PR_CREATED=0
SOURCE_REVERSED=0

REPO_ROOT=""
BRANCH_NAME=""
SOURCE_BRANCH=""
DISPOSITION=""
COMMIT_MESSAGE_FILE=""
PR_TITLE_FILE=""
PR_BODY_FILE=""
PATCH_FILE=""
PATHS=()

WORKTREE_DIR=""
PR_URL=""

log()  { printf '%s\n' "$*" >&2; }
die()  { log "ERROR: $*"; exit 1; }
step_fail() { log ""; log "==> hotfix failed at step: $1"; }

usage() {
  cat >&2 <<'EOF'
Usage: create-hotfix-pr.sh \
  --repo-root <path> \
  --branch <branch-name> \
  --source-branch <branch-name> \
  --disposition copy|move \
  --commit-message-file <path> \
  --pr-title-file <path> \
  --pr-body-file <path> \
  --patch-file <path> \
  --path <resolved-path> [--path <resolved-path> ...]
EOF
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)            REPO_ROOT="${2:-}"; shift 2 ;;
    --branch)               BRANCH_NAME="${2:-}"; shift 2 ;;
    --source-branch)        SOURCE_BRANCH="${2:-}"; shift 2 ;;
    --disposition)          DISPOSITION="${2:-}"; shift 2 ;;
    --commit-message-file)  COMMIT_MESSAGE_FILE="${2:-}"; shift 2 ;;
    --pr-title-file)        PR_TITLE_FILE="${2:-}"; shift 2 ;;
    --pr-body-file)         PR_BODY_FILE="${2:-}"; shift 2 ;;
    --patch-file)           PATCH_FILE="${2:-}"; shift 2 ;;
    --path)                 PATHS+=("${2:-}"); shift 2 ;;
    -h|--help)              usage; exit 0 ;;
    *) usage; die "unknown argument: $1" ;;
  esac
done

# ---------------------------------------------------------------------------
# Cleanup helpers (only ever touch resources THIS invocation created)
# ---------------------------------------------------------------------------
remove_worktree() {
  [[ "$WORKTREE_CREATED" == 1 && -n "$WORKTREE_DIR" ]] || return 0
  if git -C "$REPO_ROOT" worktree remove "$WORKTREE_DIR" 2>/dev/null; then
    WORKTREE_CREATED=0
    return 0
  fi
  log "normal worktree removal failed; force-removing script-created worktree: $WORKTREE_DIR"
  if git -C "$REPO_ROOT" worktree remove --force "$WORKTREE_DIR" 2>/dev/null; then
    WORKTREE_CREATED=0
    return 0
  fi
  log "WARNING: could not remove worktree; leftover path: $WORKTREE_DIR"
  return 1
}

delete_local_branch() {
  [[ "$LOCAL_BRANCH_CREATED" == 1 ]] || return 0
  if git -C "$REPO_ROOT" branch -D "$BRANCH_NAME" 2>/dev/null; then
    LOCAL_BRANCH_CREATED=0
    return 0
  fi
  log "WARNING: could not delete local branch: $BRANCH_NAME"
  return 1
}

delete_remote_branch() {
  [[ "$REMOTE_BRANCH_CREATED" == 1 ]] || return 0
  if git -C "$REPO_ROOT" push origin --delete "$BRANCH_NAME" 2>/dev/null; then
    REMOTE_BRANCH_CREATED=0
    return 0
  fi
  log "WARNING: could not delete remote branch: origin/$BRANCH_NAME"
  return 1
}

# Cleanup used when the run fails BEFORE a PR exists.
cleanup_failed_prefork() {
  remove_worktree || true
  delete_local_branch || true
  delete_remote_branch || true
}

on_signal() {
  trap - INT TERM EXIT
  step_fail "interrupted"
  if [[ "$PR_CREATED" == 1 ]]; then
    log "draft PR already exists; leaving it valid."
    log "PR URL: ${PR_URL:-<unknown>}"
    remove_worktree || true
    delete_local_branch || true
    [[ "$SOURCE_REVERSED" == 1 ]] && log "source branch reversal was already applied (unstaged)."
  else
    log "no draft PR created; cleaning up script-created resources."
    cleanup_failed_prefork
  fi
  exit 130
}
trap on_signal INT TERM

# ---------------------------------------------------------------------------
# Step: validation (no writes)
# ---------------------------------------------------------------------------
validate() {
  [[ -n "$REPO_ROOT" ]]           || { usage; die "--repo-root required"; }
  [[ -d "$REPO_ROOT/.git" || -f "$REPO_ROOT/.git" ]] || die "not a git repo: $REPO_ROOT"
  [[ -n "$BRANCH_NAME" ]]         || { usage; die "--branch required"; }
  [[ -n "$SOURCE_BRANCH" ]]       || { usage; die "--source-branch required"; }
  [[ -n "$PATCH_FILE" ]]          || { usage; die "--patch-file required"; }
  [[ -f "$PATCH_FILE" ]]          || die "patch file not found: $PATCH_FILE"
  [[ -s "$PATCH_FILE" ]]          || die "patch file is empty: $PATCH_FILE"
  [[ -n "$COMMIT_MESSAGE_FILE" && -f "$COMMIT_MESSAGE_FILE" ]] || die "commit message file not found"
  [[ -s "$COMMIT_MESSAGE_FILE" ]] || die "commit message file is empty"
  [[ -n "$PR_TITLE_FILE" && -f "$PR_TITLE_FILE" ]] || die "PR title file not found"
  [[ -s "$PR_TITLE_FILE" ]]       || die "PR title file is empty"
  [[ -n "$PR_BODY_FILE" && -f "$PR_BODY_FILE" ]] || die "PR body file not found"
  [[ ${#PATHS[@]} -ge 1 ]]        || die "at least one --path required"

  case "$DISPOSITION" in
    copy|move) ;;
    *) die "--disposition must be 'copy' or 'move' (got: '${DISPOSITION:-}')" ;;
  esac

  git -C "$REPO_ROOT" check-ref-format --branch "$BRANCH_NAME" >/dev/null 2>&1 \
    || die "invalid branch name: $BRANCH_NAME"

  command -v gh >/dev/null 2>&1 || die "gh CLI not found"
  gh auth status >/dev/null 2>&1 || die "gh is not authenticated (run: gh auth status)"

  git -C "$REPO_ROOT" fetch origin main:refs/remotes/origin/main \
    || die "could not fetch origin/main"

  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    die "local branch already exists: $BRANCH_NAME"
  fi
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME"; then
    die "remote branch already exists: origin/$BRANCH_NAME"
  fi

  local slug
  slug="$(printf '%s' "$BRANCH_NAME" | sed 's#[^A-Za-z0-9._-]#-#g')"
  WORKTREE_DIR="$REPO_ROOT/.cursor/worktrees/hotfix-$slug"
  [[ ! -e "$WORKTREE_DIR" ]] || die "worktree path already exists: $WORKTREE_DIR"
}

# ---------------------------------------------------------------------------
# Step: create worktree + branch from origin/main
# ---------------------------------------------------------------------------
create_worktree() {
  mkdir -p "$(dirname "$WORKTREE_DIR")"
  if ! git -C "$REPO_ROOT" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" origin/main; then
    step_fail "create worktree"
    log "worktree dir: $WORKTREE_DIR"
    log "branch:       $BRANCH_NAME"
    cleanup_failed_prefork
    exit 11
  fi
  WORKTREE_CREATED=1
  LOCAL_BRANCH_CREATED=1
}

# ---------------------------------------------------------------------------
# Step: apply + stage resolved paths
# ---------------------------------------------------------------------------
apply_patch() {
  if ! git -C "$WORKTREE_DIR" apply --check "$PATCH_FILE" 2>/tmp/hotfix-apply-check.$$; then
    step_fail "apply patch (conflict with origin/main)"
    log "patch file: $PATCH_FILE"
    log "paths:      ${PATHS[*]}"
    cat /tmp/hotfix-apply-check.$$ >&2 || true
    rm -f /tmp/hotfix-apply-check.$$
    cleanup_failed_prefork
    exit 12
  fi
  rm -f /tmp/hotfix-apply-check.$$
  git -C "$WORKTREE_DIR" apply "$PATCH_FILE"
  git -C "$WORKTREE_DIR" add -- "${PATHS[@]}"
}

# ---------------------------------------------------------------------------
# Step: commit
# ---------------------------------------------------------------------------
do_commit() {
  if ! git -C "$WORKTREE_DIR" commit -F "$COMMIT_MESSAGE_FILE"; then
    step_fail "commit"
    git -C "$WORKTREE_DIR" status --short >&2 || true
    cleanup_failed_prefork
    exit 13
  fi
}

# ---------------------------------------------------------------------------
# Step: push
# ---------------------------------------------------------------------------
do_push() {
  if ! git -C "$WORKTREE_DIR" push -u origin "$BRANCH_NAME"; then
    step_fail "push"
    log "branch: $BRANCH_NAME"
    # A remote ref may have been created despite a reported failure.
    if git -C "$REPO_ROOT" ls-remote --exit-code --heads origin "$BRANCH_NAME" >/dev/null 2>&1; then
      REMOTE_BRANCH_CREATED=1
    fi
    cleanup_failed_prefork
    exit 14
  fi
  REMOTE_BRANCH_CREATED=1
}

# ---------------------------------------------------------------------------
# Step: open draft PR
# ---------------------------------------------------------------------------
do_pr() {
  local title out
  title="$(cat "$PR_TITLE_FILE")"
  if out="$(gh pr create --draft --base main --head "$BRANCH_NAME" \
              --title "$title" --body-file "$PR_BODY_FILE" 2>&1)"; then
    PR_CREATED=1
    PR_URL="$(printf '%s\n' "$out" | grep -Eo 'https://[^ ]+' | head -n1 || true)"
  else
    step_fail "gh pr create"
    log "$out"
    # PR may exist anyway; check before tearing down.
    if PR_URL="$(gh pr view "$BRANCH_NAME" --json url --jq .url 2>/dev/null)" \
         && [[ -n "$PR_URL" ]]; then
      PR_CREATED=1
      log "a PR already exists for $BRANCH_NAME; treating as created."
    else
      cleanup_failed_prefork
      exit 15
    fi
  fi

  if [[ -z "$PR_URL" ]]; then
    PR_URL="$(gh pr view "$BRANCH_NAME" --json url --jq .url 2>/dev/null || true)"
    [[ -n "$PR_URL" ]] || log "WARNING: PR created but URL not captured (branch: $BRANCH_NAME)"
  fi
}

# ---------------------------------------------------------------------------
# Step: post-PR cleanup of worktree + local branch
# ---------------------------------------------------------------------------
post_pr_cleanup() {
  remove_worktree || log "(worktree cleanup left residue; PR is still valid)"
  delete_local_branch || log "(local branch cleanup failed; PR is still valid)"
}

# ---------------------------------------------------------------------------
# Step: move-mode reverse apply on source branch
# ---------------------------------------------------------------------------
move_reverse() {
  [[ "$DISPOSITION" == move ]] || return 0

  local current
  current="$(git -C "$REPO_ROOT" branch --show-current)"
  if [[ "$current" != "$SOURCE_BRANCH" ]]; then
    step_fail "move reverse (branch mismatch)"
    log "main workspace is on '$current', expected '$SOURCE_BRANCH'."
    log "skipping reverse apply; PR is valid; source branch left unchanged."
    return 0
  fi

  if ! git -C "$REPO_ROOT" apply --check -R "$PATCH_FILE" 2>/tmp/hotfix-rev-check.$$; then
    step_fail "move reverse (cannot apply -R)"
    cat /tmp/hotfix-rev-check.$$ >&2 || true
    rm -f /tmp/hotfix-rev-check.$$
    log "PR is valid; source branch still contains the hotfix change."
    return 0
  fi
  rm -f /tmp/hotfix-rev-check.$$

  git -C "$REPO_ROOT" apply -R "$PATCH_FILE"
  SOURCE_REVERSED=1
  log ""
  log "==> move mode: reversed hotfix patch on '$SOURCE_BRANCH' (unstaged)."
  if ! git -C "$REPO_ROOT" status --short -- "${PATHS[@]}" >&2; then
    log "(reversal applied, but status reporting failed)"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
validate
create_worktree
apply_patch
do_commit
do_push
do_pr
post_pr_cleanup
move_reverse

trap - INT TERM EXIT

log ""
log "==> hotfix complete"
log "draft PR: ${PR_URL:-<created; URL not captured; run: gh pr view $BRANCH_NAME --json url --jq .url>}"
[[ "$DISPOSITION" == move && "$SOURCE_REVERSED" == 1 ]] \
  && log "source branch '$SOURCE_BRANCH': hotfix change reversed (unstaged) — review with git diff"

printf '%s\n' "${PR_URL:-}"
