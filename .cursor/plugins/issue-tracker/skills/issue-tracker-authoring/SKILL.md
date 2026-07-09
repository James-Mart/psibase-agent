---
name: issue-tracker-authoring
description: >-
  The agent contract for authoring and working an Epic > Branch > Commit stack
  in the issue-tracker. Use when an agent should decompose a spec into a tracked
  stack of git PRs, record git progress (branch/PR/commit/merged), escalate or
  hand off work, or fan out parallel subagents across the ready set. Agents
  interact only through the CLI, never by hand-writing issue.json.
---

# Issue Tracker — Authoring Contract

You author and work the tracker **only through the CLI**. The CLI wraps the one
validated service layer, so misconfiguration is prevented at the source: every
command re-validates the whole issue set against the prospective write and
**exits nonzero with a clear message** on any integrity violation (bad/missing
`partOf`/`stackedOn`, wrong-kind referent, dependency cycle). Never hand-write or
hand-edit `issue.json`: a hand edit bypasses *validate-at-write*, so nothing
stops you writing a broken file. It is still validated on read — a hand-edit that
happens to be valid loads normally, but an invalid or integrity-violating one
becomes a `problem` instead of a clean change. Go through the CLI so the write is
checked before it lands.

Read [SPEC.md](../../SPEC.md) for the glossary (Kinds, `partOf`/`stackedOn`/
`blockedBy`, the diamond, derived state) — this skill does not repeat it.

## Invoking the CLI

Run every command from the app directory:

```bash
cd .cursor/plugins/issue-tracker/app && npx tsx cli.ts <command> [args]
```

- Create commands print the new issue **id** on stdout — capture it to link
  children.
- Set `ISSUES_DIR=/abs/path` to point the CLI at a specific `issues/` directory
  (defaults to the plugin's own `issues/`). Use the same value the UI/server
  uses so the human sees your changes live.

## Directory layout

One directory per issue; see [SPEC.md](../../SPEC.md#on-disk-layout) for the full
description. You never touch these files directly — the CLI writes them:

```
issues/<id>/
  issue.json        # metadata + relationships (CLI-written)
  description.md    # spec/description, GFM, may contain issue: links
  chat.jsonl        # append-only per-issue chat
```

`<id>` is a slug derived from the title at creation and is globally unique
(collisions get a `-2` suffix). It never changes when the title is edited.

## CLI reference

Accurate to `app/cli.ts`. Angle brackets are required, square brackets optional.

### Create / decompose

| command | effect |
| --- | --- |
| `create-epic <title> [--assignee <who>] [--description <text>]` | Create an Epic. `--description` seeds `description.md` (defaults to `# <title>`). |
| `add-branch <title> --part-of <epic> [--stacked-on <branch>] [--assignee <who>]` | Create a Branch under an Epic. `--stacked-on` sets the single fork point; omit to fork off `main`. |
| `add-commit <title> --part-of <branch> [--assignee <who>]` | Create a Commit under a Branch. New Commits start `status = todo`. |

### Work / update (partial merge — only the named field changes)

| command | kind | effect |
| --- | --- | --- |
| `set-status <id> <todo\|in-progress\|done>` | Commit | Set the stored commit status. |
| `set-commit <id> <sha>` | Commit | Record the git commit sha (set once done). |
| `set-branch-name <id> <name>` | Branch | Record the git branch name (do this when you create the branch). |
| `set-stacked-on <id> <branch>` | Branch | Set/repoint the single fork-point Branch. |
| `block <id> --by <branchIds...>` | Branch | Replace `blockedBy` with the given Branch ids (variadic). |
| `open-pr <id> <url>` | Branch | Record the PR URL. |
| `set-merged <id>` | Branch | Mark the Branch merged. |

### Converse / escalate

| command | effect |
| --- | --- |
| `comment <id> --role <role> --body <text> [--name <name>]` | Append a chat message (Markdown body). |
| `attention <id> --reason <text>` | Raise the needs-attention flag with a reason. |
| `attention <id> --clear` | Clear the needs-attention flag. |
| `assign <id> <who>` | Set the assignee (`human` or an agent id). |

### Inspect

| command | output |
| --- | --- |
| `ready` | The ready set as `kind<TAB>id<TAB>title` lines, or `nothing ready`. |
| `list` | The full state as JSON: `{ issues, problems, derived, ready }`. |

Notes:

- `block` **replaces** the whole `blockedBy` list; pass every current blocker
  each time.
- The CLI sets values; it does not clear scalar fields (`branchName`,
  `stackedOn`, `commitSha`, `prUrl`, `assignee`) back to empty. Clearing those is
  a human action in the UI. `attention --clear` is the one exception.
- Cross-reference any issue from a `description.md` or chat body with
  `[text](issue:<id>)`.

## Decomposing a spec into a stack

1. `create-epic` for the whole body of work; put the spec in `--description` (or
   edit `description.md` later via the UI). The Epic replaces the giant plan doc.
2. Break the work into **Branch** seams — each Branch becomes exactly one git
   branch and one PR. Group Commits that must ship together into one Branch.
   Independent Branches off the same base can be worked in parallel.
3. Under each Branch, `add-commit` for each atomic, story-point-sized unit (one
   git commit each), in the order they should land.
4. Wire dependencies:
   - `--stacked-on` (or `set-stacked-on`) = the one Branch you physically fork
     from (your git base). Omit to fork off `main`.
   - `block --by` = other Branches whose PRs must merge first but that you do
     **not** fork from. See the diamond case in SPEC.md — use `blockedBy` to keep
     parallel branches parallel instead of linearizing them.

## Working the stack (record git as you go)

The tracker is metadata-only: **you** run git/gh, then record the result.

- Create the git branch → `set-branch-name <branch-id> <name>`.
- Start a commit → `set-status <commit-id> in-progress`.
- Land the commit → `set-status <commit-id> done` and `set-commit <commit-id>
  <sha>`.
- Open the PR → `open-pr <branch-id> <url>`.
- PR merges → `set-merged <branch-id>`.

Derived Branch/Epic status and ready/blocked follow automatically from these
facts (see SPEC.md); never try to set status on a Branch or Epic.

## Ready set + parallel subagents

The **ready set** (`ready`, or the `ready` array from `list`) is how a main
agent decides what to dispatch, with no external memory. Operationally: it lists
the `todo` Commits whose Branch is started and whose earlier siblings are done,
plus the not-yet-started Branches whose base and blockers are satisfied. The
exact rules live in [SPEC.md](../../SPEC.md#derived-state) — don't restate them.

Fan-out loop for a main agent:

1. Run `ready`. Dispatch one subagent per ready item. Ready items map to distinct
   issue ids, so their `issue.json` writes touch different files. Note the
   service layer serializes writes **only within a single process**; separate CLI
   invocations are not mutually locked, so parallelism is safe because each
   subagent owns a distinct issue, not because of a shared lock.
2. Each subagent does the work and records progress via the CLI (`set-status`,
   `set-commit`, `set-branch-name`, `open-pr`, `set-merged`). It escalates with
   `attention --reason` or `comment` instead of guessing. (Ready *not-started*
   Branches have no `branchName` yet — the subagent creates the git branch and
   records it with `set-branch-name`, so git branches are only distinct once each
   subagent has done so; keep each subagent to its own Branch to avoid collisions.)
3. When subagents return, run `ready` again for the next wave. Repeat until
   `ready` reports `nothing ready` and the Epic's derived status is `done`
   (`list` → `derived[<epicId>].epicStatus === "done"`).

Because all state lives on disk and every derived fact is recomputed on read,
this loop is fully **resumable**: any agent (or a human) can run `list`/`ready`
at any time to reconstruct exactly where the stack stands and pick up. Give each
subagent its issue id (and the `ISSUES_DIR` if non-default); it reconstructs its
own context from `list`/the issue's `description.md` and `chat`.

## Rules

- Interact only through the CLI; never hand-write or hand-edit `issue.json`.
- A nonzero exit means the write was refused for an integrity reason — read the
  message and fix the inputs, don't retry blindly.
- Keep subagents on distinct issues; the CLI serializes writes within one
  process but separate CLI processes are not mutually locked, so parallel work
  must target disjoint issues (which the ready set guarantees).
- Surface problems: if `list` reports `problems`, resolve them (they mean a
  reference is dangling, wrong-kind, or cyclic) before continuing.
