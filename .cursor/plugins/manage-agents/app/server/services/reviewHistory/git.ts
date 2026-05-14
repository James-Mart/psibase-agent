import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { dirname } from "path";
import { REPO_ROOT } from "../../config.js";

function git(
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; allowFail?: boolean } = {},
): string {
  if (opts.allowFail) {
    const result = spawnSync("git", args, {
      encoding: "utf-8",
      timeout: opts.timeoutMs,
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
    });
    return result.stdout ?? "";
  }
  return execFileSync("git", args, {
    encoding: "utf-8",
    timeout: opts.timeoutMs,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
}

export function resolveTree(ref: string, repoRoot: string = REPO_ROOT): string {
  return git(["-C", repoRoot, "rev-parse", `${ref}^{tree}`]).trim();
}

export function resolveCommit(ref: string, repoRoot: string = REPO_ROOT): string {
  return git(["-C", repoRoot, "rev-parse", `${ref}^{commit}`]).trim();
}

export function commitTree(
  treeSha: string,
  parentCommit: string | null,
  message: string,
  repoRoot: string = REPO_ROOT,
): string {
  const args = ["-C", repoRoot, "commit-tree", treeSha, "-m", message];
  if (parentCommit) args.splice(4, 0, "-p", parentCommit);
  return git(args).trim();
}

export function treeOf(commitSha: string, repoRoot: string = REPO_ROOT): string {
  return git(["-C", repoRoot, "rev-parse", `${commitSha}^{tree}`]).trim();
}

export function addInternalWorktree(
  commitSha: string,
  dir: string,
  repoRoot: string = REPO_ROOT,
): void {
  mkdirSync(dirname(dir), { recursive: true });
  git(["-C", repoRoot, "worktree", "add", "--detach", dir, commitSha]);
}

export function resetWorktreeToCommit(dir: string, commitSha: string): void {
  git(["-C", dir, "reset", "--hard", commitSha]);
  git(["-C", dir, "clean", "-fdx"]);
}

export function removeInternalWorktree(
  dir: string,
  repoRoot: string = REPO_ROOT,
): void {
  if (existsSync(dir)) {
    git(["-C", repoRoot, "worktree", "remove", "--force", dir], { allowFail: true });
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  git(["-C", repoRoot, "worktree", "prune"], { allowFail: true });
}

export function stageAll(dir: string): void {
  git(["-C", dir, "add", "-A"]);
}

export function writeTree(dir: string): string {
  return git(["-C", dir, "write-tree"]).trim();
}

export function workingTreeMatchesCommit(
  dir: string,
  commitSha: string,
): boolean {
  const result = spawnSync(
    "git",
    ["-C", dir, "diff", "--quiet", commitSha, "--"],
    { encoding: "utf-8" },
  );
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `git diff --quiet failed: ${result.stderr?.toString() ?? ""}`,
    );
  }
  if (result.status !== 0) return false;
  const untracked = git([
    "-C",
    dir,
    "ls-files",
    "--others",
    "--exclude-standard",
  ]).trim();
  return untracked.length === 0;
}

export function unifiedDiff(
  treeA: string,
  treeB: string,
  paths?: string[],
  repoRoot: string = REPO_ROOT,
): string {
  const args = ["-C", repoRoot, "diff", treeA, treeB];
  if (paths && paths.length > 0) args.push("--", ...paths);
  return git(args);
}

export function changedFiles(
  treeA: string,
  treeB: string,
  repoRoot: string = REPO_ROOT,
): string[] {
  const out = git([
    "-C",
    repoRoot,
    "diff",
    "--name-only",
    treeA,
    treeB,
  ]);
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function readFileAtTree(
  treeSha: string,
  path: string,
  repoRoot: string = REPO_ROOT,
): string | null {
  const result = spawnSync("git", ["-C", repoRoot, "show", `${treeSha}:${path}`], {
    encoding: "utf-8",
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

export function createBranchInMainRepo(
  branchName: string,
  commitSha: string,
  opts: { force?: boolean } = {},
  repoRoot: string = REPO_ROOT,
): void {
  const args = ["-C", repoRoot, "branch"];
  if (opts.force) args.push("-f");
  args.push(branchName, commitSha);
  git(args);
}

export function branchExistsInMainRepo(
  branchName: string,
  repoRoot: string = REPO_ROOT,
): boolean {
  const result = spawnSync(
    "git",
    ["-C", repoRoot, "show-ref", "--verify", `refs/heads/${branchName}`],
    { encoding: "utf-8" },
  );
  return result.status === 0;
}

export function verifyBranchTreeMatches(
  branchName: string,
  expectedTree: string,
  repoRoot: string = REPO_ROOT,
): boolean {
  if (!branchExistsInMainRepo(branchName, repoRoot)) return false;
  const branchTree = resolveTree(branchName, repoRoot);
  return branchTree === expectedTree;
}

export interface BranchCommitInfo {
  sha: string;
  subject: string;
}

export function listBranchCommitsSinceMergeBase(
  branchName: string,
  baseCommit: string,
  repoRoot: string = REPO_ROOT,
): BranchCommitInfo[] {
  const out = git([
    "-C",
    repoRoot,
    "log",
    "--reverse",
    "--format=%H%x09%s",
    `${baseCommit}..${branchName}`,
  ]);
  return out
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const tab = line.indexOf("\t");
      return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
}
