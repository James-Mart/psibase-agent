# CLI

Not a spawnable agent (no frontmatter). Cross-cutting skill/agent-facing
CLI preamble. Callers **Read** this file from disk — a markdown link alone
is not enough.

Absolute path for this file (Read this exact path):

`/root/.cursor/plugins/local/issue-tracker/agents/_issue-tracker-cli.md`

Use the `issue` binary. Do not set `ISSUES_DIR`. Never `npm link` from
`/root/.cursor/plugins/local/...`.

Cross-cutting CLI invariants:
`/root/.cursor/plugins/local/issue-tracker/SPEC.md#cli-invariants`.
