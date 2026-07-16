# issue-tracker: glossary + design rationale

This is the canonical glossary for the issue-tracker plugin, referenced by both
skills. It defines every term the code, docs, and UI use, and explains the
design decisions that make the model correct-by-construction. Read it before
authoring issues or changing tracker code.

The tracker models work as a tree of **Project > Epic > Branch > Commit** nodes
that maps directly onto git stacked PRs. A directory per issue on disk is the
sole source of truth; a validated service layer
(`issues.ts` + sibling writers such as `attachments.ts`) is the only sanctioned
writer; all state that could drift is derived, never stored.

## Glossary

### Kinds

Every issue has a `kind`, one of four tiers:

- **Project** — the top-level container that groups related Epics. Purely
  organizational: it carries **no status** (derived or stored) and none of the
  assignee/needs-attention fields — a `title`, a `description.md` overview, and
  an optional `workspace` (the absolute path to the local git checkout this
  Project covers; repo-touching agents run there — see [workspace](#project-workspace)).
  Has no `partOf`.
- **Epic** — a body of work (replaces a giant plan/spec). Contains Branches; its
  `description.md` holds the spec. Carries `blockedBy` (a list of other Epic ids
  in the same Project that must finish first). Has **no stored status** — its
  status is fully derived from descendants. Is `partOf` a Project (required).
- **Branch** — a unit that becomes one git branch and one PR. Contains Commits.
  Carries `branchName`, `stackedOn`, `mergeBase`, `prUrl`, `merged`,
  `specReview`. Status is derived, never stored.
- **Commit** — an atomic, story-point-sized unit implemented as one git commit.
  Each Commit is a **small but standalone cross-section** of the work: after it
  lands on the Branch tip, the package must still **build** and tests must remain
  **meaningful** (vertical slices, not horizontal layers such as types-only,
  wire-up-later, or half-migrations that do not compile). The only kind with a
  **stored** `status` (`todo` / `in-progress` / `done`), an optional `commitSha`
  (set when done with a real git commit), and an optional `noDiff` flag (set by
  `issue set-no-diff` when the implementor deliberately lands no file changes).

### Relationships

Three relationships, each with a distinct, non-overlapping role:

- **partOf** — *containment*: the node this one belongs to. A Commit is `partOf`
  a Branch; a Branch is `partOf` an Epic; an Epic is `partOf` a Project. It points
  exactly one tier up and builds the tree. Projects have none.
- **stackedOn** — *the single git fork point* of a Branch: which one Branch it
  forks from. Branch-only, always singular, and strictly within one Epic. Absent
  means it forks off the Epic's base (`main`). It is the **sole** inter-Branch
  edge, so within an Epic the Branches form a forest of independent stacks — a
  tree, never a DAG, with no internal merge gate.
- **blockedBy** — *cross-Epic ordering*: a list of other Epic ids **in the same
  Project** that must finish (all their Branches merged) before this Epic can
  start. Epic-only, and the only edge that crosses an Epic boundary. This is what
  makes the Epic-level dependency graph a DAG.

#### The diamond (why a multi-parent dependency becomes a new Epic)

The one thing a single `stackedOn` fork point cannot express is a unit that needs
code from **two** parallel Branches at once (the classic diamond: Branches A and
B both fork `main`, worked in parallel, and C needs both). Rather than
reintroduce a Branch-level multi-parent edge — which would force a merge gate
*inside* an Epic and break the "one Epic run = one clean, bottom-up-mergeable
stack of PRs" property — we resolve it at the Epic boundary: split the dependent
unit into a **new Epic that is `blockedBy` the Epic holding the parallel
Branches** (A and B). The tradeoff is
deliberate: keeping A and B in one Epic preserves their parallelism (two
independent stacks, no gate between them), while moving C into a second Epic makes
it wait for the whole blocking Epic to *merge* first — coarser, but landing
exactly where a merge round-trip is natural (a human-paced Epic boundary) instead
of stalling a stack mid-flight.

#### The stacked-PR merge model

Every Branch has a stored **`mergeBase`**: the git ref that `start-branch`
checks out from and that `finish-branch` targets for PR/merge. It is **not**
re-derived from `stackedOn` at git time.

- **Root** (no `stackedOn`): `mergeBase = main` at create / `apply`.
- **Stacked child**: set to the parent's `branchName` when the parent is
  already named at child create / `apply`; otherwise left unset until the
  parent's first `set-branch-name`, which fills empty child `mergeBase`s in
  the same command.
- **On `set-merged`**: every child with `stackedOn = parent` gets
  `child.mergeBase = parent.mergeBase` (idempotent). That is how a stack
  retargets after the parent lands — typically onto `main`. Open GitHub PRs
  are retargeted by GitHub itself; the tracker does not run PR-base CLI — see
  [Project merge policy](#project-merge-policy).
- **Rename guard**: once a Branch has a `branchName` and any child is
  stacked on it, `set-branch-name` refuses a real rename (same-value no-op
  still allowed). Empty-only cascade on first name is enough because children
  cannot be left pointing at a stale parent name.

A stack still lands bottom-up: finish the parent first, then each child.
Consequently **each Branch must be independently mergeable** into its
`mergeBase` — merging it must leave that base building and self-consistent.
Only Branches merge; Commits are internal steps that ship together as their
Branch's single PR, so an individual Commit need not be *shippable* alone but
the Branch as a whole must be. A Commit *must* still leave the Branch tip
**buildable and testable** — see [Commit](#kinds). Never split one cohesive
change across separate Branches such that merging one would leave the base
broken (for example a schema change in one Branch and the code that consumes
it in another): keep it in one Branch as multiple Commits.

Under `pull-request` / `manual` [merge policies](#project-merge-policy), each
finished Branch is planned as a PR against its stored `mergeBase` (after
parent merge, usually `main`). The local `merge` policy integrates each
finished Branch directly into that same stored `mergeBase` with no PR, so a
stack still lands bottom-up but never touches a remote PR.

### Derived terms

These are computed by `derive()` and never written to disk (see
[Derived state](#derived-state)):

- **Stack** — the emergent set of dependent, not-yet-merged Branches under an
  Epic, induced solely by `stackedOn`: a forest of independent stacks (each a
  tree), never a cross-Branch DAG.
- **ready / blocked** — whether an issue can be picked up right now.
- **Ready view** — a flat list of the ready issues, for quick pick-up and for a
  main agent to fan out parallel subagents.
- **Branch status** — `not-started` / `in-progress` / `pr-open` / `merged`.
- **Epic status** — `todo` / `in-progress` / `done` (rollup of its Branches).
- **base** — display of a Branch's stored `mergeBase` (tree chip `base=<ref>`,
  or `base=(unset)` when `mergeBase` is absent). Never re-derived from
  `stackedOn`.
- **needs-attention** — an escalation flag (`needsAttention` + `attentionReason`),
  orthogonal to status; any kind can carry it.
- **assignee** — who currently owns an issue (e.g. `human` or an agent id).
- **specReview** — a Branch-only machine-readable spec-review gate (`passed` /
  `failed`; absent until set by `issue set-spec-review`). Surfaced in the detail
  panel when set; omitted from the tree outline.
- **noDiff** — a Commit-only signal that the implementor intentionally landed no
  file changes (`true`; absent until set by `issue set-no-diff`). Surfaced in the
  detail panel when set; omitted from the tree outline. An empty working tree
  alone is **not** a completion signal — see [Finish commit](#finish-commit).
- **problems** — integrity issues that are surfaced, never silently ignored:
  dependency cycles, dangling `partOf`/`stackedOn`/`blockedBy` ids, kind
  violations, and malformed/invalid files.

## On-disk layout

The `issues/` directory holds one directory per issue; it is the source of
truth (no database).

```
issues/<id>/
  issue.json        # metadata + relationships (machine-readable)
  description.md    # the spec/description (for an Epic, the plan). GFM; may contain issue: links
  chat.jsonl        # append-only per-issue chat, one message object per line
  attachments/      # optional; opaque files (Canvas .tsx, images, fixtures) for Epic/Branch/Commit
```

- `description.md` and `chat.jsonl` are discovered **by convention** from `<id>`
  (there are no path fields, so there can be no dangling file refs). Both are
  optional; absent means empty.
- `attachments/` is likewise by convention: no manifest; scan the directory.
  Allowed on Epic, Branch, and Commit only (not Project). See
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
| `kind` | `"project"` \| `"epic"` \| `"branch"` \| `"commit"` | discriminator |
| `title` | string | non-empty |
| `order` | int | sibling position within its parent group; defaults `0` |
| `createdAt` | ISO string | set at create |
| `updatedAt` | ISO string | bumped on every write |

Common to **Epic / Branch / Commit** (but **not** Project):

| field | type | notes |
| --- | --- | --- |
| `assignee` | string? | optional |
| `needsAttention` | boolean | defaults `false` |
| `attentionReason` | string \| null | defaults `null` |

Project — the common-to-every-kind fields plus:

| field | type | notes |
| --- | --- | --- |
| `workspace` | string? | absolute path to the local git checkout this Project covers; the cwd repo-touching agents run in (see [Project workspace](#project-workspace)) |
| `mergePolicy` | `"merge"` \| `"pull-request"` \| `"manual"` | what git `finish-branch` does after a Branch's last Commit is done; defaults `manual` (see [Project merge policy](#project-merge-policy)) |

No `partOf`, no status, no assignee/needs-attention. Its `description.md` is a
short overview of the Project.

### Project workspace

A Project's optional `workspace` is the absolute path to the local git checkout
its Epics' work lands in. It is set with `issue set-workspace <projectId> <path>`
(cleared with `--clear`) and surfaced on the Project node by both `issue show`
(a `workspace:` line) and `issue summary` (a `Workspace:` line under the Project).

The field exists so the work loop's **repo-touching subagents** (git,
implementor, and both validators) know where to operate. The coordinator and the
model discriminator do no repo work, so neither needs a workspace. The contract
below is the single source of truth; the agent files (`agents/*.md`) and the work
skill point here rather than restating it.

**Resolution.** A repo-touching subagent reads its own bootstrap
`issue summary <id>` output — never a value inlined in its Task prompt (a
coordinator must not pass one, but if one leaks in, ignore it). From that output:

- the workspace is the `Workspace:` line under the Project;
- the project id is the id on the `Project: <id> — <title>` line (used to build
  the attention message and, for git finish-branch, to look up the Project's
  [merge policy](#project-merge-policy) via `issue show <projectId>`; do not
  re-derive ancestry any other way).

**Use as cwd.** Run **every** repo command — git, builds, tests, and any
file-edit / diff-inspection — with the workspace path as the shell working
directory (pass it as the tool's `working_directory`, or `cd` into it first);
never rely on the ambient cwd for repo work. The `issue` CLI is exempt: it
resolves its issues dir from its own install location, so it works from any cwd —
keep invoking it as-is.

**Unset → escalate, never fall back.** If `issue summary` prints no `Workspace:`
line, do **not** touch any repo. Raise
`issue attention <epicId> --reason "Project workspace unset — set it with 'issue set-workspace <projectId> <path>'"`
(substituting the ids) and stop. Attention always lands on the **Epic**: a
Project carries no needs-attention fields, so it is never the target.

**Coordinator preflight.** Because the missing-workspace failure otherwise only
surfaces once a repo subagent is spawned, the work-loop coordinator checks for
the `Workspace:` line up front (in Setup) and hands back to the user before
spawning anything if it is absent.

### Project merge policy

A Project's `mergePolicy` decides what happens to a Branch once its last Commit
is `done`. It is set with `issue set-merge-policy <projectId> <policy>` and read
off the Project node by `issue show <projectId>` (a `mergePolicy:` line). It
defaults to **`manual`**, matching today's posture where a human opens and
merges PRs.

The work loop **always** finishes a Branch by spawning the git subagent in
`finish-branch` mode; the coordinator never reads or branches on `mergePolicy`.
Only the git subagent interprets it, from `issue show <projectId>`, so there is
exactly one reader and the skill can never contradict the field. `finish-branch`
runs in the Project workspace (same cwd rules as above) and applies:

- **`manual`** — no-op. Nothing is pushed, opened, or merged; a human handles
  the PR later. (Default.)
- **`pull-request`** — push the Branch and open a **draft** PR against its
  stored `mergeBase`, then record the url via `issue open-pr <branchId>
  <url>`. It does **not** wait for merge or set `merged`, so the Branch
  derives to `pr-open`.
- **`merge`** — merge the Branch into its stored `mergeBase`, push that ref,
  and set `merged` via `issue set-merged <branchId>` (Branch derives to
  `merged`). This is the local, no-PR integration path. `set-merged`
  cascades `child.mergeBase = parent.mergeBase` for stacked children (see
  [stacked-PR merge model](#the-stacked-pr-merge-model)). When a parent
  lands, **GitHub retargets** open child PRs; the tracker only updates
  metadata — finish-branch never runs `gh pr edit --base` (or any PR
  retarget CLI).

**Resumable / idempotent.** The work loop is resumable, so finish-branch may run
twice for the same Branch. Before acting, the git subagent reads the Branch's
`prUrl` / `merged` (via `issue show <branchId>`) and no-ops when the policy's end
state already holds — `merged` set for `merge`, `prUrl` set for `pull-request` —
so a re-run never opens a duplicate PR or re-merges.

**Failure and recovery.** On failure the git subagent raises `issue attention` on
the Branch and stops. A `merge` conflict is aborted (`git merge --abort`) so the
`mergeBase` ref is never left half-merged; but a *completed* local merge whose
`push` failed is left in place — with `merged` still unset it is exactly the
resumable state above, so the retry just re-pushes.

Epic — the Epic/Branch/Commit common fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Project id (required) |
| `blockedBy` | string[] | other Epic ids in the same Project that must finish first; defaults `[]`; the only cross-Epic edge |

Branch — the Epic/Branch/Commit common fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Epic id (required) |
| `branchName` | string? | set once the git branch is created; rename refused while stacked children exist |
| `stackedOn` | string? | single fork-point Branch id (must be in the same Epic); absent => root |
| `mergeBase` | string? | stored git ref for start-branch / finish-branch; root defaults `main`; see [stacked-PR merge model](#the-stacked-pr-merge-model) |
| `prUrl` | string? | optional |
| `merged` | boolean | defaults `false`; `set-merged` cascades child `mergeBase` |
| `specReview` | `"passed"` \| `"failed"`? | absent until set by `issue set-spec-review`; machine-readable spec-review gate |

Commit — the Epic/Branch/Commit common fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Branch id (required) |
| `status` | `"todo"` \| `"in-progress"` \| `"done"` | defaults `todo`; the only stored status |
| `commitSha` | string? | set when done |
| `noDiff` | boolean? | absent until set by `issue set-no-diff`; signals an intentional empty implementor diff |

Deliberately excluded: `rank`/priority (sibling order is stored as `order`, not
authored as a separate priority field), `label`, inline
`description`/`messages` (they are separate files), and status history.

### Finish commit

When the work loop spawns the git subagent in `finish-commit` mode, it finalizes
one Commit. The coordinator never inspects the working tree or the `noDiff` flag —
only the git subagent does. The subagent reads the Commit's `noDiff` (via
`issue summary` / `issue show`) and the working-tree state (`git status`), then
applies:

| `noDiff` | Tree | Action |
| --- | --- | --- |
| `true` | clean (empty) | `issue set-status <commitId> done` only — no `git commit`, no `set-commit`; leave `noDiff` set. |
| `true` | dirty | Escalate — the flag contradicts a non-empty tree. |
| absent / `false` | clean (empty) | Escalate — an empty tree without `noDiff` is not a completion signal. |
| absent / `false` | dirty | Stage all changes (`git add -A`), `git commit -m "<Commit title>"`, `issue set-status <commitId> done`, `issue set-commit <commitId> $(git rev-parse HEAD)`. |

The implementor sets `noDiff` with `issue set-no-diff <commitId> true` (and
explains why in chat) when the correct outcome is no file changes; validators and
the git subagent honor the flag. Clearing it (`issue set-no-diff <commitId> false`)
is required if a revision later lands file changes.

**Tree nesting and sibling order.** The tree nests a Branch under the Branch it
forks from: a Branch renders as a child of its `stackedOn` Branch (which must be
in the same Epic — see below), so indentation mirrors the git stack depth. A
Branch with no `stackedOn` is a *root* Branch, rendered directly under its Epic.
Under a Branch, its own Commits render first, then the Branches stacked on it.
Branch order is therefore **pure stacked depth-first** over `stackedOn` alone;
`blockedBy` plays no part in it (it is an Epic-level edge, surfaced in the Epic's
detail panel and used only to gate the Epic's derived `blocked` state — i.e.
which subtrees the Ready set omits, not sibling order). Within one nesting level,
siblings are ordered strictly by stored `order` (never `createdAt` or `id`). Root
Branches under an Epic are traversed depth-first (each root immediately followed
by what stacks on it); siblings at every level sort by `order`. Epics and Projects
sort by `order`. Duplicate `order` within a sibling group is an integrity problem.

**Projects scope the view.** A Project is the top-level container: every Epic is
`partOf` exactly one Project. The web UI lists Projects in a sidebar; selecting
one scopes the tree and the Ready view to that Project's subtree (its Epics and
their Branches/Commits). Projects themselves are not rendered as nodes inside the
tree — they are the selectable root. Projects are ordered by `order`.

**Stored `order`.** Every issue carries an integer `order` within its sibling
group. Authors never write it in an apply doc — `apply` infers it from array
position (and rejects an explicit `order` key). Imperative `create` appends
(`max + 1`); reparenting without an explicit `order` patch re-appends in the new
group. The ready set is emitted in structural DFS order (each level sorted by
`order`), never by `id` or `createdAt`.

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
  state + the ready set + all `problems`. Malformed dirs/files and malformed
  chat lines are collected into `problems`, never thrown.
- `read(id)` — returns one issue with its `description` and a content `version`.
- `create(input)` — generates the id/slug (with collision suffix) and
  timestamps, links `partOf`, and writes the dir + `issue.json` +
  `description.md`.
- `update(id, patch)` — **partial merge**, never a blind overwrite; bumps
  `updatedAt`. The mergeable fields are `title`, `assignee`, `needsAttention`/
  `attentionReason`, `partOf`, the kind-specific fields (`blockedBy` for an Epic;
  `status`/`commitSha`/`noDiff` for a Commit;
  `branchName`/`stackedOn`/`mergeBase`/`prUrl`/`merged`/`specReview` for a
  Branch), and `description` (written to `description.md`). Clearable fields are removed
  when patched to `null`. A patch that names a field not valid for the issue's
  kind is rejected.
- `remove(id)` — deletes the issue and its containment subtree, repairing every
  surviving reference into it (see [Deletion policy](#deletion-policy)). Exposed
  over HTTP as `DELETE /api/issues/:id` and via the CLI `delete` command.
- `appendMessage(id, {role, name?, body})` — appends one JSONL line to
  `chat.jsonl` with a server-stamped `at`.
- `readChat(id)` — reads/parses `chat.jsonl`, skipping malformed lines into
  `problems`.
- Attachment bytes (`attachments.ts`): `listAttachments` / `getAttachment` /
  `putAttachment` (upsert) / `removeAttachment` — see [Attachments](#attachments).
  Not part of `read(id)` payloads.

### Cross-cutting guarantees

- **Validate-at-write.** `create`/`update` run the integrity checks against the
  *prospective* state and refuse any write that would introduce a `problem` — a
  bad or missing `partOf`/`stackedOn`/`blockedBy` referent, a referent of the
  wrong kind (a Commit's `partOf` must be a Branch, a Branch's an Epic, an Epic's
  a Project; a `stackedOn` must be a Branch, a `blockedBy` entry an Epic), a
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

- **Commit** — removes only that Commit (Commits have no children).
- **Branch** — removes the Branch and every Commit `partOf` it.
- **Epic** — removes the Epic, every Branch `partOf` it, and every Commit
  `partOf` those Branches (transitive).
- **Project** — removes the Project and its entire subtree: every Epic `partOf`
  it, every Branch `partOf` those Epics, and every Commit `partOf` those Branches
  (transitive). Deleting a Project therefore discards all of its work; the UI
  gates this behind a confirmation dialog that names the contained-issue count.

**Foreign-reference resolution.** After the delete set is computed, every
surviving issue (across all Projects, not just descendants) is scanned for edges
into it, and each edge type resolves deterministically:

| edge into delete set | resolution |
| --- | --- |
| `partOf` | Cannot survive — the referrer is itself contained, so it is already in the delete set. No repair needed. |
| `stackedOn` (a deleted Branch; always same-Epic) | **Splice**: repoint the surviving Branch to the deleted branch's own `stackedOn`, walking up until a surviving Branch, or absent (forks `main`) if none. Preserves the stack minus the removed node. |
| `blockedBy` (a deleted Epic; cross-Epic, same Project) | **Drop**: remove the deleted Epic id from the blocked Epic's list, with no inheritance. This is the case that matters for Epic deletion, since `blockedBy` is the only edge that crosses an Epic boundary. |
| `stackedOn` → a deleted Commit/Epic, or `blockedBy` → a deleted Branch/Commit | Impossible — `stackedOn` only ever references a Branch, and `blockedBy` only ever references an Epic. |

`issue:` cross-links inside `description.md` are freeform Markdown, not
validated relationships, so they are left untouched.

Deleting an issue removes its whole directory (`rmSync` recursive), so any
`attachments/` under that directory go with it — both imperative `remove` and
`apply` prune. There is no separate attachment-cascade step.

**Invariant.** After `remove()`, `list().problems` gains no new
dangling-reference, wrong-kind, or cycle problem — guaranteed by construction in
`planDeletion()` and re-validated against the surviving set before any write.

## Attachments

Opaque files that travel with an Epic, Branch, or Commit (e.g. Cursor Canvases
as `.tsx`, images, small fixtures). Owned by `app/server/services/attachments.ts`,
a sibling writer whose per-file get/put/remove share the same `serialize` chain
as `issues.ts` writes; `listAttachments` is unsynchronized.

**Kinds.** Attach / list / download / detach only on Epic, Branch, and Commit.
Project (and unknown ids) are refused.

**On-disk.** `issues/<id>/attachments/<basename>` — no manifest; metadata is
filename + size + mtime, with MIME inferred from the extension
(`application/octet-stream` when unknown).

**Limits.** Path-safety only: reject empty names, `.`, `..`, `/`, `\`, null
bytes, and any name that is not a plain basename. No extension allowlist.
**25 MiB** max per file (`MAX_ATTACHMENT_BYTES`).

**Upsert.** Putting a name that already exists replaces the bytes. There is no
rename verb — re-attach under the new basename and detach the old.

**HTTP** (thin adapter over the service; payloads are not embedded in
`GET /api/issues/:id`):

| method | path | behavior |
| --- | --- | --- |
| `GET` | `/api/issues/:id/attachments` | list metadata |
| `POST` | `/api/issues/:id/attachments` | multipart `file` upload; stored name = basename of uploaded filename; upsert |
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
an Epic, or a Branch, so a single `apply` can own a whole project, one epic, or
one branch's commit list. Authoring guidance lives in
[issue-tracker-decompose](skills/issue-tracker-decompose/SKILL.md); this section
is the format + semantics reference.

### Shape

The most common doc describes one Project subtree. Kind is implied by **which
child key** a node sits under, never written:

```yaml
project:
  id: my-product              # author-chosen kebab id (required on every node)
  title: My Product
  description: |              # optional inline block scalar -> description.md
    Overview prose.
  epics:
    - id: my-epic
      title: My Epic
      description: |
        Cross-cutting invariants.
      blockedBy: [other-epic]  # other Epics (same Project) that must finish first
      branches:
        - id: base-branch      # a root Branch (no `stacked` parent) -> forks main
          title: Base Branch
          description: |
            This unit's full prose.
          commits:
            - id: first-commit
              title: First commit
              description: |
                Implementor-resolution detail + how to verify.
          stacked:             # Branches that fork off `base-branch`
            - id: follow-up
              title: Follow-up
              commits:
                - id: follow-up-commit
                  title: Follow-up commit
```

- **Kind by nesting.** `project` → its `epics` are Epics → their `branches` are
  Branches → their `commits` are Commits; a Branch's `stacked` entries are
  Branches that fork off it.
- **Inferred `partOf`.** Each node's containment is its enclosing container (a
  Commit's Branch, a Branch's Epic, an Epic's Project). Never written in the
  doc.
- **Inferred `stackedOn`.** A Branch nested under another Branch's `stacked`
  forks from it; a Branch directly under `branches` is a root Branch (forks the
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

### Rooted forms: epic and branch scope

A project doc reconciles the whole project, so it prunes every epic the doc
omits. To edit a single epic or branch without disturbing its siblings, root the
doc at that node and name the enclosing parents by **id** (a reference — never
upserted, never pruned):

```yaml
# Epic form: reconciles just my-epic within an existing project.
project: my-product        # existing project id (reference)
epic:
  id: my-epic
  title: My Epic
  blockedBy: [ ... ]       # other Epic ids (same Project) that must finish first
  branches: [ ... ]        # same branch/commit/stacked shape as above
```

```yaml
# Branch form: reconciles just my-branch + its commits within an existing epic.
project: my-product        # existing project id (reference)
epic: my-epic              # existing epic id (reference)
branch:
  id: my-branch
  title: My Branch
  commits: [ ... ]
```

- **Form by root key.** An object `project` is the project form; a string
  `project` + object `epic` is the epic form; string `project` + string `epic` +
  object `branch` is the branch form.
- **Parents must exist.** The referenced parent(s) must already be on disk with
  the right kind and containment (the epic must be in the project; a pre-existing
  root node must already sit under the declared parent), else the doc is refused.
- **Branch scope is branch + commits only.** A branch's `stacked` children are
  `partOf` the *Epic*, not the branch, so they fall outside a branch's subtree; a
  branch doc has no `stacked` key and only owns its own commit list.
- **Fork point preserved.** `stackedOn` is normally inferred from nesting, but a
  branch-rooted doc has no parent nesting, so it **preserves the on-disk
  `stackedOn`** rather than clearing it — a branch doc never moves the fork point.

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
  key the current schema no longer recognizes (e.g. a pre-migration branch-level
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
| `workspace` (Project) | imperative only (`set-workspace`); `apply` preserves |
| `mergePolicy` (Project) | imperative only (`set-merge-policy`); `apply` preserves |
| `kind`, `partOf`, `stackedOn` | `apply`, but **inferred from nesting**, not authored directly (a branch-rooted doc has no nesting, so it preserves the on-disk `stackedOn`) |
| `id`, `createdAt` | set on create; `apply` preserves them, never rewrites |
| `status`, `commitSha`, `noDiff` (Commit) | imperative only (`set-status`/`set-commit`/`set-no-diff`); `apply` preserves |
| `branchName`, `mergeBase`, `prUrl`, `merged`, `specReview` (Branch) | imperative only (`set-branch-name`/`open-pr`/`set-merged`/`set-spec-review`; `mergeBase` is written by create/`apply` defaults and those cascades — not a public setter); `apply` preserves an existing `mergeBase` |
| `assignee`, `needsAttention`/`attentionReason` | imperative write (`assign`/`attention`); read via `assignee`; `apply` preserves |
| `chat.jsonl` | imperative only (`comment`); `apply` never reads or writes it |
| `attachments/` | imperative only (HTTP attach/detach); `apply` never reads or writes attachment bytes |

So authoring/decomposition is declarative through `apply`, while working the
stack (progress, git facts, escalation, chat, attachments) stays on the
one-shot imperative verbs — the two never fight over a field.

## Derived state

`derive(issues)` (`app/server/services/derive.ts`) is a pure function (no
filesystem) that, given all issues, computes state that is **never stored** and
so cannot drift:

- **Commit `ready`** — `status === "todo"`, its Branch (`partOf`) exists with a
  `branchName` and is not merged, and all earlier sibling Commits (by sequence)
  are `done`. A `todo` Commit that is not ready is `blocked`.
- **Branch base** — same as [base](#derived-terms) (derived display of stored
  `mergeBase` for the tree/detail chips).
- **Branch status** — `merged` if `merged`; else `pr-open` if it has Commits,
  all are `done`, and `prUrl` is set; else `in-progress` if `branchName` is set;
  else `not-started`.
- **Branch `ready`** (to start) — a root Branch (no `stackedOn`) is ready
  immediately; a stacked Branch is ready once its `stackedOn` parent has a
  `branchName` (its tip exists to fork) **and** all the parent's Commits are
  `done` (it forks the parent's tip, so there is no merge gate). A `not-started`
  Branch that is not ready is `blocked`.
- **Epic status** — `done` when it has Branches and all are `merged`;
  `in-progress` if any Branch has started; else `todo`.
- **Epic `blocked`** — an Epic is `blocked` while any Epic in its `blockedBy` is
  not yet `done` (a blocker is `done` only when it has Branches and all are
  `merged` — so a blocker Epic with **zero Branches is never `done`**, and
  pointing `blockedBy` at an empty Epic blocks the dependent indefinitely). A
  blocked Epic surfaces **nothing** in the Ready set — none of its Branches or
  Commits appear until every blocker has merged. This is purely a Ready-set
  filter over the whole subtree; it does **not** set the descendant Branches'/
  Commits' own `blocked` flags, so `tree`/`list` can still show an
  individually-ready Branch or Commit under a blocked Epic even though `ready`
  omits it.
- **Ready set** — the flat list behind the Ready view: ready Commits, plus ready
  Branches that are still `not-started`, sorted by sequence, and skipping every
  Branch/Commit under a blocked Epic.
- **problems** — the integrity checks `derive()` runs over the parsed issues:
  dependency cycles over `stackedOn`/`blockedBy`; dangling
  `partOf`/`stackedOn`/`blockedBy` ids; a Branch whose `stackedOn` entry is not a
  Branch, or an Epic whose `blockedBy` entry is not an Epic; a Branch whose
  `stackedOn` is in a different Epic, or an Epic whose `blockedBy` names an Epic
  in a different Project (`stackedOn` stays within one Epic; `blockedBy` stays
  within one Project); a Commit whose `partOf` is not a Branch; a Branch whose
  `partOf` is not an Epic; and an Epic whose `partOf` is not a Project. These are
  only the *derive-time* problems; the
  `problems` array returned by `list()` also includes the *read-time* problems
  raised while loading files (malformed or missing `issue.json`, an id that
  disagrees with its directory name, and malformed `chat.jsonl` lines — see the
  [writer contract](#writer-contract) and [glossary](#derived-terms)).

The Ready set is what lets an agent reconstruct "where to pick up" without any
external state: it surfaces the next actionable Commits (in active, unmerged
Branches) and the next startable Branches.

## Design rationale

**Directory-per-issue is the source of truth (no database).** Issues are plain
files an agent, a human, or git can read and diff. There is no schema migration,
no server required to inspect state, and the on-disk tree *is* the data model.
`description.md`, `chat.jsonl`, and `attachments/` are discovered by convention
from the id (no path fields in `issue.json`), so metadata cannot point at a
missing file. Markdown links into `attachments/` are a separate convention and
may dangle — see [Attachments](#attachments).

**The complete design lives distributed across tiers.** The Epic replaces a
giant plan/spec only when the whole design is captured in the tree: overview and
cross-cutting invariants in the Epic, standalone unit prose in each Branch,
implementor-resolution detail in each Commit. Companion material belongs **with
the issue that uses it** — inlined in `description.md` or attached beside it
(link rules in [Attachments](#attachments)). Verbatim copy into the Epic with
empty children is not sufficient — distribution and a completeness pass are
what make the tracker a standalone basis for a future implementor.

**A validated service layer is the only writer.** The CLI (for agents) and the
HTTP routes (for the UI) are thin adapters over `services/issues.ts` (and
`services/attachments.ts` for attachment bytes). Every write goes through the
same validation, partial-merge, and serialization, so an issue cannot be left
in a broken state regardless of who wrote it. Integrity is enforced at the
source rather than trusted at each call site.

**Derived, not stored.** Anything that can be computed from the whole set —
Branch/Epic status, ready/blocked, base branch, the ready set — is computed by
the pure `derive()` and never written to disk. Stored duplicates of derived
facts are the classic source of drift; by refusing to store them, the tracker
cannot show a status that disagrees with reality. A Commit's `status` (the one
genuine human/agent decision) and sibling `order` (authored implicitly via doc
position or imperative append) are stored.

**Metadata-only with respect to git.** The tracker never shells out to git or
gh. Agents run git/gh themselves and record the results — `branchName`, `prUrl`,
`commitSha`, `merged` — through the CLI. The tracker's job is to model the
stacked-PR *plan* and its progress, not to drive git. This keeps it safe to run
anywhere and impossible for it to corrupt a repo.

**Correct-by-construction over defensive layering.** Malformed files and
integrity violations become `problems` that are surfaced in the UI and CLI, not
errors that are swallowed or states that are silently repaired. A write that
would introduce a problem is refused up front.
