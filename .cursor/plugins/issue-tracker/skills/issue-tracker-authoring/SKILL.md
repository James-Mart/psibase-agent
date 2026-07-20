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

- **`add` prints the new id** (`issue project|epic|idea|story|task add …`) on
  stdout — capture it to link children. `apply` (below) makes this unnecessary
  for whole-tree authoring, since ids are author-chosen.
- **`attach` collision may rename** — the stored basename can differ from the
  source file; stdout prints the stored name (and path).
- **Updates are partial merges** — only the named field changes; the rest is
  untouched. Field writes: kind-scoped `set` below.
- **Nonzero exit = the write was refused** with no on-disk change; read the
  message and fix the input.
- Cross-link issues inside any body/description: `[text](issue:<id>)`.

### Kind-scoped ops

Single-issue ops are kind-scoped (`project` | `epic` | `idea` | `story` |
`task`); the CLI kind must equal the stored kind (hard error otherwise). Full
surface: [SPEC.md](../../SPEC.md#cli-surface).

```
issue <kind> add|get|set|view|delete|comment|attach|attachments|detach
```

- **`add`** — `issue project add <title>` (no `--part-of`); children take
  `--part-of`. Description: `--description` and/or `--file` (use `-` for
  stdin). Also: `--assignee` on epic / story / task; `--stacked-on` on story.
- **`view`** — `issue <kind> view <id>` (pass `--chat` for the chat log).
- **`delete`** — `issue <kind> delete <id>` (cascades per SPEC).
- **`comment`** — epic / story / task only:
  `issue epic|story|task comment <id> --role <role> --body <text>`.
- **`attach` / `attachments` / `detach`** — epic / idea / story / task only
  (not project); see [Attachments](#attachments).

### Kind-scoped `get` / `set`

Field read/write: `issue <kind> get|set …`. Allowlists, flags, and `--clear`
semantics: `issue <kind> get|set --help` and
[SPEC.md](../../SPEC.md#kind-scoped-get--set).

- **Prefer `get` for scalar reads** — do not parse `view` / `summary` / `tree`
  for a single field. (`summary`'s `Workspace:` line remains the bootstrap
  contract for Project workspace resolution.)
- **`needsAttention true` requires `--reason`**.
- **`description`**: seed with `--description` / `--file` on `add`; update with
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
binary or Canvas bytes into `description.md`. Full model and limits (epic /
idea / story / task; basename path-safety; 25 MiB cap):
[SPEC.md](../../SPEC.md#attachments).

- **Links.** Issue-local relative Markdown only: `[foo](foo.tsx)` means that
  issue's `attachments/foo.tsx`. No `attachment:` prefix and no `attachments/`
  segment in the link. Arbitrary external workspace paths remain forbidden.
- **`attach` / `attachments` / `detach`** —
  `issue epic|idea|story|task attach <id> <file>` /
  `issue epic|idea|story|task attachments <id>` /
  `issue epic|idea|story|task detach <id> <name>`. Basename when free; unique
  suffix on collision (keeps existing file) — see
  [SPEC.md](../../SPEC.md#attachments). Project ids are refused.
- **`apply` seam.** `apply` never creates, updates, or deletes attachment
  bytes (same as `chat.jsonl`). After the tree is applied, use kind-scoped
  `attach` / `detach` for bytes.
- **Discovery.** `view` and `summary` list attachments (name, size, on-disk
  path) when present; omitted when empty.

### Inspection / bootstrap

Global board/bootstrap ops (`apply` is under **Declarative apply**). For a
single issue's metadata + `description.md`, use `issue <kind> view <id>`
(**Kind-scoped ops**).

- **`summary <id>`** — Project → Epic → Story → Task bootstrap chain; each
  node that has attachments includes the same listing (omitted when empty).
- **`tree [id]`** / **`list [id]`** — shared optional positional scope (id only;
  no title lookup). Omit for all projects. `project` → that Project subtree,
  `epic` → that Epic subtree, `story` → that Story plus its Tasks only,
  `idea` / `task` → refused (pass the parent Project / Story or Epic).
  Unknown ids error. `tree` prints an indented Project > Epic > Story > Task
  outline with derived status/stack chips (status, base, branch, PR, merged,
  sha, blocked). Stories print in **stacked depth-first order** (a Story
  immediately followed by what forks from it) and Tasks in sequence, so the
  output *is* the canonical implementation order. `list` prints JSON
  (`issues` / `derived` / `problems`) filtered to the same scope. Both omit
  archived Epic / Idea / Story / Task rows by default; pass `--show-archived`
  to include them.

### Other flags

- **`--show-archived`** — `list`/`tree` include archived Epic / Idea / Story /
  Task issues (hidden by default). See
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
