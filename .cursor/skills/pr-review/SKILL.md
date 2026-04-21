---
name: pr-review
description: Reviews the current git branch against `main` and writes a structured PR review to review.md in the workspace root. Surfaces bugs, cleanup, doc, memory, and naming improvements. Use when the user asks for a PR review, wants to clean up a branch before opening a PR, or asks to generate or update review.md.
---

# PR Review

Write a structured review of the current branch to `review.md` in the workspace root.

## Scope (strict)

All steps, findings, and template sections below apply **only** to code this branch adds or modifies relative to the merge base with `main`.

- Do not propose changes to pre-existing or surrounding code.
- If a concern can only be fixed by editing untouched code, omit it.
- The goal is to **shrink and clean up the changeset** before a PR — not to grow it.

## Steps

1. **Get diff and context**
   - Use the `/read-branch` command to fetch the merge-base diff between `main` and `HEAD`. It computes the merge base against `main` and runs the canonical diff.
   - Also capture: current branch (`git branch --show-current`), recent commits (`git log <merge-base>..HEAD --oneline -20`), and a file summary (`git diff --stat <merge-base> HEAD`).

2. **Analyze**
   For each modified region, look for:
   - **Bugs / correctness**: wrong types, wrong content types, missing error handling, broken ordering or persistence.
   - **Cleanup**: redundant code, copy/paste duplication, dead code or unused structures, leftover scaffolding.
   - **Doc comments**: inaccurate, stale, or verbose; suggest more correct and more succinct wording.
   - **Memory**: unnecessary `clone()`, `to_owned()`, `to_string()`, redundant copies, allocations that could be borrows or references.
   - **Naming**: prefer **short, semantic** names so code is maximally self-documenting. Flag long, vague, or abbreviated-without-reason names.
   - **Tests and docs**: missing tests for new behavior, or new docs that drift from the new code.

3. **Write review**
   - Output path: `review.md` in the workspace root.
   - Use the template below.
   - Be concise. Each finding must cite a file (and line if helpful) and a concrete suggested fix.
   - Omit any section that has nothing to report.

## Template

```markdown
# PR Review: <branch> → main

**Branch:** `<current-branch>`
**Base:** `main` (merge base: `<sha>`)
**Scope:** <file count / line stats>

---

## Summary
[One short paragraph: what this branch does and why.]

---

## What's in scope
[Bulleted list of main changes by area: services, build, tests, docs, etc.]

---

## Bugs
[Concrete bugs with file:line and fix.]

---

## Cleanup
[Redundant code, copy/paste, dead code, leftover scaffolding.]

---

## Doc comments
[Doc comments that should be more correct or more succinct.]

---

## Memory
[Unnecessary clones/copies/allocations.]

---

## Naming
[Names that could be shorter or more semantic.]

---

## Notes
[Other observations: ordering, persistence, tests, docs.]

---

## Recommendation
[e.g. "Fix Bugs and Cleanup items; then ready to merge." or "Ready to merge."]
```

## Guidelines

- Do not edit code unless the user explicitly asks. This skill only writes `review.md`.
- Prefer fewer, higher-signal findings over exhaustive nitpicks.
