---
name: issue-tracker-authoring
description: >-
  Drive the issue-tracker CLI to create/update Project > Epic > Branch > Commit
  issues and get the command reference. Use when an agent creates/updates issues
  or records git facts against a stack. Act only through the CLI, never by editing
  issue.json. Plan a tree: issue-tracker-decompose. Work it: issue-tracker-work.
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

Run from the app dir. Create-commands print the new **id** on stdout (capture it
to link children). `ISSUES_DIR=/abs/path` picks the `issues/` dir (default: the
plugin's own) — match the UI/server so the human sees changes live.

```bash
cd .cursor/plugins/issue-tracker/app && npx tsx cli.ts <command> [args]
```

Commands (`<required>`, `[optional]`):

```
create-project <title> [--description T]              Project (top-level container); --description seeds description.md
projects                                              list projects: id<TAB>title (call first to get a project id)
create-epic <title> --part-of <project> [--assignee W] [--description T]  Epic; --part-of = its Project (required)
add-branch <title> --part-of <epic> [--stacked-on <b>] [--assignee W]  Branch; --stacked-on = single fork point (omit = fork main)
add-commit <title> --part-of <branch> [--assignee W]  Commit (starts status=todo)
set-status <commit> <todo|in-progress|done>           stored Commit status
set-commit <commit> <sha>                             record git sha (once done)
set-branch-name <branch> <name>                       record git branch name (when created)
set-stacked-on <branch> <branch>                      set/repoint the fork point
block <branch> --by <branchIds...>                    REPLACES blockedBy — pass all current blockers
open-pr <branch> <url>                                record PR URL
set-merged <branch>                                   mark Branch merged
comment <id> --role R --body T [--name N]             append chat message (Markdown)
attention <id> --reason T | --clear                   raise / clear needs-attention
assign <id> <who>                                     set assignee (human | agent id)
delete <id>                                           delete issue: cascades to contained children, splices dependents' stackedOn, drops blockedBy
ready --project <id>                                  a project's ready set: kind<TAB>id<TAB>title, or "nothing ready"
list --project <id>                                   a project's state JSON: {issues,problems,derived,ready}
show <id> [--chat]                                    print an issue's metadata + description (--chat adds the chat log)
tree [--project <id>|--epic <id>]                     print an indented Epic > Branch > Commit outline with derived chips
```

Updates are partial merges (only the named field changes). The CLI sets but never
clears scalars (`branchName`/`stackedOn`/`commitSha`/`prUrl`/`assignee`) — a human
UI action (`attention --clear` excepted). Cross-link issues in a body: `[text](issue:<id>)`.
