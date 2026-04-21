---
name: pr-review-brandon
description: Runs a PR review of the current branch through brandonfancher's UI/frontend cleanup lens by invoking the `reviewer-brandon` subagent. Use when the user asks for a Brandon-style review, a brandonfancher-style review, a frontend/UI review, or a `pr-review-brandon` pass.
---

# PR Review (Brandon's lens)

Delegate the review to the `reviewer-brandon` subagent. The subagent runs the standard `pr-review` skill filtered through Brandon's principles and writes `review.md` in the workspace root.

## Steps

1. Launch the `reviewer-brandon` subagent via the Task tool:
   - `subagent_type`: `reviewer-brandon`
   - `description`: short title (e.g. "Brandon PR review")
   - `prompt`: a self-contained instruction telling the subagent to review the current branch against `main` and write `review.md`. Include any extra context the user provided (specific files, scope hints, focus areas).

2. When the subagent finishes, briefly summarize the result and point the user at `review.md`.

## Notes

- Do not edit code. The subagent only writes `review.md`.
- If the user already has a `review.md`, mention that it will be overwritten.
- If the branch has no UI/frontend changes, the subagent will say so and recommend the standard `pr-review` skill instead — relay that recommendation.
