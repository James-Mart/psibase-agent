---
name: issue-tracker-retro
description: >-
  Mine an issue-tracker-work implement run for remaining tracker /
  work-loop meta confusion and apply a residual Epic under Project
  issue-tracker (or comment clean on the source Epic). Used by
  issue-tracker-work Completion. Contract lives in
  agents/issue-tracker-retro.md — do not duplicate it here.
---

# Issue Tracker — Post-Implement Confusion Retro

Spawned once by `issue-tracker-work` Completion when **every Branch in the
source Epic is `merged`**. Pass source Epic id (+ title) and comment role; the
transcript directory is `$AGENT_TRANSCRIPTS/$CURSOR_CONVERSATION_ID`. Do not
expect a confusion summary return value.

Static behavior (CLI allowlist, invariants, preconditions, clean-run comment,
epic-form `apply` with `project: issue-tracker`, escalation) lives only in
[`agents/issue-tracker-retro.md`](../../agents/issue-tracker-retro.md). Do not
paste or restate that contract here.
