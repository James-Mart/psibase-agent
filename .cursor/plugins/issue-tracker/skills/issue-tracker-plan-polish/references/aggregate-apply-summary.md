# Aggregate → apply → summary

After all five return:

1. Parse each result as a JSON findings array per
   [`agents/_issue-tracker-plan-polish-check-base.md`](../../../agents/_issue-tracker-plan-polish-check-base.md).
   Deduplicate overlapping findings.
2. **Severity / remediation:** For every finding, invent concrete remediation
   from `problem` text plus tree context (`issue tree`, `<kind> view`). Fold
   clear fixes for every `error` and clear `warning` remediations into the
   retained apply plan. Any unresolved `error` means you **must not** treat
   the outcome as “no changes needed”.
   - **Escalate (do not apply)** when auto-apply is unsafe: conflicting errors
     or ambiguous fixes. Stop and ask the user how to resolve; do not guess.
     After the user resolves the escalate, incorporate their resolution,
     re-compose the retained plan if needed, then continue at step 4
     (auto-apply when safe) — escalate is not a terminal stop.
   - Clear error/warning fixes apply without asking.
3. **Compose and retain** one full apply YAML from the deduplicated findings
   and your invented fixes,
   matching the work-root kind, per issue-tracker-authoring and
   [SPEC.md § apply doc format](../../../SPEC.md#apply-doc-format). Keep this
   YAML internal — do not paste it into chat.
   - **Epic** (`<rootKind>` = `epic`) — epic-form: `project: <projectId>`
     string + `epic:` object.
   - **project-level Story** (`<rootKind>` = `story`) — story-form:
     `project: <projectId>` string + `story:` object (**no** `epic:` key).
   - Or, when there are **zero** `error` findings and you are not adopting
     warning fixes, retain nothing (no apply). Warnings that remain must
     still appear in the step-5 summary.
4. **Auto-apply when safe.** When step 2 did not escalate and there is a
   retained YAML: write it to a temp file (or stdin) and run
   `issue apply <file>` (or equivalent) so tracker writes stay
   **single-threaded** through this coordinator. Do **not** ask yes/no to
   apply. Write path is the retained apply doc per issue-tracker-authoring
   (declarative apply) — epic-form or story-form per Bootstrap `<rootKind>`.
5. **Post-apply summary.** After a successful apply, or when there is nothing
   to apply, show in chat a **short informational** summary. Include **every
   non-escalated finding** (with severities) — including warnings whose fixes
   were not adopted — plus the plan changes applied when apply ran. State
   explicitly that **no changes are needed** only when there are **zero
   findings** (truly clean). Do **not** dump the apply YAML into chat. Show
   `apply` stdout (created/updated/deleted + subtree outline) when apply ran.
