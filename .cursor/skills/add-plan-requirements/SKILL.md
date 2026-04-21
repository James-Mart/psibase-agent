---
name: add-plan-requirements
description: Append the user's standard implementation requirements to a plan so the implementing agent follows them. Use when building, drafting, or finalizing a plan in Plan mode, or when the user asks to add their standard plan requirements.
---

# Add Plan Requirements

When producing a plan, append the following section verbatim to the plan, after the implementation steps and before any "Test plan" or trailing sections. Do not paraphrase — these are explicit requirements for the agent that will implement the plan.

## Section to add

```markdown
## Implementation requirements

The agent implementing this plan must follow these requirements:

- **Code comments**: Do not add comments that explain what the code does. The only exception is doc comments on public interface functions/objects, and even those must be extremely concise. Inline comments within function bodies are almost never needed; when they are, they should explain *why* a particular design was chosen (especially when the reasoning is non-obvious), not *what* the code does.
- **Commits**: When committing changes, consult the `create-commits` skill to follow the preferred commit creation style (voice, grouping, audit format).
- **Pushing**: Committing locally is fine without confirmation. Do not push any changes without explicitly confirming with the user first.
```
