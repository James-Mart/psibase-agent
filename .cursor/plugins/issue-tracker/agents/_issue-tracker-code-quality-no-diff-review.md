# Code-quality — No-diff review

Not a spawnable agent (no frontmatter). Loaded only when Task `noDiff` is
true. Used by `issue-tracker-code-quality-validator`.

Absolute path for this file (Read this exact path):

`/root/.cursor/plugins/local/issue-tracker/agents/_issue-tracker-code-quality-no-diff-review.md`

The Task intentionally lands no diff, so there is nothing to code-review.
Instead:

1. Confirm the working tree is actually clean (`git status` in the workspace). A
   dirty tree with `noDiff` set is a contradiction — treat it as actionable.
2. Confirm the implementor left a rationale: `issue task view <taskId> --chat` must
   contain an implementor comment tying the empty diff to the spec. A flag set
   with no rationale is actionable.
3. Judge that rationale against the Task spec — is "no file changes" actually
   correct here? A weak or wrong rationale, or a spec that plainly demands
   changes, is actionable.
4. Prepare the comment body: list any actionable problems from above as a
   concrete list, or — if the no-op is justified — a single line approving it.
   Never edit files or the `noDiff` flag. Then continue to the Outcome include
   (do **not** post the comment or stop from this file).
