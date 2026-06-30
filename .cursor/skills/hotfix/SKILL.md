---
name: hotfix
description: >-
  Extract a highlighted or scoped change from the current branch into a new
  branch off main using a temporary git worktree, then commit, push, and open
  a draft PR. Optionally remove the change from the source branch (move) or leave
  it in place (copy). Uses AskQuestion to gather any missing scope, branch name,
  commit message, or copy/move disposition. Use when the user asks for a hotfix,
  wants to land a partial change on main, or provides a branch name + commit
  message + code selection.
---

# Hotfix

Take a highlighted/scoped change from the current branch and land it on `main`
as a draft PR: **new branch off `origin/main` → single commit → push → draft PR**.

Branch/worktree/commit/push all happen inside an isolated temporary git worktree
under `.cursor/worktrees/`. The main workspace working tree stays untouched
through Steps 0–7. Only in **move** mode, after the PR is open, the scoped change
is reverse-applied (uncommitted) to the source branch for the user to review.

`.cursor` here is an ignored symlink to `/root/agent-config/.cursor`, so the
skill and its worktrees never touch the repo's tracked files or `.gitignore`.

## 1. Inputs

| Input | Required | Source |
|-------|----------|--------|
| **Change scope** | Yes | Code attached via Ctrl+I (file path + line range, usually `startLine:endLine:filepath` citations) and/or explicit file paths in the message. |
| **Branch name** | Yes | User states it (e.g. `hotfix/tokens-overflow`), or picks from `AskQuestion` suggestions (see §2). |
| **Commit message** | Yes | User states it, or picks from `AskQuestion` suggestions (see §2). Becomes the commit subject. |
| **PR title/body** | Yes | You derive them from the commit message, source branch, and confirmed scope. Title usually matches the commit message. |
| **Source disposition** | Yes | **copy** (default) or **move**. User states it or picks via `AskQuestion` (see §2). |

**Source branch** = whatever branch is checked out in the main workspace when the
skill runs. Never switch branches in the main workspace.

### Copy vs move

| Mode | Effect on source branch after the PR is open |
|------|----------------------------------------------|
| **Copy** (default) | Source branch left unchanged. Change exists on both branches. |
| **Move** | Reverse-apply the hotfix patch to the source branch working tree, left **uncommitted** for the user to review and commit. |

## 2. Gather missing inputs

Parse the invocation message and any attached citations. **Do not** resolve
scope, run branch-name preconditions, or show the confirmation plan until every
required input from §1 is present.

Use the `AskQuestion` tool for each missing input. If `AskQuestion` is not
available, ask conversationally instead. Ask **one question at a time**; wait
for the answer before the next. Users can pick **Other** for freeform text
(branch names, commit messages, file paths).

### Order

1. **Change scope** (if missing) — must be resolved before scope resolution (§3).
2. **Resolve scope** (§3) — read-only; produces the patch candidate.
3. **Branch name** (if missing) — suggest 2–3 `hotfix/…` names derived from
   affected paths or the change topic; include **Other** for a custom name.
4. **Commit message** (if missing) — suggest 2 concise subjects from the
   resolved hunks; include **Other** for a custom message.
5. **Source disposition** (if missing) — single-select:
   - "Copy — keep change on current branch" (recommended default)
   - "Move — remove change from current branch"

**Source disposition** does not depend on scope; ask it whenever it is still
missing, including in parallel with steps 3–4 if those steps do not apply.

### Change scope (when missing)

Use `AskQuestion` with options such as:

- "I'll attach a code selection (Ctrl+I) in my next message"
- "Whole file(s)" — then ask which path(s) via **Other** or a follow-up if
  multiple files are plausible
- "All uncommitted changes on the current branch"

If the user chooses to attach a selection, **stop and wait** for their next
message before continuing. Do not infer scope from unrelated context.

### Branch name (when missing)

After §3 resolves scope, derive short branch candidates from the primary changed
file or topic (e.g. `hotfix/tokens-overflow`, `hotfix/config-plugin-trust`).
Offer the best 2–3 as `AskQuestion` options plus **Other**.

Validate the chosen name satisfies `git check-ref-format --branch` before §5.

### Commit message (when missing)

After §3 resolves scope, draft 2 commit subjects that describe the scoped change
(not the whole branch). Offer them via `AskQuestion` plus **Other**.

### Do not proceed without

- At least one citation or explicit file path (or user-confirmed "all
  uncommitted changes")
- A branch name
- A commit message
- A disposition (`copy` or `move`)

## 3. Resolve scope (read-only)

Cursor sends file citations with line ranges plus the selected text, not a diff.
To turn that into an exact patch:

1. Collect every attached citation → `{ path, startLine, endLine }`.
2. Merge overlapping/adjacent ranges per file.
3. Fetch and diff the source working tree against `origin/main` (zero context for
   line mapping; this includes uncommitted tracked edits):
   ```bash
   git fetch origin main:refs/remotes/origin/main
   git diff --no-ext-diff --no-color -U0 origin/main -- <path>
   ```
4. Keep only hunks whose **new-side** line numbers overlap the cited ranges. A
   whole-file selection naturally keeps every hunk in that file.
5. For a clean apply, expand the kept hunks with normal context (and the minimal
   enclosing hunks `git apply --check` needs).
6. New/untracked files: if the path does not exist on `origin/main`, build an
   add-file patch from the working-tree content and confirm that is intended.
7. **Stop and ask** if scope is ambiguous: overlapping unrelated hunks, missing
   paths, citation text not matching the source working tree, or a patch that
   would carry unselected behavior. Use `AskQuestion` when the choice is discrete
   (e.g. which hunk to include); otherwise ask conversationally. Abort if the
   resolved scope is empty.

## 4. Preconditions (no working-tree writes)

From the main workspace repo root:

- `git status`, `git branch --show-current` → record `SOURCE_BRANCH` (dirty tree
  is fine; uncommitted work can be in scope).
- `git fetch origin main:refs/remotes/origin/main`.
- `gh auth status` — verify `gh` is available and authenticated.

Abort (no writes) if:

- `origin/main` cannot be fetched.
- `git check-ref-format --branch "$BRANCH_NAME"` fails.
- `BRANCH_NAME` already exists locally or on the remote
  (`git show-ref --verify refs/heads/$BRANCH_NAME` or
  `refs/remotes/origin/$BRANCH_NAME`). This guarantees any branch with this name
  later was created by this invocation.
- `.cursor/worktrees/hotfix-<branch_slug>` already exists.

The script re-validates all of this; these checks just let you fail early and
clearly.

## 5. Confirm (mandatory)

Show this summary and **wait for explicit approval** before any branch/worktree
creation, patch application, commit, push, PR, or main-workspace write:

```markdown
## Hotfix plan

- Source branch: `<SOURCE_BRANCH>`
- Source disposition: **copy** | **move**
- New branch: `<BRANCH_NAME>` (from `origin/main`)
- Commit: `<commit message>`
- Draft PR title: `<PR title>`
- Base: `main`

### Files / hunks
1. `path/to/file.rs` — lines 120–145 (1 hunk)
2. ...

### After approval
- worktree: `.cursor/worktrees/hotfix-<branch_slug>/`
- push: `origin/<BRANCH_NAME>`
- draft PR: `<BRANCH_NAME>` → `main`
- if move: reverse scoped patch on `<SOURCE_BRANCH>` (uncommitted)
```

## 6. Execute

After approval, write four files (use a private temp dir so branch names with
slashes are not path problems):

```bash
PATCH_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hotfix.XXXXXX")"
PATCH_FILE="$PATCH_DIR/change.patch"          # exact resolved hunks
COMMIT_MESSAGE_FILE="$PATCH_DIR/commit.txt"
PR_TITLE_FILE="$PATCH_DIR/pr-title.txt"
PR_BODY_FILE="$PATCH_DIR/pr-body.txt"
```

The PR body is generated from `SOURCE_BRANCH`, the confirmed files/hunks, and a
short test plan. Then invoke the script from the main workspace:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
"$REPO_ROOT/.cursor/skills/hotfix/scripts/create-hotfix-pr.sh" \
  --repo-root "$REPO_ROOT" \
  --branch "$BRANCH_NAME" \
  --source-branch "$SOURCE_BRANCH" \
  --disposition "$DISPOSITION" \
  --commit-message-file "$COMMIT_MESSAGE_FILE" \
  --pr-title-file "$PR_TITLE_FILE" \
  --pr-body-file "$PR_BODY_FILE" \
  --patch-file "$PATCH_FILE" \
  --path path/to/file.rs
```

Pass one `--path` per resolved file. The script must not infer scope or invent
PR text — you produce the exact patch and all message files. The script handles
the deterministic mechanics: create worktree+branch from `origin/main`, apply and
stage only the resolved paths, commit, push `-u`, open the draft PR, capture the
URL, remove the worktree and local branch, and (move mode) reverse-apply on the
source branch.

## 7. Move cleanup (move mode only)

The script does this only after the PR is created and the worktree is cleaned up,
and only if the main workspace is still on `SOURCE_BRANCH`:

```bash
git -C "$REPO_ROOT" apply --check -R "$PATCH_FILE"
git -C "$REPO_ROOT" apply -R "$PATCH_FILE"
```

The reversal is left **unstaged** for user review. In copy mode this is skipped.

## 8. Cleanup & report

- On success: report the draft PR URL. In move mode, also report `git status` /
  `git diff` for the affected paths so the user can review the removal.
- The script removes the worktree and local branch on success, force-removing
  only its own `WORKTREE_DIR`/`BRANCH_NAME` if normal removal fails.
- On failure, relay the script's failure-policy output: which step failed and
  whether a branch, worktree, commit, push, PR, or source reversal was created.
  If a push/PR step failed, the script removes the local/remote branch and
  worktree it created. If the PR was created but the URL was not captured, treat
  the PR as successful.

## 9. Safety rules (hard constraints)

- No branch/worktree creation, patch application, commit, push, PR, or
  main-workspace working-tree write until the user approves scope + disposition.
- Main workspace working tree stays unchanged in Steps 0–7. Only `git status`,
  `git diff`, and `git fetch` run against it. Move mode's reverse apply is the
  only main-workspace write, and it stays unstaged.
- No destructive git: no `reset --hard`, `clean -fdx`, or force-push unless the
  user explicitly asks. Branch deletion is allowed only for the exact
  local/remote `BRANCH_NAME` that preflight proved did not exist before this
  invocation.
- No `git add .` / `git add -A`. Stage only resolved-scope paths, and only inside
  the worktree.
- Never commit secrets (`.env`, credentials, keys).
- Compatible with [`manual-mode`](../manual-mode/SKILL.md): hotfix commits/pushes
  **only inside the worktree**; the move-mode source reversal stays unstaged.
