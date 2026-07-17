import { readFileSync } from "fs";

/** Read a CLI `--file`/`--description-file` path; `-` means stdin. */
export function readCliFileArg(path: string): string {
  const source = path === "-" ? 0 : path;
  return readFileSync(source, "utf8");
}
