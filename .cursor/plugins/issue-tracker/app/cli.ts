#!/usr/bin/env -S npx tsx
import { readFileSync } from "fs";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";
import {
  appendMessage,
  create,
  list,
  remove,
  update,
} from "./server/services/issues.js";
import {
  COMMIT_STATUSES,
  type CommitStatus,
  type IssueRecord,
} from "./server/schemas.js";
import { projectSubtreeIds } from "./server/services/subtree.js";
import { apply } from "./server/services/apply.js";
import { parseApplyDoc } from "./server/services/apply-schema.js";

function requireProject(issues: IssueRecord[], projectId: string): void {
  const project = issues.find(
    (issue) => issue.id === projectId && issue.kind === "project",
  );
  if (!project) throw new Error(`unknown project "${projectId}"`);
}

// Resolve a description from either inline text or a file path. `--description-file`
// wins when both are given; returns undefined when neither is provided so callers
// can fall back to the default `# <title>` seed.
function resolveDescription(opts: {
  description?: string;
  descriptionFile?: string;
}): string | undefined {
  if (opts.descriptionFile) return readFileSync(opts.descriptionFile, "utf8");
  return opts.description;
}

const program = new Command();
program
  .name("issue-tracker")
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
  .option("--description-file <path>", "read description.md contents from a file")
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
  .option("--description-file <path>", "read description.md contents from a file")
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
  .option("--description-file <path>", "read description.md contents from a file")
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
  .option("--description-file <path>", "read description.md contents from a file")
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
    "upsert a whole Project > Epic > Branch > Commit tree from one nested YAML doc",
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
    }),
  );

program
  .command("set-status")
  .argument("<id>", "commit id")
  .argument("<status>", `one of: ${COMMIT_STATUSES.join(", ")}`)
  .action((id, status) =>
    run(() => {
      if (!(COMMIT_STATUSES as readonly string[]).includes(status)) {
        throw new Error(
          `invalid status "${status}" (expected: ${COMMIT_STATUSES.join(", ")})`,
        );
      }
      return update(id, { status: status as CommitStatus });
    }),
  );

program
  .command("set-commit")
  .argument("<id>", "commit id")
  .argument("<sha>", "git commit sha")
  .action((id, sha) => run(() => update(id, { commitSha: sha })));

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
  .command("block")
  .argument("<id>", "branch id")
  .requiredOption("--by <branchIds...>", "blocking branch ids")
  .action((id, opts) => run(() => update(id, { blockedBy: opts.by })));

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
  .option("--description-file <path>", "read description.md contents from a file")
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
  .requiredOption("--project <id>", "project id to scope the ready set to")
  .action((opts) =>
    run(() => {
      const { issues, ready } = list();
      requireProject(issues, opts.project);
      const scope = projectSubtreeIds(issues, opts.project);
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
  .requiredOption("--project <id>", "project id to scope the listing to")
  .action((opts) =>
    run(() => {
      const full = list();
      requireProject(full.issues, opts.project);
      const scope = projectSubtreeIds(full.issues, opts.project);
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

program.parseAsync(process.argv);
