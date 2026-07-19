import { readFileSync } from "fs";
import type { Command } from "commander";

/** Read a CLI `--file`/`--description-file` path; `-` means stdin. */
export function readCliFileArg(path: string): string {
  const source = path === "-" ? 0 : path;
  return readFileSync(source, "utf8");
}

export type CreateDescriptionOpts = {
  description?: string;
  descriptionFile?: string;
};

// Resolve a description from either inline text or a file path. `--description-file`
// wins when both are given; returns undefined when neither is provided so callers
// can fall back to the default `# <title>` seed.
export function resolveDescription(
  opts: CreateDescriptionOpts,
): string | undefined {
  if (opts.descriptionFile) {
    return readCliFileArg(opts.descriptionFile);
  }
  return opts.description;
}

/** Shared `--description` / `--description-file` flags for create/add verbs. */
export function withCreateDescriptionOptions(cmd: Command): Command {
  return cmd
    .option("--description <text>", "description.md contents")
    .option(
      "--description-file <path>",
      "read description.md contents from a file (use - for stdin)",
    );
}
