#!/usr/bin/env -S npx tsx
// One-time setup to invoke this CLI as `issue <verb>` instead of `npx tsx cli.ts <verb>`:
//   cd .cursor/plugins/issue-tracker/app && npm link
import { readFileSync } from "fs";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";
import { list } from "./server/services/issues.js";
import {
  KINDS,
  type DerivedState,
  type IssueRecord,
} from "./server/schemas.js";
import { subtreeIds } from "./server/services/subtree.js";
import { visibleIssues } from "./server/services/archived-visibility.js";
import { apply } from "./server/services/apply.js";
import {
  parseApplyDoc,
  isStoryDoc,
  isEpicDoc,
  type ApplyDoc,
} from "./server/services/apply-schema.js";
import { bySequence, buildProjectBoardOf, stackedStoryOrder } from "./server/order.js";
import { resolveProjectId } from "./server/scope.js";
import { CHIP_UNSET } from "./server/services/merge-base.js";
import { formatSummary, summarize } from "./server/services/summary.js";
import { hasAttention } from "./server/kind.js";
import {
  registerKindAdd,
  registerLegacyCreateCommands,
} from "./cli-create.js";
import { registerKindGetSet } from "./cli-kind.js";
import { registerKindOps, registerLegacyOps } from "./cli-ops.js";
import { DELETED_FIELD_VERBS } from "./deleted-field-verbs.js";

type EpicRecord = Extract<IssueRecord, { kind: "epic" }>;
type StoryRecord = Extract<IssueRecord, { kind: "story" }>;
type TaskRecord = Extract<IssueRecord, { kind: "task" }>;
type ProjectBoardChild = Extract<IssueRecord, { kind: "epic" | "idea" }>;

// Shared context for the `tree` renderer: the children of each parent bucketed
// by kind, and the derived state. Commits are pre-sorted into their execution
// sequence; Branches are ordered per-Epic via `stackedStoryOrder`.
interface TreeContext {
  storiesOf: Map<string, StoryRecord[]>;
  tasksOf: Map<string, TaskRecord[]>;
  storyById: Map<string, StoryRecord>;
  derived: Record<string, DerivedState>;
}

function buildTreeContext(
  issues: IssueRecord[],
  derived: Record<string, DerivedState>,
): TreeContext {
  const storiesOf = new Map<string, StoryRecord[]>();
  const tasksOf = new Map<string, TaskRecord[]>();
  const storyById = new Map<string, StoryRecord>();
  for (const issue of issues) {
    if (issue.kind === "story") {
      storyById.set(issue.id, issue);
      const bucket = storiesOf.get(issue.partOf) ?? [];
      bucket.push(issue);
      storiesOf.set(issue.partOf, bucket);
    } else if (issue.kind === "task") {
      const bucket = tasksOf.get(issue.partOf) ?? [];
      bucket.push(issue);
      tasksOf.set(issue.partOf, bucket);
    }
  }
  for (const bucket of tasksOf.values()) bucket.sort(bySequence);
  return { storiesOf, tasksOf, storyById, derived };
}

// The git-stack depth of a Branch within its Epic: how many `stackedOn` hops it
// takes to reach a root Branch. Drives the extra indentation a stacked Branch
// gets under the one it forks from.
function storyDepth(
  story: StoryRecord,
  inSet: Set<string>,
  storyById: Map<string, StoryRecord>,
): number {
  let depth = 0;
  let current = story;
  const seen = new Set<string>();
  while (current.stackedOn && inSet.has(current.stackedOn) && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = storyById.get(current.stackedOn);
    if (!parent) break;
    current = parent;
    depth += 1;
  }
  return depth;
}

function nodeLine(
  indent: number,
  kind: string,
  id: string,
  title: string,
  chips: string[],
): string {
  const pad = "  ".repeat(indent);
  const tail = chips.length > 0 ? `  [${chips.join(" ")}]` : "";
  return `${pad}${kind} ${id}  ${title}${tail}`;
}

function attentionChip(issue: IssueRecord): string[] {
  if (!hasAttention(issue) || !issue.needsAttention) return [];
  return [`attention=${issue.attentionReason ?? "(no reason)"}`];
}

function epicChips(epic: EpicRecord, derived: Record<string, DerivedState>): string[] {
  const d = derived[epic.id];
  const chips: string[] = [];
  if (d?.epicStatus) chips.push(`status=${d.epicStatus}`);
  if (epic.retro) chips.push(`retro=${epic.retro}`);
  return [...chips, ...attentionChip(epic)];
}

function storyChips(story: StoryRecord, derived: Record<string, DerivedState>): string[] {
  const d = derived[story.id];
  const chips: string[] = [];
  if (d?.storyStatus) chips.push(`status=${d.storyStatus}`);
  if (story.specReview) chips.push(`specReview=${story.specReview}`);
  chips.push(`base=${d?.base ?? CHIP_UNSET}`);
  chips.push(`branch=${story.branchName ?? CHIP_UNSET}`);
  if (story.prUrl) chips.push(`pr=${story.prUrl}`);
  if (story.merged) chips.push("merged");
  if (d?.blocked) chips.push("blocked");
  return [...chips, ...attentionChip(story)];
}

function taskChips(task: TaskRecord, derived: Record<string, DerivedState>): string[] {
  const chips = [`status=${task.status}`];
  if (task.qa) chips.push(`qa=${task.qa}`);
  if (task.commitSha) chips.push(`sha=${task.commitSha.slice(0, 7)}`);
  if (derived[task.id]?.blocked) chips.push("blocked");
  return [...chips, ...attentionChip(task)];
}

// Render one Branch line plus its Commits (no stacked child Branches).
function renderStory(story: StoryRecord, indent: number, ctx: TreeContext): string[] {
  const lines = [
    nodeLine(indent, "story", story.id, story.title, storyChips(story, ctx.derived)),
  ];
  for (const task of ctx.tasksOf.get(story.id) ?? []) {
    lines.push(
      nodeLine(indent + 1, "task", task.id, task.title, taskChips(task, ctx.derived)),
    );
  }
  return lines;
}

function renderBoardChild(
  child: ProjectBoardChild,
  indent: number,
  ctx: TreeContext,
): string[] {
  if (child.kind === "idea") {
    return [nodeLine(indent, "idea", child.id, child.title, [])];
  }
  return renderEpic(child, indent, ctx);
}

function renderProjectBoard(
  project: Extract<IssueRecord, { kind: "project" }>,
  boardChildren: ProjectBoardChild[],
  ctx: TreeContext,
  indent: number,
): string[] {
  const lines = [nodeLine(indent, "project", project.id, project.title, [])];
  for (const child of boardChildren) {
    lines.push(...renderBoardChild(child, indent + 1, ctx));
  }
  return lines;
}

// Render one Epic subtree starting at `indent`. Branches print in stacked
// depth-first order (roots first, each followed by what forks from it); within
// a Branch its Commits print first (in sequence) and its stacked children
// after, so indentation mirrors the git stack.
function renderEpic(epic: EpicRecord, indent: number, ctx: TreeContext): string[] {
  const lines = [nodeLine(indent, "epic", epic.id, epic.title, epicChips(epic, ctx.derived))];
  const stories = stackedStoryOrder(ctx.storiesOf.get(epic.id) ?? []);
  const inSet = new Set(stories.map((s) => s.id));
  for (const story of stories) {
    const level = indent + 1 + storyDepth(story, inSet, ctx.storyById);
    lines.push(...renderStory(story, level, ctx));
  }
  return lines;
}

// Resolved `tree` scope: positional id and/or --project/--epic flags, after
// conflict and kind checks. Branch scope carries the record so render does not
// re-look it up.
type TreeScope =
  | { kind: "all" }
  | { kind: "project"; projectRef: string }
  | { kind: "epic"; epicId: string }
  | { kind: "story"; story: StoryRecord };

function resolveTreeScope(
  id: string | undefined,
  opts: { project?: string; epic?: string },
  issues: IssueRecord[],
): TreeScope {
  if (id && (opts.project || opts.epic)) {
    throw new Error("cannot combine tree [id] with --project or --epic");
  }
  if (id) {
    const issue = issues.find((candidate) => candidate.id === id);
    if (!issue) throw new Error(`unknown issue "${id}"`);
    switch (issue.kind) {
      case "project":
        return { kind: "project", projectRef: issue.id };
      case "epic":
        return { kind: "epic", epicId: issue.id };
      case "story":
        return { kind: "story", story: issue };
      case "idea":
        throw new Error(
          `cannot scope tree to an idea; pass project "${issue.partOf}" instead`,
        );
      case "task":
        throw new Error(
          `cannot scope tree to a task; pass story "${issue.partOf}" or its epic instead`,
        );
    }
  }
  if (opts.epic) return { kind: "epic", epicId: opts.epic };
  if (opts.project) return { kind: "project", projectRef: opts.project };
  return { kind: "all" };
}

function renderProjects(
  issues: IssueRecord[],
  ctx: TreeContext,
  projectRef?: string,
): string[] {
  const boardOf = buildProjectBoardOf(issues);
  const projectId = projectRef ? resolveProjectId(issues, projectRef) : undefined;
  const projects = issues
    .filter((issue): issue is Extract<IssueRecord, { kind: "project" }> =>
      issue.kind === "project" && (!projectId || issue.id === projectId),
    )
    .sort(bySequence);

  const lines: string[] = [];
  for (const project of projects) {
    lines.push(...renderProjectBoard(project, boardOf.get(project.id) ?? [], ctx, 0));
  }
  return lines;
}

function renderTreeScope(
  scope: TreeScope,
  issues: IssueRecord[],
  ctx: TreeContext,
): string[] {
  switch (scope.kind) {
    case "story":
      return renderStory(scope.story, 0, ctx);
    case "epic": {
      const epic = issues.find(
        (issue) => issue.id === scope.epicId && issue.kind === "epic",
      );
      if (!epic) throw new Error(`unknown epic "${scope.epicId}"`);
      return renderEpic(epic, 0, ctx);
    }
    case "project":
      return renderProjects(issues, ctx, scope.projectRef);
    case "all":
      return renderProjects(issues, ctx);
  }
}

// Render the subtree an `apply` doc is rooted at (Project, Epic, or Branch), so
// `apply` can echo the resulting shape the way `tree` would for the same scope.
function renderApplyRoot(doc: ApplyDoc, issues: IssueRecord[], ctx: TreeContext): string[] {
  if (isStoryDoc(doc)) {
    const story = ctx.storyById.get(doc.story.id);
    return story ? renderStory(story, 0, ctx) : [];
  }
  if (isEpicDoc(doc)) {
    const epic = issues.find((i) => i.id === doc.epic.id && i.kind === "epic");
    return epic ? renderEpic(epic, 0, ctx) : [];
  }
  const projectId = doc.project.id;
  const project = issues.find((i) => i.id === projectId && i.kind === "project");
  if (!project) return [];
  const boardOf = buildProjectBoardOf(issues);
  return renderProjectBoard(project, boardOf.get(projectId) ?? [], ctx, 0);
}

const program = new Command();
program
  .name("issue")
  .description("File-backed Epic > Story > Task tracker")
  .showHelpAfterError();

async function run(action: () => unknown): Promise<void> {
  try {
    const result = await action();
    if (result && typeof result === "object" && "id" in result) {
      console.log((result as { id: string }).id);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

for (const kind of KINDS) {
  const kindCmd = registerKindGetSet(program, kind, run);
  registerKindAdd(kindCmd, kind, run);
  registerKindOps(kindCmd, kind, run);
}
registerLegacyCreateCommands(program, run);
registerLegacyOps(program, run);

program
  .command("apply")
  .argument("<file>", "path to the nested YAML doc to apply")
  .description(
    "upsert a nested YAML tree rooted at a Project (whole tree), an Epic (one epic in an existing project), or a Story (one story + its tasks in an existing epic); prunes within the declared root's subtree only",
  )
  .action((file) =>
    run(async () => {
      const raw = parseYaml(readFileSync(file, "utf8"));
      const parsed = parseApplyDoc(raw);
      if (!parsed.ok) throw new Error(parsed.message);
      const summary = await apply(parsed.doc);
      const line = (label: string, ids: string[]): string =>
        `${label}: ${ids.length}${ids.length ? ` (${ids.join(", ")})` : ""}`;
      console.log(line("created", summary.created));
      console.log(line("updated", summary.updated));
      console.log(line("deleted", summary.deleted));

      // Echo the resulting subtree the doc is rooted at, so callers don't have
      // to follow up with a separate `tree` invocation.
      const { issues, derived } = list();
      const treeLines = renderApplyRoot(parsed.doc, issues, buildTreeContext(issues, derived));
      if (treeLines.length > 0) {
        console.log();
        console.log(treeLines.join("\n"));
      }
    }),
  );

program
  .command("summary")
  .argument("<id>", "issue id (task, story, epic, idea, or project)")
  .description(
    "print the Project → … → target chain for agent bootstrap (e.g. Project → Idea, or Project → Epic → Story → Task)",
  )
  .action((id) =>
    run(() => {
      console.log(formatSummary(summarize(id)));
    }),
  );

program
  .command("projects")
  .description("print all projects: id<TAB>title")
  .action(() =>
    run(() => {
      const { issues } = list();
      const projects = issues.filter((issue) => issue.kind === "project");
      if (projects.length === 0) {
        console.log("no projects");
        return;
      }
      for (const project of projects) {
        console.log(`${project.id}\t${project.title}`);
      }
    }),
  );

program
  .command("list")
  .description("print a project's issues, derived state, and any problems as JSON")
  .requiredOption("--project <id|title>", "project id or title to scope the listing to")
  .option("--show-archived", "include archived Epic / Idea / Story / Task issues")
  .action((opts) =>
    run(() => {
      const full = list();
      const projectId = resolveProjectId(full.issues, opts.project);
      const scope = subtreeIds(full.issues, projectId);
      const scopedIssues = visibleIssues(
        full.issues.filter((issue) => scope.has(issue.id)),
        Boolean(opts.showArchived),
      );
      const visibleIds = new Set(scopedIssues.map((issue) => issue.id));
      const scoped = {
        issues: scopedIssues,
        problems: full.problems.filter((problem) => visibleIds.has(problem.id)),
        derived: Object.fromEntries(
          Object.entries(full.derived).filter(([id]) => visibleIds.has(id)),
        ),
      };
      console.log(JSON.stringify(scoped, null, 2));
    }),
  );

program
  .command("tree")
  .description(
    "print an indented Project outline (Ideas and Epics interleaved by order; Epics show Story > Task subtrees with derived chips)",
  )
  .argument(
    "[id]",
    "scope by issue id (project/epic/story subtree; tasks are refused)",
  )
  .option("--project <id|title>", "scope the outline to a project subtree (id or title)")
  .option("--epic <id>", "scope the outline to a single epic subtree")
  .option("--show-archived", "include archived Epic / Idea / Story / Task issues")
  .action((id, opts) =>
    run(() => {
      const { issues: allIssues, derived } = list();
      // Resolve scope against the full graph so archived ids remain addressable,
      // then render only the visible subset (unless --show-archived).
      const scope = resolveTreeScope(id, opts, allIssues);
      const showArchived = Boolean(opts.showArchived);
      const issues = visibleIssues(allIssues, showArchived);
      const visibleIds = new Set(issues.map((issue) => issue.id));
      if (!showArchived) {
        if (scope.kind === "epic" && !visibleIds.has(scope.epicId)) {
          throw new Error(
            `epic "${scope.epicId}" is archived; pass --show-archived`,
          );
        }
        if (scope.kind === "story" && !visibleIds.has(scope.story.id)) {
          throw new Error(
            `story "${scope.story.id}" is archived; pass --show-archived`,
          );
        }
      }
      const visibleDerived = Object.fromEntries(
        Object.entries(derived).filter(([issueId]) => visibleIds.has(issueId)),
      );
      const ctx = buildTreeContext(issues, visibleDerived);
      const lines = renderTreeScope(scope, issues, ctx);
      if (lines.length === 0) {
        console.log("no projects");
        return;
      }
      console.log(lines.join("\n"));
    }),
  );

for (const verb of DELETED_FIELD_VERBS) {
  if (program.commands.some((cmd) => cmd.name() === verb)) {
    throw new Error(`deleted field verb "${verb}" must not be registered`);
  }
}

program.parseAsync(process.argv);
