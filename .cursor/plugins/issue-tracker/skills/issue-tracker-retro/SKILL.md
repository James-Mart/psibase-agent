---
name: issue-tracker-retro
description: >-
  Mine an invoking run's transcripts (issue-tracker-work Completion or
  issue-tracker-plan post-polish) for remaining tracker / work-loop meta
  confusion and apply a residual Epic under Project issue-tracker (or
  comment clean on the source work root — Epic or project-level Story).
  Contract lives in agents/issue-tracker-retro.md — do not duplicate it here.
---

# Issue Tracker — Confusion Retro

Spawned by `issue-tracker-work` Completion or `issue-tracker-plan` post-polish
when work-root `retro` is unset. Callers own spawn timing. Pass source
work-root id (+ title) — Epic or project-level Story — and comment role; do
not require promoting a Story to an Epic. Transcript resolution is in
`agents/issue-tracker-retro.md` **## Transcript resolution**. Do not expect a
confusion summary return value.

Cross-cutting CLI invariants: [SPEC.md § CLI invariants](../../SPEC.md#cli-invariants).

Static behavior (CLI allowlist, invariants, transcript resolution, clean-run
comment, epic-form `apply` with `project: issue-tracker`, kind-scoped source
`comment` / `set … retro` / `needsAttention`, escalation) lives only in
[`agents/issue-tracker-retro.md`](../../agents/issue-tracker-retro.md). Do not
paste or restate that contract here.
