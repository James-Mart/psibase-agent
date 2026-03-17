---
name: pr-review
description: Diffs the current git branch against origin/main and writes a structured PR review to review.md in the workspace root. Use when the user wants a PR review, to review a branch vs main, or to generate review.md.
---

# PR Review

## Task

1. Diff the current branch against `origin/main`.
2. Write a structured PR review to `review.md` in the workspace root.

## Steps

1. **Get diff and context**
   - `git fetch origin main` (if needed)
   - `git diff origin/main...HEAD --stat` for file summary
   - `git branch --show-current` and `git log origin/main..HEAD --oneline -20` for branch name and commits
   - `git diff origin/main...HEAD` for full diff

2. **Analyze**
   - Summarize what the branch does (scope, intent).
   - List main areas of change (by component/file).
   - Note bugs, wrong types, or inconsistencies (e.g. wrong Content-Type, missing error handling).
   - Note ordering, persistence, tests, and docs where relevant.

3. **Write review**
   - Output path: `review.md` in the workspace root (e.g. `/root/psibase/review.md` for this repo).
   - Use this structure:

```markdown
# PR Review: <branch> → main

**Branch:** `<current-branch>`
**Base:** `origin/main`
**Scope:** <file count / line stats>

---

## Summary
[One short paragraph: what the PR does and why.]

---

## What's in scope
[Bulleted list of main changes by area: services, build, tests, docs, etc.]

---

## Bug(s)
[Any concrete bugs with file and fix. Omit section if none.]

---

## Notes
[Ordering, persistence, tests, docs, or other observations.]

---

## Recommendation
[Fix X; then merge / or ready to merge.]
```

## Guidelines

- Base comparison is `origin/main`. Use a three-dot diff: `origin/main...HEAD`.
- Be concise. Call out only real issues and important design choices.
- If the user didn’t ask for code changes, don’t edit code—only write the review.
