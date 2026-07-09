#!/usr/bin/env -S npx tsx
import { Command } from "commander";
import {
  appendMessage,
  create,
  list,
  remove,
  update,
} from "./server/services/issues.js";
import { COMMIT_STATUSES, type CommitStatus } from "./server/schemas.js";

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
  .command("create-epic")
  .argument("<title>", "epic title")
  .option("--assignee <who>", "assignee id")
  .option("--description <text>", "description.md contents")
  .action((title, opts) =>
    run(() =>
      create({
        kind: "epic",
        title,
        assignee: opts.assignee,
        description: opts.description,
      }),
    ),
  );

program
  .command("add-branch")
  .argument("<title>", "branch title")
  .requiredOption("--part-of <epic>", "parent epic id")
  .option("--stacked-on <branch>", "fork-point branch id")
  .option("--assignee <who>", "assignee id")
  .action((title, opts) =>
    run(() =>
      create({
        kind: "branch",
        title,
        partOf: opts.partOf,
        stackedOn: opts.stackedOn,
        assignee: opts.assignee,
      }),
    ),
  );

program
  .command("add-commit")
  .argument("<title>", "commit title")
  .requiredOption("--part-of <branch>", "parent branch id")
  .option("--assignee <who>", "assignee id")
  .action((title, opts) =>
    run(() =>
      create({
        kind: "commit",
        title,
        partOf: opts.partOf,
        assignee: opts.assignee,
      }),
    ),
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
  .command("ready")
  .description("print the ready set (next actionable commits + startable branches)")
  .action(() =>
    run(() => {
      const { issues, ready } = list();
      const byId = new Map(issues.map((issue) => [issue.id, issue]));
      if (ready.length === 0) {
        console.log("nothing ready");
        return;
      }
      for (const id of ready) {
        const issue = byId.get(id);
        if (issue) console.log(`${issue.kind}\t${id}\t${issue.title}`);
      }
    }),
  );

program
  .command("list")
  .description("print all issues, derived state, and any problems as JSON")
  .action(() => {
    console.log(JSON.stringify(list(), null, 2));
  });

program.parseAsync(process.argv);
