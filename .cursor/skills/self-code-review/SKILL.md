---
name: self-code-review
description: Stages a large working directory as a sequence of logical, reviewable commits while the user reviews each staged batch. Use when the user asks to self-review.
---

# Self Code Review

Use this skill when the working directory has many unstaged changes and the user wants to review them as logical commits before committing.
Use this skill only when manually prompted.

**Never push.** Commit locally only after explicit approval for each staged batch.

## Core Workflow

1. **Survey the tree**
   - Run `git status --short --untracked-files=all`, `git diff --stat`, `git diff`, and `git diff --cached`.
   - Read untracked files and key hunks so each change is understood.
   - If the tree is clean, stop.
   - If unrelated existing staged changes are present, call them out before changing the index.

2. **Plan the commit sequence**
   - Group changes by logical concern, not by file size.
   - Commits do **not** need to compile independently.
   - Prefer an order that is easy to review: types/schema/contracts, core implementation, callers/UI, tests/docs, cleanup.
   - Keep generated files with their sources and lockfiles with the dependency or package change that produced them.
   - If different hunks in one file belong to different commits, use a cached patch (`git apply --cached`) instead of interactive staging.

3. **Stage only the next proposed commit**
   - Reset or adjust the index only as needed to ensure the staged diff contains exactly the next batch.
   - Stage whole files when all hunks belong to the batch.
   - Stage partial files with an explicit cached patch when only some hunks belong.
   - Verify with `git diff --cached --stat` and, when useful, `git diff --cached`.

4. **Ask for review and approval**
   - Tell the user what is staged and give the proposed commit message in the same response.
   - Explicitly remind the user that you are waiting for approval and that, after approval, you will commit locally, not push, then stage the next proposed commit.
   - Do not commit until the user approves the staged changes.

5. **Commit after approval**
   - If the user changes the message, use their message.
   - Commit with a heredoc:
     ```bash
     git commit -m "$(cat <<'EOF'
     <subject>
     EOF
     )"
     ```
   - Do not push.
   - If the commit fails or a hook changes files, stop and ask before proceeding.

6. **Repeat**
   - After each successful commit, stage the next proposed commit, provide the staged file list and message, and wait again.
   - Continue until all intended changes are committed.
   - Finish with `git status --short --untracked-files=all` and a concise list of commits created.

## Commit Message Voice

- Follow the Voice section from the `/create-commits` skill.

## Response Template

When a batch is staged, respond:

````markdown
Staged the next candidate: <short description>.

Staged files:
- `path/one`
- `path/two`

Proposed commit message:

```text
<subject>
```

Please review the staged diff. If it looks good, approve it and I will commit locally, not push, then stage the next proposed commit.
````

## Final Summary Template

```markdown
Committed all approved batches. Working tree is <clean/status>.

Nothing was pushed.

Commits created:
- `<sha>` <subject>
- `<sha>` <subject>
```
