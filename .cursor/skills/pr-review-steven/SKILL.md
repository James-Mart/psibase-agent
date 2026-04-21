---
name: pr-review-steven
description: Runs a PR review of the current branch through swatanabe's correctness, performance, and architectural-layering lens by invoking the `reviewer-steven` subagent. Use when the user asks for a Steven-style review, a swatanabe-style review, a backend/services/protocol review, or a `pr-review-steven` pass.
---

# PR Review (Steven's lens)

Delegate the review to the `reviewer-steven` subagent. The subagent runs the standard `pr-review` skill filtered through Steven's principles and writes `review.md` in the workspace root.

## Steps

1. Launch the `reviewer-steven` subagent via the Task tool:
   - `subagent_type`: `reviewer-steven`
   - `description`: short title (e.g. "Steven PR review")
   - `prompt`: a self-contained instruction telling the subagent to review the current branch against `main` and write `review.md`. Include any extra context the user provided (specific files, scope hints, focus areas).

2. When the subagent finishes, briefly summarize the result and point the user at `review.md`.

## Notes

- Do not edit code. The subagent only writes `review.md`.
- If the user already has a `review.md`, mention that it will be overwritten.
- If the branch is exclusively UI/frontend, the subagent will say so and recommend `pr-review-brandon` or the standard `pr-review` skill instead — relay that recommendation.
