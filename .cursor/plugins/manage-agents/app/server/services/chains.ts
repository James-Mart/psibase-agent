import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
} from "fs";
import { createConnection } from "net";
import { join } from "path";
import {
  type ChainRow,
  getChainPort,
  getLatestChainForWorker,
  insertChain,
  listAssignedChainPorts,
  listLatestChains as dbListLatestChains,
  listUnfinishedChains,
  setChainBootFinished,
  setChainBootStarted,
  setChainLaunchFinished,
  upsertChainPort,
} from "../db.js";
import { HttpError } from "../errors.js";
import { isAlive } from "./processes.js";
import { requireWorkerDir } from "./workers.js";

export type ChainStatus =
  | "idle"
  | "launching"
  | "booting"
  | "ready"
  | "boot-failed"
  | "failed"
  | "stopped";

export type ChainPhase = "launch" | "boot";
export type LogStream = "stdout" | "stderr";

export interface ChainInfo {
  status: ChainStatus;
  chainId: number | null;
  port: number | null;
  launchPid: number | null;
  bootPid: number | null;
  launchStartedAt: string | null;
  launchFinishedAt: string | null;
  launchExitCode: number | null;
  bootStartedAt: string | null;
  bootFinishedAt: string | null;
  bootExitCode: number | null;
  launchStdoutSize: number;
  launchStderrSize: number;
  bootStdoutSize: number;
  bootStderrSize: number;
  psinodeAvailable: boolean;
}

export interface ChainSummary {
  workerName: string;
  status: ChainStatus;
  chainId: number | null;
  port: number | null;
  launchStartedAt: string | null;
  launchFinishedAt: string | null;
  bootFinishedAt: string | null;
}

export interface LogChunk {
  content: string;
  nextOffset: number;
  totalSize: number;
  eof: boolean;
}

interface ChainPaths {
  chainDir: string;
  launchStdout: string;
  launchStderr: string;
  launchExitcode: string;
  bootStdout: string;
  bootStderr: string;
  bootExitcode: string;
}

function chainPaths(worktreeDir: string): ChainPaths {
  const chainDir = join(worktreeDir, "build", "chain");
  return {
    chainDir,
    launchStdout: join(chainDir, "launch.log"),
    launchStderr: join(chainDir, "launch.err.log"),
    launchExitcode: join(chainDir, ".launch.exitcode"),
    bootStdout: join(chainDir, "boot.log"),
    bootStderr: join(chainDir, "boot.err.log"),
    bootExitcode: join(chainDir, ".boot.exitcode"),
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

const runningLaunches = new Map<string, ChildProcess>();
const runningBoots = new Map<string, ChildProcess>();

export const chainEvents = new EventEmitter();
chainEvents.setMaxListeners(50);

function rowToStatus(row: ChainRow): ChainStatus {
  if (row.launch_finished_at !== null) {
    if (row.cancelled) return "stopped";
    return "failed";
  }
  if (row.boot_finished_at !== null) {
    if (row.boot_exit_code === 0) return "ready";
    return "boot-failed";
  }
  if (row.boot_started_at !== null) return "booting";
  return "launching";
}

function rowToSummary(row: ChainRow): ChainSummary {
  return {
    workerName: row.worker_name,
    status: rowToStatus(row),
    chainId: row.id,
    port: row.port,
    launchStartedAt: row.launch_started_at,
    launchFinishedAt: row.launch_finished_at,
    bootFinishedAt: row.boot_finished_at,
  };
}

function finalizeLaunch(
  id: number,
  workerName: string,
  exitCode: number | null,
  cancelled: boolean,
): void {
  if (!setChainLaunchFinished(id, exitCode, cancelled)) return;
  const row = getLatestChainForWorker(workerName);
  if (!row || row.id !== id) return;
  chainEvents.emit("finished", rowToSummary(row));
}

function finalizeBoot(id: number, workerName: string, exitCode: number | null): void {
  setChainBootFinished(id, exitCode);
  const row = getLatestChainForWorker(workerName);
  if (!row || row.id !== id) return;
  chainEvents.emit("finished", rowToSummary(row));
}

function reconcileRow(row: ChainRow): ChainRow {
  if (row.launch_finished_at !== null) return row;

  if (row.boot_started_at !== null && row.boot_finished_at === null && row.boot_pid !== null) {
    if (!isAlive(row.boot_pid)) {
      const worktreeDir = safeRequireWorkerDir(row.worker_name);
      const exitCode = worktreeDir
        ? readExitCode(chainPaths(worktreeDir).bootExitcode)
        : null;
      finalizeBoot(row.id, row.worker_name, exitCode);
      return getLatestChainForWorker(row.worker_name) ?? row;
    }
  }

  if (!isAlive(row.launch_pid)) {
    const worktreeDir = safeRequireWorkerDir(row.worker_name);
    const exitCode = worktreeDir
      ? readExitCode(chainPaths(worktreeDir).launchExitcode)
      : null;
    finalizeLaunch(row.id, row.worker_name, exitCode, false);
    return getLatestChainForWorker(row.worker_name) ?? row;
  }

  return row;
}

function safeRequireWorkerDir(name: string): string | null {
  try {
    return requireWorkerDir(name);
  } catch {
    return null;
  }
}

function hasPsinode(worktreeDir: string): boolean {
  return existsSync(join(worktreeDir, "build", "psidk", "bin", "psinode"));
}

function rowToChainInfo(row: ChainRow, worktreeDir: string): ChainInfo {
  const paths = chainPaths(worktreeDir);
  return {
    status: rowToStatus(row),
    chainId: row.id,
    port: row.port,
    launchPid: row.launch_pid,
    bootPid: row.boot_pid,
    launchStartedAt: row.launch_started_at,
    launchFinishedAt: row.launch_finished_at,
    launchExitCode: row.launch_exit_code,
    bootStartedAt: row.boot_started_at,
    bootFinishedAt: row.boot_finished_at,
    bootExitCode: row.boot_exit_code,
    launchStdoutSize: safeStatSize(paths.launchStdout),
    launchStderrSize: safeStatSize(paths.launchStderr),
    bootStdoutSize: safeStatSize(paths.bootStdout),
    bootStderrSize: safeStatSize(paths.bootStderr),
    psinodeAvailable: hasPsinode(worktreeDir),
  };
}

function emptyChainInfo(worktreeDir: string): ChainInfo {
  return {
    status: "idle",
    chainId: null,
    port: null,
    launchPid: null,
    bootPid: null,
    launchStartedAt: null,
    launchFinishedAt: null,
    launchExitCode: null,
    bootStartedAt: null,
    bootFinishedAt: null,
    bootExitCode: null,
    launchStdoutSize: 0,
    launchStderrSize: 0,
    bootStdoutSize: 0,
    bootStderrSize: 0,
    psinodeAvailable: hasPsinode(worktreeDir),
  };
}

export function getChainStatus(name: string): ChainInfo {
  const worktreeDir = requireWorkerDir(name);
  const row = getLatestChainForWorker(name);
  if (!row) return emptyChainInfo(worktreeDir);
  return rowToChainInfo(reconcileRow(row), worktreeDir);
}

export function listLatestChainsInfo(): ChainSummary[] {
  return dbListLatestChains().map((row) => rowToSummary(reconcileRow(row)));
}

export function getActiveChainPort(name: string): number | null {
  const row = getLatestChainForWorker(name);
  if (!row) return null;
  const status = rowToStatus(reconcileRow(row));
  if (status === "ready") return row.port;
  return null;
}

function allocatePort(name: string): number {
  const existing = getChainPort(name);
  if (existing !== null) return existing;
  const used = new Set(listAssignedChainPorts());
  let port = 8080;
  while (used.has(port)) port++;
  upsertChainPort(name, port);
  return port;
}

function pollPsinodeReady(port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      if (Date.now() > deadline) {
        reject(new Error("Timed out waiting for psinode"));
        return;
      }
      const sock = createConnection({ host: "127.0.0.1", port }, () => {
        sock.destroy();
        resolve();
      });
      sock.on("error", () => {
        sock.destroy();
        setTimeout(attempt, 1_000);
      });
    };
    attempt();
  });
}

export function startChain(name: string): { chainId: number; pid: number; port: number } {
  const worktreeDir = requireWorkerDir(name);
  const existing = getLatestChainForWorker(name);
  if (existing) {
    const status = rowToStatus(reconcileRow(existing));
    if (status === "launching" || status === "booting" || status === "ready" || status === "boot-failed") {
      throw new HttpError(409, "Chain already running");
    }
  }

  const port = allocatePort(name);
  const paths = chainPaths(worktreeDir);
  mkdirSync(paths.chainDir, { recursive: true });
  rmSync(paths.launchExitcode, { force: true });
  rmSync(paths.bootExitcode, { force: true });

  const outFd = openSync(paths.launchStdout, "w");
  const errFd = openSync(paths.launchStderr, "w");

  const child = spawn(
    "bash",
    [
      "-c",
      `stdbuf -oL -eL direnv exec . bash .vscode/scripts/launch.sh ${port} myprod; echo $? > build/chain/.launch.exitcode`,
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
    throw new HttpError(500, "Failed to spawn launch process");
  }

  child.unref();

  const chainId = insertChain(name, port, child.pid, new Date().toISOString());
  runningLaunches.set(name, child);

  child.on("exit", (code, signal) => {
    runningLaunches.delete(name);
    const cancelled = signal === "SIGTERM" || signal === "SIGKILL";
    const exitCode = typeof code === "number"
      ? code
      : readExitCode(paths.launchExitcode);
    finalizeLaunch(chainId, name, exitCode, cancelled);
  });

  void pollPsinodeReady(port, 60_000).then(
    () => spawnBoot(name, chainId, port, worktreeDir),
    () => { /* psinode died or timed out; child exit handler will finalize */ },
  );

  return { chainId, pid: child.pid, port };
}

function spawnBoot(name: string, chainId: number, port: number, worktreeDir: string): void {
  const row = getLatestChainForWorker(name);
  if (!row || row.id !== chainId || row.launch_finished_at !== null) return;

  const paths = chainPaths(worktreeDir);
  const outFd = openSync(paths.bootStdout, "w");
  const errFd = openSync(paths.bootStderr, "w");

  const child = spawn(
    "bash",
    [
      "-c",
      `direnv exec . psibase boot -a http://psibase.localhost:${port} -p myprod; echo $? > build/chain/.boot.exitcode`,
    ],
    {
      cwd: worktreeDir,
      detached: true,
      stdio: ["ignore", outFd, errFd],
    },
  );

  closeSync(outFd);
  closeSync(errFd);

  if (typeof child.pid !== "number") return;

  child.unref();
  setChainBootStarted(chainId, child.pid, new Date().toISOString());
  runningBoots.set(name, child);

  child.on("exit", (code) => {
    runningBoots.delete(name);
    const exitCode = typeof code === "number"
      ? code
      : readExitCode(paths.bootExitcode);
    finalizeBoot(chainId, name, exitCode);
  });
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

export async function cancelChain(name: string): Promise<{ ok: true }> {
  const row = getLatestChainForWorker(name);
  if (!row) throw new HttpError(404, "No chain to cancel");
  const status = rowToStatus(reconcileRow(row));
  if (status !== "launching" && status !== "booting" && status !== "ready" && status !== "boot-failed") {
    throw new HttpError(404, "No running chain to cancel");
  }

  if (row.boot_pid && isAlive(row.boot_pid)) {
    killProcessGroup(row.boot_pid, "SIGTERM");
  }

  killProcessGroup(row.launch_pid, "SIGTERM");

  const deadline = Date.now() + CANCEL_GRACE_MS;
  while (Date.now() < deadline) {
    if (!isAlive(row.launch_pid)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (isAlive(row.launch_pid)) killProcessGroup(row.launch_pid, "SIGKILL");

  finalizeLaunch(row.id, name, null, true);
  return { ok: true };
}

export function cancelChainIfRunning(name: string): Promise<void> {
  const row = getLatestChainForWorker(name);
  if (!row) return Promise.resolve();
  const status = rowToStatus(reconcileRow(row));
  if (status !== "launching" && status !== "booting" && status !== "ready" && status !== "boot-failed") {
    return Promise.resolve();
  }
  return cancelChain(name).then(() => undefined);
}

export function assertNoRunningChain(name: string): void {
  const row = getLatestChainForWorker(name);
  if (!row) return;
  const status = rowToStatus(reconcileRow(row));
  if (status === "launching" || status === "booting" || status === "ready" || status === "boot-failed") {
    throw new HttpError(409, "Cannot proceed while chain is running. Stop it first.");
  }
}

const RECONCILE_INTERVAL_MS = 3_000;

function reconcileAllUnfinished(): void {
  for (const row of listUnfinishedChains()) {
    reconcileRow(row);
  }
}

export function startChainReconciler(): () => void {
  reconcileAllUnfinished();
  const handle = setInterval(reconcileAllUnfinished, RECONCILE_INTERVAL_MS);
  handle.unref?.();
  return () => clearInterval(handle);
}

export function readChainLog(
  name: string,
  phase: ChainPhase,
  stream: LogStream,
  offset: number,
  limit: number,
): LogChunk {
  const worktreeDir = requireWorkerDir(name);
  const paths = chainPaths(worktreeDir);

  let path: string;
  if (phase === "launch") {
    path = stream === "stdout" ? paths.launchStdout : paths.launchStderr;
  } else {
    path = stream === "stdout" ? paths.bootStdout : paths.bootStderr;
  }

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
