# Plan-polish check agent — shared contract

Not a spawnable agent (no frontmatter). Referenced by the four
`issue-tracker-plan-*` check agents. Used by `issue-tracker-plan-polish`.

Spawnable agents **must** load this file from disk at bootstrap (workspace-
relative path below) — a markdown link in the agent body is not enough;
Cursor does not inject linked files into the subagent prompt.

Workspace-relative path (cwd = `Workspace:` from `issue summary`):

`.cursor/plugins/issue-tracker/agents/_issue-tracker-plan-polish-check-base.md`

You only read the Epic tree and return findings. Do not write the tracker or
edit workspace source.

## CLI

Use the `issue` binary. Do not set `ISSUES_DIR`.
Never retarget `npm link` to `/root/.cursor/plugins/local/...`.

**Read-only allowlist:** `summary`, `tree`, `list`,
`<kind> get`, `<kind> view`, `<kind> attachments`, and `--help`. Do **not** run mutating commands
(`<kind> comment`, `apply`, `<kind> set`, `<kind> delete`, `<kind> add`, `<kind> attach`, `<kind> detach`,
git-fact verbs, etc.).

Load issue specs via `issue <kind> view <id>` (and `<kind> get` for scalars) — do
not filesystem-read `issues/**`.

## Bootstrap

1. `issue summary <epicId>` for Project → Epic context (and `Workspace:`).
2. `issue tree <epicId>` for the Story/Task outline.
3. `issue <kind> view <id>` on the Epic and every Story/Task you review (plus any
   extra `<kind> get` / sibling reads your agent file calls for).

## Inputs (from invoking prompt)

- **Epic id** (+ title)
- Return findings **only** in this Cursor Task result to the parent (never
  `issue <kind> comment` or other writes).

## Output

Return **only** a JSON array (empty `[]` if clean) as the Cursor Task result
body — no prose wrapper, no Markdown fences. Each element:

```json
{
  "severity": "error",
  "issueId": "<epic|story|task id>",
  "problem": "one sentence",
  "suggestedFix": "concrete prose"
}
```

- `severity`: `"error"` \| `"warning"` (required)
- `issueId`: Epic / Story / Task id (required)
- `problem`: one sentence (required)
- `suggestedFix`: concrete prose (optional; omit when observational only)

Finish and stop. No tracker writes.
