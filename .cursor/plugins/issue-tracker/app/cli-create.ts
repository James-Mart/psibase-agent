import type { Command } from "commander";
import {
  resolveDescription,
  withCreateDescriptionOptions,
  type CreateDescriptionOpts,
} from "./cli-io.js";
import { KIND_CAPABILITIES } from "./server/kind.js";
import {
  PARENT_KIND,
  type CreateInput,
  type IssueKind,
} from "./server/schemas.js";
import { create } from "./server/services/issues.js";

type Run = (action: () => unknown) => Promise<void>;

type CreateOpts = CreateDescriptionOpts & {
  partOf?: string;
  assignee?: string;
  stackedOn?: string;
};

/** Legacy top-level aliases kept until the cutover Story deletes them. */
const LEGACY_CREATE_COMMANDS: Partial<Record<IssueKind, string>> = {
  project: "create-project",
  epic: "create-epic",
  story: "add-story",
  task: "add-task",
};

function withCreateKindOptions(cmd: Command, kind: IssueKind): Command {
  const parentKind = PARENT_KIND[kind];
  if (parentKind) {
    cmd = cmd.requiredOption(
      `--part-of <${parentKind}>`,
      `parent ${parentKind} id`,
    );
  }
  if (KIND_CAPABILITIES[kind].assignee) {
    cmd = cmd.option("--assignee <who>", "assignee id");
  }
  if (kind === "story") {
    cmd = cmd.option("--stacked-on <story>", "fork-point story id");
  }
  return withCreateDescriptionOptions(cmd);
}

function buildCreateInput(
  kind: IssueKind,
  title: string,
  opts: CreateOpts,
): CreateInput {
  return {
    kind,
    title,
    partOf: opts.partOf,
    stackedOn: opts.stackedOn,
    assignee: opts.assignee,
    description: resolveDescription(opts),
  };
}

export function registerCreateCommand(
  parent: Command,
  name: string,
  kind: IssueKind,
  run: Run,
): void {
  withCreateKindOptions(
    parent.command(name).argument("<title>", `${kind} title`),
    kind,
  ).action((title: string, opts: CreateOpts) =>
    run(() => create(buildCreateInput(kind, title, opts))),
  );
}

export function registerKindAdd(
  kindCmd: Command,
  kind: IssueKind,
  run: Run,
): void {
  registerCreateCommand(kindCmd, "add", kind, run);
}

export function registerLegacyCreateCommands(program: Command, run: Run): void {
  for (const kind of Object.keys(LEGACY_CREATE_COMMANDS) as IssueKind[]) {
    const name = LEGACY_CREATE_COMMANDS[kind];
    if (name) registerCreateCommand(program, name, kind, run);
  }
}
