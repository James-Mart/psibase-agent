# issue-tracker: glossary + design rationale

This is the canonical glossary for the issue-tracker plugin, referenced by both
skills. It defines every term the code, docs, and UI use, and explains the
design decisions that make the model correct-by-construction. Read it before
authoring issues or changing tracker code.

The tracker models work as a tree of **Project > Epic > Branch > Commit** nodes
that maps directly onto git stacked PRs. A directory per issue on disk is the
sole source of truth; one validated service layer is the only sanctioned writer;
all state that could drift is derived, never stored.

## Glossary

### Kinds

Every issue has a `kind`, one of four tiers:

- **Project** — the top-level container that groups related Epics. Purely
  organizational: it carries **no status** (derived or stored) and none of the
  assignee/needs-attention fields — only a `title` and a `description.md`
  overview. Has no `partOf`.
- **Epic** — a body of work (replaces a giant plan/spec). Contains Branches; its
  `description.md` holds the spec. Has **no stored status** — its status is fully
  derived from descendants. Is `partOf` a Project (required).
- **Branch** — a unit that becomes one git branch and one PR. Contains Commits.
  Carries `branchName`, `stackedOn`, `blockedBy`, `prUrl`, `merged`. Status is
  derived, never stored.
- **Commit** — an atomic, story-point-sized unit implemented as one git commit.
  The only kind with a **stored** `status` (`todo` / `in-progress` / `done`) and
  a `commitSha` (set once done).

### Relationships

Three relationships, each with a distinct, non-overlapping role:

- **partOf** — *containment*: the node this one belongs to. A Commit is `partOf`
  a Branch; a Branch is `partOf` an Epic; an Epic is `partOf` a Project. It points
  exactly one tier up and builds the tree. Projects have none.
- **stackedOn** — *the single git fork point* of a Branch: which one Branch it
  forks from. Branch-only and always singular. Absent means it forks off the
  Epic's base (`main`).
- **blockedBy** — *additional dependencies beyond the fork point*: a list of
  Branches that must merge before this Branch can start. Branch-only. This is
  what makes the branch/PR graph a DAG rather than a plain tree.

#### The diamond (why both `stackedOn` and `blockedBy` exist)

Branches A and B both fork off `main` and are worked in parallel. Branch C needs
the code from *both*. A git branch forks from exactly one point, so we record
`C.stackedOn = A` (C physically forks from A) and `C.blockedBy = [B]` (C also
depends on B, but does not fork from it). Collapsing this to a single linear
chain `A -> B -> C` would destroy the A/B parallelism; keeping `stackedOn`
singular and `blockedBy` a list preserves it. `stackedOn` answers "what is my
git base?"; `blockedBy` answers "what else must land first?".

### Derived terms

These are computed by `derive()` and never written to disk (see
[Derived state](#derived-state)):

- **Stack** — the emergent set of dependent, not-yet-merged Branches under an
  Epic (a tree/DAG, not necessarily linear), induced by `stackedOn`/`blockedBy`.
- **ready / blocked** — whether an issue can be picked up right now.
- **Ready view** — a flat list of the ready issues, for quick pick-up and for a
  main agent to fan out parallel subagents.
- **Branch status** — `not-started` / `in-progress` / `pr-open` / `merged`.
- **Epic status** — `todo` / `in-progress` / `done` (rollup of its Branches).
- **base** — the git branch a Branch forks from (its `stackedOn`'s `branchName`,
  else `main`).
- **needs-attention** — an escalation flag (`needsAttention` + `attentionReason`),
  orthogonal to status; any kind can carry it.
- **assignee** — who currently owns an issue (e.g. `human` or an agent id).
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
```

- `description.md` and `chat.jsonl` are discovered **by convention** from `<id>`
  (there are no path fields, so there can be no dangling file refs). Both are
  optional; absent means empty.
- `<id>` = directory name = a slug derived from the title at creation, mirrored
  in `issue.json.id`, and **stable** across title edits. It is globally unique
  across all kinds; collisions get a numeric suffix (`add-auth`, `add-auth-2`).

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
| `createdAt` | ISO string | set at create |
| `updatedAt` | ISO string | bumped on every write |

Common to **Epic / Branch / Commit** (but **not** Project):

| field | type | notes |
| --- | --- | --- |
| `assignee` | string? | optional |
| `needsAttention` | boolean | defaults `false` |
| `attentionReason` | string \| null | defaults `null` |

Project — the common-to-every-kind fields only (no `partOf`, no status, no
assignee/needs-attention). Its `description.md` is a short overview of the
Project.

Epic — the Epic/Branch/Commit common fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Project id (required) |

Branch — the Epic/Branch/Commit common fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Epic id (required) |
| `branchName` | string? | set once the git branch is created |
| `stackedOn` | string? | single fork-point Branch id (must be in the same Epic); absent => base `main` |
| `blockedBy` | string[] | additional Branch deps; defaults `[]` |
| `prUrl` | string? | optional |
| `merged` | boolean | defaults `false` |

Commit — the Epic/Branch/Commit common fields plus:

| field | type | notes |
| --- | --- | --- |
| `partOf` | string | the Branch id (required) |
| `status` | `"todo"` \| `"in-progress"` \| `"done"` | defaults `todo`; the only stored status |
| `commitSha` | string? | set when done |

Deliberately excluded: `rank`/priority (ordering is derived), `label`, inline
`description`/`messages` (they are separate files), and status history.

**Tree nesting and sibling order.** The tree nests a Branch under the Branch it
forks from: a Branch renders as a child of its `stackedOn` Branch (which must be
in the same Epic — see below), so indentation mirrors the git stack depth. A
Branch with no `stackedOn` is a *root* Branch, rendered directly under its Epic.
Under a Branch, its own Commits render first, then the Branches stacked on it.
`blockedBy` is not shown in the tree (it lives in the detail panel); it only
affects sibling ordering. Within one nesting level, Commits are ordered by
sequence (`createdAt` ascending, tie-broken by `id`); sibling Branches are
ordered topologically by their `stackedOn`/`blockedBy` edges, falling back to the
same sequence when there is no dependency between two siblings. Epics are ordered
by sequence.

**Projects scope the view.** A Project is the top-level container: every Epic is
`partOf` exactly one Project. The web UI lists Projects in a sidebar; selecting
one scopes the tree and the Ready view to that Project's subtree (its Epics and
their Branches/Commits). Projects themselves are not rendered as nodes inside the
tree — they are the selectable root. Projects are ordered by sequence.

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

`app/server/services/issues.ts` is the **only sanctioned writer** of `issues/`,
shared verbatim by the HTTP routes and the CLI. All misconfiguration is
prevented here, so no consumer can persist a broken file.

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
  `attentionReason`, `partOf`, the kind-specific fields (`status`/`commitSha` for
  a Commit; `branchName`/`stackedOn`/`blockedBy`/`prUrl`/`merged` for a Branch),
  and `description` (written to `description.md`). Clearable fields are removed
  when patched to `null`. A patch that names a field not valid for the issue's
  kind is rejected.
- `remove(id)` — deletes the issue and its containment subtree, repairing every
  surviving reference into it (see [Deletion policy](#deletion-policy)). Exposed
  over HTTP as `DELETE /api/issues/:id` and via the CLI `delete` command.
- `appendMessage(id, {role, name?, body})` — appends one JSONL line to
  `chat.jsonl` with a server-stamped `at`.
- `readChat(id)` — reads/parses `chat.jsonl`, skipping malformed lines into
  `problems`.

### Cross-cutting guarantees

- **Validate-at-write.** `create`/`update` run the integrity checks against the
  *prospective* state and refuse any write that would introduce a `problem` — a
  bad or missing `partOf`/`stackedOn` referent, a referent of the wrong kind (a
  Commit's `partOf` must be a Branch, a Branch's an Epic, an Epic's a Project), a
  `stackedOn` in a different Epic, or a cycle-inducing `stackedOn`/`blockedBy`.
  On failure the CLI exits nonzero
  with a clear message and HTTP returns 4xx with detail.
- **Read-time validation.** Hand-edited or out-of-band files are still validated
  on read and surfaced as `problems`; they never crash a read. A directory whose
  `issue.json` id disagrees with the directory name is reported as a problem.
- **Serialized writes.** A single in-process promise chain serializes all writes
  so concurrent CLI/HTTP calls cannot race.
- **Change detection.** `read` returns a `version` (a hash over `issue.json` +
  `description.md`) so the UI can detect out-of-band edits to the open issue.
  `chat.jsonl` is deliberately excluded from the version so chat appends do not
  trip the external-edit banner.

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
| `blockedBy` (a deleted Branch; may cross Epics) | **Drop**: remove the deleted id from the list, with no inheritance. This is the case that matters for Epic deletion, since `blockedBy` is the only edge allowed to cross Epics. |
| `stackedOn`/`blockedBy` → a deleted Commit | Impossible — those edges only ever reference Branches. |

`issue:` cross-links inside `description.md` are freeform Markdown, not
validated relationships, so they are left untouched.

**Invariant.** After `remove()`, `list().problems` gains no new
dangling-reference, wrong-kind, or cycle problem — guaranteed by construction in
`planDeletion()` and re-validated against the surviving set before any write.

## Derived state

`derive(issues)` (`app/server/services/derive.ts`) is a pure function (no
filesystem) that, given all issues, computes state that is **never stored** and
so cannot drift:

- **Commit `ready`** — `status === "todo"`, its Branch (`partOf`) exists with a
  `branchName` and is not merged, and all earlier sibling Commits (by sequence)
  are `done`. A `todo` Commit that is not ready is `blocked`.
- **Branch base** — the `stackedOn` Branch's `branchName` if set, else `main`.
- **Branch status** — `merged` if `merged`; else `pr-open` if it has Commits,
  all are `done`, and `prUrl` is set; else `in-progress` if `branchName` is set;
  else `not-started`.
- **Branch `ready`** (to start) — its base exists (it has no `stackedOn`, or its
  `stackedOn` Branch has a `branchName`) and every `blockedBy` Branch is
  `merged`. A `not-started` Branch that is not ready is `blocked`.
- **Epic status** — `done` when it has Branches and all are `merged`;
  `in-progress` if any Branch has started; else `todo`.
- **Ready set** — the flat list behind the Ready view: ready Commits, plus ready
  Branches that are still `not-started`, sorted by sequence.
- **problems** — the integrity checks `derive()` runs over the parsed issues:
  dependency cycles over `stackedOn`/`blockedBy`; dangling
  `partOf`/`stackedOn`/`blockedBy` ids; a Branch whose `stackedOn`/`blockedBy`
  entry is not a Branch; a Branch whose `stackedOn` is in a different Epic
  (`stackedOn` must stay within one Epic; `blockedBy` may cross Epics); a Commit
  whose `partOf` is not a Branch; a Branch whose `partOf` is not an Epic; and an
  Epic whose `partOf` is not a Project. These are only the *derive-time* problems; the
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
`description.md` and `chat.jsonl` are found by convention from the id, so a file
reference can never dangle.

**The complete design lives distributed across tiers.** The Epic replaces a
giant plan/spec only when the whole design is captured in the tree: overview and
cross-cutting invariants in the Epic, standalone unit prose in each Branch,
implementor-resolution detail in each Commit. Companion material is inlined
where it is used. Verbatim copy into the Epic with empty children is not
sufficient — distribution and a completeness pass are what make the tracker a
standalone basis for a future implementor.

**One validated service layer is the only writer.** The CLI (for agents) and the
HTTP routes (for the UI) are both thin adapters over `services/issues.ts`. Every
write goes through the same validation, partial-merge, and serialization, so an
issue cannot be left in a broken state regardless of who wrote it. Integrity is
enforced at the source rather than trusted at each call site.

**Derived, not stored.** Anything that can be computed from the whole set —
Branch/Epic status, ready/blocked, base branch, the ready set — is computed by
the pure `derive()` and never written to disk. Stored duplicates of derived
facts are the classic source of drift; by refusing to store them, the tracker
cannot show a status that disagrees with reality. Only a Commit's `status` (the
one genuine human/agent decision) is stored.

**Metadata-only with respect to git.** The tracker never shells out to git or
gh. Agents run git/gh themselves and record the results — `branchName`, `prUrl`,
`commitSha`, `merged` — through the CLI. The tracker's job is to model the
stacked-PR *plan* and its progress, not to drive git. This keeps it safe to run
anywhere and impossible for it to corrupt a repo.

**Correct-by-construction over defensive layering.** Malformed files and
integrity violations become `problems` that are surfaced in the UI and CLI, not
errors that are swallowed or states that are silently repaired. A write that
would introduce a problem is refused up front.
