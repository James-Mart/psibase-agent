import { execFileSync, spawn } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve, sep } from "path";

function bash(args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): string {
  return execFileSync("bash", args, {
    encoding: "utf-8",
    timeout: opts.timeoutMs,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
}

import {
  CREATE_WORKER_SCRIPT,
  REPO_ROOT,
  WORKTREES_DIR,
} from "../config.js";
import {
  deleteWorker as deleteWorkerRow,
  getNote,
  getSourceBranch,
  getStatus,
  renameWorker as renameWorkerRow,
  upsertNote,
  upsertSourceBranch,
  upsertStatus,
  type WorkerStatus,
} from "../db.js";
import { HttpError } from "../errors.js";
import type {
  CreateWorkerResult,
  DeleteWorkerResult,
  WorkerDetails,
  WorkerInfo,
} from "../types.js";
import {
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
import { renameWorktreeOnDisk } from "./worktreeRename.js";

const WORKER_NAME_RE = /^[a-zA-Z0-9._-]+$/;
const DEFAULT_SOURCE_BRANCH = "origin/main";

export function resolveSafeWorkerDir(name: string): string | null {
  if (!WORKER_NAME_RE.test(name)) return null;
  const workerDir = join(WORKTREES_DIR, name);
  const resolved = resolve(workerDir);
  const base = resolve(WORKTREES_DIR);
  if (resolved !== base && !resolved.startsWith(base + sep)) return null;
  return workerDir;
}

function requireWorkerDir(name: string): string {
  const dir = resolveSafeWorkerDir(name);
  if (!dir) throw new HttpError(400, "Invalid worker name");
  if (!existsSync(dir)) throw new HttpError(404, `Worktree ${name} not found`);
  return dir;
}

export function listWorkers(): WorkerInfo[] {
  if (!existsSync(WORKTREES_DIR)) return [];

  const agents = getAgentProcesses();
  const prMap = fetchAllPrs();
  const workers: WorkerInfo[] = [];

  for (const entry of readdirSync(WORKTREES_DIR)) {
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
    });
  }

  workers.sort((a, b) => a.name.localeCompare(b.name));
  return workers;
}

export interface CreateWorkerInput {
  branch: string;
  sourceBranch?: string;
}

export function createWorker(input: CreateWorkerInput): CreateWorkerResult {
  const args = [CREATE_WORKER_SCRIPT, input.branch];
  if (input.sourceBranch) args.push(input.sourceBranch);

  let output: string;
  try {
    output = bash(args, { cwd: REPO_ROOT, timeoutMs: 300_000 });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string };
    throw new HttpError(500, "create-worker.sh failed", {
      output: e.stdout ?? "",
      stderr: e.stderr ?? "",
    });
  }

  const worktreeName = output.match(/WORKTREE_NAME=(\S+)/)?.[1] ?? null;
  const worktreePath = output.match(/WORKTREE_PATH=(\S+)/)?.[1] ?? null;
  const branch = output.match(/BRANCH=(\S+)/)?.[1] ?? input.branch;

  if (worktreeName) {
    upsertSourceBranch(worktreeName, input.sourceBranch ?? DEFAULT_SOURCE_BRANCH);
  }

  return { worktreeName, worktreePath, branch, output };
}

export function startAgent(name: string): { pid: number | undefined } {
  const workerDir = requireWorkerDir(name);

  const agents = getAgentProcesses();
  const existing = agents.get(workerDir);
  if (existing !== undefined) {
    throw new HttpError(409, "Agent already running", { pid: existing });
  }

  const child = spawn("agent", ["worker", "start", "--name", name], {
    cwd: workerDir,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { pid: child.pid };
}

export function stopAgent(name: string): { ok: true; pid: number } {
  const workerDir = join(WORKTREES_DIR, name);
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
  const pr = fetchPrForBranch(branch, workerDir);
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

  try {
    renameWorktreeOnDisk(oldWorkerDir, newWorkerDir, name, newName);
  } catch (err: unknown) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(500, `Rename failed: ${message}`);
  }

  renameWorkerRow(name, newName);
  return { ok: true, newName };
}

export async function deleteWorker(name: string): Promise<DeleteWorkerResult> {
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

  const branch = getCurrentBranch(workerDir);

  let logs: string[];
  try {
    logs = removeWorktree(REPO_ROOT, workerDir).logs;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Git worktree remove failed";
    throw new HttpError(500, message);
  }

  const { branchDeleted, branchDeleteMessage } = deleteBranch(REPO_ROOT, branch);
  deleteWorkerRow(name);

  return {
    ok: true,
    branch: branch || null,
    branchDeleted,
    branchDeleteMessage,
    output: logs.length ? logs.join("\n") : undefined,
  };
}
