import { execFileSync, spawn } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve, sep } from "path";

import {
  MAIN_WORKER_NAME,
  REPO_ROOT,
  WORKTREES_DIR,
} from "../config.js";
import {
  deleteChainsForWorker,
  deleteBuildsForWorker,
  deleteRhsSessionsForWorker,
  deleteWorker as deleteWorkerRow,
  getNote,
  getSourceBranch,
  getStatus,
  renameBuildsForWorker,
  renameChainsForWorker,
  renameRhsSessionsForWorker,
  renameWorker as renameWorkerRow,
  upsertNote,
  upsertSourceBranch,
  upsertStatus,
  type WorkerStatus,
} from "../db.js";
import { HttpError } from "../errors.js";
import {
  assertNoRunningBuild,
  cancelBuildIfRunning,
} from "./builds.js";
import {
  assertNoRunningChain,
  cancelChainIfRunning,
  getActiveChainPort,
} from "./chains.js";
import type {
  CreateWorkerResult,
  DeleteWorkerResult,
  WorkerDetails,
  WorkerInfo,
} from "../types.js";
import {
  addWorktree,
  deleteBranch,
  getCurrentBranch,
  getStatusPorcelain,
  removeWorktree,
} from "./git.js";
import {
  getAgentProcesses,
  killProcess,
  waitForExit,
} from "./processes.js";
import { fetchAllPrs, fetchPrForBranch } from "./pullRequests.js";
import {
  listSessionsForWorker as listRhsSessions,
  tearDownAllSessionsForWorker as tearDownRhsWorktreesForWorker,
} from "./reviewHistory/sessions.js";
import { cancelRun as cancelRhsRun } from "./reviewHistory/agents.js";
import { getRunningRhsRunForSession } from "../db.js";
import { renameWorktreeOnDisk } from "./worktreeRename.js";

const WORKER_NAME_RE = /^[a-zA-Z0-9._-]+$/;
const DEFAULT_SOURCE_BRANCH = "origin/main";

export function resolveSafeWorkerDir(name: string): string | null {
  if (name === MAIN_WORKER_NAME) return REPO_ROOT;
  if (!WORKER_NAME_RE.test(name)) return null;
  // Names starting with `_` are reserved for internal subtrees (e.g. the
  // `_review-synthesis/` synthesis worktrees) and never address a worker.
  if (name.startsWith("_")) return null;
  const workerDir = join(WORKTREES_DIR, name);
  const resolved = resolve(workerDir);
  const base = resolve(WORKTREES_DIR);
  if (resolved !== base && !resolved.startsWith(base + sep)) return null;
  return workerDir;
}

export function requireWorkerDir(name: string): string {
  const dir = resolveSafeWorkerDir(name);
  if (!dir) throw new HttpError(400, "Invalid worker name");
  if (!existsSync(dir)) throw new HttpError(404, `Worktree ${name} not found`);
  return dir;
}

export function listWorkers(): WorkerInfo[] {
  const agents = getAgentProcesses();
  const prMap = fetchAllPrs();
  const workers: WorkerInfo[] = [];

  const mainBranch = getCurrentBranch(REPO_ROOT) || "(unknown)";
  const mainPid = agents.get(REPO_ROOT) ?? null;
  workers.push({
    name: MAIN_WORKER_NAME,
    path: REPO_ROOT,
    branch: mainBranch,
    agentRunning: mainPid !== null,
    agentPid: mainPid,
    status: getStatus(MAIN_WORKER_NAME),
    pr: prMap.get(mainBranch) ?? null,
    isMain: true,
    chainPort: getActiveChainPort(MAIN_WORKER_NAME),
  });

  if (existsSync(WORKTREES_DIR)) {
    for (const entry of readdirSync(WORKTREES_DIR)) {
      // Underscore-prefixed entries hold internal subtrees (e.g. review-synthesis worktrees) and never appear as workers.
      if (entry.startsWith("_")) continue;
      const fullPath = join(WORKTREES_DIR, entry);
      try {
        if (!statSync(fullPath).isDirectory()) continue;
      } catch {
        continue;
      }

      const branch = getCurrentBranch(fullPath) || "(unknown)";
      const pid = agents.get(fullPath) ?? null;
      workers.push({
        name: entry,
        path: fullPath,
        branch,
        agentRunning: pid !== null,
        agentPid: pid,
        status: getStatus(entry),
        pr: prMap.get(branch) ?? null,
        chainPort: getActiveChainPort(entry),
      });
    }
  }

  workers.sort((a, b) => a.name.localeCompare(b.name));
  return workers;
}

export interface CreateWorkerInput {
  branch: string;
  sourceBranch?: string;
  existingBranch?: boolean;
  remoteOnly?: boolean;
}

export function createWorker(input: CreateWorkerInput): CreateWorkerResult {
  const worktreeName = input.branch.replace(/\//g, "-");
  const worktreePath = join(WORKTREES_DIR, worktreeName);

  if (existsSync(worktreePath)) {
    throw new HttpError(409, `Worktree directory already exists: ${worktreePath}`);
  }

  try {
    if (input.existingBranch) {
      addWorktree(REPO_ROOT, worktreePath, input.branch, { existing: true });
    } else if (input.remoteOnly) {
      addWorktree(REPO_ROOT, worktreePath, input.branch, { source: `origin/${input.branch}` });
    } else {
      const source = input.sourceBranch?.trim() || DEFAULT_SOURCE_BRANCH;
      addWorktree(REPO_ROOT, worktreePath, input.branch, { source });
    }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: unknown; message?: string };
    const stderr = typeof e.stderr === "string"
      ? e.stderr
      : (e.stderr as { toString?: () => string } | undefined)?.toString?.() ?? "";
    throw new HttpError(500, "git worktree add failed", {
      output: e.stdout ?? "",
      stderr: stderr || e.message || "",
    });
  }

  try {
    execFileSync("bash", [".vscode/scripts/env-setup.sh"], {
      cwd: worktreePath,
      encoding: "utf-8",
      timeout: 300_000,
    });
  } catch (err: unknown) {
    const e = err as { stderr?: string };
    throw new HttpError(500, "env-setup.sh failed", {
      output: "",
      stderr: e.stderr ?? "",
    });
  }

  const sourceBranch = input.existingBranch
    ? input.branch
    : input.remoteOnly
      ? `origin/${input.branch}`
      : (input.sourceBranch?.trim() || DEFAULT_SOURCE_BRANCH);
  upsertSourceBranch(worktreeName, sourceBranch);

  return { worktreeName, worktreePath, branch: input.branch, output: "" };
}

export function startAgent(name: string): { pid: number | undefined } {
  const workerDir = requireWorkerDir(name);

  const agents = getAgentProcesses();
  const existing = agents.get(workerDir);
  if (existing !== undefined) {
    throw new HttpError(409, "Agent already running", { pid: existing });
  }

  const args =
    name === MAIN_WORKER_NAME
      ? ["worker", "start", "--worker-dir", workerDir]
      : ["worker", "start", "--name", name];
  const child = spawn("agent", args, {
    cwd: workerDir,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { pid: child.pid };
}

export function stopAgent(name: string): { ok: true; pid: number } {
  const workerDir = requireWorkerDir(name);
  const pid = getAgentProcesses().get(workerDir);
  if (!pid) {
    throw new HttpError(404, `No running agent found for ${name}`);
  }
  killProcess(pid, "SIGTERM");
  return { ok: true, pid };
}

export function getWorkerDetails(name: string): WorkerDetails {
  const workerDir = requireWorkerDir(name);
  const unstagedFiles = getStatusPorcelain(workerDir);
  const branch = getCurrentBranch(workerDir);
  const pr = fetchPrForBranch(branch);
  return {
    unstagedFiles,
    note: getNote(name),
    sourceBranch: getSourceBranch(name),
    pr,
  };
}

export function updateNote(name: string, note: string): { ok: true } {
  requireWorkerDir(name);
  upsertNote(name, note);
  return { ok: true };
}

export function updateStatus(
  name: string,
  status: WorkerStatus,
): { ok: true } {
  requireWorkerDir(name);
  upsertStatus(name, status);
  return { ok: true };
}

export function renameWorker(
  name: string,
  newName: string,
): { ok: true; newName: string } {
  if (name === MAIN_WORKER_NAME) {
    throw new HttpError(403, "Cannot rename the main worktree");
  }
  if (newName === name) {
    throw new HttpError(400, "New name is the same as the current name");
  }
  const oldWorkerDir = requireWorkerDir(name);
  const newWorkerDir = join(WORKTREES_DIR, newName);
  if (existsSync(newWorkerDir)) {
    throw new HttpError(409, `Worktree ${newName} already exists`);
  }
  if (getAgentProcesses().has(oldWorkerDir)) {
    throw new HttpError(
      409,
      "Cannot rename while agent is running. Stop it first.",
    );
  }
  assertNoRunningBuild(name);
  assertNoRunningChain(name);

  try {
    renameWorktreeOnDisk(oldWorkerDir, newWorkerDir, name, newName);
  } catch (err: unknown) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(500, `Rename failed: ${message}`);
  }

  renameWorkerRow(name, newName);
  renameBuildsForWorker(name, newName);
  renameChainsForWorker(name, newName);
  renameRhsSessionsForWorker(name, newName);
  return { ok: true, newName };
}

export async function deleteWorker(name: string): Promise<DeleteWorkerResult> {
  if (name === MAIN_WORKER_NAME) {
    throw new HttpError(403, "Cannot delete the main worktree");
  }
  const workerDir = requireWorkerDir(name);

  const pid = getAgentProcesses().get(workerDir);
  if (pid) {
    try {
      killProcess(pid, "SIGTERM");
    } catch {
      // already gone
    }
    await waitForExit(pid, 8000);
  }

  await cancelBuildIfRunning(name);
  await cancelChainIfRunning(name);

  const branch = getCurrentBranch(workerDir);

  let logs: string[];
  try {
    logs = removeWorktree(REPO_ROOT, workerDir).logs;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Git worktree remove failed";
    throw new HttpError(500, message);
  }

  for (const session of listRhsSessions(name)) {
    const running = getRunningRhsRunForSession(session.id);
    if (running) {
      try {
        await cancelRhsRun(running.id);
      } catch {}
    }
  }
  tearDownRhsWorktreesForWorker(name);

  const { branchDeleted, branchDeleteMessage } = deleteBranch(REPO_ROOT, branch);
  deleteWorkerRow(name);
  deleteBuildsForWorker(name);
  deleteChainsForWorker(name);
  deleteRhsSessionsForWorker(name);

  return {
    ok: true,
    branch: branch || null,
    branchDeleted,
    branchDeleteMessage,
    output: logs.length ? logs.join("\n") : undefined,
  };
}
