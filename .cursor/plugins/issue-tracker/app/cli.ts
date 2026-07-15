#!/usr/bin/env -S npx tsx
// One-time setup to invoke this CLI as `issue <verb>` instead of `npx tsx cli.ts <verb>`:
//   cd .cursor/plugins/issue-tracker/app && npm link
import { readFileSync } from "fs";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";
import {
  appendMessage,
  create,
  list,
  read,
  readChat,
  remove,
  update,
} from "./server/services/issues.js";
import {
  COMMIT_STATUSES,
  MERGE_POLICIES,
  SPEC_REVIEW_STATUSES,
  type CommitStatus,
  type DerivedState,
  type IssueRecord,
  type MergePolicy,
  type SpecReviewStatus,
} from "./server/schemas.js";
import { subtreeIds } from "./server/services/subtree.js";
import { apply } from "./server/services/apply.js";
import {
  parseApplyDoc,
  isBranchDoc,
  isEpicDoc,
  type ApplyDoc,
} from "./server/services/apply-schema.js";
import { bySequence, stackedBranchOrder } from "./server/order.js";
import { resolveProjectId } from "./server/scope.js";
import { EPIC_BASE } from "./server/services/derive.js";
import { formatSummary, summarize } from "./server/services/summary.js";

type BranchRecord = Extract<IssueRecord, { kind: "branch" }>;
type CommitRecord = Extract<IssueRecord, { kind: "commit" }>;

function assertEnumArg(
  values: readonly string[],
  value: string,
  label: string,
): void {
  if (!values.includes(value)) {
    throw new Error(`invalid ${label} "${value}" (expected: ${values.join(", ")})`);
  }
}

// Shared context for the `tree` renderer: the children of each parent bucketed
// by kind, and the derived state. Commits are pre-sorted into their execution
// sequence; Branches are ordered per-Epic via `stackedBranchOrder`.
interface TreeContext {
  branchesOf: Map<string, BranchRecord[]>;
  commitsOf: Map<string, CommitRecord[]>;
  branchById: Map<string, BranchRecord>;
  derived: Record<string, DerivedState>;
}

function buildTreeContext(
  issues: IssueRecord[],
  derived: Record<string, DerivedState>,
): TreeContext {
  const branchesOf = new Map<string, BranchRecord[]>();
  const commitsOf = new Map<string, CommitRecord[]>();
  const branchById = new Map<string, BranchRecord>();
  for (const issue of issues) {
    if (issue.kind === "branch") {
      branchById.set(issue.id, issue);
      const bucket = branchesOf.get(issue.partOf) ?? [];
      bucket.push(issue);
      branchesOf.set(issue.partOf, bucket);
    } else if (issue.kind === "commit") {
      const bucket = commitsOf.get(issue.partOf) ?? [];
      bucket.push(issue);
      commitsOf.set(issue.partOf, bucket);
    }
  }
  for (const bucket of commitsOf.values()) bucket.sort(bySequence);
  return { branchesOf, commitsOf, branchById, derived };
}

// The git-stack depth of a Branch within its Epic: how many `stackedOn` hops it
// takes to reach a root Branch. Drives the extra indentation a stacked Branch
// gets under the one it forks from.
function branchDepth(
  branch: BranchRecord,
  inSet: Set<string>,
  branchById: Map<string, BranchRecord>,
): number {
  let depth = 0;
  let current = branch;
  const seen = new Set<string>();
  while (current.stackedOn && inSet.has(current.stackedOn) && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = branchById.get(current.stackedOn);
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
  if (issue.kind === "project" || !issue.needsAttention) return [];
  return [`attention=${issue.attentionReason ?? "(no reason)"}`];
}

function epicChips(epic: IssueRecord, derived: Record<string, DerivedState>): string[] {
  const d = derived[epic.id];
  const chips: string[] = [];
  if (d?.epicStatus) chips.push(`status=${d.epicStatus}`);
  return [...chips, ...attentionChip(epic)];
}

function branchChips(branch: BranchRecord, derived: Record<string, DerivedState>): string[] {
  const d = derived[branch.id];
  const chips: string[] = [];
  if (d?.branchStatus) chips.push(`status=${d.branchStatus}`);
  chips.push(`base=${d?.base ?? EPIC_BASE}`);
  chips.push(`branch=${branch.branchName ?? "(unset)"}`);
  if (branch.prUrl) chips.push(`pr=${branch.prUrl}`);
  if (branch.merged) chips.push("merged");
  if (d?.blocked) chips.push("blocked");
  return [...chips, ...attentionChip(branch)];
}

function commitChips(commit: CommitRecord, derived: Record<string, DerivedState>): string[] {
  const chips = [`status=${commit.status}`];
  if (commit.commitSha) chips.push(`sha=${commit.commitSha.slice(0, 7)}`);
  if (derived[commit.id]?.blocked) chips.push("blocked");
  return [...chips, ...attentionChip(commit)];
}

// Render one Epic subtree starting at `indent`. Branches print in stacked
// depth-first order (roots first, each followed by what forks from it); within
// a Branch its Commits print first (in sequence) and its stacked children
// after, so indentation mirrors the git stack.
function renderEpic(epic: IssueRecord, indent: number, ctx: TreeContext): string[] {
  const lines = [nodeLine(indent, "epic", epic.id, epic.title, epicChips(epic, ctx.derived))];
  const branches = stackedBranchOrder(ctx.branchesOf.get(epic.id) ?? []);
  const inSet = new Set(branches.map((b) => b.id));
  for (const branch of branches) {
    const level = indent + 1 + branchDepth(branch, inSet, ctx.branchById);
    lines.push(nodeLine(level, "branch", branch.id, branch.title, branchChips(branch, ctx.derived)));
    for (const commit of ctx.commitsOf.get(branch.id) ?? []) {
      lines.push(nodeLine(level + 1, "commit", commit.id, commit.title, commitChips(commit, ctx.derived)));
    }
  }
  return lines;
}

// Render the subtree an `apply` doc is rooted at (Project, Epic, or Branch), so
// `apply` can echo the resulting shape the way `tree` would for the same scope.
function renderApplyRoot(doc: ApplyDoc, issues: IssueRecord[], ctx: TreeContext): string[] {
  if (isBranchDoc(doc)) {
    const branch = ctx.branchById.get(doc.branch.id);
    if (!branch) return [];
    const lines = [nodeLine(0, "branch", branch.id, branch.title, branchChips(branch, ctx.derived))];
    for (const commit of ctx.commitsOf.get(branch.id) ?? []) {
      lines.push(nodeLine(1, "commit", commit.id, commit.title, commitChips(commit, ctx.derived)));
    }
    return lines;
  }
  if (isEpicDoc(doc)) {
    const epic = issues.find((i) => i.id === doc.epic.id && i.kind === "epic");
    return epic ? renderEpic(epic, 0, ctx) : [];
  }
  const projectId = doc.project.id;
  const project = issues.find((i) => i.id === projectId && i.kind === "project");
  if (!project) return [];
  const lines = [nodeLine(0, "project", project.id, project.title, [])];
  for (const epic of issues
    .filter((i) => i.kind === "epic" && i.partOf === projectId)
    .sort(bySequence)) {
    lines.push(...renderEpic(epic, 1, ctx));
  }
  return lines;
}

// Resolve a description from either inline text or a file path. `--description-file`
// wins when both are given; returns undefined when neither is provided so callers
// can fall back to the default `# <title>` seed.
function resolveDescription(opts: {
  description?: string;
  descriptionFile?: string;
}): string | undefined {
  if (opts.descriptionFile) {
    // `-` means read the description from stdin (pipe/heredoc), matching the
    // common CLI convention, rather than a file literally named "-".
    const source = opts.descriptionFile === "-" ? 0 : opts.descriptionFile;
    return readFileSync(source, "utf8");
  }
  return opts.description;
}

const program = new Command();
program
  .name("issue")
  .description("File-backed Epic > Branch > Commit tracker")
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

program
  .command("create-project")
  .argument("<title>", "project title")
  .option("--description <text>", "description.md contents")
  .option("--description-file <path>", "read description.md contents from a file (use - for stdin)")
  .action((title, opts) =>
    run(() =>
      create({
        kind: "project",
        title,
        description: resolveDescription(opts),
      }),
    ),
  );

program
  .command("create-epic")
  .argument("<title>", "epic title")
  .requiredOption("--part-of <project>", "parent project id")
  .option("--assignee <who>", "assignee id")
  .option("--description <text>", "description.md contents")
  .option("--description-file <path>", "read description.md contents from a file (use - for stdin)")
  .action((title, opts) =>
    run(() =>
      create({
        kind: "epic",
        title,
        partOf: opts.partOf,
        assignee: opts.assignee,
        description: resolveDescription(opts),
      }),
    ),
  );

program
  .command("add-branch")
  .argument("<title>", "branch title")
  .requiredOption("--part-of <epic>", "parent epic id")
  .option("--stacked-on <branch>", "fork-point branch id")
  .option("--assignee <who>", "assignee id")
  .option("--description <text>", "description.md contents")
  .option("--description-file <path>", "read description.md contents from a file (use - for stdin)")
  .action((title, opts) =>
    run(() =>
      create({
        kind: "branch",
        title,
        partOf: opts.partOf,
        stackedOn: opts.stackedOn,
        assignee: opts.assignee,
        description: resolveDescription(opts),
      }),
    ),
  );

program
  .command("add-commit")
  .argument("<title>", "commit title")
  .requiredOption("--part-of <branch>", "parent branch id")
  .option("--assignee <who>", "assignee id")
  .option("--description <text>", "description.md contents")
  .option("--description-file <path>", "read description.md contents from a file (use - for stdin)")
  .action((title, opts) =>
    run(() =>
      create({
        kind: "commit",
        title,
        partOf: opts.partOf,
        assignee: opts.assignee,
        description: resolveDescription(opts),
      }),
    ),
  );

program
  .command("apply")
  .argument("<file>", "path to the nested YAML doc to apply")
  .description(
    "upsert a nested YAML tree rooted at a Project (whole tree), an Epic (one epic in an existing project), or a Branch (one branch + its commits in an existing epic); prunes within the declared root's subtree only",
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
  .command("set-status")
  .argument("<id>", "commit id")
  .argument("<status>", `one of: ${COMMIT_STATUSES.join(", ")}`)
  .action((id, status) =>
    run(() => {
      assertEnumArg(COMMIT_STATUSES, status, "status");
      return update(id, { status: status as CommitStatus });
    }),
  );

program
  .command("set-commit")
  .argument("<id>", "commit id")
  .argument("<sha>", "git commit sha")
  .action((id, sha) => run(() => update(id, { commitSha: sha })));

program
  .command("set-workspace")
  .argument("<id>", "project id")
  .argument("[path]", "absolute path to git checkout")
  .option("--clear", "clear the workspace field")
  .action((id, path, opts) =>
    run(() => {
      if (opts.clear) {
        return update(id, { workspace: null });
      }
      if (!path) {
        throw new Error("provide an absolute path or --clear");
      }
      return update(id, { workspace: path });
    }),
  );

program
  .command("set-merge-policy")
  .argument("<id>", "project id")
  .argument("<policy>", `one of: ${MERGE_POLICIES.join(", ")}`)
  .action((id, policy) =>
    run(() => update(id, { mergePolicy: policy as MergePolicy })),
  );

program
  .command("set-branch-name")
  .argument("<id>", "branch id")
  .argument("<name>", "git branch name")
  .action((id, name) => run(() => update(id, { branchName: name })));

program
  .command("set-stacked-on")
  .argument("<id>", "branch id")
  .argument("<branch>", "fork-point branch id")
  .action((id, branch) => run(() => update(id, { stackedOn: branch })));

program
  .command("set-part-of")
  .argument("<id>", "issue id")
  .argument("<parent>", "new parent id (commit>branch, branch>epic, epic>project)")
  .action((id, parent) => run(() => update(id, { partOf: parent })));

program
  .command("block")
  .argument("<id>", "epic id")
  .description("edit an Epic's blockedBy (ids must be same-Project Epics)")
  .option("--by <epicIds...>", "replace blockedBy with exactly these ids")
  .option("--add <epicIds...>", "union these ids into the current blockedBy")
  .option("--remove <epicIds...>", "drop these ids from the current blockedBy")
  // `--by`/`--add`/`--remove` are mutually exclusive: `--by` is a full replace
  // while `--add`/`--remove` are incremental, so combining them has no
  // unsurprising meaning. Require exactly one rather than inventing a precedence.
  .action((id, opts) =>
    run(() => {
      const modes = (["by", "add", "remove"] as const).filter(
        (mode) => opts[mode] !== undefined,
      );
      if (modes.length === 0) {
        throw new Error("provide exactly one of --by, --add, or --remove");
      }
      if (modes.length > 1) {
        throw new Error(
          `--by, --add, and --remove are mutually exclusive (got ${modes
            .map((mode) => `--${mode}`)
            .join(", ")})`,
        );
      }
      const detail = read(id);
      if (detail.kind !== "epic") {
        throw new Error(`blockedBy is only valid on an epic, not a ${detail.kind}`);
      }
      if (opts.by) return update(id, { blockedBy: opts.by });

      const current = detail.blockedBy;
      const blockedBy = opts.add
        ? [...current, ...opts.add.filter((bid: string) => !current.includes(bid))]
        : current.filter((bid) => !opts.remove.includes(bid));
      return update(id, { blockedBy });
    }),
  );

program
  .command("open-pr")
  .argument("<id>", "branch id")
  .argument("<url>", "pull request url")
  .action((id, url) => run(() => update(id, { prUrl: url })));

program
  .command("set-merged")
  .argument("<id>", "branch id")
  .action((id) => run(() => update(id, { merged: true })));

program
  .command("set-spec-review")
  .argument("<id>", "branch id")
  .argument("<status>", `one of: ${SPEC_REVIEW_STATUSES.join(", ")}`)
  .action((id, status) =>
    run(() => {
      assertEnumArg(SPEC_REVIEW_STATUSES, status, "specReview");
      const detail = read(id);
      if (detail.kind !== "branch") {
        throw new Error(`specReview is only valid on a branch, not a ${detail.kind}`);
      }
      return update(id, { specReview: status as SpecReviewStatus });
    }),
  );

program
  .command("comment")
  .argument("<id>", "issue id")
  .requiredOption("--role <role>", "message author role (e.g. agent, human)")
  .requiredOption("--body <text>", "message body (Markdown)")
  .option("--name <name>", "author display name")
  .action((id, opts) =>
    run(async () => {
      const message = await appendMessage(id, {
        role: opts.role,
        name: opts.name,
        body: opts.body,
      });
      console.log(`commented on ${id} as ${message.name ?? message.role}`);
    }),
  );

program
  .command("attention")
  .argument("<id>", "issue id")
  .option("--reason <text>", "why the issue needs attention")
  .option("--clear", "clear the attention flag")
  .action((id, opts) =>
    run(() => {
      if (opts.clear) {
        return update(id, { needsAttention: false, attentionReason: null });
      }
      if (!opts.reason) {
        throw new Error("provide --reason <text> or --clear");
      }
      return update(id, { needsAttention: true, attentionReason: opts.reason });
    }),
  );

program
  .command("assign")
  .argument("<id>", "issue id")
  .argument("<who>", "assignee id (human or agent)")
  .action((id, who) => run(() => update(id, { assignee: who })));

program
  .command("set-description")
  .argument("<id>", "issue id")
  .option("--description <text>", "description.md contents")
  .option("--description-file <path>", "read description.md contents from a file (use - for stdin)")
  .action((id, opts) =>
    run(() => {
      const description = resolveDescription(opts);
      if (description === undefined) {
        throw new Error("provide --description <text> or --description-file <path>");
      }
      return update(id, { description });
    }),
  );

program
  .command("delete")
  .argument("<id>", "issue id")
  .description(
    "delete an issue: cascades to contained children, splices stackedOn, drops blockedBy",
  )
  .action((id) =>
    run(async () => {
      const result = await remove(id);
      console.log(`deleted ${result.deleted.join(", ")}`);
      for (const { id: bid, to } of result.repointed) {
        console.log(`  repointed ${bid}.stackedOn -> ${to ?? "main"}`);
      }
      for (const { id: bid } of result.unblocked) {
        console.log(`  dropped deleted blocker from ${bid}.blockedBy`);
      }
    }),
  );

program
  .command("summary")
  .argument("<id>", "issue id (commit, branch, epic, or project)")
  .description(
    "print the Project → Epic → Branch → Commit chain for agent bootstrap",
  )
  .action((id) =>
    run(() => {
      console.log(formatSummary(summarize(id)));
    }),
  );

program
  .command("show")
  .argument("<id>", "issue id")
  .description(
    "print an issue's metadata and description (pass --chat for the chat log)",
  )
  .option("--chat", "also print the chat log")
  .action((id, opts) =>
    run(() => {
      const detail = read(id);
      const lines = [
        `id: ${detail.id}`,
        `kind: ${detail.kind}`,
        `title: ${detail.title}`,
      ];
      if (detail.kind === "project") {
        lines.push(`mergePolicy: ${detail.mergePolicy}`);
        if (detail.workspace) {
          lines.push(`workspace: ${detail.workspace}`);
        }
      }
      if (detail.kind !== "project") lines.push(`partOf: ${detail.partOf}`);
      if (detail.kind === "epic" && detail.blockedBy.length > 0) {
        lines.push(`blockedBy: ${detail.blockedBy.join(", ")}`);
      }
      if (detail.kind === "branch") {
        if (detail.stackedOn) lines.push(`stackedOn: ${detail.stackedOn}`);
        if (detail.branchName) lines.push(`branchName: ${detail.branchName}`);
        if (detail.prUrl) lines.push(`prUrl: ${detail.prUrl}`);
        lines.push(`merged: ${detail.merged}`);
        if (detail.specReview) lines.push(`specReview: ${detail.specReview}`);
      }
      if (detail.kind === "commit") {
        lines.push(`status: ${detail.status}`);
        if (detail.commitSha) lines.push(`commitSha: ${detail.commitSha}`);
      }
      if (detail.kind !== "project") {
        if (detail.assignee) lines.push(`assignee: ${detail.assignee}`);
        if (detail.needsAttention) {
          lines.push(`attention: ${detail.attentionReason ?? "(no reason)"}`);
        }
      }
      console.log(lines.join("\n"));
      console.log();
      console.log(detail.description || "(no description)");

      if (opts.chat) {
        const { messages, problems } = readChat(id);
        console.log();
        console.log("--- chat ---");
        if (messages.length === 0) console.log("(no messages)");
        for (const message of messages) {
          console.log(`[${message.at}] ${message.name ?? message.role}: ${message.body}`);
        }
        // Malformed chat lines are surfaced as stderr warnings but deliberately
        // do not fail the command: like list()'s `problems`, they are data
        // warnings, not a failure of `show` itself, which still printed the
        // issue and every parseable message. Only thrown errors (e.g. unknown
        // id) set a nonzero exit code.
        for (const problem of problems) {
          console.error(`chat problem: ${problem.message}`);
        }
      }
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
  .command("ready")
  .description("print a project's ready set (next actionable commits + startable branches)")
  .requiredOption("--project <id|title>", "project id or title to scope the ready set to")
  .action((opts) =>
    run(() => {
      const { issues, ready } = list();
      const projectId = resolveProjectId(issues, opts.project);
      const scope = subtreeIds(issues, projectId);
      const byId = new Map(issues.map((issue) => [issue.id, issue]));
      const scoped = ready.filter((id) => scope.has(id));
      if (scoped.length === 0) {
        console.log("nothing ready");
        return;
      }
      for (const id of scoped) {
        const issue = byId.get(id);
        if (issue) console.log(`${issue.kind}\t${id}\t${issue.title}`);
      }
    }),
  );

program
  .command("list")
  .description("print a project's issues, derived state, and any problems as JSON")
  .requiredOption("--project <id|title>", "project id or title to scope the listing to")
  .action((opts) =>
    run(() => {
      const full = list();
      const projectId = resolveProjectId(full.issues, opts.project);
      const scope = subtreeIds(full.issues, projectId);
      const scoped = {
        issues: full.issues.filter((issue) => scope.has(issue.id)),
        problems: full.problems.filter((problem) => scope.has(problem.id)),
        derived: Object.fromEntries(
          Object.entries(full.derived).filter(([id]) => scope.has(id)),
        ),
        ready: full.ready.filter((id) => scope.has(id)),
      };
      console.log(JSON.stringify(scoped, null, 2));
    }),
  );

program
  .command("tree")
  .description(
    "print an indented Project > Epic > Branch > Commit outline with derived chips",
  )
  .option("--project <id|title>", "scope the outline to a project subtree (id or title)")
  .option("--epic <id>", "scope the outline to a single epic subtree")
  .action((opts) =>
    run(() => {
      const { issues, derived } = list();
      const ctx = buildTreeContext(issues, derived);

      if (opts.epic) {
        const epic = issues.find(
          (issue) => issue.id === opts.epic && issue.kind === "epic",
        );
        if (!epic) throw new Error(`unknown epic "${opts.epic}"`);
        console.log(renderEpic(epic, 0, ctx).join("\n"));
        return;
      }

      const epicsOf = new Map<string, IssueRecord[]>();
      for (const issue of issues) {
        if (issue.kind !== "epic") continue;
        const bucket = epicsOf.get(issue.partOf) ?? [];
        bucket.push(issue);
        epicsOf.set(issue.partOf, bucket);
      }

      const projectId = opts.project
        ? resolveProjectId(issues, opts.project)
        : undefined;
      const projects = issues
        .filter((issue): issue is Extract<IssueRecord, { kind: "project" }> =>
          issue.kind === "project" && (!projectId || issue.id === projectId),
        )
        .sort(bySequence);

      const lines: string[] = [];
      for (const project of projects) {
        lines.push(nodeLine(0, "project", project.id, project.title, []));
        for (const epic of (epicsOf.get(project.id) ?? []).sort(bySequence)) {
          lines.push(...renderEpic(epic, 1, ctx));
        }
      }
      if (lines.length === 0) {
        console.log("no projects");
        return;
      }
      console.log(lines.join("\n"));
    }),
  );

program.parseAsync(process.argv);
