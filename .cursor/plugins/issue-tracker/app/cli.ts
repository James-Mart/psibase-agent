#!/usr/bin/env -S npx tsx
import { Command } from "commander";
import { create, list, remove, update } from "./server/services/issues.js";
import { COMMIT_STATUSES, type CommitStatus } from "./server/schemas.js";

const program = new Command();
program
  .name("issue-tracker")
  .description("File-backed Epic > Branch > Commit tracker")
  .showHelpAfterError();

async function run(action: () => Promise<unknown>): Promise<void> {
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
  .command("list")
  .description("print all issues and any problems as JSON")
  .action(() => {
    console.log(JSON.stringify(list(), null, 2));
  });

program.parseAsync(process.argv);
