import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { WORKTREES_DIR } from "../config.js";

export type AgentProcessMap = Map<string, number>;

const WORKER_DIR_RE =
  /^\s*(\d+)\s+.*agent\b.*\bworker\s+start\b.*--worker-dir\s+(\S+)/;
const NAME_RE = /^\s*(\d+)\s+.*agent\b.*\bworker\s+start\b.*--name\s+(\S+)/;

export function getAgentProcesses(): AgentProcessMap {
  const result = new Map<string, number>();
  let out: string;
  try {
    out = execSync("ps -eo pid,args", { encoding: "utf-8" });
  } catch {
    return result;
  }

  for (const line of out.split("\n")) {
    if (!line.includes("agent") || !line.includes("worker")) continue;

    const dirMatch = line.match(WORKER_DIR_RE);
    if (dirMatch) {
      result.set(dirMatch[2], Number(dirMatch[1]));
      continue;
    }

    const nameMatch = line.match(NAME_RE);
    if (nameMatch) {
      result.set(join(WORKTREES_DIR, nameMatch[2]), Number(nameMatch[1]));
    }
  }
  return result;
}

export function killProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
  process.kill(pid, signal);
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // Zombies are reported alive by `kill(pid, 0)` because the kernel keeps the
  // task entry until the parent reaps it. In containers where PID 1 doesn't
  // reap (e.g., `sleep infinity`), reparented zombies linger forever. Treat
  // any process in state Z as dead so reconciliation and cancellation work.
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
    const close = stat.lastIndexOf(")");
    const state = stat.slice(close + 2, close + 3);
    if (state === "Z") return false;
  } catch {
    // /proc unavailable (non-Linux) or race: fall through to "alive".
  }
  return true;
}

export async function waitForExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
