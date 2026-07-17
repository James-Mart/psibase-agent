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

Parent `description.md` prose must not restate the child list
([SPEC.md](../../SPEC.md#parent-prose-must-not-restate-descendant-lists)).

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
  (`branchName`/`stackedOn`/`commitSha`/`noDiff`/`prUrl`/`specReview`/`assignee`); clearing is a human
  UI action (`attention --clear` excepted).
- **Nonzero exit = the write was refused** with no on-disk change; read the
  message and fix the input.
- Cross-link issues inside any body/description: `[text](issue:<id>)`.

### Declarative apply

- **`apply <file>`** — the declarative authoring path: upsert a nested
  Project > Epic > Branch > Commit tree from one YAML doc. It is
  **idempotent** (re-applying an unchanged doc is a no-op), **atomic** (the whole
  prospective set is integrity-checked before any write; a bad doc changes
  nothing), and **prune-by-default** (a node the doc omits within its root's
  subtree is deleted). The doc can be rooted at a **Project** (whole tree), an
  **Epic** (one epic in an existing project), or a **Branch** (one branch + its
  commits in an existing epic), so prune stays bounded to that root — edit one
  epic/branch without disturbing siblings. It writes only plan shape + prose and
  preserves all runtime/progress fields, so it is safe to re-apply mid-run.
  Prints `created`/`updated`/`deleted` counts, then echoes the resulting subtree
  the doc is rooted at (the same outline `tree` prints), so no follow-up `tree`
  is needed. `blockedBy` is authored as a field on the **Epic** node (a list of
  same-Project Epic ids); Branches carry no `blockedBy`. Doc format and field
  seam: [SPEC.md](../../SPEC.md). Use it via issue-tracker-decompose.
  When Commit descriptions introduce or wire an interface, see
  [Commit interface seams](#commit-interface-seams).

### Attachments

Companion material (Canvas `.tsx`, images, fixtures) belongs **with the issue
that uses it** as opaque files under `issues/<id>/attachments/` — do not paste
binary or Canvas bytes into `description.md`. Full model and limits (Epic/
Branch/Commit only; basename path-safety; 25 MiB cap):
[SPEC.md](../../SPEC.md#attachments).

- **Links.** Issue-local relative Markdown only: `[foo](foo.tsx)` means that
  issue's `attachments/foo.tsx`. No `attachment:` prefix and no `attachments/`
  segment in the link. Arbitrary external workspace paths remain forbidden.
- **`attach <id> <file>`** — upsert; stored name is the source file's basename;
  re-attaching the same name replaces bytes. Project ids are refused.
- **`attachments <id>`** — list names and sizes, or `(no attachments)`.
- **`detach <id> <name>`** — remove one attachment by basename.
- **`apply` seam.** `apply` never creates, updates, or deletes attachment
  bytes (same as `chat.jsonl`). After the tree is applied, use `attach` /
  `detach` for bytes.
- **Discovery.** `show` and `summary` list attachments (name, size, on-disk
  path) when present; omitted when empty.

### Inspection / bootstrap

- **`show <id>`** — print one issue's metadata + rendered `description.md`
  (attachments listed when present — see above). `--chat` also prints the chat
  log. Self-verify a single issue without piping the big `list` JSON through a
  script.
- **`summary <id>`** — Project → Epic → Branch → Commit bootstrap chain; each
  node that has attachments includes the same listing (omitted when empty).
- **`tree [id]`** — print an indented Project > Epic > Branch > Commit outline with
  derived status/stack chips (status, base, branch, PR, merged, sha, blocked).
  A trailing id scopes by kind: `project` → that Project subtree (same as
  `--project <id>`), `epic` → that Epic subtree (same as `--epic <id>`),
  `branch` → that Branch line plus its Commits only, `commit` → refused (pass
  the parent Branch or Epic). Unknown ids error; do not combine `[id]` with
  `--project` or `--epic`. `--project <id|title>` or `--epic <id>` still scope
  when no positional is given. Branches print in **stacked
  depth-first order** (a Branch immediately followed by what forks from it) and
  Commits in sequence, so the output *is* the canonical implementation order.

### Other verbs / flags

- **`block <id>`** — edits an **Epic's** `blockedBy` (the sole cross-Epic edge).
  Exactly one of: `--by <ids...>` (full replace), `--add <ids...>` (union in),
  `--remove <ids...>` (drop). Prefer `--add`/`--remove` for incremental edits;
  `--by` overwrites the whole list.
- **`set-part-of <id> <parent>`** — reparent a node (Commit→Branch, Branch→Epic,
  Epic→Project). The service validates the new parent's kind/existence.
- **`--description-file <path>`** (on the create verbs and `set-description`) —
  read `description.md` from a file instead of an inline `--description`; pass
  `-` to read from **stdin** (pipe/heredoc), which avoids shell-escaping
  multiline Markdown. When the description introduces or wires an interface, see
  [Commit interface seams](#commit-interface-seams).
- **project title in place of id** — `list`/`ready`/`tree` accept `--project`
  as either a project id **or** a unique project title, so you don't have to run
  `projects` first (an ambiguous/unknown title errors nonzero).

## Commit interface seams

Commit descriptions that introduce or wire an interface must spell out **API
shape and field names** (function names/signatures, HTTP paths/methods,
multipart field name) so implementors do not invent them. Do not require file
or middleware homes — those are implementor choices, not authoring seams.

- **Bad:** "Add HTTP download for attachments" (implementor invents
  `getAttachment`, multer, and multipart field `"file"`).
- **Good:** "Add `GET /attachments/:id` returning the raw bytes; upload is
  `POST /attachments` multipart field `attachment`."

## Commit Change paths

When a Commit Change **does** name a file path, that path MUST be relative to
the Project `workspace` root. Do not use plugin-root shorthand (`agents/...`,
`skills/...`, `app/...`) — Read/Glob resolve those paths as
`<workspace>/agents/...` and miss the plugin tree.

- **Bad:** `In agents/issue-tracker-spec-conformance-validator.md`
- **Good:** `In
  .cursor/plugins/issue-tracker/agents/issue-tracker-spec-conformance-validator.md`
