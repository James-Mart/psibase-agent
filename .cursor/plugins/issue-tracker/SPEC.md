# issue-tracker: glossary + design rationale

This is the canonical glossary for the issue-tracker plugin, referenced by both
skills. It defines every term the code, docs, and UI use, and explains the
design decisions that make the model correct-by-construction. Read it before
authoring issues or changing tracker code.

The tracker models work as a tree of **Project > Epic > Story > Task** nodes
that maps onto git stacked PRs, plus **Idea** nodes that sit beside Epics under
a Project (capture items, not work). A directory per issue on disk is the sole
source of truth; a validated service layer (`issues.ts` + sibling writers such
as `attachments.ts`) is the only sanctioned writer; all state that could drift
is derived, never stored.

## Glossary

### Kinds

#### Kinds vs git vocabulary

Kind names are **Story** and **Task**. A Story is planned as one git branch +
PR; a Task as one git commit. Git fact field names (`branchName`, `commitSha`,
`mergeBase`, …) and git-subagent modes (`start-branch`, `finish-commit`,
`finish-branch`) stay **git-shaped** — they are not renamed to match kinds.

Every issue has a `kind`, one of:

- **Project** — the top-level container that groups related Epics and Ideas.
  Purely organizational: it carries **no status** (derived or stored) and none
  of the assignee/needs-attention fields — a `title`, a `description.md`
  overview, and an optional `workspace` (the absolute path to the local git
  checkout this Project covers; repo-touching agents run there — see
  [workspace](#project-workspace)). Has no `partOf`.
- **Epic** — a body of work (replaces a giant plan/spec). Contains Stories; its
  `description.md` holds the spec. Carries `blockedBy` (a list of other Epic ids
  in the same Project that must finish first) and an optional `retro` gate
  (`in-progress` / `done`). Has **no stored status** — its status is fully
  derived from descendants. Is `partOf` a Project (required).
- **Idea** — a Project-level capture item (title, description, attachments,
  archive) that agents and humans mine later into real work. Leaf kind: no
  children, no assignee/needs-attention, no status or git fields, and **no
  chat** (`appendMessage` / CLI `comment` / chat HTTP refuse Ideas). Is
  `partOf` a Project (required). Epics and Ideas share one Project-child
  sibling `order` space. There is no separate Idea Board kind — the "board" is
  the Project's Ideas in the tree/CLI/UI.
- **Story** — a unit of work under an Epic. Contains Tasks. Carries
  `branchName`, `stackedOn`, `mergeBase`, `prUrl`, `merged`, and `specReview`.
  Status is derived, never stored.
- **Task** — an atomic, story-point-sized unit under a Story. Each Task is a
  **small but standalone cross-section** of the work: after it lands on the
  Story tip, the package must still **build** and tests must remain
  **meaningful** (vertical slices, not horizontal layers such as types-only,
  wire-up-later, or half-migrations that do not compile). The only kind with a
  **stored** `status` (`todo` / `in-progress` / `fixing` / `done`), an optional
  `qa` gate (`reviewing` / `changes-requested` / `passed`), an optional `commitSha`
  (set when done with a real git commit), and an optional `noDiff` flag (set via
  kind [`set`](#kind-scoped-get--set) when the implementor deliberately lands no
  file changes).

### Relationships

Three relationships, each with a distinct, non-overlapping role:

- **partOf** — *containment*: the node this one belongs to. A Task is `partOf`
  a Story; a Story is `partOf` an Epic; an Epic or Idea is `partOf` a Project.
  It points exactly one tier up and builds the tree. Projects have none.
- **stackedOn** — *the single git fork point* of a Story: which one Story it
  forks from. Story-only, always singular, and strictly within one Epic. Absent
  means it forks off the Epic's base (`main`). It is the **sole** inter-Story
  edge, so within an Epic the Stories form a forest of independent stacks — a
  tree, never a DAG, with no internal merge gate.
- **blockedBy** — *cross-Epic ordering*: a list of other Epic ids **in the same
  Project** that must finish (all their Stories merged) before this Epic can
  start. Epic-only, and the only edge that crosses an Epic boundary. This is what
  makes the Epic-level dependency graph a DAG.

#### The diamond (why a multi-parent dependency becomes a new Epic)

The one thing a single `stackedOn` fork point cannot express is a unit that needs
code from **two** parallel Stories at once (the classic diamond: Stories A and
B both fork `main`, worked in parallel, and C needs both). Rather than
reintroduce a Story-level multi-parent edge — which would force a merge gate
*inside* an Epic and break the "one Epic run = one clean, bottom-up-mergeable
stack of PRs" property — we resolve it at the Epic boundary: split the dependent
unit into a **new Epic that is `blockedBy` the Epic holding the parallel
Stories** (A and B). The tradeoff is
deliberate: keeping A and B in one Epic preserves their parallelism (two
independent stacks, no gate between them), while moving C into a second Epic makes
it wait for the whole blocking Epic to *merge* first — coarser, but landing
exactly where a merge round-trip is natural (a human-paced Epic boundary) instead
of stalling a stack mid-flight.

#### The stacked-PR merge model

Every Story has a stored **`mergeBase`**: the git ref that `start-branch`
checks out from and that `finish-branch` targets for PR/merge. It is **not**
re-derived from `stackedOn` at git time.

- **Shared resolver** — canonical algorithm for a Story's `mergeBase` from its
  fork point:
  - **Triggers**: any write that sets or clears `stackedOn` — create, `apply`
    (when the doc changes it), kind [`set`](#kind-scoped-get--set), and delete
    splice ([foreign-reference resolution](#foreign-reference-resolution)).
  - **Algorithm**: no `stackedOn` (root or unstack) → `main`; stacked on a
    merged parent → `parent.mergeBase`; else parent's `branchName` when set;
    else unset (key absent).
  - **`apply` preservation**: re-`apply` with unchanged `stackedOn` keeps the
    on-disk `mergeBase`.
- **First `branchName` cascade**: when a parent gets its first `branchName`
  via [`set`](#kind-scoped-get--set), children whose `mergeBase` key is absent
  get that name in the same command (children that already have a `mergeBase`
  are left alone).
- **On `merged` → `true`**: every child with `stackedOn = parent` gets
  `child.mergeBase = parent.mergeBase` (idempotent). That is how a stack
  retargets after the parent lands — typically onto `main`. Open GitHub PRs
  are retargeted by GitHub itself; the tracker does not run PR-base CLI — see
  [Project merge policy](#project-merge-policy).
- **Rename guard**: once a Story has a `branchName` and any child is
  stacked on it, a real `branchName` rename is refused (same-value no-op still
  allowed). Empty-only cascade on first name is enough because children cannot
  be left pointing at a stale parent name.

A stack still lands bottom-up: finish the parent first, then each child.
Consequently **each Story must be independently mergeable** into its
`mergeBase` — merging it must leave that base building and self-consistent.
Only Stories merge; Tasks are internal steps that ship together as their
Story's single PR, so an individual Task need not be *shippable* alone but
the Story as a whole must be. A Task *must* still leave the Story tip
**buildable and testable** — see [Task](#kinds). Never split one cohesive
change across separate Stories such that merging one would leave the base
broken (for example a schema change in one Story and the code that consumes
it in another): keep it in one Story as multiple Tasks.

Under `pull-request` / `manual` [merge policies](#project-merge-policy), each
finished Story is planned as a PR against its stored `mergeBase` (after
parent merge, usually `main`). The local `merge` policy integrates each
finished Story directly into that same stored `mergeBase` with no PR, so a
stack still lands bottom-up but never touches a remote PR.

### Derived terms

These are computed by `derive()` and never written to disk (see
[Derived state](#derived-state)):

- **Stack** — the emergent set of dependent, not-yet-merged Stories under an
  Epic, induced solely by `stackedOn`: a forest of independent stacks (each a
  tree), never a cross-Story DAG.
- **blocked** — whether an issue is waiting on a dependency (per-kind rules in
  [Derived state](#derived-state)).
- **Story status** — `not-started` / `in-progress` / `pr-open` / `merged`.
- **Epic status** — `todo` / `in-progress` / `done` (rollup of its Stories).
- **base** — display of a Story's stored `mergeBase` (tree chip `base=<ref>`,
  or `base=(unset)` when `mergeBase` is absent). Never re-derived from
  `stackedOn`.
- **needs-attention** — an escalation flag (`needsAttention` + `attentionReason`),
  orthogonal to status; any kind can carry it.
- **assignee** — who currently owns an issue (e.g. `human` or an agent id).
- **specReview** — a Story-only machine-readable spec-review gate (`passed` /
  `failed`; absent until set via kind [`set`](#kind-scoped-get--set)). Surfaced
  in the detail panel when set; omitted from the tree outline.
- **noDiff** — a Task-only signal that the implementor intentionally landed no
  file changes (`true`; absent until set via kind [`set`](#kind-scoped-get--set)).
  Surfaced in the detail panel when set; omitted from the tree outline. An empty
  working tree alone is **not** a completion signal — see
  [Finish commit](#finish-commit).
- **archived** — stored visibility flag on Epic / Idea / Story / Task (never
  Project). Explicit; **not** auto-derived from Done. Cascade and CLI/UI
  filtering — see [Archived visibility](#archived-visibility).
- **problems** — integrity issues that are surfaced, never silently ignored:
  dependency cycles, dangling `partOf`/`stackedOn`/`blockedBy` ids, kind
  violations, and malformed/invalid files.

## Kind-scoped `get` / `set`

Field read/write on the CLI is kind-scoped:

- `issue <kind> get <id> <field>`
- `issue <kind> set <id> <field> [value] [--clear] [--add <ids...>] [--remove <ids...>] [--file <path|->] [--reason <text>]`

`<kind>` is one of `project` | `epic` | `story` | `task`. The verb kind must
equal the issue's stored `kind` (hard error otherwise). Field names are
camelCase, identical to schema / `issue.json` keys. There is no cross-kind
`get`/`set`; shared fields are repeated on each kind that owns them.

Prefer `issue <kind> get <id> <field>` for scalar reads — do not parse
`show` / `summary` / `tree` for a single field. (`summary`'s `Workspace:` line
remains the bootstrap contract for [Project workspace](#project-workspace)
resolution.)

Kept non-field ops (`apply`, `comment`, attach verbs, create/add, `delete`,
`summary` / `show` / `list` / `tree` / `projects`) are unchanged.

### `get`

- Prints the value alone on stdout (composable in `$(...)`).
- Scalars raw; arrays/objects as JSON.
- Unset optional → empty stdout, exit 0. Fields with a schema default print that
  default: an Epic with no blockers prints `[]` (arrays as JSON), not empty
  stdout.
- Readable surface is **wider than set**: any stored field for that kind plus
  derived fields (`epicStatus`, `storyStatus`, `blocked`, `base`, …).
- Includes `description` and `attentionReason` as readable fields.

### `set`

- Typed coercion + validation; same `update` + `checkIntegrity` write path as
  `apply` / create.
- Per-kind **set** allowlists (not a flat shared allowlist). Shared machinery is
  only coerce/dispatch (bool/enum/JSON/array/`--clear`/`--file`/`--reason`).
- `order` is not settable. `mergeBase` is not settable (see
  [stacked-PR merge model](#the-stacked-pr-merge-model)).
- `attentionReason` is not directly settable (see
  [`needsAttention`](#needsattention)).
- **CLI/UI parity:** `set` can do anything the UI edit form can, including
  *clearing* fields via `--clear` (behaviors below).

#### Set allowlists

| kind | settable fields |
| --- | --- |
| project | `title`, `workspace`, `mergePolicy`, `description` |
| epic | `title`, `assignee`, `needsAttention`, `archived`, `partOf`, `blockedBy`, `retro`, `description` |
| story | `title`, `assignee`, `needsAttention`, `archived`, `partOf`, `branchName`, `stackedOn`, `prUrl`, `merged`, `specReview`, `description` |
| task | `title`, `assignee`, `needsAttention`, `archived`, `partOf`, `status`, `qa`, `commitSha`, `noDiff`, `description` |

#### Value parsing

- Enums: literal strings.
- Booleans: only `true` / `false`.
- Arrays (`blockedBy`): full replace takes a positional JSON array; incremental
  edits use `--add <ids...>` / `--remove <ids...>` (variadic ids). Exactly one
  mode per call — positional value, `--add`, `--remove`, and `--clear` are
  mutually exclusive.
- `--clear` (mutually exclusive with a positional value / `--add` / `--remove`):
  - **Clearable scalars** (`assignee`, `commitSha`, `branchName`, `stackedOn`,
    `prUrl`, `workspace`, `qa`, `retro`): blanks the field (absent / `null`).
  - **`blockedBy`**: sets `[]` (empty array, not null).
  - **`needsAttention`**: sets `false` and clears `attentionReason` (same as
    `needsAttention false`).
- `description`: omit positional value when `--file <path|->` is passed.
  `--file` is the generic "value from a file" flag. Create/`add` verbs use the
  same `--file` for seeding `description.md`.

#### `needsAttention`

- `issue <kind> set <id> needsAttention true --reason <text>` — `--reason` is
  required.
- `issue <kind> set <id> needsAttention false` — also clears `attentionReason`.
- `issue <kind> set <id> needsAttention --clear` — equivalent to `false`.

## On-disk layout

The `issues/` directory holds one directory per issue; it is the source of
truth (no database).

```
issues/<id>/
  issue.json        # metadata + relationships (machine-readable)
  description.md    # the spec/description (for an Epic, the plan). GFM; may contain issue: links
  chat.jsonl        # append-only per-issue chat (not Ideas), one message object per line
  attachments/      # optional; opaque files for Epic/Idea/Story/Task (not Project)
```

- `description.md` and `chat.jsonl` are discovered **by convention** from `<id>`
  (there are no path fields, so there can be no dangling file refs). Both are
  optional; absent means empty. Ideas refuse chat writes — see
  [`appendMessage`](#service-layer).
- `attachments/` is likewise by convention: no manifest; scan the directory.
  Allowed on Epic, Idea, Story, and Task only (not Project). See
  [Attachments](#attachments).
- `<id>` = directory name, mirrored in `issue.json.id`, **stable** across title
  edits, and globally unique across all kinds. Its *origin* depends on the
  writer, but the result is the same kind of id either way:
  - the imperative `create*` verbs **derive** it as a slug from the title at
    creation, adding a numeric suffix on collision (`add-auth`, `add-auth-2`);
  - the declarative [`apply`](#apply-doc-format) doc requires an
    **author-chosen** id on every node (kebab, unique, slug-safe, and
    title-independent, so it survives retitles and lets `issue:<id>` cross-links
    be authored before anything exists).

  An id is never *only* a title-slug: once written it is a stable handle
  decoupled from the title, whatever produced it.

## `issue.json` schema

A single kind-discriminated zod schema (`app/server/schemas.ts`) is the one
source of truth for validation, on both read and write. Which fields are present
depends on `kind`.

Common to every kind:

| field | type | notes |
| --- | --- | --- |
| `id` | string | = directory name; stable |
| `kind` | `"project"` \| `"epic"` \| `"idea"` \| `"story"` \| `"task"` | discriminator |
| `title` | string | non-empty |
| `order` | int | sibling position within its parent group; defaults `0` |
| `createdAt` | ISO string | set at create |
| `updatedAt` | ISO string | bumped on every write |

Common to **Epic / Story / Task** (but **not** Project or Idea):

| field | type | notes |
| --- | --- | --- |
| `assignee` | string? | optional |
| `needsAttention` | boolean | defaults `false` |
| `attentionReason` | string \| null | defaults `null` |

Project — the common-to-every-kind fields plus:

| field | type | notes |
| --- | --- | --- |
| `workspace` | string? | absolute path to the local git checkout this Project covers; the cwd repo-touching agents run in (see [Project workspace](#project-workspace)) |
| `mergePolicy` | `"merge"` \| `"pull-request"` \| `"manual"` | what git `finish-branch` does after a Story's last Task is done; defaults `manual` (see [Project merge policy](#project-merge-policy)) |

No `partOf`, no status, no assignee/needs-attention. Its `description.md` is a
short overview of the Project.

### Project workspace

A Project's optional `workspace` is the absolute path to the local git checkout
its Epics' work lands in. It is set with
`issue project set <projectId> workspace <path>` (cleared with `--clear`) and
surfaced on the Project node by both `issue show` (a `workspace:` line) and
`issue summary` (a `Workspace:` line under the Project). Prefer
`issue project get <projectId> workspace` for a single-field read.

The field exists so the work loop's **repo-touching subagents** (git,
implementor, and both validators) know where to operate. The **model
discriminator** uses the same path for **read-only peeks** when scoring
verification difficulty (see [Model discriminator (read-only peek)](#model-discriminator-read-only-peek)).
The coordinator does no repo work and never needs a workspace. The contract
below is the single source of truth; the agent files (`agents/*.md`) and the work
skill point here rather than restating it.

**Resolution.** A repo-touching subagent reads its own bootstrap
`issue summary <id>` output — never a value inlined in its Task prompt (a
coordinator must not pass one, but if one leaks in, ignore it). From that output:

- the workspace is the `Workspace:` line under the Project;
- the project id is the id on the `Project: <id> — <title>` line (used to build
  the attention message and, for git finish-branch, to look up the Project's
  [merge policy](#project-merge-policy) via
  `issue project get <projectId> mergePolicy`; do not re-derive ancestry any
  other way).

**Use as cwd.** Run **every** repo command — git, builds, tests, and any
file-edit / diff-inspection — with the workspace path as the shell working
directory (pass it as the tool's `working_directory`, or `cd` into it first);
never rely on the ambient cwd for repo work. The `issue` CLI is exempt: it
resolves its issues dir from its own install location, so it works from any cwd —
keep invoking it as-is.

**Unset → escalate, never fall back.** If `issue summary` prints no `Workspace:`
line, do **not** touch any repo. Raise
`issue epic set <epicId> needsAttention true --reason "Project workspace unset — set it with 'issue project set <projectId> workspace <path>'"`
(substituting the ids) and stop. Attention always lands on the **Epic**: a
Project carries no needs-attention fields, so it is never the target.

**Coordinator preflight.** Because the missing-workspace failure otherwise only
surfaces once a repo subagent is spawned, the work-loop coordinator checks for
the `Workspace:` line up front (in Setup) and hands back to the user before
spawning anything if it is absent.

### Model discriminator (read-only peek)

When scoring verification difficulty, the discriminator may **read-only**
inspect the workspace (file reads and greps; no edits, builds, tests, or writes)
with the workspace as cwd, solely to judge whether required patterns/APIs exist
and how hard verification will be. It does not implement, choose libraries for
the implementor, or plan the solution beyond what scoring requires. Resolve and
use the workspace via the same `issue summary` rules above; honor **Unset →
escalate** — do not peek from an ambient cwd. Exploration volume (many reads
across the tree) is not capped when needed to score accurately.

### Project merge policy

A Project's `mergePolicy` decides what happens to a Story once its last Task
is `done`. It is set with `issue project set <projectId> mergePolicy <policy>`
and read with `issue project get <projectId> mergePolicy`. It defaults to
**`manual`**, matching today's posture where a human opens and merges PRs.

The work loop **always** finishes a Story by spawning the git subagent in
`finish-branch` mode; the coordinator never reads or branches on `mergePolicy`.
Only the git subagent interprets it, from
`issue project get <projectId> mergePolicy`, so there is exactly one reader and
the skill can never contradict the field. `finish-branch` runs in the Project
workspace (same cwd rules as above) and applies:

- **`manual`** — no-op. Nothing is pushed, opened, or merged; a human handles
  the PR later. (Default.)
- **`pull-request`** — push the Story's git branch and open a **draft** PR
  against its stored `mergeBase`, then record the url via
  `issue story set <storyId> prUrl <url>`. It does **not** wait for merge or
  set `merged`, so the Story derives to `pr-open`.
- **`merge`** — merge the Story's git branch into its stored `mergeBase`, push
  that ref, and set `merged` via `issue story set <storyId> merged true` (Story
  derives to `merged`). This is the local, no-PR integration path. Setting
  `merged` cascades `child.mergeBase = parent.mergeBase` for stacked children
  (see [stacked-PR merge model](#the-stacked-pr-merge-model)). When a parent
  lands, **GitHub retargets** open child PRs; the tracker only updates
  metadata — finish-branch never runs `gh pr edit --base` (or any PR
  retarget CLI).

**Resumable / idempotent.** The work loop is resumable, so finish-branch may run
twice for the same Story. Before acting, the git subagent reads the Story's
`prUrl` / `merged` (via `issue story get <storyId> prUrl` /
`issue story get <storyId> merged`) and no-ops when the policy's end state
already holds — `merged` set for `merge`, `prUrl` set for `pull-request` — so a
re-run never opens a duplicate PR or re-merges.

**Failure and recovery.** On failure the git subagent raises attention on the
Story (`issue story set <storyId> needsAttention true --reason "…"`) and
stops. A `merge` conflict is aborted (`git merge --abort`) so the `mergeBase`
ref is never left half-merged; but a *completed* local merge whose `push`
failed is left in place — with `merged` still unset it is exactly the resumable
state above, so the retry just re-pushes.

Epic — the Epic/Story/Task common fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Project id (required) |
| `blockedBy` | string[] | other Epic ids in the same Project that must finish first; defaults `[]`; the only cross-Epic edge |
| `retro` | `"in-progress"` \| `"done"`? | absent until set; machine-readable retro gate |

Idea — the common-to-every-kind fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Project id (required) |
| `archived` | boolean | defaults `false`; see [Archived visibility](#archived-visibility) |

No assignee, needs-attention, status, git fields, or chat. Leaf under a Project;
shares the Project-child `order` space with Epics.

Story — the Epic/Story/Task common fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Epic id (required) |
| `branchName` | string? | set once the git branch is created; rename refused while stacked children exist |
| `stackedOn` | string? | single fork-point Story id (must be in the same Epic); absent => root |
| `mergeBase` | string? | stored git ref for start-branch / finish-branch; [shared resolver](#the-stacked-pr-merge-model) on `stackedOn` change, plus first-`branchName` and `merged` cascades |
| `prUrl` | string? | optional |
| `merged` | boolean | defaults `false`; setting `true` cascades child `mergeBase` |
| `specReview` | `"passed"` \| `"failed"`? | absent until set; machine-readable spec-review gate |

Task — the Epic/Story/Task common fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Story id (required) |
| `status` | `"todo"` \| `"in-progress"` \| `"fixing"` \| `"done"` | defaults `todo`; the only stored status |
| `qa` | `"reviewing"` \| `"changes-requested"` \| `"passed"`? | absent until set; machine-readable QA gate |
| `commitSha` | string? | set when done |
| `noDiff` | boolean? | absent until set; signals an intentional empty implementor diff |

Deliberately excluded: `rank`/priority (sibling order is stored as `order`, not
authored as a separate priority field), `label`, inline
`description`/`messages` (they are separate files), and status history.

### Finish commit

When the work loop spawns the git subagent in `finish-commit` mode, it finalizes
one Task. The coordinator never inspects the working tree or the `noDiff` flag —
only the git subagent does. The subagent reads the Task's `noDiff` (via
`issue task get <taskId> noDiff`) and the working-tree state (`git status`),
then applies:

| `noDiff` | Tree | Action |
| --- | --- | --- |
| `true` | clean (empty) | `issue task set <taskId> status done` only — no `git commit`, no `commitSha`; leave `noDiff` set. |
| `true` | dirty | Escalate: `issue task set <taskId> needsAttention true --reason "…"` — the flag contradicts a non-empty tree. |
| absent / `false` | clean (empty) | Escalate: `issue task set <taskId> needsAttention true --reason "…"` — an empty tree without `noDiff` is not a completion signal. |
| absent / `false` | dirty | Stage all changes (`git add -A`), `git commit -m "<Task title>"`, `issue task set <taskId> status done`, `issue task set <taskId> commitSha $(git rev-parse HEAD)`. |

The implementor sets `noDiff` via kind [`set`](#kind-scoped-get--set) (and
explains why in chat) when the correct outcome is no file changes; validators and
the git subagent honor the flag. Clearing it (`noDiff false`) is required if a
revision later lands file changes.

### Tree nesting and order

The tree nests a Story under the Story it forks from: a Story renders as a
child of its `stackedOn` Story (which must be in the same Epic — see below), so
indentation mirrors the git stack depth. A Story with no `stackedOn` is a
*root* Story, rendered directly under its Epic. Under a Story, its own Tasks
render first, then the Stories stacked on it. Story order is therefore **pure
stacked depth-first** over `stackedOn` alone; `blockedBy` plays no part in it
(it is an Epic-level edge, surfaced in the Epic's detail panel and used only to
gate the Epic's derived `blocked` state — not sibling order). Within one
nesting level, siblings are ordered strictly by stored `order` (never
`createdAt` or `id`). Root Stories under an Epic are traversed depth-first
(each root immediately followed by what stacks on it); siblings at every level
sort by `order`. Epics, Ideas, and Projects sort by `order` (Epics and Ideas
share one Project-child sibling group). Duplicate `order` within a sibling group
is an integrity problem.

**Projects scope the view.** A Project is the top-level container: every Epic
and Idea is `partOf` exactly one Project. The web UI lists Projects in a
sidebar; selecting one scopes the tree to that Project's subtree (its Epics and
Ideas, and each Epic's Stories/Tasks). Projects themselves are not rendered as
nodes inside the tree — they are the selectable root. Projects are ordered by
`order`.

**Stored `order`.** Every issue carries an integer `order` within its sibling
group. Authors never write it in an apply doc — `apply` infers it from array
position (and rejects an explicit `order` key). Imperative `create` appends
(`max + 1`); reparenting without an explicit `order` patch re-appends in the new
group. Tree emission is structural DFS (each level sorted by `order`), never by
`id` or `createdAt`.

<a id="archived-visibility"></a>

### Archived visibility

Epic / Idea / Story / Task carry a stored boolean `archived` (default / absent =
`false`). Projects are never archived. Setting `archived` true or false on a
node applies the same value to all descendants (cascade). Creating a child
under any archived ancestor starts the child `archived: true`. Archiving a
child while its parent stays unarchived remains allowed. Ideas are leaves, so
archiving an Idea has no descendants to cascade to. `issue tree` and
`issue list` omit archived rows by default; pass `--show-archived` to include
them. The web UI tree uses the same filter rule: archived rows are hidden
unless the client "Show archived" preference is on (default off; fills the
former Ready view-control slot next to search). Detail header and tree-row
hover expose Archive / Unarchive actions that PATCH `archived` through the same
cascade path as CLI `set`.

## `chat.jsonl` message shape

Each line of `chat.jsonl` is one JSON message object (`app/server/schemas.ts`):

| field | type | notes |
| --- | --- | --- |
| `role` | string | non-empty; the author role (e.g. `agent`, `human`) |
| `name` | string? | optional author display name |
| `body` | string | non-empty; Markdown, may contain `issue:` links |
| `at` | ISO string | server-stamped on append (not supplied by the caller) |

Malformed lines are skipped into `problems` on read, never thrown.

## Service layer

`app/server/services/issues.ts` is the **sanctioned writer** of issue metadata
and prose under `issues/`, shared by the HTTP routes and the CLI.
`app/server/services/attachments.ts` is the sibling writer for
`issues/<id>/attachments/` (per-file get/put/remove share the same `serialize`
chain; `listAttachments` does not). All misconfiguration is prevented here, so
no consumer can persist a broken file.

### Writer contract

- `list()` — scans `issues/*/`, reads each `issue.json` (plus presence of
  `description.md`/`chat.jsonl`), runs `derive()`, and returns issues + derived
  state + all `problems`. Malformed dirs/files and malformed chat lines are
  collected into `problems`, never thrown.
- `read(id)` — returns one issue with its `description` and a content `version`.
- `create(input)` — generates the id/slug (with collision suffix) and
  timestamps, links `partOf`, and writes the dir + `issue.json` +
  `description.md`.
- `update(id, patch)` — **partial merge**, never a blind overwrite; bumps
  `updatedAt`. The mergeable fields are `title`, `assignee`, `needsAttention`/
  `attentionReason`, `archived` (Epic / Idea / Story / Task; cascades to
  descendants — see [Archived visibility](#archived-visibility)), `partOf`, the
  kind-specific fields (`blockedBy` for an Epic; `status`/`qa`/`commitSha`/`noDiff`
  for a Task; `branchName`/`stackedOn`/`mergeBase`/`prUrl`/`merged`/
  `specReview` for a Story), and `description` (written to `description.md`).
  Clearable fields are removed when patched to `null`. A patch that names a
  field not valid for the issue's kind is rejected.
- `remove(id)` — deletes the issue and its containment subtree, repairing every
  surviving reference into it (see [Deletion policy](#deletion-policy)). Exposed
  over HTTP as `DELETE /api/issues/:id` and via the CLI `delete` command.
- `appendMessage(id, {role, name?, body})` — appends one JSONL line to
  `chat.jsonl` with a server-stamped `at`. Refused with a validation error for
  Ideas (CLI `comment` and chat HTTP share this path); does not create
  `chat.jsonl`.
- `readChat(id)` — reads/parses `chat.jsonl`, skipping malformed lines into
  `problems`. An Idea with no chat file returns empty messages (same as any
  other kind without `chat.jsonl`).
- Attachment bytes (`attachments.ts`): `listAttachments` / `getAttachment` /
  `putAttachment` (unique name on collision) / `removeAttachment` — see
  [Attachments](#attachments). Not part of `read(id)` payloads.

### Cross-cutting guarantees

- **Validate-at-write.** `create`/`update` run the integrity checks against the
  *prospective* state and refuse any write that would introduce a `problem` — a
  bad or missing `partOf`/`stackedOn`/`blockedBy` referent, a referent of the
  wrong kind (a Task's `partOf` must be a Story, a Story's an Epic, an Epic's
  a Project; a `stackedOn` must be a Story, a `blockedBy` entry an Epic), a
  `stackedOn` in a different Epic, a `blockedBy` Epic in a different Project, or a
  cycle-inducing `stackedOn`/`blockedBy`. On failure the CLI exits nonzero
  with a clear message and HTTP returns 4xx with detail.
- **Read-time validation.** Hand-edited or out-of-band files are still validated
  on read and surfaced as `problems`; they never crash a read. A directory whose
  `issue.json` id disagrees with the directory name is reported as a problem.
- **Serialized writes.** A single in-process promise chain serializes all writes
  so concurrent CLI/HTTP calls cannot race.
- **Change detection.** `read` returns a `version` (a hash over `issue.json` +
  `description.md`) so the UI can detect out-of-band edits to the open issue.
  `chat.jsonl` and `attachments/` are deliberately excluded from the version so
  chat appends and attachment uploads/deletes do not trip the external-edit
  banner.

### Deletion policy

Deleting an issue must leave the remaining graph valid — no dangling
`partOf`/`stackedOn`/`blockedBy` and no new problem. `remove()` computes the
outcome with the pure, filesystem-free `planDeletion()`
(`app/server/services/deletion.ts`), validates the prospective surviving set,
and only then persists repairs and removes directories, so a deletion that could
not leave the graph valid is refused without side effects.

**Cascade by deleted kind (the `partOf` containment closure — the "delete
set"):**

- **Task** — removes only that Task (Tasks have no children).
- **Story** — removes the Story and every Task `partOf` it.
- **Epic** — removes the Epic, every Story `partOf` it, and every Task
  `partOf` those Stories (transitive).
- **Project** — removes the Project and its entire subtree: every Epic `partOf`
  it, every Story `partOf` those Epics, and every Task `partOf` those Stories
  (transitive). Deleting a Project therefore discards all of its work; the UI
  gates this behind a confirmation dialog that names the contained-issue count.

**Foreign-reference resolution.** After the delete set is computed, every
surviving issue (across all Projects, not just descendants) is scanned for edges
into it, and each edge type resolves deterministically:

| edge into delete set | resolution |
| --- | --- |
| `partOf` | Cannot survive — the referrer is itself contained, so it is already in the delete set. No repair needed. |
| `stackedOn` (a deleted Story; always same-Epic) | **Splice**: repoint the surviving Story to the deleted story's own `stackedOn`, walking up until a surviving Story, or absent (forks `main`) if none. Recomputes `mergeBase` via the [shared resolver](#the-stacked-pr-merge-model). Preserves the stack minus the removed node. |
| `blockedBy` (a deleted Epic; cross-Epic, same Project) | **Drop**: remove the deleted Epic id from the blocked Epic's list, with no inheritance. This is the case that matters for Epic deletion, since `blockedBy` is the only edge that crosses an Epic boundary. |
| `stackedOn` → a deleted Task/Epic, or `blockedBy` → a deleted Story/Task | Impossible — `stackedOn` only ever references a Story, and `blockedBy` only ever references an Epic. |

`issue:` cross-links inside `description.md` are freeform Markdown, not
validated relationships, so they are left untouched.

Deleting an issue removes its whole directory (`rmSync` recursive), so any
`attachments/` under that directory go with it — both imperative `remove` and
`apply` prune. There is no separate attachment-cascade step.

**Invariant.** After `remove()`, `list().problems` gains no new
dangling-reference, wrong-kind, or cycle problem — guaranteed by construction in
`planDeletion()` and re-validated against the surviving set before any write.

## Attachments

Opaque files that travel with an Epic, Idea, Story, or Task (e.g. Cursor
Canvases as `.tsx`, images, small fixtures). Owned by
`app/server/services/attachments.ts`, a sibling writer whose per-file
get/put/remove share the same `serialize` chain as `issues.ts` writes;
`listAttachments` is unsynchronized.

**Kinds.** Attach / list / download / detach only on Epic, Idea, Story, and
Task. Project (and unknown ids) are refused.

**On-disk.** `issues/<id>/attachments/<basename>` — no manifest; metadata is
filename + size + mtime, with MIME inferred from the extension
(`application/octet-stream` when unknown).

**Limits.** Path-safety only: reject empty names, `.`, `..`, `/`, `\`, null
bytes, and any name that is not a plain basename. No extension allowlist.
**25 MiB** max per file (`MAX_ATTACHMENT_BYTES`).

**Unique names.** `putAttachment` stores under a collision-free basename: the
requested basename when free, otherwise `{stem}-{n}{ext}` with the smallest
`n ≥ 2` not already taken (stem + last extension). Existing files are never
overwritten. Removal is explicit (`removeAttachment` / CLI `detach` /
`DELETE`). There is no rename verb — attach under the desired basename and
detach the old name.

**HTTP** (thin adapter over the service; payloads are not embedded in
`GET /api/issues/:id`):

| method | path | behavior |
| --- | --- | --- |
| `GET` | `/api/issues/:id/attachments` | list metadata |
| `POST` | `/api/issues/:id/attachments` | multipart `file` upload; requested name = basename of uploaded filename; on collision store under a unique name; response returns the stored name |
| `GET` | `/api/issues/:id/attachments/:name` | download bytes + `Content-Type` |
| `DELETE` | `/api/issues/:id/attachments/:name` | remove one file |

**Description links.** Issue-local relative Markdown only. A link like
`[foo](foo.tsx)` means that issue's `attachments/foo.tsx`. Arbitrary external
workspace paths remain forbidden. Convention + docs/skills only — there is no
integrity check that the linked file exists.

**`apply`.** Never creates, updates, or deletes attachment bytes (same seam as
`chat.jsonl`). Rewriting `description.md` via apply leaves attachments
untouched; only deleting the issue (or apply-pruning it) removes them.

## `apply` doc format

`apply` (`app/server/services/apply.ts`, schema in `apply-schema.ts`) is the
**declarative writer**: it reconciles a subtree from one nested YAML doc,
complementing the imperative one-shot verbs. The doc may be rooted at a Project,
an Epic, or a Story, so a single `apply` can own a whole project, one epic, or
one story's task list. Authoring guidance lives in
[issue-tracker-decompose](skills/issue-tracker-decompose/SKILL.md); this section
is the format + semantics reference.

### Shape

The most common doc describes one Project subtree. Under a Project, each
`children:` entry declares `kind: epic | idea` explicitly so Epics and Ideas can
interleave in one shared sibling `order` space (array index). Below an Epic,
kind is implied by **which child key** a node sits under, never written:

```yaml
project:
  id: my-product              # author-chosen kebab id (required on every node)
  title: My Product
  description: |              # optional inline block scalar -> description.md
    Overview prose.
  children:
    - kind: idea
      id: future-work
      title: Future work
      description: |
        Capture item — mined later into an Epic or Story.
    - kind: epic
      id: my-epic
      title: My Epic
      description: |
        Cross-cutting invariants.
      blockedBy: [other-epic]  # other Epics (same Project) that must finish first
      stories:
        - id: base-story       # a root Story (no `stacked` parent) -> forks main
          title: Base Story
          description: |
            This unit's full prose.
          tasks:
            - id: first-task
              title: First task
              description: |
                Implementor-resolution detail + how to verify.
          stacked:             # Stories that fork off `base-story`
            - id: follow-up
              title: Follow-up
              tasks:
                - id: follow-up-task
                  title: Follow-up task
```

- **Kind at Project vs below Epic.** Under a Project, each `children:` entry
  carries `kind: epic | idea` (Ideas are leaves — no child keys). Below an Epic,
  `stories` are Stories → their `tasks` are Tasks; a Story's `stacked` entries
  are Stories that fork off it.
- **No dual-key / legacy keys.** Project `epics:` is **not** accepted — use
  `children:` with `kind: epic | idea` (refused with
  `project "epics:" is no longer accepted; use "children:" with kind: epic | idea`).
  Nested `branches` / `commits` and a rooted `branch:` are also **not**
  accepted — there is no alias period. Migrate apply docs to `stories` /
  `tasks` and `story:`; rooted `branch:` is refused with an explicit error
  (`"branch:" is no longer accepted; use "story:"`).
- **Inferred `partOf`.** Each node's containment is its enclosing container (a
  Task's Story, a Story's Epic, an Epic or Idea's Project). Never written in
  the doc.
- **Inferred `stackedOn`.** A Story nested under another Story's `stacked`
  forks from it; a Story directly under `stories` is a root Story (forks the
  Epic's base, `main`). Never written in the doc.
- **Explicit `blockedBy`.** The one cross-reference authored by hand: on an
  **Epic** node, a list of other Epic ids (same Project) this Epic depends on.
  Uses the same kebab id rule as node ids.
- **Inline descriptions.** Each node's optional `description` is a block scalar
  (`|`) written to that issue's `description.md`; omitting it on create seeds the
  default `# <title>`. This is what lets authors write Markdown without shell
  escaping.
- **Author-chosen ids** on every node (see the [id model](#on-disk-layout)):
  required, kebab, unique across the doc, slug-safe, title-independent.

### Rooted forms: epic and story scope

A project doc reconciles the whole project, so it prunes every epic and idea the
doc omits. To edit a single epic or story without disturbing its siblings, root
the doc at that node and name the enclosing parents by **id** (a reference —
never upserted, never pruned). Epic- and story-rooted docs never include Ideas
in scope (Ideas are Project children only), so those forms leave Ideas
untouched:

```yaml
# Epic form: reconciles just my-epic within an existing project.
project: my-product        # existing project id (reference)
epic:
  id: my-epic
  title: My Epic
  blockedBy: [ ... ]       # other Epic ids (same Project) that must finish first
  stories: [ ... ]         # same story/task/stacked shape as above
```

```yaml
# Story form: reconciles just my-story + its tasks within an existing epic.
project: my-product        # existing project id (reference)
epic: my-epic              # existing epic id (reference)
story:
  id: my-story
  title: My Story
  tasks: [ ... ]
```

- **Form by root key.** An object `project` is the project form; a string
  `project` + object `epic` is the epic form; string `project` + string `epic` +
  object `story` is the story form.
- **Parents must exist.** The referenced parent(s) must already be on disk with
  the right kind and containment (the epic must be in the project; a pre-existing
  root node must already sit under the declared parent), else the doc is refused.
- **Story scope is story + tasks only.** A story's `stacked` children are
  `partOf` the *Epic*, not the story, so they fall outside a story's subtree; a
  story doc has no `stacked` key and only owns its own task list.
- **Fork point preserved.** `stackedOn` is normally inferred from nesting, but a
  story-rooted doc has no parent nesting, so it **preserves the on-disk
  `stackedOn`** rather than clearing it — a story doc never moves the fork point.

### Semantics

- **Upsert.** A node whose id exists (within the declared root's subtree) is
  updated; a new id is created. Ids are matched, not titles, so retitling a node
  in the doc renames its `title` in place rather than creating a duplicate.
- **Prune by default.** Any issue in the declared root's on-disk subtree that
  the doc no longer lists is deleted. `apply` is therefore the full desired state
  of that root's subtree, not a patch. (An out-of-scope `blockedBy` edge into a
  pruned Epic is dropped, mirroring the [deletion policy](#deletion-policy).)
- **Atomic + validated.** The entire prospective set is run through
  `checkIntegrity` in one pass before any write; a doc that would introduce a
  problem (dangling/wrong-kind referent, cross-Epic `stackedOn`, cycle, duplicate
  or non-slug id, or an id that already exists outside the declared root's
  subtree) is refused with no on-disk change. Same validator, same guarantees as
  the imperative writer.
- **Idempotent.** Re-applying an unchanged doc rewrites nothing (unchanged nodes
  keep their `updatedAt`), so it is safe to re-`apply` an evolving plan. The one
  exception is **stale-key reconciliation:** if an on-disk `issue.json` carries a
  key the current schema no longer recognizes (e.g. a pre-migration story-level
  `blockedBy`, which `parseIssue` strips on read), a re-apply rewrites that file to
  tidy the stale key and counts it as `updated`. Since this is not a semantic
  change, the node keeps its existing `updatedAt`.

### Declarative/imperative field seam

`apply` owns only **plan shape + prose** and must **never** touch runtime state.
This is enforced in `buildIssue`, which reads the doc for its owned fields and
preserves everything else from the existing same-kind issue.

| field | writer |
| --- | --- |
| `title` | `apply` (from the doc) |
| `description` (`description.md`) | `apply` (from the doc) |
| `blockedBy` (Epic) | `apply` (explicit on the Epic node) |
| `retro` (Epic) | imperative only (kind [`set`](#kind-scoped-get--set)); `apply` preserves |
| `workspace` (Project) | imperative only (kind [`set`](#kind-scoped-get--set)); `apply` preserves |
| `mergePolicy` (Project) | imperative only (kind [`set`](#kind-scoped-get--set)); `apply` preserves |
| `kind` | explicit on Project `children:` (`kind: epic | idea`); inferred from nesting below Epic |
| `partOf`, `stackedOn` | inferred from nesting (a story-rooted doc has no nesting, so it preserves the on-disk `stackedOn`); runtime `partOf`/`stackedOn` edits use kind [`set`](#kind-scoped-get--set) |
| `id`, `createdAt` | set on create; `apply` preserves them, never rewrites |
| `status`, `qa`, `commitSha`, `noDiff` (Task) | imperative only (kind [`set`](#kind-scoped-get--set)); `apply` preserves |
| `branchName`, `mergeBase`, `prUrl`, `merged`, `specReview` (Story) | imperative only (kind [`set`](#kind-scoped-get--set); `mergeBase` per [stacked-PR merge model](#the-stacked-pr-merge-model) — not a public setter); `apply` preserves `mergeBase` when `stackedOn` is unchanged |
| `assignee`, `needsAttention`/`attentionReason` | imperative write (kind [`set`](#kind-scoped-get--set); `attentionReason` only via `needsAttention` + `--reason`); read via kind [`get`](#kind-scoped-get--set); `apply` preserves |
| `chat.jsonl` | imperative only (`comment`); `apply` never reads or writes it |
| `attachments/` | imperative only (HTTP attach/detach); `apply` never reads or writes attachment bytes |

So authoring/decomposition is declarative through `apply`, while working the
stack (progress, git facts, escalation, chat, attachments) stays on kind
`get`/`set` and the kept one-shot verbs — the two never fight over a field.

## Derived state

`derive(issues)` (`app/server/services/derive.ts`) is a pure function (no
filesystem) that, given all issues, computes state that is **never stored** and
so cannot drift:

- **Task `blocked`** — a `todo` Task is `blocked` unless its Story
  (`partOf`) exists with a `branchName` and is not merged, and all earlier
  sibling Tasks (by sequence) are `done`.
- **Story base** — same as [base](#derived-terms) (derived display of stored
  `mergeBase` for the tree/detail chips).
- **Story status** — `merged` if `merged`; else `pr-open` if it has Tasks,
  all are `done`, and `prUrl` is set; else `in-progress` if `branchName` is set;
  else `not-started`.
- **Story `blocked`** (to start) — a `not-started` Story is `blocked` when it
  has a `stackedOn` parent whose tip cannot be forked yet: the parent must have
  a `branchName` **and** all the parent's Tasks must be `done` (it forks the
  parent's tip, so there is no merge gate). A root Story (no `stackedOn`) is
  never blocked by stacking.
- **Epic status** — `done` when it has Stories and all are `merged`;
  `in-progress` if any Story has started; else `todo`.
- **Epic `blocked`** — an Epic is `blocked` while any Epic in its `blockedBy` is
  not yet `done` (a blocker is `done` only when it has Stories and all are
  `merged` — so a blocker Epic with **zero Stories is never `done`**, and
  pointing `blockedBy` at an empty Epic blocks the dependent indefinitely).
  Epic `blocked` does **not** cascade onto descendant Stories'/Tasks' own
  `blocked` flags — `tree`/`list` still show per-node stacking/sibling blocking
  under a blocked Epic.
- **problems** — the integrity checks `derive()` runs over the parsed issues:
  dependency cycles over `stackedOn`/`blockedBy`; dangling
  `partOf`/`stackedOn`/`blockedBy` ids; a Story whose `stackedOn` entry is not a
  Story, or an Epic whose `blockedBy` entry is not an Epic; a Story whose
  `stackedOn` is in a different Epic, or an Epic whose `blockedBy` names an Epic
  in a different Project (`stackedOn` stays within one Epic; `blockedBy` stays
  within one Project); a Task whose `partOf` is not a Story; a Story whose
  `partOf` is not an Epic; and an Epic whose `partOf` is not a Project. These are
  only the *derive-time* problems; the
  `problems` array returned by `list()` also includes the *read-time* problems
  raised while loading files (malformed or missing `issue.json`, an id that
  disagrees with its directory name, and malformed `chat.jsonl` lines — see the
  [writer contract](#writer-contract) and [glossary](#derived-terms)).

## Design rationale

**Directory-per-issue is the source of truth (no database).** Issues are plain
files an agent, a human, or git can read and diff. There is no schema migration,
no server required to inspect state, and the on-disk tree *is* the data model.
`description.md`, `chat.jsonl`, and `attachments/` are discovered by convention
from the id (no path fields in `issue.json`), so metadata cannot point at a
missing file. Markdown links into `attachments/` are a separate convention and
may dangle — see [Attachments](#attachments).

<a id="parent-prose-must-not-restate-descendant-lists"></a>

**The complete design lives distributed across tiers.** The Epic replaces a
giant plan/spec only when the whole design is captured in the tree: overview and
cross-cutting invariants in the Epic, standalone unit prose in each Story,
implementor-resolution detail in each Task. Companion material belongs **with
the issue that uses it** — inlined in `description.md` or attached beside it
(link rules in [Attachments](#attachments)). Verbatim copy into the Epic with
empty children is not sufficient — distribution and a completeness pass are
what make the tracker a standalone basis for a future implementor. A parent's
`description.md` MUST NOT enumerate or restate the specific work its children
individually cover. Parent prose carries scope, approach, cross-cutting
invariants, and context; the *enumeration of units* is the child list itself
(Project → its Epics and Ideas, Epic → its Stories, Story → its Tasks) — not a
mirrored per-child checklist in the parent. Children get pruned or reshaped
during plan cleanup, so a parent that mirrors them drifts into orphan claims.

**A validated service layer is the only writer.** The CLI (for agents) and the
HTTP routes (for the UI) are thin adapters over `services/issues.ts` (and
`services/attachments.ts` for attachment bytes). Every write goes through the
same validation, partial-merge, and serialization, so an issue cannot be left
in a broken state regardless of who wrote it. Integrity is enforced at the
source rather than trusted at each call site.

**Derived, not stored.** Anything that can be computed from the whole set —
Story/Epic status, `blocked`, base — is computed by the pure `derive()`
and never written to disk. Stored duplicates of derived facts are the classic
source of drift; by refusing to store them, the tracker cannot show a status
that disagrees with reality. A Task's `status` (the one genuine human/agent
decision) and sibling `order` (authored implicitly via doc position or
imperative append) are stored.

**Metadata-only with respect to git.** The tracker never shells out to git or
gh. Agents run git/gh themselves and record the results — `branchName`, `prUrl`,
`commitSha`, `merged` — through the CLI. The tracker's job is to model the
stacked-PR *plan* and its progress, not to drive git. This keeps it safe to run
anywhere and impossible for it to corrupt a repo.

**Correct-by-construction over defensive layering.** Malformed files and
integrity violations become `problems` that are surfaced in the UI and CLI, not
errors that are swallowed or states that are silently repaired. A write that
would introduce a problem is refused up front.
