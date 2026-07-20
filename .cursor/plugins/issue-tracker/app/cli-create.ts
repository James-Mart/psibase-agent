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

export function registerKindAdd(
  kindCmd: Command,
  kind: IssueKind,
  run: Run,
): void {
  withCreateKindOptions(
    kindCmd.command("add").argument("<title>", `${kind} title`),
    kind,
  ).action((title: string, opts: CreateOpts) =>
    run(() => create(buildCreateInput(kind, title, opts))),
  );
}
