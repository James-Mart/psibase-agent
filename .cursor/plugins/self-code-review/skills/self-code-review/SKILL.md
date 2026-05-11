---
name: self-code-review
description: Stage a large working tree as a sequence of compileable, semantically-grouped commits using a temporary snapshot branch. The user reviews each candidate as unstaged changes in their editor, runs the build between commits, and approves before committing. Delegates context-heavy reasoning to specialist subagents. Use only when manually prompted.
---

# Self Code Review

Slice the working tree into a sequence of small, semantically-coherent commits. Each commit must compile. The user reviews each candidate as **unstaged** changes in the working tree, runs their own build/check, and approves before committing.

## Hard rules

- **Never push.** Commit locally only.
- **One `git commit` per approval.** Do not chain commits across a single response.
- **Every intermediate commit must compile.** The full snapshot is assumed to compile, so any build failure means the current candidate is missing related hunks from the snapshot — never that the plan needs revising.
- **The agent never runs the build.** Always ask the user to run their build/check and report.
- **Strict commit order: upstream → downstream.** native (`libraries/`, `programs/`) → service → query service → plugin → UI → tests/docs. Tests/docs ride with the layer they cover when needed for compilation; otherwise after that layer.
- **Semantic grouping wins over file or layer boundaries.** If ten new actions land but only three share a feature, that's three commits, not one. Bindings/generated stubs ride with the action they describe.

## Scripts

The plugin ships four bash scripts under `.cursor/plugins/self-code-review/scripts/` that handle every git operation in this workflow. The agent invokes them; it does not run raw git plumbing for snapshot lifecycle or patch application.

| Script | Purpose | Output (stdout on success / stderr on failure) |
| --- | --- | --- |
| `snapshot-init` | Create or resume the snapshot branch. | `NEW <snapshot>` / `RESUMED <snapshot>` / `CLEAN` |
| `apply-batch <patch>` | Apply a unified diff produced by a picker subagent. | `APPLIED\n<paths>` / `OUT_OF_SCOPE` / `REJECTED` / `MISSING_PATCH` / `MISSING <snapshot>` |
| `snapshot-refresh` | Fold latest HEAD into the snapshot after a commit. | `REFRESHED <snapshot>` / `CONFLICT` / `MISSING <snapshot>` |
| `snapshot-finalize` | Verify the snapshot has been fully consumed and delete it. | `DELETED <snapshot>` / `NONEMPTY <snapshot>` (followed by the diff) / `MISSING <snapshot>` |

Always invoke them as `bash .cursor/plugins/self-code-review/scripts/<script>` from the workspace root. Scripts derive the branch / snapshot names themselves; only `apply-batch` takes an argument.

## Workflow

### 1. Snapshot the working tree

Run `git status --short --untracked-files=all` to confirm there is work to review. If unrelated changes are already staged, call them out before touching the index.

Then:

```bash
bash .cursor/plugins/self-code-review/scripts/snapshot-init
```

- `NEW <snapshot>`: a fresh snapshot was created; the working tree is now clean and `<snapshot>` holds all the pending work as a single commit. Continue.
- `RESUMED <snapshot>`: the snapshot already existed from a prior interrupted run; the snapshot is the source of truth for remaining work, and any current working-tree changes are the in-progress batch from before. Continue from step 3 with whichever theme that batch was on.
- `CLEAN`: nothing to review. Stop.

### 2. Plan themes (delegate to `self-review-surveyor`)

Launch the `self-review-surveyor` subagent via the Task tool. Pass it:

- The output of `git diff HEAD "$snapshot"` (plus a list of untracked-in-snapshot files captured via `git diff HEAD "$snapshot" --diff-filter=A --name-only`).
- Its job is to return a numbered list of semantic themes — one short line per theme, no file enumeration.

The main agent only retains the returned theme list, not the raw diff.

Show the theme list to the user as context (no approval required at this stage; per-commit approval is the only gate).

### 3. For each theme, in upstream-to-downstream order

#### 3a. Pick hunks (delegate to `self-review-hunk-picker`)

Launch the `self-review-hunk-picker` subagent. Pass it the current theme description and the snapshot branch name.

It returns one of:

- A single fenced ```patch``` block — a unified diff against HEAD. Save its body to a temp file and apply:

  ```bash
  patch_file=$(mktemp --suffix=.patch)
  # write the patch body into "$patch_file"
  bash .cursor/plugins/self-code-review/scripts/apply-batch "$patch_file"
  ```

  Outcomes:
  - `APPLIED` → continue to step 3b.
  - `REJECTED` (offsets shifted) or `OUT_OF_SCOPE` (patch touches files outside pending work) → re-invoke the picker with the script's stderr appended to its prompt. Do not hand-edit the patch.

- `AMBIGUOUS: <reason>` → surface the reason to the user and ask how to proceed.

#### 3b. Ask the user to build

List the files now changed in the working tree:

```bash
git diff --name-only
```

Ask the user to run their build/check (whatever is appropriate for the layer being committed) and report the result. Do not run any build command yourself.

While the user is running the build they may also edit the working tree directly — fixing a typo, cleaning up an unrelated nit, etc. **This is fine and expected**; those edits get committed as part of the current batch and are folded back into the snapshot in step 3f, so future batches see them as already-applied.

#### 3c. On build failure, diagnose (delegate to `self-review-build-diagnoser`)

Launch the `self-review-build-diagnoser` subagent. Pass it the build error text and the snapshot branch name.

It returns one of:

- A single fenced ```patch``` block — apply it the same way as step 3a (save to temp file, run `apply-batch`, handle `REJECTED` / `OUT_OF_SCOPE` by re-invoking the diagnoser). Then return to step 3b.
- `EXTERNAL: <reason>` → the error points at code outside any pending hunks; surface the reason to the user.

#### 3d. Draft the commit message (delegate to `self-review-message-writer`)

Launch the `self-review-message-writer` subagent. Pass it:

- The current theme description.
- The staging diff: `git diff` (working tree vs HEAD; nothing is staged yet).
- 100 recent subjects for voice: `git log --author="$(git config user.name)" --no-merges --pretty=format:"%s" -100`.

It returns a single subject line.

#### 3e. Ask for commit approval

Use the response template below. The user reviews the **unstaged** working-tree diff (not a staged diff) in their editor. On approval, stage everything currently modified and commit:

```bash
git add -A
git commit -m "$(cat <<'EOF'
<subject>
EOF
)"
```

Run `git commit` exactly once per approval. If a commit hook fails, stop and ask — do not silently retry, do not amend.

If the user changes the message, use their message verbatim.

#### 3f. Refresh the snapshot

Fold any in-flight edits the user made during step 3b back into the snapshot, so future batches see HEAD as their starting point:

```bash
bash .cursor/plugins/self-code-review/scripts/snapshot-refresh
```

- `REFRESHED <snapshot>` → loop to the next theme (back to step 3a).
- `CONFLICT` → stop and ask the user. Do not force-resolve.

### 4. Final cleanup

After all themes are committed and the snapshot has been refreshed for the last commit:

```bash
bash .cursor/plugins/self-code-review/scripts/snapshot-finalize
```

- `DELETED <snapshot>` → output the final summary (template below).
- `NONEMPTY <snapshot>` → surface the printed diff and ask the user how to proceed; do not delete anything until they decide.

## Response templates

### Per-commit (waiting for build + approval)

```markdown
Candidate: <theme>

Files in working tree:
- `path/one`
- `path/two`

Please run your build/check for this layer and report:
- compiles? yes/no
- if no, paste the error
```

### After build passes

```markdown
Build passed. Proposed commit message:

```text
<subject>
```

Review the unstaged diff in your editor. Approve and I will commit locally (no push).
```

### Final summary

```markdown
Committed all approved batches. Working tree is <clean/status>.

Nothing was pushed.

Commits created:
- `<sha>` <subject>
- `<sha>` <subject>
```

## Commit message voice

The `self-review-message-writer` subagent enforces voice from the user's recent git log. If the user overrides the message at approval time, use their text verbatim.

## Subagent contract summary

| Subagent | Purpose | Returns |
| --- | --- | --- |
| `self-review-surveyor` | Read the full snapshot diff, propose semantic themes. | Numbered theme list, one line each, no files. |
| `self-review-hunk-picker` | Map a theme to a unified diff against HEAD. | One ```patch``` block, or `AMBIGUOUS: <reason>`. |
| `self-review-build-diagnoser` | Map a build error to a unified diff that adds the missing hunks. | One ```patch``` block, or `EXTERNAL: <reason>`. |
| `self-review-message-writer` | Draft a commit subject in the user's voice. | One subject line. |

The main agent's job is to drive the loop, talk to the user, invoke the four scripts (snapshot lifecycle + patch application), and execute `git commit`. Raw diffs and large outputs stay inside subagents.
