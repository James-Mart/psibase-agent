import { execFileSync } from "child_process";
import type { UnstagedFile } from "../types.js";

function git(args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): string {
  return execFileSync("git", args, {
    encoding: "utf-8",
    timeout: opts.timeoutMs,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
}

const GITHUB_HTTPS_PREFIX = "https://github.com/";
const GITHUB_SSH_PREFIX = "git@github.com:";
const GITHUB_SSH_INSTEADOF_KEY = `url.${GITHUB_SSH_PREFIX}.insteadOf`;

function sshGithubToHttps(url: string): string | null {
  if (url.startsWith(GITHUB_HTTPS_PREFIX)) return null;
  const scpMatch = url.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (scpMatch) {
    const repoPath = scpMatch[1].replace(/\.git$/, "");
    return `${GITHUB_HTTPS_PREFIX}${repoPath}.git`;
  }
  const sshMatch = url.match(/^ssh:\/\/git@github\.com\/(.+?)(?:\.git)?$/);
  if (sshMatch) return `${GITHUB_HTTPS_PREFIX}${sshMatch[1]}.git`;
  return null;
}

/** Use HTTPS + gh credential helper; this environment has no SSH keys. */
export function ensureGitHubHttpsAuth(repoRoot: string): void {
  try {
    git(["-C", repoRoot, "config", "--local", "--unset-all", GITHUB_SSH_INSTEADOF_KEY]);
  } catch {}

  let originUrl: string;
  try {
    originUrl = git(["-C", repoRoot, "remote", "get-url", "origin"]).trim();
  } catch {
    return;
  }

  const httpsUrl = sshGithubToHttps(originUrl);
  if (httpsUrl) {
    git(["-C", repoRoot, "remote", "set-url", "origin", httpsUrl]);
  }
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

export function fetchOrigin(repoRoot: string): void {
  ensureGitHubHttpsAuth(repoRoot);
  git(["-C", repoRoot, "fetch", "origin", "--prune"], { timeoutMs: 30_000 });
}

export interface BranchCheckResult {
  localExists: boolean;
  remoteRef: string | null;
}

export function checkBranch(repoRoot: string, name: string): BranchCheckResult {
  let localExists = false;
  try {
    git(["-C", repoRoot, "show-ref", "--verify", `refs/heads/${name}`]);
    localExists = true;
  } catch {}
  let remoteRef: string | null = null;
  try {
    git(["-C", repoRoot, "show-ref", "--verify", `refs/remotes/origin/${name}`]);
    remoteRef = `origin/${name}`;
  } catch {}
  return { localExists, remoteRef };
}

export function addWorktree(
  repoRoot: string,
  worktreePath: string,
  branch: string,
  opts: { source?: string; existing?: boolean },
): void {
  ensureGitHubHttpsAuth(repoRoot);
  if (opts.existing) {
    git(["-C", repoRoot, "worktree", "add", worktreePath, branch]);
  } else {
    const source = opts.source ?? "origin/main";
    if (source.startsWith("origin/")) {
      const remoteBranch = source.slice("origin/".length);
      git(["-C", repoRoot, "fetch", "origin", remoteBranch], { timeoutMs: 30_000 });
    }
    git(["-C", repoRoot, "worktree", "add", "--no-track", "-b", branch, worktreePath, source]);
  }
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
