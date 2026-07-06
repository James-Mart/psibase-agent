---
name: address-pr-feedback
description: Triages the unresolved review comments on the current branch's PR one at a time (showing each comment verbatim with code context and a recommended resolution), builds a plan covering every comment, then implements the approved plan one item at a time with human-in-the-loop commit approval. Use when the user asks to address, triage, resolve, or work through PR review comments/feedback on the current branch.
disable-model-invocation: true
---

# Address PR Feedback

Two phases: (1) triage unresolved comments and build a plan, (2) implement the plan one item at a time with human approval before each commit. Do not push.

## Phase 1: Triage and plan (in Plan mode)

1. Enter Plan mode (`SwitchMode` -> `plan`) before doing anything else.
2. Identify the PR for the current branch:

```bash
gh pr view --json number,title,url,headRefName
```

3. Fetch the unresolved review threads via GraphQL (REST does not expose resolved state). Filter to `isResolved == false`:

```bash
gh api graphql -f query='
query {
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          path
          line
          comments(first: 20) { nodes { author { login } body diffHunk } }
        }
      }
    }
  }
}' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved==false)'
```

4. Go through the unresolved threads **one at a time**. For each, present:
   - The comment(s) **verbatim** (include the full thread when there is back-and-forth).
   - Relevant **code context** (read the cited file/lines; cite real line numbers).
   - Your **recommended resolution(s)**, investigating the code as needed to make the recommendation concrete and correct.
   Then use `AskQuestion` to let the user pick a strategy (offer your recommendation first, labeled "(Recommended)", plus alternatives and a "skip / handle separately" option). Keep investigating and re-asking when the user pushes back or wants more detail; do not move on until the user resolves that comment.
5. Build the plan **incrementally, in view of the user** -- do not save all plan updates for the end. As soon as the first comment's strategy is approved, call `CreatePlan` to create the plan with that one todo. After each subsequent comment is resolved, update the plan by editing the plan file directly (add the new todo and any deferred/skipped notes). This way the plan visibly grows as triage proceeds.
6. Once all comments are triaged, do a final pass over the plan file: confirm one todo per actionable comment, and that deferred/skipped comments are listed with why. Follow the repo's planning rules (no ambiguity: a single definitive approach per item).

## Phase 2: Implementation (one item at a time, human-in-the-loop)

Only after the user approves starting. Switch to Agent mode (`SwitchMode` -> `agent`).

For each plan item, in order:

1. Implement **only that one item**. Make the edits and fix any linter errors you introduced.
2. **Stop. Leave all changes unstaged.** Do not `git add`, do not commit yet.
3. Propose a **single-line** commit message (no body) in the user's voice:
   - Lowercase first letter; imperative mood (`fix`, `add`, `support`, `improve`, `remove`, `rename old -> new`).
   - No conventional-commit prefixes (no `feat:`, `fix:`, `chore:`).
   - Concise, ~60 chars.
   - Identifiers keep their casing, optionally quoted: `'getDetails'`, `"BandwidthPricing"`.
   - If unsure of the voice, re-derive it from `git log --author="$(git config user.name)" --no-merges --pretty=format:"%s" -100`.
4. Wait for the user to approve both the implementation and the commit message. If they request changes, revise and re-propose.
5. Once approved, commit (do NOT push):

```bash
git add <files for this item> && git commit -m "$(cat <<'EOF'
<approved message>
EOF
)"
```

6. Move on to the next item and repeat.

## Rules

- Never push. Never `git push` unless the user explicitly asks in a later, separate instruction.
- One item per commit; never batch multiple plan items into a single commit.
- Always pause for explicit approval of the changes + commit message before committing each item.
- Respect comments the user said they are handling separately; do not silently implement them.
- Never communicate on GitHub. Do not post, reply to, or resolve comments/reviews/threads, and never propose or offer to do so (e.g. drafting a reply to a reviewer). The user reserves all direct communication with collaborators for themselves. Resolving a comment means making the code change and committing it locally — nothing more.
