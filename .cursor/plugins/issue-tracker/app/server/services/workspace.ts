import { existsSync, statSync } from "fs";
import { isAbsolute, join } from "path";
import type { IssuePatch } from "../schemas.js";
import { IssueError } from "./errors.js";

export function validateWorkspacePath(path: string): void {
  if (!path.trim()) {
    throw new IssueError("validation", "workspace path must be non-empty");
  }
  if (!isAbsolute(path)) {
    throw new IssueError("validation", "workspace path must be absolute");
  }
  if (!existsSync(path)) {
    throw new IssueError("validation", `workspace path does not exist: ${path}`);
  }
  if (!statSync(path).isDirectory()) {
    throw new IssueError("validation", "workspace path must be a directory");
  }
  if (!existsSync(join(path, ".git"))) {
    throw new IssueError(
      "validation",
      "workspace path must contain a .git directory or file",
    );
  }
}

export function validateWorkspacePatch(patch: IssuePatch): void {
  if (!("workspace" in patch)) return;
  const { workspace } = patch;
  if (workspace !== null && workspace !== undefined) {
    validateWorkspacePath(workspace);
  }
}
