---
name: issue-tracker-authoring
description: >-
  Drive the issue-tracker CLI to create/update Project > Epic > Story > Task
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
in the **workspace** app dir
(`<workspace>/.cursor/plugins/issue-tracker/app`), the CLI is also invokable as
`issue <verb>` (the `issue` bin) instead of `npx tsx cli.ts <verb>`. Never
`npm link` from `/root/.cursor/plugins/local/issue-tracker/` — that retargets
the global bin away from the authoritative workspace `issues/` store.

## Semantics (what `--help` doesn't spell out)

- **Create verbs print the new id** (`create-project`/`create-epic`/`add-story`/
  `add-task`) on stdout — capture it to link children. `apply` (below) makes
  this unnecessary for whole-tree authoring, since ids are author-chosen.
- **`attach` collision may rename** — the stored basename can differ from the
  source file; stdout prints the stored name (and path).
- **Updates are partial merges** — only the named field changes; the rest is
  untouched. Field writes: kind-scoped `set` below.
- **Nonzero exit = the write was refused** with no on-disk change; read the
  message and fix the input.
- Cross-link issues inside any body/description: `[text](issue:<id>)`.

### Kind-scoped `get` / `set`

Field read/write: `issue <kind> get|set …` (`project` | `epic` | `story` |
`task`). Allowlists, flags, and `--clear` semantics:
`issue <kind> get|set --help` and
[SPEC.md](../../SPEC.md#kind-scoped-get--set).

- **Prefer `get` for scalar reads** — do not parse `show` / `summary` / `tree`
  for a single field. (`summary`'s `Workspace:` line remains the bootstrap
  contract for Project workspace resolution.)
- **`needsAttention true` requires `--reason`**.
- **`description`**: create with `--description` / `--file` on the create/`add`
  verbs; update with
  `issue <kind> set <id> description --file <path|->` (omit the positional
  value). Pass `-` for stdin to avoid shell-escaping multiline Markdown. When
  the description introduces or wires an interface, see
  [Task interface seams](#task-interface-seams).
- **Reparent**: `issue <kind> set <id> partOf <parent>` (Task→Story,
  Story→Epic, Epic→Project).
- **Epic `blockedBy`**: prefer `--add` / `--remove` for incremental edits; a
  positional JSON array fully replaces.

### Declarative apply

- **`apply <file>`** — declarative authoring path for plan shape + prose. Doc
  format and field seam: [SPEC.md](../../SPEC.md#apply-doc-format). Use via
  issue-tracker-decompose.
- **Roots.** Project (whole tree, including Ideas), Epic (one epic in an
  existing project), or Story (one story + its tasks). Epic/story forms leave
  Ideas untouched — Ideas are Project children only.
- **Semantics.** Idempotent upsert; atomic (integrity-checked before any write);
  prune-by-default within the doc's root subtree.
- **Output.** Prints `created`/`updated`/`deleted` counts, then echoes the
  resulting subtree (same outline as `tree`). `blockedBy` is authored on the
  **Epic** node only. When Task descriptions introduce or wire an interface, see
  [Task interface seams](#task-interface-seams).

### Attachments

Companion material (Canvas `.tsx`, images, fixtures) belongs **with the issue
that uses it** as opaque files under `issues/<id>/attachments/` — do not paste
binary or Canvas bytes into `description.md`. Full model and limits (Epic/
Story/Task only; basename path-safety; 25 MiB cap):
[SPEC.md](../../SPEC.md#attachments).

- **Links.** Issue-local relative Markdown only: `[foo](foo.tsx)` means that
  issue's `attachments/foo.tsx`. No `attachment:` prefix and no `attachments/`
  segment in the link. Arbitrary external workspace paths remain forbidden.
- **`attach <id> <file>`** — basename when free; unique suffix on collision
  (keeps existing file) — see [SPEC.md](../../SPEC.md#attachments). Project
  ids are refused.
- **`attachments <id>`** — list names and sizes, or `(no attachments)`.
- **`detach <id> <name>`** — remove one attachment by basename (explicit
  delete).
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
- **`summary <id>`** — Project → Epic → Story → Task bootstrap chain; each
  node that has attachments includes the same listing (omitted when empty).
- **`tree [id]`** — print an indented Project > Epic > Story > Task outline with
  derived status/stack chips (status, base, branch, PR, merged, sha, blocked).
  A trailing id scopes by kind: `project` → that Project subtree (same as
  `--project <id>`), `epic` → that Epic subtree (same as `--epic <id>`),
  `story` → that Story line plus its Tasks only, `task` → refused (pass
  the parent Story or Epic). Unknown ids error; do not combine `[id]` with
  `--project` or `--epic`. `--project <id|title>` or `--epic <id>` still scope
  when no positional is given. Stories print in **stacked
  depth-first order** (a Story immediately followed by what forks from it) and
  Tasks in sequence, so the output *is* the canonical implementation order.
  Omits archived Epic / Story / Task rows by default; pass `--show-archived`
  to include them.

### Other flags

- **project title in place of id** — `list`/`tree` accept `--project` as either
  a project id **or** a unique project title, so you don't have to run
  `projects` first (an ambiguous/unknown title errors nonzero).
- **`--show-archived`** — `list`/`tree` include archived Epic / Story / Task
  issues (hidden by default). See
  [SPEC.md](../../SPEC.md#archived-visibility).

## Task interface seams

Task descriptions that introduce or wire an interface must spell out **API
shape and field names** (function names/signatures, HTTP paths/methods,
multipart field name) so implementors do not invent them. Do not require file
or middleware homes — those are implementor choices, not authoring seams.

- **Bad:** "Add HTTP download for attachments" (implementor invents
  `getAttachment`, multer, and multipart field `"file"`).
- **Good:** "Add `GET /attachments/:id` returning the raw bytes; upload is
  `POST /attachments` multipart field `attachment`."

## Task Change paths

When a Task Change **does** name a file path, that path MUST be relative to
the Project `workspace` root. Do not use plugin-root shorthand (`agents/...`,
`skills/...`, `app/...`) — Read/Glob resolve those paths as
`<workspace>/agents/...` and miss the plugin tree.

- **Bad:** `In agents/issue-tracker-spec-conformance-validator.md`
- **Good:** `In
  .cursor/plugins/issue-tracker/agents/issue-tracker-spec-conformance-validator.md`
