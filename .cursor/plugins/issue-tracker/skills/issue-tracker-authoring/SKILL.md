---
name: issue-tracker-authoring
description: >-
  Drive the issue-tracker CLI to create/update Project > Epic > Branch > Commit
  issues and record git facts against a stack. Use when an agent creates/updates
  issues or works a stack. The authoritative command reference is `cli.ts --help`.
  Act only through the CLI, never by editing issue.json. Plan a tree:
  issue-tracker-decompose. Work it: issue-tracker-work.
---

# Issue Tracker — CLI Contract

Act **only through the CLI**; never hand-edit `issue.json`. The CLI wraps the one
validated service layer: it re-validates the whole set on each write and **exits
nonzero with a message** on any integrity violation (bad/missing
`partOf`/`stackedOn`, wrong-kind referent, cross-Epic `stackedOn`, cycle).
Nonzero = refused — read it, fix inputs, don't retry blindly. If `list` reports
`problems`, resolve them first. Glossary and derived state: [SPEC.md](../../SPEC.md).

The tracker is a **plan artifact**, so authoring it via this CLI is permitted in
**Plan mode** (it is the plan, like editing a plan doc); other system writes are not.

## Command reference: `--help`

The commander-generated help is the **single source of truth** for the command
set and every flag — this skill does not restate it (a hand-copied table would
silently rot against `app/cli.ts`).

```bash
cd .cursor/plugins/issue-tracker/app && npx tsx cli.ts --help   # all commands
npx tsx cli.ts <command> --help                                 # one command's flags
```

`ISSUES_DIR=/abs/path` picks the `issues/` dir (default: the plugin's own) —
match the UI/server so the human sees changes live. After a one-time `npm link`
in the app dir, the CLI is also invokable as `issue <verb>` (the `issue` bin)
instead of `npx tsx cli.ts <verb>`.

## Semantics (what `--help` doesn't spell out)

- **Create verbs print the new id** (`create-project`/`create-epic`/`add-branch`/
  `add-commit`) on stdout — capture it to link children. `apply` (below) makes
  this unnecessary for whole-tree authoring, since ids are author-chosen.
- **Updates are partial merges** — only the named field changes; the rest is
  untouched. The CLI sets but never clears scalars
  (`branchName`/`stackedOn`/`commitSha`/`prUrl`/`assignee`); clearing is a human
  UI action (`attention --clear` excepted).
- **Nonzero exit = the write was refused** with no on-disk change; read the
  message and fix the input.
- Cross-link issues inside any body/description: `[text](issue:<id>)`.

### The new verbs

- **`apply <file>`** — the declarative authoring path: upsert a whole
  Project > Epic > Branch > Commit tree from one nested YAML doc. It is
  **idempotent** (re-applying an unchanged doc is a no-op), **atomic** (the whole
  prospective set is integrity-checked before any write; a bad doc changes
  nothing), and **prune-by-default** (an in-project node the doc omits is
  deleted). It writes only plan shape + prose and preserves all runtime/progress
  fields, so it is safe to re-apply mid-run. Prints `created`/`updated`/`deleted`
  counts. Doc format and field seam: [SPEC.md](../../SPEC.md). Use it via
  issue-tracker-decompose.
- **`show <id>`** — print one issue's metadata + rendered `description.md`;
  `--chat` also prints the chat log. Self-verify a single issue without piping
  the big `list` JSON through a script.
- **`tree`** — print an indented Project > Epic > Branch > Commit outline with
  derived status/stack chips (status, base, branch, PR, merged, sha, blocked).
  `--project <id|title>` or `--epic <id>` scopes it. Branches print in **stacked
  depth-first order** (a Branch immediately followed by what forks from it) and
  Commits in sequence, so the output *is* the canonical implementation order.
- **`block <id>`** — edits a Branch's `blockedBy`. Exactly one of: `--by
  <ids...>` (full replace), `--add <ids...>` (union in), `--remove <ids...>`
  (drop). Prefer `--add`/`--remove` for incremental edits; `--by` overwrites the
  whole list.
- **`set-part-of <id> <parent>`** — reparent a node (Commit→Branch, Branch→Epic,
  Epic→Project). The service validates the new parent's kind/existence.
- **`--description-file <path>`** (on the create verbs and `set-description`) —
  read `description.md` from a file instead of an inline `--description`; pass
  `-` to read from **stdin** (pipe/heredoc), which avoids shell-escaping
  multiline Markdown.
- **project title in place of id** — `list`/`ready`/`tree` accept `--project`
  as either a project id **or** a unique project title, so you don't have to run
  `projects` first (an ambiguous/unknown title errors nonzero).
