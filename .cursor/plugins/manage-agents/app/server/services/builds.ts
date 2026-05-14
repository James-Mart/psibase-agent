import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
} from "fs";
import { join } from "path";
import {
  type BuildRow,
  getLatestBuildForWorker,
  insertBuild,
  listLatestBuilds as dbListLatestBuilds,
  listUnfinishedBuilds,
  setBuildFinished,
} from "../db.js";
import { HttpError } from "../errors.js";
import { isAlive } from "./processes.js";
import { requireWorkerDir } from "./workers.js";

export type BuildStatus =
  | "idle"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export type LogStream = "stdout" | "stderr";

export interface BuildInfo {
  status: BuildStatus;
  buildId: number | null;
  pid: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  stdoutSize: number;
  stderrSize: number;
}

export interface BuildSummary {
  workerName: string;
  status: BuildStatus;
  buildId: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
}

export interface LogChunk {
  content: string;
  nextOffset: number;
  totalSize: number;
  eof: boolean;
}

interface BuildPaths {
  buildDir: string;
  stdoutPath: string;
  stderrPath: string;
  exitcodePath: string;
}

function buildPaths(worktreeDir: string): BuildPaths {
  const buildDir = join(worktreeDir, "build");
  return {
    buildDir,
    stdoutPath: join(buildDir, "build.log"),
    stderrPath: join(buildDir, "build.err.log"),
    exitcodePath: join(buildDir, ".exitcode"),
  };
}

function safeStatSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function readExitCode(path: string): number | null {
  try {
    const text = readFileSync(path, "utf-8").trim();
    if (!text) return null;
    const n = Number.parseInt(text, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const runningBuilds = new Map<string, ChildProcess>();

export const buildEvents = new EventEmitter();
buildEvents.setMaxListeners(50);

function rowToStatus(row: BuildRow): BuildStatus {
  if (row.finished_at === null) return "running";
  if (row.cancelled) return "cancelled";
  if (row.exit_code === 0) return "success";
  return "failed";
}

function rowToSummary(row: BuildRow): BuildSummary {
  return {
    workerName: row.worker_name,
    status: rowToStatus(row),
    buildId: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
  };
}

function finalizeBuild(
  id: number,
  workerName: string,
  exitCode: number | null,
  cancelled: boolean,
): void {
  if (!setBuildFinished(id, exitCode, cancelled)) return;
  const row = getLatestBuildForWorker(workerName);
  if (!row || row.id !== id) return;
  buildEvents.emit("finished", rowToSummary(row));
}

function reconcileRow(row: BuildRow): BuildRow {
  if (row.finished_at !== null) return row;
  if (isAlive(row.pid)) return row;

  // Process is gone (or a zombie that `isAlive` detected). Read the .exitcode
  // sentinel for an authoritative exit code; a missing file means the build
  // was killed before the wrapper got to write it.
  const worktreeDir = (() => {
    try {
      return requireWorkerDir(row.worker_name);
    } catch {
      return null;
    }
  })();
  const exitCode = worktreeDir
    ? readExitCode(buildPaths(worktreeDir).exitcodePath)
    : null;

  finalizeBuild(row.id, row.worker_name, exitCode, false);
  const updated = getLatestBuildForWorker(row.worker_name);
  return updated ?? {
    ...row,
    finished_at: new Date().toISOString(),
    exit_code: exitCode,
  };
}

function rowToBuildInfo(row: BuildRow, worktreeDir: string): BuildInfo {
  const paths = buildPaths(worktreeDir);
  return {
    status: rowToStatus(row),
    buildId: row.id,
    pid: row.pid,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exitCode: row.exit_code,
    stdoutSize: safeStatSize(paths.stdoutPath),
    stderrSize: safeStatSize(paths.stderrPath),
  };
}

function emptyBuildInfo(): BuildInfo {
  return {
    status: "idle",
    buildId: null,
    pid: null,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    stdoutSize: 0,
    stderrSize: 0,
  };
}

export function getBuildStatus(name: string): BuildInfo {
  const worktreeDir = requireWorkerDir(name);
  const row = getLatestBuildForWorker(name);
  if (!row) return emptyBuildInfo();
  return rowToBuildInfo(reconcileRow(row), worktreeDir);
}

export function listLatestBuilds(): BuildSummary[] {
  return dbListLatestBuilds().map((row) => rowToSummary(reconcileRow(row)));
}

export function startBuild(name: string): { buildId: number; pid: number } {
  const worktreeDir = requireWorkerDir(name);
  const existing = getLatestBuildForWorker(name);
  if (existing && rowToStatus(reconcileRow(existing)) === "running") {
    throw new HttpError(409, "Build already running");
  }

  const paths = buildPaths(worktreeDir);
  mkdirSync(paths.buildDir, { recursive: true });
  rmSync(paths.exitcodePath, { force: true });

  const outFd = openSync(paths.stdoutPath, "w");
  const errFd = openSync(paths.stderrPath, "w");

  const child = spawn(
    "bash",
    [
      "-c",
      "stdbuf -oL -eL bash .vscode/scripts/build.sh; echo $? > build/.exitcode",
    ],
    {
      cwd: worktreeDir,
      detached: true,
      stdio: ["ignore", outFd, errFd],
    },
  );

  closeSync(outFd);
  closeSync(errFd);

  if (typeof child.pid !== "number") {
    throw new HttpError(500, "Failed to spawn build process");
  }

  child.unref();

  const buildId = insertBuild(name, child.pid, new Date().toISOString());
  runningBuilds.set(name, child);

  child.on("exit", (code, signal) => {
    runningBuilds.delete(name);
    const cancelled = signal === "SIGTERM" || signal === "SIGKILL";
    const exitCode = typeof code === "number"
      ? code
      : readExitCode(paths.exitcodePath);
    finalizeBuild(buildId, name, exitCode, cancelled);
  });

  return { buildId, pid: child.pid };
}

const CANCEL_GRACE_MS = 5_000;

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ESRCH") throw err;
  }
}

export async function cancelBuild(name: string): Promise<{ ok: true }> {
  const row = getLatestBuildForWorker(name);
  if (!row || rowToStatus(reconcileRow(row)) !== "running") {
    throw new HttpError(404, "No running build to cancel");
  }
  const pid = row.pid;
  killProcessGroup(pid, "SIGTERM");

  const deadline = Date.now() + CANCEL_GRACE_MS;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return { ok: true };
    await new Promise((r) => setTimeout(r, 100));
  }
  if (isAlive(pid)) killProcessGroup(pid, "SIGKILL");
  return { ok: true };
}

export function cancelBuildIfRunning(name: string): Promise<void> {
  const row = getLatestBuildForWorker(name);
  if (!row || rowToStatus(reconcileRow(row)) !== "running") {
    return Promise.resolve();
  }
  return cancelBuild(name).then(() => undefined);
}

export function assertNoRunningBuild(name: string): void {
  const row = getLatestBuildForWorker(name);
  if (!row) return;
  if (rowToStatus(reconcileRow(row)) === "running") {
    throw new HttpError(
      409,
      "Cannot proceed while build is running. Cancel it first.",
    );
  }
}

// Without an active reconciler, builds whose parent server died (e.g. after a
// dev hot reload) only get finalized when something polls `getBuildStatus` for
// that worker. That means SSE subscribers (e.g. the BuildNotifier on a
// background tab) never see a `finished` event. The reconciler periodically
// finalizes any unfinished build whose `.exitcode` sentinel exists or whose
// pid is no longer alive, ensuring events fire regardless of UI focus.
const RECONCILE_INTERVAL_MS = 3_000;

function reconcileAllUnfinished(): void {
  for (const row of listUnfinishedBuilds()) {
    reconcileRow(row);
  }
}

export function startBuildReconciler(): () => void {
  reconcileAllUnfinished();
  const handle = setInterval(reconcileAllUnfinished, RECONCILE_INTERVAL_MS);
  handle.unref?.();
  return () => clearInterval(handle);
}

export function readBuildLog(
  name: string,
  stream: LogStream,
  offset: number,
  limit: number,
): LogChunk {
  const worktreeDir = requireWorkerDir(name);
  const paths = buildPaths(worktreeDir);
  const path = stream === "stdout" ? paths.stdoutPath : paths.stderrPath;

  let totalSize = 0;
  try {
    totalSize = statSync(path).size;
  } catch {
    return { content: "", nextOffset: offset, totalSize: 0, eof: true };
  }

  const safeOffset = Math.max(0, Math.min(offset, totalSize));
  if (safeOffset >= totalSize) {
    return { content: "", nextOffset: totalSize, totalSize, eof: true };
  }

  const remaining = totalSize - safeOffset;
  const toRead = Math.min(limit, remaining);
  const buf = Buffer.alloc(toRead);
  const fd = openSync(path, "r");
  let bytesRead = 0;
  try {
    bytesRead = readSync(fd, buf, 0, toRead, safeOffset);
  } finally {
    closeSync(fd);
  }
  const nextOffset = safeOffset + bytesRead;
  return {
    content: buf.subarray(0, bytesRead).toString("utf-8"),
    nextOffset,
    totalSize,
    eof: nextOffset >= totalSize,
  };
}
