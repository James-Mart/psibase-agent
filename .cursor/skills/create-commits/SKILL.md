---
name: create-commits
description: Splits the current working directory's uncommitted changes into a series of semantic commits, each grouping related edits so reviewers can follow the change. Uses the user's commit message voice. Does not push. Use when the user asks to break up changes, create semantic commits, slice a working tree into reviewable commits, or organize uncommitted work into a clean history.
---

# Create Commits

Split the working tree's uncommitted changes into small, semantically coherent commits. Each commit should be reviewable on its own and, where practical, leave the tree compileable.

**Never push.** Stage and commit locally only.

## Voice

Write subjects in the user's voice (derived from their git history):

- Lowercase first letter (`fix query prefix handling`, not `Fix...`).
- Imperative mood: `fix`, `add`, `support`, `improve`, `prefer X over Y`, `extract`, `consolidate`, `remove`, `rename old -> new`.
- No conventional-commit prefixes (no `feat:`, `fix:`, `chore:`).
- Concise — single line, ~60 chars; no body unless rationale is non-obvious.
- Identifiers keep their casing, optionally quoted: `'getDetails'`, `"BandwidthPricing"`.

If running in a different repo, re-derive voice from `git log --author="$(git config user.name)" --no-merges --pretty=format:"%s" -100`.

## Workflow

1. **Survey** — `git status`, `git diff`, `git diff --cached`, `git status -s -uall`. Read untracked files and key hunks so you understand each change. Stop if the tree is clean.

2. **Plan** — group hunks into commits using these criteria, in priority order:
   1. One concern per commit.
   2. Each commit compiles when applied in order; if a refactor would break the build when split, keep it together.
   3. Mechanical changes (renames, formatting, generated/bindings files) get their own commits.
   4. Lockfiles ride with the dependency change that produced them.
   5. Generated bindings ride with their source.
   6. Order by dependency: types/schema → service → callers/UI → tests → docs.

   For files containing hunks belonging to different commits, prefer building a patch and applying it with `git apply --cached` over interactive `git add -p`.

3. **Confirm** — show the user the plan (numbered list of subjects + files) and wait for approval before committing anything.

4. **Commit** — for each planned commit: `git reset`, stage its files, verify with `git diff --cached --stat`, then commit with a heredoc:
   ```bash
   git commit -m "$(cat <<'EOF'
   <subject>
   EOF
   )"
   ```
   Capture each resulting SHA for the audit. Stop and ask if a hook fails or anything unexpected happens — do not retry blindly, do not amend, do not edit code to force a grouping to compile.

5. **Audit** — output this block to chat:

   ```markdown
   ## Commits created (N)

   Branch: `<branch>` — nothing was pushed.

   ### 1. `<sha>` <subject>
   Files:
   - path/one
   - path/two

   ### 2. `<sha>` <subject>
   > <body, if any>

   Files:
   - path/three

   ### Left uncommitted
   - path/x — <reason>
   ```

## Guidelines

- After all commits, `git status` must be clean except for files the user agreed to leave uncommitted.
- Skip `.env`, `credentials.json`, key files, etc., unless the user explicitly confirms.
- If the tree mixes clearly unrelated tasks, call that out in the plan rather than burying it.
- When in doubt about a split, ask.
