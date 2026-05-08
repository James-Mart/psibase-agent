import { execFileSync } from "child_process";
import type { UnstagedFile } from "../types.js";

function git(args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): string {
  return execFileSync("git", args, {
    encoding: "utf-8",
    timeout: opts.timeoutMs,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
}

export function getCurrentBranch(workerDir: string): string {
  try {
    return git(["-C", workerDir, "rev-parse", "--abbrev-ref", "HEAD"]).trim();
  } catch {
    return "";
  }
}

export function getStatusPorcelain(workerDir: string): UnstagedFile[] {
  let out: string;
  try {
    out = git(["-C", workerDir, "status", "--porcelain", "-uall"]);
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => ({ path: line.slice(3), status: line.slice(0, 2).trim() }));
}

export interface RemoveWorktreeResult {
  logs: string[];
}

export function removeWorktree(repoRoot: string, workerDir: string): RemoveWorktreeResult {
  const logs: string[] = [];
  const runCollect = (args: string[]) => {
    try {
      const out = git(args);
      if (out.trim()) logs.push(out.trim());
    } catch (err: unknown) {
      const stderr =
        (err as { stderr?: { toString?: () => string } })?.stderr?.toString?.() ??
        (err instanceof Error ? err.message : String(err));
      throw new Error(stderr.trim() || `git ${args.join(" ")} failed`);
    }
  };

  runCollect(["-C", repoRoot, "worktree", "remove", "--force", workerDir]);
  runCollect(["-C", repoRoot, "worktree", "prune"]);
  return { logs };
}

export interface DeleteBranchResult {
  branchDeleted: boolean;
  branchDeleteMessage?: string;
}

export function deleteBranch(repoRoot: string, branch: string): DeleteBranchResult {
  if (!branch) {
    return {
      branchDeleted: false,
      branchDeleteMessage: "Skipped branch delete (could not resolve branch)",
    };
  }
  if (branch === "HEAD") {
    return {
      branchDeleted: false,
      branchDeleteMessage: "Skipped branch delete (detached HEAD)",
    };
  }
  if (branch === "(unknown)") {
    return {
      branchDeleted: false,
      branchDeleteMessage: "Skipped branch delete (could not resolve branch)",
    };
  }

  try {
    git(["-C", repoRoot, "branch", "-D", branch]);
    return { branchDeleted: true };
  } catch (err: unknown) {
    const stderr =
      (err as { stderr?: { toString?: () => string } })?.stderr?.toString?.() ??
      (err instanceof Error ? err.message : String(err));
    return {
      branchDeleted: false,
      branchDeleteMessage: stderr.trim() || "branch -D failed",
    };
  }
}
